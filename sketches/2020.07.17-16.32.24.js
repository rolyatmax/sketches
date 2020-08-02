/* global fetch, performance */
/**
 * load & render nyc ground surface - test
 * (output of faces-to-ground-surface.js script in rolyatmax/building-swap)
 */

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.10')
const { GUI } = require('dat-gui')
const mat4 = require('gl-mat4')
const createRoamingCamera = require('../lib/roaming-camera/roaming-camera-0.0.1')
const injectGLSL = require('../lib/inject-glsl/inject-glsl-0.0.1')
const NOISE_GLSL = require('../lib/noise-glsl/noise-glsl-0.0.1')
const palettes = require('nice-color-palettes')
const getNormal = require('get-plane-normal')
const createPaletteAnimator = require('../lib/palette-animator/palette-animator-0.0.1')
const { createSpring } = require('spring-animator')

const paletteAnimator = createPaletteAnimator(palettes, 0.001, 0.1, [0.11, 0.11, 0.11])
const { PALETTE_ANIMATOR_GLSL } = paletteAnimator

const rico = window.rico = createRico()

const settings = {
  palette: 60,
  stiffness: 0.02,
  damping: 0.15,
  noiseFreq: 200,
  normMult: 0.01,
  pointSize: 1,
  springDelay: 100,
  pointsScale: 1
}

const gui = new GUI()
gui.add(settings, 'palette', 0, 99).step(1)
gui.add(settings, 'pointSize', 0, 10).step(0.01)
gui.add(settings, 'noiseFreq', 0, 500)
gui.add(settings, 'normMult', 0, 1).step(0.001)
gui.add(settings, 'stiffness', 0.001, 0.1).step(0.001)
gui.add(settings, 'damping', 0.01, 0.5).step(0.01)
gui.add(settings, 'springDelay', 0, 500).step(1)
gui.add(settings, 'pointsScale', 0, 4).step(0.01).onChange(onChangeBuildingScale)
gui.add({ next: () => camera.moveToNextPosition() }, 'next')

const EMPIRE_STATE_BUILDING_XY = [
  988223,
  211951
]
const MAPCENTER = EMPIRE_STATE_BUILDING_XY

const camera = window.camera = createRoamingCamera({
  canvas: rico.canvas,
  zoomSpeed: 4,
  center: [...MAPCENTER.map(v => v - 2000), 2000],
  eye: [...MAPCENTER, 0],
  damping: 0.03,
  stiffness: 0.00005,
  getCameraPosition: () => [...MAPCENTER.map(v => v + Math.random() * 5000 - 2500), 1000 * Math.random() + 100]
})

const scaleSprings = new Array(16).fill().map(() => {
  return createSpring(settings.stiffness, settings.damping, 0)
})

function onChangeBuildingScale () {
  scaleSprings.map((s, i) => setTimeout(() => {
    s.setDestination(settings.pointsScale)
  }, settings.springDelay * i))
}

onChangeBuildingScale()

Promise.all([
  fetch('data/nyc-lidar/midtown.bin').then(res => res.arrayBuffer()),
  fetch('resources/data/nyc-buildings/indexed-building-triangles-midtown.bin').then(res => res.arrayBuffer())
])
  .then(onLoadData)

