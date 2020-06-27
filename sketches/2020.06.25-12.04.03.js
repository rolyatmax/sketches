/* global fetch, performance */
/**
 * load & render nyc building footprint data (output of footprints-to-binary.js script)
 */

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.10')
const { GUI } = require('dat-gui')
const mat4 = require('gl-mat4')
const NOISE_GLSL = require('../lib/noise-glsl/noise-glsl-0.0.1')
const injectGLSL = require('../lib/inject-glsl/inject-glsl-0.0.1')
const createRoamingCamera = require('../lib/roaming-camera/roaming-camera-0.0.1')
const { createSpring } = require('spring-animator')

const rico = window.rico = createRico()

const settings = {
  colorRange: 0.7,
  grayColor: 0.7,
  noiseFreq: 1.85,
  timeScale: 2,
  footprintScale: 1,
  stiffness: 0.006,
  damping: 0.15,
  springDelay: 100,
  zScale: 0.0015
}

const gui = new GUI()
gui.add(settings, 'grayColor', 0, 1).step(0.01)
gui.add(settings, 'colorRange', 0, 1).step(0.01)
gui.add(settings, 'noiseFreq', 0, 5).step(0.01)
gui.add(settings, 'timeScale', 0, 2).step(0.01)
gui.add(settings, 'stiffness', 0.001, 0.1).step(0.001)
gui.add(settings, 'damping', 0.01, 0.5).step(0.01)
gui.add(settings, 'zScale', 0.0001, 0.005).step(0.0001)
gui.add(settings, 'springDelay', 0, 500).step(1)
gui.add(settings, 'footprintScale', 0, 1).step(0.01).onChange(onChangeFootprintScale)
gui.add({ next: () => camera.moveToNextPosition() }, 'next')

const MAPCENTER = [-73.993599, 40.735302]

const camera = createRoamingCamera({
  canvas: rico.canvas,
  zoomSpeed: 4,
  center: [...MAPCENTER.map(v => v - 0.05), 0.05],
  eye: [...MAPCENTER, 0],
  damping: 0.03,
  stiffness: 0.00001,
  getCameraPosition: () => [...MAPCENTER.map(v => v + Math.random() * 0.2 - 0.1), 0.05 * Math.random() + 0.01]
})

const scaleSprings = new Array(16).fill().map(() => {
  return createSpring(settings.stiffness, settings.damping, 0)
})

function onChangeFootprintScale () {
  scaleSprings.map((s, i) => setTimeout(() => {
    s.setDestination(settings.footprintScale)
  }, settings.springDelay * i))
}

onChangeFootprintScale()

fetch('resources/data/nyc-footprints/simplified-footprint-triangles.bin')
  .then(res => res.arrayBuffer())
  .then(onLoadData)

