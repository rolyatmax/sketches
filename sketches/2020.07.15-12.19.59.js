/* global fetch, performance */
/**
 * load & render nyc ground surface - test
 * (output of faces-to-ground-surface.js script in rolyatmax/building-swap)
 */

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.10')
const { GUI } = require('dat-gui')
const mat4 = require('gl-mat4')
const NOISE_GLSL = require('../lib/noise-glsl/noise-glsl-0.0.1')
const injectGLSL = require('../lib/inject-glsl/inject-glsl-0.0.1')
const palettes = require('nice-color-palettes')
const createPaletteAnimator = require('../lib/palette-animator/palette-animator-0.0.1')
const geoao = require('../lib/geo-ao/geo-ao')
const getNormal = require('get-plane-normal')
const createRoamingCamera = require('../lib/roaming-camera/roaming-camera-0.0.1')

const paletteAnimator = createPaletteAnimator(palettes, 0.001, 0.1, [0.11, 0.11, 0.11])
const { PALETTE_ANIMATOR_GLSL } = paletteAnimator

const rico = window.rico = createRico()

const settings = {
  palette: 60,
  sampleCount: 256,
  resolution: 1024,
  bias: 0.04,
  aoPower: 1.5,
  normMult: 0.01,
  noiseFreq: 500,
  aoMult: 0.6
}

const gui = new GUI()
gui.add(settings, 'palette', 0, 99).step(1)
gui.add(settings, 'sampleCount', 1, 10000).step(1).onChange(setup)
gui.add(settings, 'resolution', 1, 2048).step(1).onChange(setup)
gui.add(settings, 'bias', 0, 0.5).step(0.001).onChange(setup)
gui.add(settings, 'aoPower', 0, 2)
gui.add(settings, 'normMult', 0, 1).step(0.001)
gui.add(settings, 'noiseFreq', 0, 2000)
gui.add(settings, 'aoMult', 0, 1).step(0.001)
gui.add({ next: () => camera.moveToNextPosition() }, 'next')

const EMPIRE_STATE_BUILDING_XY = [
  988223,
  211951
]
const MAPCENTER = EMPIRE_STATE_BUILDING_XY

const camera = createRoamingCamera({
  canvas: rico.canvas,
  zoomSpeed: 4,
  center: [...MAPCENTER.map(v => v - 2000), 2000],
  eye: [...MAPCENTER, 0],
  damping: 0.03,
  stiffness: 0.00005,
  getCameraPosition: () => [...MAPCENTER.map(v => v + Math.random() * 2000 - 1000), 1000 * Math.random() + 10000]
})

Promise.all([
  fetch('resources/data/nyc-buildings/midtown-ground-triangles.bin').then(res => res.arrayBuffer()),
  fetch('resources/data/nyc-buildings/indexed-building-triangles-midtown.bin').then(res => res.arrayBuffer())
]).then(onLoadData)

let draw, positions, normals