function onLoadData ([lidarBinaryData, buildingBinaryData]) {
  const startTime = performance.now()
  const { interleavedPoints, intensityQuintiles, offset, pointCount } = parseLiDARData(lidarBinaryData)
  const positionOffset = offset
  const { buildings } = parseIndexedBuildingsData(buildingBinaryData)
  const { centroids, positionDeltas, normals } = getBuffers(buildings)
  console.log({ interleavedPoints, intensityQuintiles, offset, pointCount })

  const interleavedBuffer = rico.createInterleavedBuffer(8, interleavedPoints)
  const lidarVertexArray = rico.createVertexArray()
    .vertexAttributeBuffer(0, interleavedBuffer, { type: rico.gl.UNSIGNED_SHORT, size: 3, stride: 8, offset: 0, integer: true })
    .vertexAttributeBuffer(1, interleavedBuffer, { type: rico.gl.UNSIGNED_SHORT, size: 1, stride: 8, offset: 6, integer: true })

  const buildingsVertexArray = rico.createVertexArray()
    .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 3, positionDeltas))
    .vertexAttributeBuffer(1, rico.createVertexBuffer(rico.gl.FLOAT, 3, centroids))
    .vertexAttributeBuffer(2, rico.createVertexBuffer(rico.gl.FLOAT, 3, normals))

  console.log('parse time:', performance.now() - startTime)

  const drawLidar = rico({
    depth: true,
    vertexArray: lidarVertexArray,
    count: pointCount,
    primitive: 'points',
    vs: injectGLSL(NOISE_GLSL, PALETTE_ANIMATOR_GLSL, `#version 300 es
    precision highp float;

    layout(location=0) in uvec3 position;
    layout(location=1) in uint intensity;

    uniform mat4 projection;
    uniform mat4 view;
    uniform float pointSize;
    uniform float noiseFreq;
    uniform vec3 positionOffset;
    uniform vec4 intensityQuintiles;

    out vec3 color;

    void main() {
      vec3 p = positionOffset + vec3(position);

      float i = float(intensity);
      float t = i < intensityQuintiles.x ? 0.1 :
                i < intensityQuintiles.y ? 0.3 :
                i < intensityQuintiles.z ? 0.5 :
                i < intensityQuintiles.w ? 0.7 : 0.9;
      color = getColorFromPalette(t);
      gl_PointSize = pointSize;
      gl_Position = projection * view * vec4(p, 1);
    }
    `),
    fs: `#version 300 es
    precision highp float;
    in vec3 color;
    out vec4 fragColor;
    void main() {
      fragColor = vec4(color, 1);
    }
    `
  })

  const drawBuildings = rico({
    depth: true,
    vertexArray: buildingsVertexArray,
    count: positionDeltas.length / 3,
    primitive: 'triangles',
    vs: injectGLSL(NOISE_GLSL, PALETTE_ANIMATOR_GLSL, `#version 300 es
    precision highp float;

    layout(location=0) in vec3 positionDelta;
    layout(location=1) in vec3 buildingCentroid;
    layout(location=2) in vec3 norm;

    uniform mat4 projection;
    uniform mat4 view;
    uniform float normMult;
    uniform float noiseFreq;
    uniform mat4 springs;

    out vec3 color;

    void main() {
      float springT = noise3D(buildingCentroid, noiseFreq * 20.0, vec2(0.0, 16.0));
      int springIdx = int(springT);
      float scaleA = springs[springIdx / 4][springIdx % 4];
      int springIdx2 = min(15, springIdx + 1);
      float scaleB = springs[springIdx2 / 4][springIdx2 % 4];
      float scale = mix(scaleA, scaleB, fract(springT));
      vec3 position = positionDelta * scale + buildingCentroid;

      // float colorT = noise3D(
      //   position,
      //   noiseFreq,
      //   vec2(0.0, 1.0)
      // );
      // vec3 lightDir = normalize(vec3(1));
      // color = getColorFromPalette(colorT) + vec3(dot(lightDir, normal) * normMult);
      color = vec3(0.11, 0.12, 0.13);
      gl_Position = projection * view * vec4(position, 1);
    }
    `),
    fs: `#version 300 es
    precision highp float;
    in vec3 color;
    out vec4 fragColor;
    void main() {
      fragColor = vec4(color, 1);
    }
    `
  })

  const sketch = () => {
    return ({ width, height, time }) => {
      rico.clear(0.11, 0.12, 0.13, 1)
      // rico.clear(0.97, 0.98, 0.99, 1)
      camera._camera.up = [0, 0, 1]
      camera.tick()
      paletteAnimator.tick(settings.palette)

      for (const s of scaleSprings) s.tick(settings.stiffness, settings.damping)

      const commonUniforms = {
        view: camera.getMatrix(),
        projection: mat4.perspective([], Math.PI / 4, width / height, 1, 1000000),
        noiseFreq: settings.noiseFreq / 1000000,
        springs: scaleSprings.map(s => s.getCurrentValue()),
        ...paletteAnimator.uniforms()
      }

      drawBuildings({
        uniforms: {
          ...commonUniforms,
          normMult: settings.normMult
        }
      })

      drawLidar({
        uniforms: {
          ...commonUniforms,
          pointSize: settings.pointSize,
          positionOffset: positionOffset,
          intensityQuintiles: intensityQuintiles
        }
      })
    }
  }

  canvasSketch(sketch, {
    canvas: rico.canvas,
    context: 'webgl2',
    pixelRatio: 1,
    animate: true
  })
}

