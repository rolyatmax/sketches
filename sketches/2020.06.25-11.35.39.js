/* global fetch, performance */
/**
 * load & render nyc building footprint data (output of footprints-to-binary.js script)
 */

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.10')
const { GUI } = require('dat-gui')
const mat4 = require('gl-mat4')
const createCamera = require('3d-view-controls')
// const { createSpring } = require('spring-animator')

const rico = window.rico = createRico()

const settings = {
  footprintScale: 2.5,
  centroidScale: 2,
  vertexScale: 0.01,
  footprintGrayscaleColor: 0.5
}

const gui = new GUI()
gui.add(settings, 'footprintScale', 0, 8).step(0.01)
gui.add(settings, 'footprintGrayscaleColor', 0, 1).step(0.01)
gui.add(settings, 'centroidScale', 0, 4)
gui.add(settings, 'vertexScale', 0, 4)

const MAPCENTER = [-73.993599, 40.735302]

const camera = createCamera(rico.canvas, { zoomSpeed: 4 })
camera.lookAt(
  [...MAPCENTER.map(v => v - 0.05), 0.05],
  [...MAPCENTER, 0],
  [0, 0, 1]
)

fetch('data/nyc-footprints/all-simplified-footprint-triangles.bin')
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
    vs: `#version 300 es
    precision highp float;

    layout(location=0) in vec2 positionDelta;
    layout(location=1) in vec2 buildingCentroid;

    uniform mat4 projection;
    uniform mat4 view;
    uniform float footprintScale;
    uniform float vertexScale;

    void main() {
      vec2 position = positionDelta * footprintScale + buildingCentroid;
      gl_Position = projection * view * vec4(position, 0, 1);
      gl_PointSize = vertexScale;
    }
    `,
    fs: `#version 300 es
    precision highp float;
    uniform vec3 color;
    out vec4 fragColor;
    void main() {
      fragColor = vec4(color, 1);
    }
    `
  })

  const drawCentroids = rico({
    depth: true,
    vertexArray: vertexArray,
    count: centroids.length / 2,
    primitive: 'points',
    vs: `#version 300 es
    precision highp float;

    layout(location=1) in vec2 buildingCentroid;

    uniform mat4 projection;
    uniform mat4 view;
    uniform float centroidScale;

    void main() {
      gl_Position = projection * view * vec4(buildingCentroid, 0, 1);
      gl_PointSize = centroidScale;
    }
    `,
    fs: `#version 300 es
    precision highp float;
    uniform vec3 color;
    out vec4 fragColor;
    void main() {
      fragColor = vec4(color, 1);
    }
    `
  })

  const sketch = () => {
    return ({ width, height }) => {
      rico.clear(0.11, 0.12, 0.13, 1)
      camera.tick()

      const projMat = mat4.perspective([], Math.PI / 4, width / height, 0.0001, 10)

      draw({
        primitive: 'triangles',
        uniforms: {
          view: camera.matrix,
          projection: projMat,
          footprintScale: settings.footprintScale,
          vertexScale: settings.vertexScale,
          color: [settings.footprintGrayscaleColor, settings.footprintGrayscaleColor, settings.footprintGrayscaleColor]
        }
      })
      draw({
        primitive: 'points',
        uniforms: {
          view: camera.matrix,
          projection: projMat,
          footprintScale: settings.footprintScale,
          vertexScale: settings.vertexScale,
          color: [0.67, 0.68, 0.69]
        }
      })
      drawCentroids({
        uniforms: {
          view: camera.matrix,
          projection: projMat,
          color: [0.97, 0.28, 0.29],
          centroidScale: settings.centroidScale
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
  const triCount = 3868793 // for ALL buildings in NYC
  const buildingCount = 1085068 // for ALL buildings in NYC

  const positionDeltas = new Float32Array(triCount * 3 * 2)
  const positionBuildings = new Float32Array(triCount * 3)
  const buildingCentroids = new Float32Array(buildingCount * 2)
  const buildingBBLs = new Float32Array(buildingCount)

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

  return { positionDeltas, positionBuildings, buildingCentroids, buildingBBLs }
}

function isLittleEndian () {
  const buffer = new ArrayBuffer(2)
  new DataView(buffer).setInt16(0, 256, true /* littleEndian */)
  // Int16Array uses the platform's endianness.
  return new Int16Array(buffer)[0] === 256
}
