/* global fetch, performance */
/**
 * load & render nyc building data (from rolyatmax/building-swap repo)
 */

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.10')
const { GUI } = require('dat-gui')
const mat4 = require('gl-mat4')
const NOISE_GLSL = require('../lib/noise-glsl/noise-glsl-0.0.1')
const injectGLSL = require('../lib/inject-glsl/inject-glsl-0.0.1')
const palettes = require('nice-color-palettes')
const createPaletteAnimator = require('../lib/palette-animator/palette-animator-0.0.1')
const createRoamingCamera = require('../lib/roaming-camera/roaming-camera-0.0.1')
const normal = require('get-plane-normal')
const { createSpring } = require('spring-animator')

const paletteAnimator = createPaletteAnimator(palettes, 0.001, 0.1, [1, 1, 1])
const { PALETTE_ANIMATOR_GLSL } = paletteAnimator

const rico = window.rico = createRico()

const settings = {
  palette: 60,
  colorRange: 0.8,
  grayColor: 0.5,
  normMult: 0.3,
  noiseFreq: 50,
  timeScale: 2000,
  footprintScale: 1,
  stiffness: 0.006,
  damping: 0.15,
  springDelay: 250,
  zScale: -200,
  offsetSize: 10
}

const gui = new GUI()
gui.add(settings, 'palette', 0, 99).step(1)
gui.add(settings, 'grayColor', 0, 1).step(0.01)
gui.add(settings, 'colorRange', 0, 1).step(0.01)
gui.add(settings, 'normMult', 0, 1).step(0.01)
gui.add(settings, 'noiseFreq', 0, 500)
gui.add(settings, 'timeScale', 0, 50000).step(0.01)
gui.add(settings, 'stiffness', 0.001, 0.1).step(0.001)
gui.add(settings, 'damping', 0.01, 0.5).step(0.01)
gui.add(settings, 'zScale', -1000, 1000)
gui.add(settings, 'offsetSize', -1000, 1000)
gui.add(settings, 'springDelay', 0, 500).step(1)
gui.add(settings, 'footprintScale', 0, 8).step(0.01).onChange(onChangeBuildingScale)
gui.add({ next: () => camera.moveToNextPosition() }, 'next')

const MAP_EXTENT = [[978979, 1009920], [194479, 259420], [-39, 1797]]
const MAPCENTER = [15470 + 978979 - 3000, 32470 + 194479 - 20000]

const camera = createRoamingCamera({
  canvas: rico.canvas,
  zoomSpeed: 4,
  center: [...MAPCENTER.map(v => v - 10000), 10000],
  eye: [...MAPCENTER, 0],
  damping: 0.03,
  stiffness: 0.00005,
  getCameraPosition: () => [...MAPCENTER.map(v => v + Math.random() * 2000 - 1000), 1000 * Math.random() + 10000]
})

const scaleSprings = new Array(16).fill().map(() => {
  return createSpring(settings.stiffness, settings.damping, 0)
})

function onChangeBuildingScale () {
  scaleSprings.map((s, i) => setTimeout(() => {
    s.setDestination(settings.footprintScale)
  }, settings.springDelay * i))
}

onChangeBuildingScale()

fetch('data/nyc-buildings/indexed-building-triangles-all.bin')
  .then(res => res.arrayBuffer())
  .then(onLoadData)

function onLoadData (binaryData) {
  const startTime = performance.now()
  const { buildings } = parseIndexedBuildingsData(binaryData)
  const { centroids, positionDeltas, normals } = getBuffers(buildings)
  console.log('parse time:', performance.now() - startTime)
  console.log({ centroids, positionDeltas, normals, buildings })

  const vertexArray = rico.createVertexArray()
    .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 3, positionDeltas))
    .vertexAttributeBuffer(1, rico.createVertexBuffer(rico.gl.FLOAT, 3, centroids))
    .vertexAttributeBuffer(2, rico.createVertexBuffer(rico.gl.FLOAT, 3, normals))

  const draw = rico({
    depth: true,
    cullBackfaces: true,
    vertexArray: vertexArray,
    count: positionDeltas.length / 3,
    primitive: 'triangles',
    vs: injectGLSL(NOISE_GLSL, PALETTE_ANIMATOR_GLSL, `#version 300 es
    precision highp float;

    layout(location=0) in vec3 pd;
    layout(location=1) in vec3 bc;
    layout(location=2) in vec3 norm;

    uniform mat4 projection;
    uniform mat4 view;
    uniform float time;
    uniform float grayColor;
    uniform float colorRange;
    uniform float noiseFreq;
    uniform mat4 springs;
    uniform float zScale;
    uniform float normMult;
    uniform float offsetSize;

    out vec3 color;

    void main() {
      vec3 positionDelta = pd;
      vec3 buildingCentroid = bc;
      positionDelta.z += buildingCentroid.z;
      buildingCentroid.z = 0.0;
      float angle = noise3D(buildingCentroid + vec3(50000, 50000000, time), noiseFreq, vec2(-6.283, 6.283));
      vec3 offset = vec3(cos(angle), sin(angle), 0) * offsetSize;

      float springT = noise3D(buildingCentroid, noiseFreq * 20.0, vec2(0.0, 16.0));
      int springIdx = int(springT);
      float scaleA = springs[springIdx / 4][springIdx % 4];
      int springIdx2 = min(15, springIdx + 1);
      float scaleB = springs[springIdx2 / 4][springIdx2 % 4];
      float scale = mix(scaleA, scaleB, fract(springT));
      float colorT = noise3D(
        vec3(buildingCentroid.xy * 3.0, time) + vec3(10),
        noiseFreq,
        vec2(grayColor - colorRange * 0.5, grayColor + colorRange * 0.5)
      );
      vec3 lightDir = normalize(vec3(1));
      color = getColorFromPalette(colorT) + vec3(dot(lightDir, norm) * normMult);
      vec3 position = positionDelta * scale + buildingCentroid + offset * (1.0 - scale);
      float z = (1.0 - scale) * zScale;
      position.z += z;
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
      rico.clear(0.97, 0.98, 0.99, 1)
      camera._camera.up = [0, 0, 1]
      camera.tick()
      paletteAnimator.tick(settings.palette)

      const projMat = mat4.perspective([], Math.PI / 4, width / height, 1, 1000000)
      for (const s of scaleSprings) s.tick(settings.stiffness, settings.damping)

      draw({
        uniforms: {
          view: camera.getMatrix(),
          projection: projMat,
          time: time * settings.timeScale,
          colorRange: settings.colorRange,
          grayColor: settings.grayColor,
          noiseFreq: settings.noiseFreq / 10000000,
          zScale: settings.zScale,
          normMult: settings.normMult,
          offsetSize: settings.offsetSize,
          springs: scaleSprings.map(s => s.getCurrentValue()),
          ...paletteAnimator.uniforms()
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

      const n = normal(
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

    // 1 - Manhattan, 2 - Bronx, 3 - Brooklyn, 4 - Queens, 5 - Staten Island
    if (
      (building.bin >= 1000000 && building.bin < 2000000) ||
      (building.bin >= 2000000 && building.bin < 3000000) ||
      (building.bin >= 3000000 && building.bin < 5000000)
    ) {
      buildings.push(building)
    }
  }

  return { buildings }
}

function isLittleEndian () {
  const buffer = new ArrayBuffer(2)
  new DataView(buffer).setInt16(0, 256, true /* littleEndian */)
  // Int16Array uses the platform's endianness.
  return new Int16Array(buffer)[0] === 256
}