/*
  Binary Data format:

// pointCount - uint32
// xOffset, yOffset, zOffset - int32s
// pt1 xDelta, yDelta, zDelta - uint16s
// pt1 intensity - uint16
// pt2...
*/
function parseLiDARData (binaryData) {
  const littleEndian = isLittleEndian()
  const dataview = new DataView(binaryData)

  let i = 0

  const pointCount = dataview.getUint32(i, littleEndian)
  i += 4

  const offset = [
    dataview.getInt32(i, littleEndian),
    dataview.getInt32(i + 4, littleEndian),
    dataview.getInt32(i + 8, littleEndian)
  ]
  i += 12

  const interleavedPoints = new Uint16Array(binaryData, i)

  const intensities = []
  for (let j = 3; j < interleavedPoints.length; j += 4) {
    if (Math.random() < 0.05) intensities.push(interleavedPoints[j])
  }
  intensities.sort((a, b) => a - b)

  const intensityQuintiles = [0.2, 0.4, 0.6, 0.8].map(t => intensities[intensities.length * t | 0])

  return { interleavedPoints, intensityQuintiles, pointCount, offset }
}

function getBuffers (buildings) {
  const positionCount = buildings.reduce((tot, b) => {
    return tot + b.triangles.length / 3
  }, 0)
  const normals = new Float32Array(positionCount * 3)
  const centroids = new Float32Array(positionCount * 3)
  const positionDeltas = new Float32Array(positionCount * 3)
  let j = 0

  const scratch = []
  for (const b of buildings) {
    for (let p = 0; p < b.triangles.length; p += 9) {
      const x1Delta = b.triangles[p] - b.centroid[0]
      const y1Delta = b.triangles[p + 1] - b.centroid[1]
      const z1Delta = b.triangles[p + 2] - b.centroid[2]

      const x2Delta = b.triangles[p + 3] - b.centroid[0]
      const y2Delta = b.triangles[p + 4] - b.centroid[1]
      const z2Delta = b.triangles[p + 5] - b.centroid[2]

      const x3Delta = b.triangles[p + 6] - b.centroid[0]
      const y3Delta = b.triangles[p + 7] - b.centroid[1]
      const z3Delta = b.triangles[p + 8] - b.centroid[2]

      const n = getNormal(
        scratch,
        [x1Delta, y1Delta, z1Delta],
        [x2Delta, y2Delta, z2Delta],
        [x3Delta, y3Delta, z3Delta]
      )

      positionDeltas[j] = x1Delta
      normals[j] = n[0]
      centroids[j++] = b.centroid[0]
      positionDeltas[j] = y1Delta
      normals[j] = n[1]
      centroids[j++] = b.centroid[1]
      positionDeltas[j] = z1Delta
      normals[j] = n[2]
      centroids[j++] = b.centroid[2]

      positionDeltas[j] = x2Delta
      normals[j] = n[0]
      centroids[j++] = b.centroid[0]
      positionDeltas[j] = y2Delta
      normals[j] = n[1]
      centroids[j++] = b.centroid[1]
      positionDeltas[j] = z2Delta
      normals[j] = n[2]
      centroids[j++] = b.centroid[2]

      positionDeltas[j] = x3Delta
      normals[j] = n[0]
      centroids[j++] = b.centroid[0]
      positionDeltas[j] = y3Delta
      normals[j] = n[1]
      centroids[j++] = b.centroid[1]
      positionDeltas[j] = z3Delta
      normals[j] = n[2]
      centroids[j++] = b.centroid[2]
    }
  }

  return { centroids, positionDeltas, normals }
}

