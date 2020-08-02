/* global fetch, performance */

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.10')
const { GUI } = require('dat-gui')
const mat4 = require('gl-mat4')
const createRoamingCamera = require('../lib/roaming-camera/roaming-camera-0.0.1')
const injectGLSL = require('../lib/inject-glsl/inject-glsl-0.0.1')
const NOISE_GLSL = require('../lib/noise-glsl/noise-glsl-0.0.1')
const palettes = require('nice-color-palettes')
const createPaletteAnimator = require('../lib/palette-animator/palette-animator-0.0.1')
const { createSpring } = require('spring-animator')

const paletteAnimator = createPaletteAnimator(palettes, 0.001, 0.1, [0.11, 0.11, 0.11])
const { PALETTE_ANIMATOR_GLSL } = paletteAnimator

const rico = window.rico = createRico()

const settings = {
  palette: 69,
  pointSize: 1,
  cameraDist: 2000,
  bounce: 'first'
}

const gui = new GUI()
gui.add(settings, 'palette', 0, 99).step(1)
gui.add(settings, 'pointSize', 0, 10).step(0.01)
gui.add(settings, 'cameraDist', 100, 8000)
gui.add(settings, 'bounce', ['first', 'last'])
gui.add({ next: () => camera.moveToNextPosition() }, 'next')

// FiDi
const data = {
  xyExtent: [[ 980000, 982500 ], [ 195000, 197500 ]],
  filename: 'data/nyc-lidar/980195-xyzicrn.bin'
}

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
  const { outbuffer, pointCount } = parseLiDARData(lidarBinaryData)

  console.log({ outbuffer, pointCount })

  const interleavedBuffer = rico.createInterleavedBuffer(16, new DataView(outbuffer))
  const vertexArray = rico.createVertexArray()
    .vertexAttributeBuffer(0, interleavedBuffer, { type: rico.gl.FLOAT, size: 3, stride: 16, offset: 0 })
    .vertexAttributeBuffer(1, interleavedBuffer, { type: rico.gl.UNSIGNED_SHORT, size: 1, stride: 16, offset: 12, normalized: true })
    .vertexAttributeBuffer(2, interleavedBuffer, { type: rico.gl.UNSIGNED_BYTE, size: 1, stride: 16, offset: 14, integer: true })
    .vertexAttributeBuffer(3, interleavedBuffer, { type: rico.gl.UNSIGNED_BYTE, size: 1, stride: 16, offset: 15, integer: true })

  console.log('parse time:', performance.now() - startTime)

  const draw = rico({
    depth: true,
    vertexArray: vertexArray,
    count: pointCount,
    primitive: 'points',
    vs: injectGLSL(NOISE_GLSL, PALETTE_ANIMATOR_GLSL, `#version 300 es
    precision highp float;

    layout(location=0) in vec3 position;
    layout(location=1) in float intensity;
    layout(location=2) in uint returnNum;
    layout(location=3) in uint numOfReturns;

    uniform mat4 projection;
    uniform mat4 view;
    uniform float pointSize;
    uniform float bounce;

    out vec3 color;

    void main() {
      float retNum = float(returnNum) - 1.0;
      float numOfRets = float(numOfReturns) - 1.0;

      if (numOfRets == 0.0 || bounce == (retNum / numOfRets)) {
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
          bounce: settings.bounce === 'first' ? 0 : 1,
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
  * listOfPoints - 17 bytes
    * x - Float32
    * y - Float32
    * z - Float32
    * intensity - Uint16
    * classification - Uint8
    * returnNum - Uint8
    * numOfReturns - Uint8
*/
function parseLiDARData (binaryData) {
  const le = true // littleEndian
  const dataview = new DataView(binaryData)

  let i = 0

  const pointCount = dataview.getUint32(i, le)
  i += 4

  const offset = [
    dataview.getFloat32(i, le),
    dataview.getFloat32(i + 4, le),
    dataview.getFloat32(i + 8, le)
  ]
  i += 12

  const outbuffer = new ArrayBuffer(pointCount * 16)
  const outDataview = new DataView(outbuffer)

  let j = 0
  while (j < outbuffer.byteLength) {
    // x
    outDataview.setFloat32(j, dataview.getFloat32(i, le) + offset[0], le)
    j += 4
    i += 4
    // y
    outDataview.setFloat32(j, dataview.getFloat32(i, le) + offset[1], le)
    j += 4
    i += 4
    // z
    outDataview.setFloat32(j, dataview.getFloat32(i, le) + offset[2], le)
    j += 4
    i += 4
    // intensity
    outDataview.setUint16(j, dataview.getUint16(i, le), le)
    j += 2
    i += 2

    // classification // ignoring for now
    i += 1

    // returnNum
    outDataview.setUint8(j, dataview.getUint8(i, le), le)
    j += 1
    i += 1
    // numOfReturns
    outDataview.setUint8(j, dataview.getUint8(i, le), le)
    j += 1
    i += 1
  }

  return { outbuffer, pointCount }
}