function onLoadData (binaryData) {
  const startTime = performance.now()
  const { positionDeltas, buildingCentroids, positionBuildings } = parseFootprintsData(binaryData)
  console.log('parse time:', performance.now() - startTime)

  const centroids = new Float32Array(positionDeltas.length)
  for (let i = 0; i < positionBuildings.length; i++) {
    const idx = positionBuildings[i]
    centroids[i * 2] = buildingCentroids[idx * 2]
    centroids[i * 2 + 1] = buildingCentroids[idx * 2 + 1]
  }

  const vertexArray = rico.createVertexArray()
    .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 2, positionDeltas))
    .vertexAttributeBuffer(1, rico.createVertexBuffer(rico.gl.FLOAT, 2, centroids))

  const draw = rico({
    depth: true,
    vertexArray: vertexArray,
    count: positionDeltas.length / 2,
    primitive: 'triangles',
    vs: injectGLSL(NOISE_GLSL, `#version 300 es
    precision highp float;

    layout(location=0) in vec2 positionDelta;
    layout(location=1) in vec2 buildingCentroid;

    uniform mat4 projection;
    uniform mat4 view;
    uniform float time;
    uniform float grayColor;
    uniform float colorRange;
    uniform float noiseFreq;
    uniform mat4 springs;
    uniform float zScale;

    out vec3 color;

    void main() {
      int springIdx = int(noise3D(vec3(buildingCentroid, 0), noiseFreq * 20.0, vec2(0.0, 16.0)));
      float scale = springs[springIdx / 4][springIdx % 4];
      float colorT = noise3D(
        vec3(buildingCentroid * 3.0, time * 0.05) + vec3(10),
        noiseFreq,
        vec2(grayColor - colorRange * 0.5, grayColor + colorRange * 0.5)
      );
      color = vec3(colorT);
      vec2 position = positionDelta * scale + buildingCentroid;
      float z = (1.0 - scale) * zScale;
      gl_Position = projection * view * vec4(position, z, 1);
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
      camera._camera.up = [0, 0, 1]
      camera.tick()

      const projMat = mat4.perspective([], Math.PI / 4, width / height, 0.0001, 10)
      for (const s of scaleSprings) s.tick(settings.stiffness, settings.damping)

      draw({
        uniforms: {
          view: camera.getMatrix(),
          projection: projMat,
          time: time * settings.timeScale,
          colorRange: settings.colorRange,
          grayColor: settings.grayColor,
          noiseFreq: settings.noiseFreq,
          zScale: settings.zScale,
          springs: scaleSprings.map(s => s.getCurrentValue())
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

  bbl, // the building's BBL number (as 32b float)
  centroid[0], // the footprint's centroid longitude (as 32b float)
  centroid[1], // the footprint's centroid latitude (as 32b float)
  vertices.length / 2, // the number of vertices (vec2s) to follow (as 2-byte int)
  ...vertices, // the vertices: lng1, lat1, lng2, lat2, (as offsets from centroid - each multiplied by 1000000) (as 2-byte ints)
  triIdxs.length / 3, // the number of triangles in the footprint (as 2-byte int)
  ...triIdxs // the triangle indices into the vertex list: tri1A, tri1B, tri1C, tri2A, tri2B, tri2C, etc (as 1-byte ints when vertexCount < 256, otherwise 2-byte ints)
*/
function parseFootprintsData (binaryData) {
  // TODO: output the binary data with some metadata about how many buildings and triangles to expect
  // so we can be smarter about allocating the right size TypedArrays here
  // TIMING WITHOUT ALLOCATING FLOAT32ARRAYS UP FRONT: 539ms
  // TIMING WITH UP-FRONT ALLOCATION: 180ms
  // const triCount = 2412031
  // const buildingCount = 326226

  const positionDeltas = [] // new Float32Array(triCount * 3 * 2)
  const positionBuildings = [] // new Float32Array(triCount * 3)
  const buildingCentroids = [] // new Float32Array(buildingCount * 2)
  const buildingBBLs = [] // new Float32Array(buildingCount)

  const littleEndian = isLittleEndian()
  const dataview = new DataView(binaryData)

  let i = 0
  let buildingIdx = 0
  let curTriIdx = 0
  while (i < binaryData.byteLength) {
    const curBuildingIdx = buildingIdx
    buildingIdx += 1
    const bbl = dataview.getFloat32(i, littleEndian)
    const centroidLng = dataview.getFloat32(i + 4, littleEndian)
    const centroidLat = dataview.getFloat32(i + 8, littleEndian)
    i += 12

    buildingBBLs[curBuildingIdx] = bbl
    buildingCentroids[curBuildingIdx * 2] = centroidLng
    buildingCentroids[curBuildingIdx * 2 + 1] = centroidLat

    const vertexCount = dataview.getInt16(i, littleEndian)
    i += 2

    const vertexDeltas = new Float32Array(vertexCount * 2)
    for (let j = 0; j < vertexCount * 2; j++) {
      vertexDeltas[j] = dataview.getInt16(i, littleEndian) / 1000000
      i += 2
    }

    const triangleCount = dataview.getInt16(i, littleEndian)
    i += 2

    const TriIdxType = vertexCount < 256 ? Uint8Array : Int16Array
    for (let j = 0; j < triangleCount * 3; j++) {
      const idx = TriIdxType === Uint8Array ? dataview.getUint8(i, littleEndian) : dataview.getInt16(i, littleEndian)
      positionDeltas[curTriIdx * 2] = vertexDeltas[idx * 2]
      positionDeltas[curTriIdx * 2 + 1] = vertexDeltas[idx * 2 + 1]
      positionBuildings[curTriIdx] = curBuildingIdx

      i += TriIdxType.BYTES_PER_ELEMENT
      curTriIdx += 1
    }
  }

  return {
    positionDeltas: new Float32Array(positionDeltas),
    positionBuildings: new Float32Array(positionBuildings),
    buildingCentroids: new Float32Array(buildingCentroids),
    buildingBBLs: new Float32Array(buildingBBLs)
  }
}

function isLittleEndian () {
  const buffer = new ArrayBuffer(2)
  new DataView(buffer).setInt16(0, 256, true /* littleEndian */)
  // Int16Array uses the platform's endianness.
  return new Int16Array(buffer)[0] === 256
}