/*
  Binary Data format:

  // BIN int32
  // Vertex Offset vec3<int32>
  // Vertex ByteSize uint8 (1 or 2 - representing the number of bytes used for the vertex X, Y, & Z)
  // Vertex Count uint16
  // vertex1 X uint8 or uint16 depending on Vertex ByteSize
  // vertex1 Y
  // vertex1 Z
  // vertex2 X
  // vertex2 Y
  // ...
  // Triangle Count uint16
  // triangle1 A uint8 or uint16 depending on Vertex Count
  // triangle1 B
  // triangle1 C
  // triangle2 A
  // triangle2 B
  // ...
*/
function parseIndexedBuildingsData (binaryData) {
  // TODO: output the binary data with some metadata about how many buildings and triangles to expect
  // so we can be smarter about allocating the right size TypedArrays here
  const buildings = [] // new Float32Array(vertexCount * 2)

  const littleEndian = isLittleEndian()
  const dataview = new DataView(binaryData)

  let i = 0
  while (i < binaryData.byteLength) {
    const building = {}

    // BIN int32
    building.bin = dataview.getInt32(i, littleEndian)
    i += 4

    // Vertex Offset vec3<int32>
    const offsetX = dataview.getInt32(i, littleEndian)
    const offsetY = dataview.getInt32(i + 4, littleEndian)
    const offsetZ = dataview.getInt32(i + 8, littleEndian)
    i += 12

    // Vertex ByteSize uint8 (1 or 2 - representing the number of bytes used for the vertex X, Y, & Z)
    const vertexByteSize = dataview.getUint8(i, littleEndian)
    i += 1

    // Vertex Count uint16
    const vertexCount = dataview.getUint16(i, littleEndian)
    i += 2

    const minVertex = [Infinity, Infinity, Infinity]
    const maxVertex = [-Infinity, -Infinity, -Infinity]

    const vertices = new Int32Array(vertexCount * 3)
    for (let j = 0; j < vertexCount; j++) {
      // vertex1 X uint8 or uint16 depending on Vertex ByteSize
      if (vertexByteSize === 1) {
        vertices[j * 3] = dataview.getUint8(i, littleEndian)
        vertices[j * 3 + 1] = dataview.getUint8(i + 1, littleEndian)
        vertices[j * 3 + 2] = dataview.getUint8(i + 2, littleEndian)
      } else {
        vertices[j * 3] = dataview.getUint16(i, littleEndian)
        vertices[j * 3 + 1] = dataview.getUint16(i + 2, littleEndian)
        vertices[j * 3 + 2] = dataview.getUint16(i + 4, littleEndian)
      }

      vertices[j * 3] += offsetX
      vertices[j * 3 + 1] += offsetY
      vertices[j * 3 + 2] += offsetZ

      minVertex[0] = Math.min(minVertex[0], vertices[j * 3])
      minVertex[1] = Math.min(minVertex[1], vertices[j * 3 + 1])
      minVertex[2] = Math.min(minVertex[2], vertices[j * 3 + 2])

      maxVertex[0] = Math.max(maxVertex[0], vertices[j * 3])
      maxVertex[1] = Math.max(maxVertex[1], vertices[j * 3 + 1])
      maxVertex[2] = Math.max(maxVertex[2], vertices[j * 3 + 2])

      i += vertexByteSize * 3
    }

    const centroid = [
      (minVertex[0] + maxVertex[0]) / 2,
      (minVertex[1] + maxVertex[1]) / 2,
      (minVertex[2] + maxVertex[2]) / 2
    ]

    building.centroid = centroid
    building.minVertex = minVertex
    building.maxVertex = maxVertex

    // Triangle Count uint16
    const triCount = dataview.getUint16(i, littleEndian)
    i += 2

    const triIdxByteSize = vertexCount > 255 ? 2 : 1

    const triangles = new Int32Array(triCount * 3 * 3)
    building.triangles = triangles
    for (let j = 0; j < triCount * 3; j++) {
      // triangle1 A uint8 or uint16 depending on Vertex Count
      const vertexIdx = triIdxByteSize === 1 ? dataview.getUint8(i, littleEndian) : dataview.getUint16(i, littleEndian)
      i += triIdxByteSize
      triangles[j * 3] = vertices[vertexIdx * 3]
      triangles[j * 3 + 1] = vertices[vertexIdx * 3 + 1]
      triangles[j * 3 + 2] = vertices[vertexIdx * 3 + 2]
    }

    buildings.push(building)
  }

  return { buildings }
}

function isLittleEndian () {
  const buffer = new ArrayBuffer(2)
  new DataView(buffer).setInt16(0, 256, true /* littleEndian */)
  // Int16Array uses the platform's endianness.
  return new Int16Array(buffer)[0] === 256
}
