/* global fetch, performance */
/**
 * load & render citibike data
 */

// TODO: ANIMATE ARCS, DRAW STATIONS, AND MOVE BETWEEN MAP VIEWS AND STASTICAL VIEWS

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.10')
const { GUI } = require('dat-gui')
const mat4 = require('gl-mat4')
const NOISE_GLSL = require('../lib/noise-glsl/noise-glsl-0.0.1')
const injectGLSL = require('../lib/inject-glsl/inject-glsl-0.0.1')
const createRoamingCamera = require('../lib/roaming-camera/roaming-camera-0.0.1')
const { createSpring } = require('spring-animator')
const { csvParse } = require('d3-dsv')

const rico = window.rico = createRico()

const settings = {
  colorRange: 0.1,
  grayColor: 0.4,
  noiseFreq: 1.4,
  timeScale: 2,
  stiffness: 0.006,
  damping: 0.15,
  springDelay: 350,
  zScale: 0.001,
  curHour: 3,
  windowSize: 0.25,
  show: true
}

const gui = new GUI()
gui.add(settings, 'grayColor', 0, 1).step(0.01)
gui.add(settings, 'colorRange', 0, 1).step(0.01)
gui.add(settings, 'noiseFreq', 0, 5).step(0.01)
gui.add(settings, 'timeScale', 0, 2).step(0.01)
gui.add(settings, 'stiffness', 0.001, 0.1).step(0.001)
gui.add(settings, 'damping', 0.01, 0.5).step(0.01)
gui.add(settings, 'zScale', -0.001, 0.001).step(0.0001)
gui.add(settings, 'springDelay', 0, 500).step(1)
gui.add(settings, 'curHour', 0, 23)
gui.add(settings, 'windowSize', 0.01, 2)
gui.add(settings, 'show').onChange(onChangeShow)
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

function onChangeShow () {
  const scale = settings.show ? 1 : 0
  scaleSprings.map((s, i) => setTimeout(() => {
    s.setDestination(scale)
  }, settings.springDelay * i))
}

onChangeShow()

Promise.all([
  fetch('resources/data/nyc-footprints/simplified-footprint-triangles.bin').then(res => res.arrayBuffer()),
  fetch('resources/data/citibike/citibike-trips-202005.bin').then(res => res.arrayBuffer()),
  fetch('resources/data/citibike/citibike-stations-202005.csv').then(res => res.text())
]).then(onLoadData)

