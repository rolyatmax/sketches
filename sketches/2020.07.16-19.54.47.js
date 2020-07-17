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
const createPaletteAnimator = require('../lib/palette-animator/palette-animator-0.0.1')
const { createSpring } = require('spring-animator')

const paletteAnimator = createPaletteAnimator(palettes, 0.001, 0.1, [0.11, 0.11, 0.11])
const { PALETTE_ANIMATOR_GLSL } = paletteAnimator

const rico = window.rico = createRico()

const settings = {
  palette: 60,
  colorOffset: 0.5,
  colorPow: 2,
  stiffness: 0.02,
  damping: 0.15,
  noiseFreq: 200,
  pointSize: 1,
  springDelay: 100,
  pointsScale: 1,
  zScale: 0
}

const gui = new GUI()
gui.add(settings, 'palette', 0, 99).step(1)
gui.add(settings, 'colorOffset', 0, 1).step(0.01)
gui.add(settings, 'colorPow', 0, 3).step(0.01)
gui.add(settings, 'pointSize', 0, 10).step(0.01)
gui.add(settings, 'noiseFreq', 0, 500)
gui.add(settings, 'stiffness', 0.001, 0.1).step(0.001)
gui.add(settings, 'damping', 0.01, 0.5).step(0.01)
gui.add(settings, 'zScale', -2, 2)
gui.add(settings, 'springDelay', 0, 500).step(1)
gui.add(settings, 'pointsScale', 0, 4).step(0.01).onChange(onChangeBuildingScale)
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

fetch('resources/data/nyc-lidar/987210-sample.bin')
  .then(res => res.arrayBuffer())
  .then(onLoadData)

function onLoadData (lidarBinaryData) {
  const startTime = performance.now()
  const { interleavedPoints, offset, pointCount } = parseLiDARData(lidarBinaryData)
  const positionOffset = offset
  console.log({ interleavedPoints, offset, pointCount })

  const interleavedBuffer = rico.createInterleavedBuffer(8, interleavedPoints)
  const vertexArray = rico.createVertexArray()
    .vertexAttributeBuffer(0, interleavedBuffer, { type: rico.gl.UNSIGNED_SHORT, size: 3, stride: 8, offset: 0, integer: true })
    .vertexAttributeBuffer(1, interleavedBuffer, { type: rico.gl.UNSIGNED_SHORT, size: 1, stride: 8, offset: 6, normalized: true })

  console.log('parse time:', performance.now() - startTime)

  const draw = rico({
    depth: true,
    vertexArray: vertexArray,
    count: pointCount,
    primitive: 'points',
    vs: injectGLSL(NOISE_GLSL, PALETTE_ANIMATOR_GLSL, `#version 300 es
    precision highp float;

    layout(location=0) in uvec3 position;
    layout(location=1) in float intensity;

    uniform mat4 projection;
    uniform mat4 view;
    uniform float pointSize;
    uniform float colorOffset;
    uniform float colorPow;
    uniform float noiseFreq;
    uniform mat4 springs;
    uniform float zScale;
    uniform vec3 positionOffset;

    out vec3 color;

    void main() {
      vec3 p = positionOffset + vec3(position);
      float springT = noise3D(p, noiseFreq * 20.0, vec2(0.0, 16.0));
      int springIdx = int(springT);
      float scaleA = springs[springIdx / 4][springIdx % 4];
      int springIdx2 = min(15, springIdx + 1);
      float scaleB = springs[springIdx2 / 4][springIdx2 % 4];
      float scale = mix(scaleA, scaleB, fract(springT));

      float t = intensity;
      color = getColorFromPalette(pow(t + colorOffset, colorPow));
      gl_PointSize = pointSize;

      p.z *= scale;
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
          colorOffset: settings.colorOffset,
          colorPow: settings.colorPow,
          noiseFreq: settings.noiseFreq / 10000000,
          zScale: settings.zScale,
          springs: scaleSprings.map(s => s.getCurrentValue()),
          positionOffset: positionOffset,
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

  return { interleavedPoints, pointCount, offset }
}

function isLittleEndian () {
  const buffer = new ArrayBuffer(2)
  new DataView(buffer).setInt16(0, 256, true /* littleEndian */)
  // Int16Array uses the platform's endianness.
  return new Int16Array(buffer)[0] === 256
}