function setup () {
  const aoSampler = geoao(positions, {
    resolution: settings.resolution,
    bias: settings.bias,
    normals: normals
  })

  for (let i = 0; i < settings.sampleCount; i++) {
    aoSampler.sample()
  }

  // returns a Float32Array
  const ao = aoSampler.report()

  aoSampler.dispose()

  const vertexArray = rico.createVertexArray()
    .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 3, positions))
    .vertexAttributeBuffer(1, rico.createVertexBuffer(rico.gl.FLOAT, 3, normals))
    .vertexAttributeBuffer(2, rico.createVertexBuffer(rico.gl.FLOAT, 1, ao))

  draw = rico({
    depth: true,
    vertexArray: vertexArray,
    count: positions.length / 3,
    primitive: 'triangles',
    vs: injectGLSL(NOISE_GLSL, PALETTE_ANIMATOR_GLSL, `#version 300 es
    precision highp float;

    layout(location=0) in vec3 position;
    layout(location=1) in vec3 normal;
    layout(location=2) in float ao;

    uniform mat4 projection;
    uniform mat4 view;
    uniform float aoPower;
    uniform float normMult;
    uniform float aoMult;
    uniform float noiseFreq;

    out vec3 color;

    void main() {
      float colorT = noise3D(
        position,
        noiseFreq,
        vec2(0.0, 1.0)
      );
      vec3 lightDir = normalize(vec3(1));
      color = getColorFromPalette(colorT) + vec3(dot(lightDir, normal) * normMult);
      color += pow(ao, aoPower) * aoMult;
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
}

function onLoadData ([groundBinaryData, buildingBinaryData]) {
  const startTime = performance.now()
  const groundBuffers = parseSurfaceData(groundBinaryData)
  const { buildings } = parseIndexedBuildingsData(buildingBinaryData)
  const buildingBuffers = getBuffers(buildings)

  positions = new Float32Array(groundBuffers.positions.length + buildingBuffers.positions.length)
  normals = new Float32Array(groundBuffers.normals.length + buildingBuffers.normals.length)

  positions.set(groundBuffers.positions)
  positions.set(buildingBuffers.positions, groundBuffers.positions.length)

  normals.set(groundBuffers.normals)
  normals.set(buildingBuffers.normals, groundBuffers.normals.length)

  console.log('parse time:', performance.now() - startTime)

  setup()

  const sketch = () => {
    return ({ width, height, time }) => {
      rico.clear(0.11, 0.12, 0.13, 1)
      // rico.clear(0.97, 0.98, 0.99, 1)
      camera._camera.up = [0, 0, 1]
      camera.tick()
      paletteAnimator.tick(settings.palette)

      draw({
        uniforms: {
          view: camera.getMatrix(),
          projection: mat4.perspective([], Math.PI / 4, width / height, 1, 1000000),
          aoPower: settings.aoPower,
          normMult: settings.normMult,
          aoMult: settings.aoMult,
          noiseFreq: settings.noiseFreq / 1000000,
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

// Length of pts list - uint32
// pt1 X - int32
// pt1 Y - int32
// pt1 Z - int32
// pt2 X - int32
// ...
// Length of triangle list - uint32
// tri1 A - uint32
// tri1 B - uint32
// tri1 C - uint32
// tri2 A - uint32
// ...
function parseSurfaceData (binaryData) {
  const littleEndian = isLittleEndian()
  const dataview = new DataView(binaryData)

  let i = 0
  const ptCount = dataview.getUint32(i, littleEndian)
  i += 4

  const vertices = new Int32Array(binaryData, i, ptCount * 3)

  i += ptCount * 3 * 4

  const triCount = dataview.getUint32(i, littleEndian)
  i += 4

  const triangles = new Uint32Array(binaryData, i, triCount * 3)

  const positions = new Float32Array(triangles.length * 9 * 2)
  const normals = new Float32Array(triangles.length * 9 * 2)

  const scratch = []
  for (let j = 0; j < triangles.length; j += 3) {
    const idx1 = triangles[j]
    const idx2 = triangles[j + 1]
    const idx3 = triangles[j + 2]

    const pt1 = vertices.slice(idx1 * 3, idx1 * 3 + 3)
    const pt2 = vertices.slice(idx2 * 3, idx2 * 3 + 3)
    const pt3 = vertices.slice(idx3 * 3, idx3 * 3 + 3)

    // raise the surface up to 20
    pt1[2] = 40
    pt2[2] = 40
    pt3[2] = 40

    const n = getNormal(scratch, pt1, pt2, pt3)

    positions.set(pt1, j * 6)
    positions.set(pt2, j * 6 + 3)
    positions.set(pt3, j * 6 + 6)

    normals.set(n, j * 6)
    normals.set(n, j * 6 + 3)
    normals.set(n, j * 6 + 6)

    // do two surfaces to hide the top one from  geo-ao?
    // raise the surface up to 21
    pt1[2] = 20
    pt2[2] = 20
    pt3[2] = 20

    positions.set(pt1, j * 6 + 9)
    positions.set(pt2, j * 6 + 12)
    positions.set(pt3, j * 6 + 15)

    // normals are the same as above since we're just translating
    normals.set(n, j * 6 + 9)
    normals.set(n, j * 6 + 12)
    normals.set(n, j * 6 + 15)
  }

  return { positions, normals }
}

function getBuffers (buildings) {
  const positionCount = buildings.reduce((tot, b) => {
    return tot + b.triangles.length / 3
  }, 0)
  const normals = new Float32Array(positionCount * 3)
  const positions = new Float32Array(positionCount * 3)
  let j = 0

  const scratch = []
  for (const b of buildings) {
    for (let p = 0; p < b.triangles.length; p += 9) {
      const x1 = b.triangles[p]
      const y1 = b.triangles[p + 1]
      const z1 = b.triangles[p + 2]

      const x2 = b.triangles[p + 3]
      const y2 = b.triangles[p + 4]
      const z2 = b.triangles[p + 5]

      const x3 = b.triangles[p + 6]
      const y3 = b.triangles[p + 7]
      const z3 = b.triangles[p + 8]

      const n = getNormal(
        scratch,
        [x1, y1, z1],
        [x2, y2, z2],
        [x3, y3, z3]
      )

      positions[j] = x1
      normals[j++] = n[0]
      positions[j] = y1
      normals[j++] = n[1]
      positions[j] = z1
      normals[j++] = n[2]

      positions[j] = x2
      normals[j++] = n[0]
      positions[j] = y2
      normals[j++] = n[1]
      positions[j] = z2
      normals[j++] = n[2]

      positions[j] = x3
      normals[j++] = n[0]
      positions[j] = y3
      normals[j++] = n[1]
      positions[j] = z3
      normals[j++] = n[2]
    }
  }

  return { positions, normals }
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
