/* global fetch, performance */
/**
 * load & render citibike data adjacency matrix
 */

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.10')
const { GUI } = require('dat-gui')
const mat4 = require('gl-mat4')
const NOISE_GLSL = require('../lib/noise-glsl/noise-glsl-0.0.1')
const injectGLSL = require('../lib/inject-glsl/inject-glsl-0.0.1')
const palettes = require('nice-color-palettes')
const createPaletteAnimator = require('../lib/palette-animator/palette-animator-0.0.1')
const createCamera = require('3d-view-controls')
// const { createSpring } = require('spring-animator')
const { csvParse } = require('d3-dsv')
const createCube = require('primitive-cube')

const paletteAnimator = createPaletteAnimator(palettes, 0.01, 0.1, [1, 1, 1])
const { PALETTE_ANIMATOR_GLSL } = paletteAnimator

const rico = window.rico = createRico()

const settings = {
  curHour: 3,
  windowSize: 0.25,
  palette: 14,
  maxTripCount: 25
}

const gui = new GUI()
gui.add(settings, 'palette', 0, palettes.length - 1).step(1)
gui.add(settings, 'maxTripCount', 0, 500)
// gui.add(settings, 'curHour', 0, 23)
// gui.add(settings, 'windowSize', 0.01, 2)

const camera = createCamera(rico.canvas, { zoomSpeed: 4 })
camera.lookAt(
  [1, 1, 1],
  [0, 0, 0],
  [0, 0, 1]
)

Promise.all([
  fetch('resources/data/citibike/citibike-trips-202005.bin').then(res => res.arrayBuffer()),
  fetch('resources/data/citibike/citibike-stations-202005.csv').then(res => res.text())
]).then(onLoadData)