function onLoadData ([footprintBinaryData, tripsBinaryData, stationsData]) {
  const startTime = performance.now()
  const { positionDeltas, buildingCentroids, positionBuildings } = parseFootprintsData(footprintBinaryData)
  const stations = csvParse(stationsData)
  const {
    tripStartPositions,
    tripEndPositions,
    tripStartTimes,
    tripDurations,
    tripIsSubscribers,
    stationPositions
  } = parseTripsData(tripsBinaryData, stations)
  console.log('parse time:', performance.now() - startTime)

  const drawTrips = createTripsDrawCall(tripStartPositions, tripEndPositions, tripStartTimes, tripDurations, tripIsSubscribers)
  const drawBasemap = createBasemapDrawCall(positionDeltas, buildingCentroids, positionBuildings)

  const sketch = () => {
    return ({ width, height, time }) => {
      rico.clear(0.11, 0.12, 0.13, 1)
      camera._camera.up = [0, 0, 1]
      camera.tick()

      const projMat = mat4.perspective([], Math.PI / 4, width / height, 0.0001, 10)
      for (const s of scaleSprings) s.tick(settings.stiffness, settings.damping)
      const springVals = scaleSprings.map(s => s.getCurrentValue())

      drawBasemap({
        uniforms: {
          view: camera.getMatrix(),
          projection: projMat,
          time: time * settings.timeScale,
          colorRange: settings.colorRange,
          grayColor: settings.grayColor,
          noiseFreq: settings.noiseFreq,
          zScale: settings.zScale,
          springs: springVals
        }
      })

      drawTrips({
        uniforms: {
          view: camera.getMatrix(),
          projection: projMat,
          curHour: settings.curHour,
          windowSize: settings.windowSize,
          noiseFreq: settings.noiseFreq,
          springs: springVals
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

function createTripsDrawCall (tripStartPositions, tripEndPositions, tripStartTimes, tripDurations, tripIsSubscribers) {
  const GRANULARITY = 20
  const arcInterpolations = new Array(GRANULARITY).fill().map((_, i) => [
    i / (GRANULARITY - 1),
    Math.sin(i / (GRANULARITY - 1) * Math.PI)
  ]).flat()

  const vertexArray = rico.createVertexArray()
    .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 2, new Float32Array(arcInterpolations)))
    .instanceAttributeBuffer(1, rico.createVertexBuffer(rico.gl.FLOAT, 2, tripStartPositions))
    .instanceAttributeBuffer(2, rico.createVertexBuffer(rico.gl.FLOAT, 2, tripEndPositions))
    .instanceAttributeBuffer(3, rico.createVertexBuffer(rico.gl.FLOAT, 1, tripStartTimes))
    .instanceAttributeBuffer(4, rico.createVertexBuffer(rico.gl.FLOAT, 1, tripDurations)) // TODO: Make this use a uint8?

  return rico({
    depth: true,
    vertexArray: vertexArray,
    instanceCount: tripStartPositions.length / 2,
    count: GRANULARITY,
    primitive: 'line strip',
    blend: {
      csrc: 'src alpha',
      asrc: 'src alpha',
      cdest: 'one',
      adest: 'one'
    },
    vs: injectGLSL(NOISE_GLSL, `#version 300 es
    precision highp float;

    layout(location=0) in vec2 arcPosition;
    layout(location=1) in vec2 startPosition;
    layout(location=2) in vec2 endPosition;
    layout(location=3) in float startTime;
    layout(location=4) in float duration;

    uniform mat4 projection;
    uniform mat4 view;
    uniform float curHour;
    uniform float windowSize;
    uniform mat4 springs;
    uniform float noiseFreq;

    #define MAY_START 1588305600.0

    out vec4 color;

    void main() {
      float elapsedInMonth = startTime - MAY_START;
      float elapsedInDay = mod(elapsedInMonth, 24.0 * 60.0 * 60.0);
      float curSecondsInDay = curHour * 60.0 * 60.0;
      float window = windowSize * 60.0 * 60.0;
      float alpha = min(
        smoothstep(curSecondsInDay - window * 0.5, curSecondsInDay, elapsedInDay),
        1.0 - smoothstep(curSecondsInDay, curSecondsInDay + window * 0.5, elapsedInDay)
      );
      if (alpha <= 0.001) {
        gl_Position = vec4(0);
        color = vec4(0);
      } else {
        float dist = distance(startPosition, endPosition);
        float height = arcPosition.y * 0.5 * dist / 2.0;
        vec2 position = mix(startPosition, endPosition, arcPosition.x);

        float springT = noise3D(vec3(startPosition, 0), noiseFreq * 20.0, vec2(0.0, 16.0));
        int springIdx = int(springT);
        float scaleA = springs[springIdx / 4][springIdx % 4];
        int springIdx2 = min(15, springIdx + 1);
        float scaleB = springs[springIdx2 / 4][springIdx2 % 4];
        float scale = mix(scaleA, scaleB, fract(springT));

        gl_Position = projection * view * vec4(position, (scale * 0.5 + 0.5) * height + 0.00001, 1);

        float t = duration / 60.0;
        vec3 c = mix(
          vec3(1, 0.5, 0.5),
          vec3(0.5, 0.5, 1),
          t
        );
        color = vec4(c, alpha * scale * scale);
      }
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
}

function createBasemapDrawCall (positionDeltas, buildingCentroids, positionBuildings) {
  const centroids = new Float32Array(positionDeltas.length)
  for (let i = 0; i < positionBuildings.length; i++) {
    const idx = positionBuildings[i]
    centroids[i * 2] = buildingCentroids[idx * 2]
    centroids[i * 2 + 1] = buildingCentroids[idx * 2 + 1]
  }

  const vertexArray = rico.createVertexArray()
    .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 2, positionDeltas))
    .vertexAttributeBuffer(1, rico.createVertexBuffer(rico.gl.FLOAT, 2, centroids))

  return rico({
    depth: true,
    vertexArray: vertexArray,
    count: positionDeltas.length / 2,
    primitive: 'triangles',
    blend: false,
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
      float angle = noise3D(vec3(buildingCentroid, 90.0), noiseFreq * 20.0, vec2(0.0, 6.283));
      vec2 offset = vec2(cos(angle), sin(angle)) * 0.001;

      float springT = noise3D(vec3(buildingCentroid, 0), noiseFreq * 20.0, vec2(0.0, 16.0));
      int springIdx = int(springT);
      float scaleA = springs[springIdx / 4][springIdx % 4];
      int springIdx2 = min(15, springIdx + 1);
      float scaleB = springs[springIdx2 / 4][springIdx2 % 4];
      float scale = mix(scaleA, scaleB, fract(springT));
      float colorT = noise3D(
        vec3(buildingCentroid * 3.0, time * 0.05) + vec3(10),
        noiseFreq,
        vec2(grayColor - colorRange * 0.5, grayColor + colorRange * 0.5)
      );
      color = vec3(colorT);
      vec2 position = positionDelta * scale + buildingCentroid + offset * (1.0 - scale);
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

function parseTripsData (tripsBinaryData, stations) {
  const stationsCount = stations.length
  const stationPositions = new Float32Array(stationsCount * 2)
  const stationsByID = {}
  let j = 0
  for (const s of stations) {
    s.stationID = parseInt(s.stationID, 10)
    s.longitude = parseFloat(s.longitude)
    s.latitude = parseFloat(s.latitude)
    stationsByID[s.stationID] = s
    stationPositions[j++] = s.longitude
    stationPositions[j++] = s.latitude
  }

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

  const tripStartPositions = new Float32Array(tripsCount * 2)
  const tripEndPositions = new Float32Array(tripsCount * 2)
  const tripStartTimes = new Float32Array(tripsCount * 2)
  const tripDurations = new Float32Array(tripsCount * 2)
  const tripIsSubscribers = new Uint8Array(tripsCount * 2)

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
    const isSubscriber = dataview.getUint8(i + 2, littleEndian)
    const startTime = lastStartTime + startTimeDelta * 60
    lastStartTime = startTime
    i += 3

    const startStationID = dataview.getUint16(i, littleEndian)
    const endStationID = dataview.getUint16(i + 2, littleEndian)
    i += 4

    const startStation = stationsByID[startStationID]
    const endStation = stationsByID[endStationID]

    tripStartPositions[curTripIdx * 2] = startStation.longitude
    tripStartPositions[curTripIdx * 2 + 1] = startStation.latitude

    tripEndPositions[curTripIdx * 2] = endStation.longitude
    tripEndPositions[curTripIdx * 2 + 1] = endStation.latitude

    tripStartTimes[curTripIdx * 2] = startTime
    tripStartTimes[curTripIdx * 2 + 1] = startTime

    tripDurations[curTripIdx * 2] = duration
    tripDurations[curTripIdx * 2 + 1] = duration

    tripIsSubscribers[curTripIdx * 2] = isSubscriber
    tripIsSubscribers[curTripIdx * 2 + 1] = isSubscriber
  }

  return { tripStartPositions, tripEndPositions, tripStartTimes, tripDurations, tripIsSubscribers, stationPositions }
}

function isLittleEndian () {
  const buffer = new ArrayBuffer(2)
  new DataView(buffer).setInt16(0, 256, true /* littleEndian */)
  // Int16Array uses the platform's endianness.
  return new Int16Array(buffer)[0] === 256
}
