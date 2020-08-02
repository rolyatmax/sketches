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
  palette: 60,
  stiffness: 0.02,
  damping: 0.15,
  noiseFreq: 200,
  pointSize: 1,
  springDelay: 100,
  pointsScale: 1
}

const gui = new GUI()
gui.add(settings, 'palette', 0, 99).step(1)
gui.add(settings, 'pointSize', 0, 10).step(0.01)
gui.add(settings, 'noiseFreq', 0, 500)
gui.add(settings, 'stiffness', 0.001, 0.1).step(0.001)
gui.add(settings, 'damping', 0.01, 0.5).step(0.01)
gui.add(settings, 'springDelay', 0, 500).step(1)
gui.add(settings, 'pointsScale', 0, 4).step(0.01).onChange(onChangeBuildingScale)
gui.add({ next: () => camera.moveToNextPosition() }, 'next')

// Catskill
const data = {
  xyExtent: [[ 594000, 595499 ], [ 4674000, 4675499 ]],
  filename: 'data/nyc-lidar/u_5940067400_2016.bin'
}

// FiDi
// const data = {
//   xyExtent: [[ 980000, 982500 ], [ 195000, 197500 ]],
//   filename: 'data/nyc-lidar/980195.bin'
// }

const MAPCENTER = data.xyExtent.map(coord => (coord[0] + coord[1]) / 2)

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

fetch(data.filename)
  .then(res => res.arrayBuffer())
  .then(onLoadData)

function onLoadData (lidarBinaryData) {
  const startTime = performance.now()
  const { interleavedPoints, intensityQuintiles, offset, pointCount } = parseLiDARData(lidarBinaryData)
  const positionOffset = offset
  console.log({ interleavedPoints, intensityQuintiles, offset, pointCount })

  const interleavedBuffer = rico.createInterleavedBuffer(8, interleavedPoints)
  const vertexArray = rico.createVertexArray()
    .vertexAttributeBuffer(0, interleavedBuffer, { type: rico.gl.UNSIGNED_SHORT, size: 3, stride: 8, offset: 0, integer: true })
    .vertexAttributeBuffer(1, interleavedBuffer, { type: rico.gl.UNSIGNED_SHORT, size: 1, stride: 8, offset: 6, integer: true })

  console.log('parse time:', performance.now() - startTime)

  const draw = rico({
    depth: true,
    vertexArray: vertexArray,
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
    uniform mat4 springs;
    uniform vec3 positionOffset;
    uniform vec4 intensityQuintiles;

    out vec3 color;

    void main() {
      vec3 p = positionOffset + vec3(position);
      vec3 jitter = vec3(
        noise3D(p, noiseFreq * 20000.0, vec2(-1.0, 1.0)),
        noise3D(p, noiseFreq * 20000.0, vec2(-1.0, 1.0)),
        noise3D(p, noiseFreq * 20000.0, vec2(-1.0, 1.0))
      ) * 10.0;
      p += jitter;
      float springT = noise3D(p, noiseFreq * 20.0, vec2(0.0, 16.0));
      int springIdx = int(springT);
      float scaleA = springs[springIdx / 4][springIdx % 4];
      int springIdx2 = min(15, springIdx + 1);
      float scaleB = springs[springIdx2 / 4][springIdx2 % 4];
      float scale = mix(scaleA, scaleB, fract(springT));

      float i = float(intensity);
      float t = i < intensityQuintiles.x ? 0.1 :
                i < intensityQuintiles.y ? 0.3 :
                i < intensityQuintiles.z ? 0.5 :
                i < intensityQuintiles.w ? 0.7 : 0.9;
      color = getColorFromPalette(t);
      gl_PointSize = pointSize;

      // p.z *= scale;
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

  const sketch = () => {
    return ({ width, height, time }) => {
      rico.clear(0.11, 0.12, 0.13, 1)
      // rico.clear(0.97, 0.98, 0.99, 1)
      camera._camera.up = [0, 0, 1]
      camera.tick()
      paletteAnimator.tick(settings.palette)

      for (const s of scaleSprings) s.tick(settings.stiffness, settings.damping)

      draw({
        uniforms: {
          view: camera.getMatrix(),
          projection: mat4.perspective([], Math.PI / 4, width / height, 1, 1000000),
          pointSize: settings.pointSize,
          noiseFreq: settings.noiseFreq / 10000000,
          springs: scaleSprings.map(s => s.getCurrentValue()),
          positionOffset: positionOffset,
          intensityQuintiles: intensityQuintiles,
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

function isLittleEndian () {
  const buffer = new ArrayBuffer(2)
  new DataView(buffer).setInt16(0, 256, true /* littleEndian */)
  // Int16Array uses the platform's endianness.
  return new Int16Array(buffer)[0] === 256
}