function onLoadData ([tripsBinaryData, stationsData]) {
  const startTime = performance.now()
  const stations = csvParse(stationsData)
  const { tripStartStations, tripEndStations, tripStartTimes, tripDurations } = parseTripsData(tripsBinaryData)

  // stations already ordered by longitude, make another list ordered by latitude
  // (in reverse order bc latitude decreases from north to south)
  const stationsByLng = stations
  const stationsByLat = stations.slice().sort((a, b) => b.latitude - a.latitude)
  const stationIdxByLng = {}
  const stationIdxByLat = {}
  for (let i = 0; i < stationsByLng.length; i++) stationIdxByLng[stationsByLng[i].stationID] = i
  for (let j = 0; j < stationsByLat.length; j++) stationIdxByLat[stationsByLat[j].stationID] = j

  const tripCountMatrix = new Float32Array(stations.length * stations.length)
  const durationMatrix = new Float32Array(stations.length * stations.length)

  for (let i = 0; i < tripStartStations.length; i++) {
    const latIdx = stationIdxByLat[tripStartStations[i]]
    const lngIdx = stationIdxByLng[tripEndStations[i]]
    const idx = latIdx * stationsByLat.length + lngIdx
    tripCountMatrix[idx] += 1
    durationMatrix[idx] += tripDurations[i]
  }

  // cube geometry
  const cube = createCube()
  const cubePositions = new Float32Array(cube.cells.map(face => face.map(idx => cube.positions[idx]).flat()).flat())
  const cubeNormals = new Float32Array(cube.cells.map(face => face.map(idx => cube.normals[idx]).flat()).flat())
  const vertexArray = rico.createVertexArray()
    .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 3, cubePositions))
    .vertexAttributeBuffer(1, rico.createVertexBuffer(rico.gl.FLOAT, 3, cubeNormals))
    .instanceAttributeBuffer(2, rico.createVertexBuffer(rico.gl.FLOAT, 1, tripCountMatrix))
    .instanceAttributeBuffer(3, rico.createVertexBuffer(rico.gl.FLOAT, 1, durationMatrix))

  const draw = rico({
    depth: true,
    vertexArray: vertexArray,
    instanceCount: tripCountMatrix.length,
    count: cubePositions.length / 3,
    cullBackfaces: true,
    primitive: 'triangles',
    vs: injectGLSL(PALETTE_ANIMATOR_GLSL, `#version 300 es
    precision highp float;

    layout(location=0) in vec3 position;
    layout(location=1) in vec3 normal;
    layout(location=2) in float tripCount;
    layout(location=3) in float durationSum;

    uniform mat4 projection;
    uniform mat4 view;
    uniform float stationsCount;
    uniform float maxTripCount;

    #define LIGHT_SRC vec3(-10.0, 5.0, 3.0)

    out vec4 color;

    void main() {
      float instanceNumber = float(gl_InstanceID);
      float middle = stationsCount / 2.0;
      vec3 offset = vec3(
        mod(instanceNumber, stationsCount) - middle,
        floor(instanceNumber / stationsCount) - middle,
        0
      );

      vec3 p = (position + offset) * vec3(0.001, 0.001, 0.0003 * tripCount + 0.01);

      vec3 dir = normalize(p - LIGHT_SRC);
      float t = dot(dir, normal);
      float colorT = tripCount / maxTripCount;
      vec3 colorOffset = t * 0.1 * vec3(1);
      color = vec4(getColorFromPalette(colorT) + colorOffset, 1);
      gl_Position = projection * view * vec4(p, 1);
    }
    `),
    fs: `#version 300 es
    precision highp float;
    in vec4 color;
    out vec4 fragColor;
    void main() {
      fragColor = color;
    }
    `
  })

  console.log('setup time:', performance.now() - startTime)

  const sketch = () => {
    return ({ width, height, time }) => {
      rico.clear(0.97, 0.98, 0.99, 1)
      camera.up = [0, 0, 1]
      camera.tick()
      paletteAnimator.tick(settings.palette)

      draw({
        uniforms: {
          view: camera.matrix,
          // TODO: Use ortho here
          projection: mat4.perspective([], Math.PI / 4, width / height, 0.0001, 10),
          stationsCount: stations.length,
          maxTripCount: settings.maxTripCount,
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

function parseTripsData (tripsBinaryData) {
  // parse binary trips data
  const littleEndian = isLittleEndian()
  const dataview = new DataView(tripsBinaryData)

  let i = 0

  // first, a "binary header"
  // * tripsCount - Uint32
  // * firstStartTime - Uint32 - epoch timestamp in seconds
  const tripsCount = dataview.getUint32(i, littleEndian)
  const firstStartTime = dataview.getUint32(i + 4, littleEndian)
  i += 8

  const tripStartStations = new Float32Array(tripsCount)
  const tripEndStations = new Float32Array(tripsCount)
  const tripStartTimes = new Float32Array(tripsCount)
  const tripDurations = new Float32Array(tripsCount)

  let lastStartTime = firstStartTime
  let tripIdx = 0
  while (i < tripsBinaryData.byteLength) {
    const curTripIdx = tripIdx
    tripIdx += 1

    // then each trip is as follows:
    // * startTime (minute granularity - delta from previous trip's startTime) - Uint8
    // * duration - Uint8
    // * isSubscriber - Uint8
    // * startStationID - Uint16
    // * endStationID - Uint16
    const startTimeDelta = dataview.getUint8(i, littleEndian)
    const duration = dataview.getUint8(i + 1, littleEndian)
    // const isSubscriber = dataview.getUint8(i + 2, littleEndian)
    const startTime = lastStartTime + startTimeDelta * 60
    lastStartTime = startTime
    i += 3

    const startStationID = dataview.getUint16(i, littleEndian)
    const endStationID = dataview.getUint16(i + 2, littleEndian)
    i += 4

    tripStartStations[curTripIdx] = startStationID
    tripEndStations[curTripIdx] = endStationID
    tripStartTimes[curTripIdx] = startTime
    tripDurations[curTripIdx] = duration
  }

  return { tripStartStations, tripEndStations, tripStartTimes, tripDurations }
}

function isLittleEndian () {
  const buffer = new ArrayBuffer(2)
  new DataView(buffer).setInt16(0, 256, true /* littleEndian */)
  // Int16Array uses the platform's endianness.
  return new Int16Array(buffer)[0] === 256
}
