/* global fetch, performance */

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.11')
const { GUI } = require('dat-gui')
const mat4 = require('gl-mat4')
const createRoamingCamera = require('../lib/roaming-camera/roaming-camera-0.0.1')
const injectGLSL = require('../lib/inject-glsl/inject-glsl-0.0.1')
const NOISE_GLSL = require('../lib/noise-glsl/noise-glsl-0.0.1')
const palettes = require('nice-color-palettes')
const createPaletteAnimator = require('../lib/palette-animator/palette-animator-0.0.1')
const KDBush = require('kdbush')

const paletteAnimator = createPaletteAnimator(palettes, 0.001, 0.1, [0.11, 0.11, 0.11])
const { PALETTE_ANIMATOR_GLSL } = paletteAnimator

const rico = window.rico = createRico()

const settings = {
  palette: 69,
  pointSize: 1,
  cameraDist: 2000,
  distThreshold: 100
}

const gui = new GUI()
gui.add(settings, 'palette', 0, 99).step(1)
gui.add(settings, 'pointSize', 0, 10).step(0.01)
gui.add(settings, 'cameraDist', 100, 8000)
gui.add(settings, 'distThreshold', 0, 500)
gui.add({ next: () => camera.moveToNextPosition() }, 'next')

// FiDi
const data = {
  xyExtent: [[980000, 982500], [195000, 197500]],
  filename: 'data/nyc-lidar/980195-xyzi-p10.bin'
}

// Catskill
// const data = {
//   xyExtent: [[594000, 595499], [4674000, 4675499]],
//   filename: 'data/nyc-lidar/u_5940067400_2016-xyzi-p25.bin'
// }

const MAPCENTER = data.xyExtent.map(coord => (coord[0] + coord[1]) / 2)

const camera = window.camera = createRoamingCamera({
  canvas: rico.canvas,
  zoomSpeed: 4,
  center: [...MAPCENTER.map(v => v - 3000), 4000],
  eye: [...MAPCENTER, 0],
  damping: 0.03,
  stiffness: 0.0001,
  getCameraPosition: () => [...MAPCENTER.map(v => v + (Math.random() - 0.5) * settings.cameraDist), settings.cameraDist * Math.random() * 0.5 + 200]
})

fetch(data.filename)
  .then(res => res.arrayBuffer())
  .then(onLoadData)

function onLoadData (lidarBinaryData) {
  const startTime = performance.now()
  const { values, pointCount } = parseLiDARData(lidarBinaryData)

  const vec4Values = []
  for (let i = 0; i < values.length; i += 4) {
    vec4Values.push(new Float32Array(values.buffer, i * 4, 2))
  }

  const tree = window.tree = new KDBush(vec4Values, p => p[0], p => p[1], 2, Float32Array)

  const SEARCH_BUFFER = 200
  const lineCount = 1000000
  const lineValues = new Float32Array(lineCount * 8)
  let k = 0
  while (k < lineValues.length) {
    const idx1 = Math.random() * pointCount | 0
    const x1 = values[idx1 * 4]
    const y1 = values[idx1 * 4 + 1]
    const z1 = values[idx1 * 4 + 2]
    const i1 = values[idx1 * 4 + 3]

    const idxs = tree.within(x1, y1, SEARCH_BUFFER)

    if (idxs.length === 0) continue

    const idx2 = idxs[Math.random() * idxs.length | 0]
    const x2 = values[idx2 * 4]
    const y2 = values[idx2 * 4 + 1]
    const z2 = values[idx2 * 4 + 2]
    const i2 = values[idx2 * 4 + 3]

    lineValues[k++] = x1
    lineValues[k++] = y1
    lineValues[k++] = z1
    lineValues[k++] = i1
    lineValues[k++] = x2
    lineValues[k++] = y2
    lineValues[k++] = z2
    lineValues[k++] = i2
  }

  console.log({ values, pointCount })

  const interleavedBuffer = rico.createInterleavedBuffer(32, lineValues)

  const vertexArray = rico.createVertexArray()
    .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.UNSIGNED_BYTE, 1, new Uint8Array([0, 1])))
    .instanceAttributeBuffer(1, interleavedBuffer, { type: rico.gl.FLOAT, size: 3, stride: 32, offset: 0 })
    .instanceAttributeBuffer(2, interleavedBuffer, { type: rico.gl.FLOAT, size: 1, stride: 32, offset: 12 })
    .instanceAttributeBuffer(3, interleavedBuffer, { type: rico.gl.FLOAT, size: 3, stride: 32, offset: 16 })
    .instanceAttributeBuffer(4, interleavedBuffer, { type: rico.gl.FLOAT, size: 1, stride: 32, offset: 28 })

  console.log('parse time:', performance.now() - startTime)

  const draw = rico({
    depth: true,
    vertexArray: vertexArray,
    instanceCount: lineCount.length,
    primitive: 'lines',
    vs: injectGLSL(NOISE_GLSL, PALETTE_ANIMATOR_GLSL, `#version 300 es
    precision highp float;

    layout(location=0) in uint idx;
    layout(location=1) in vec3 position1;
    layout(location=2) in float intensity1;
    layout(location=3) in vec3 position2;
    layout(location=4) in float intensity2;

    uniform mat4 projection;
    uniform mat4 view;
    uniform float pointSize;
    uniform float distThreshold;

    out vec3 color;

    void main() {
      float dist = distance(position1, position2);
      if (dist < distThreshold) {
        float t = float(idx);
        float intensity = mix(intensity1, intensity2, t);
        vec3 position = mix(position1, position2, t);
        color = getColorFromPalette(intensity);
        color += vec3(intensity - 0.5) * 0.2;
        gl_PointSize = pointSize;
        gl_Position = projection * view * vec4(position, 1);
      } else {
        color = vec3(0);
        gl_PointSize = 0.0;
        gl_Position = vec4(0);
      }
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
      paletteAnimator.tick(settings.palette)

      draw({
        uniforms: {
          view: camera.getMatrix(),
          projection: mat4.perspective([], Math.PI / 2.5, width / height, 1, 1000000),
          pointSize: settings.pointSize,
          distThreshold: settings.distThreshold,
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

/*
  Binary Data format:

  * numPoints - Uint32
  * offsetX - Float32
  * offsetY - Float32
  * offsetZ - Float32
  * listOfPoints - 14 bytes
    * x - Float32
    * y - Float32
    * z - Float32
    * intensity - Uint16
*/
function parseLiDARData (binaryData) {
  const dataview = new DataView(binaryData)

  let i = 0

  const pointCount = dataview.getUint32(i, true)
  i += 4

  const offset = [
    dataview.getFloat32(i, true),
    dataview.getFloat32(i + 4, true),
    dataview.getFloat32(i + 8, true)
  ]
  i += 12

  const values = new Float32Array(pointCount * 4)

  const uint16Max = 2 ** 16 - 1

  let j = 0
  while (i < binaryData.byteLength) {
    values[j++] = dataview.getFloat32(i, true) + offset[0]
    values[j++] = dataview.getFloat32(i + 4, true) + offset[1]
    values[j++] = dataview.getFloat32(i + 8, true) + offset[2]
    i += 12

    values[j++] = dataview.getUint16(i, true) / uint16Max
    i += 2
  }

  return { values, pointCount }
}
