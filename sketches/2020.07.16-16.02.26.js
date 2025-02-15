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
  stiffness: 0.006,
  damping: 0.15,
  noiseFreq: 300,
  pointSize: 1,
  springDelay: 250,
  pointsScale: 1,
  zScale: 20
}

const gui = new GUI()
gui.add(settings, 'palette', 0, 99).step(1)
gui.add(settings, 'colorOffset', 0, 1).step(0.01)
gui.add(settings, 'colorPow', 0, 3).step(0.01)
gui.add(settings, 'pointSize', 0, 10).step(0.01)
gui.add(settings, 'noiseFreq', 0, 500)
gui.add(settings, 'stiffness', 0.001, 0.1).step(0.001)
gui.add(settings, 'damping', 0.01, 0.5).step(0.01)
gui.add(settings, 'zScale', -1000, 1000)
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
  getCameraPosition: () => [...MAPCENTER.map(v => v + Math.random() * 2000 - 1000), 1000 * Math.random() + 100]
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

fetch('data/nyc-lidar/987210.bin')
  .then(res => res.arrayBuffer())
  .then(onLoadData)

function onLoadData (lidarBinaryData) {
  const startTime = performance.now()
  const { positions, intensities, classifications } = parseLiDARData(lidarBinaryData)
  console.log('parse time:', performance.now() - startTime)

  console.log({ positions, intensities, classifications })

  const vertexArray = rico.createVertexArray()
    .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 3, positions))
    .vertexAttributeBuffer(1, rico.createVertexBuffer(rico.gl.UNSIGNED_SHORT, 1, intensities), { normalized: true })
    .vertexAttributeBuffer(2, rico.createVertexBuffer(rico.gl.UNSIGNED_BYTE, 1, classifications), { normalized: true })

  const draw = rico({
    depth: true,
    vertexArray: vertexArray,
    count: positions.length / 3,
    primitive: 'points',
    vs: injectGLSL(NOISE_GLSL, PALETTE_ANIMATOR_GLSL, `#version 300 es
    precision highp float;

    layout(location=0) in vec3 position;
    layout(location=1) in float intensity;
    layout(location=2) in float classification;

    uniform mat4 projection;
    uniform mat4 view;
    uniform float pointSize;
    uniform float colorOffset;
    uniform float colorPow;
    uniform float noiseFreq;
    uniform mat4 springs;
    uniform float zScale;

    out vec3 color;

    void main() {
      float angle = noise3D(position, noiseFreq * 20.0, vec2(0.0, 6.283));
      vec3 offset = vec3(cos(angle), sin(angle), 0) * 100.0;

      float springT = noise3D(position, noiseFreq * 20.0, vec2(0.0, 16.0));
      int springIdx = int(springT);
      float scaleA = springs[springIdx / 4][springIdx % 4];
      int springIdx2 = min(15, springIdx + 1);
      float scaleB = springs[springIdx2 / 4][springIdx2 % 4];
      float scale = mix(scaleA, scaleB, fract(springT));

      float t = intensity;
      color = getColorFromPalette(pow(t + colorOffset, colorPow));
      gl_PointSize = pointSize;

      vec3 pos = position + offset * (1.0 - scale);
      pos.z *= scale;
      pos.z += (1.0 - scale) * zScale;
      gl_Position = projection * view * vec4(pos, 1);
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
// pt1 classification - uint8
// pt2...
*/
function parseLiDARData (binaryData) {
  const littleEndian = isLittleEndian()
  const dataview = new DataView(binaryData)

  let i = 0

  const pointCount = dataview.getUint32(i, littleEndian)
  i += 4

  const xOffset = dataview.getInt32(i, littleEndian)
  const yOffset = dataview.getInt32(i + 4, littleEndian)
  const zOffset = dataview.getInt32(i + 8, littleEndian)
  i += 12

  const positions = new Float32Array(pointCount * 3)
  const intensities = new Int16Array(pointCount)
  const classifications = new Uint8Array(pointCount)

  let curPtIdx = 0

  while (i < binaryData.byteLength) {
    positions[curPtIdx * 3] = dataview.getUint16(i, littleEndian) + xOffset
    positions[curPtIdx * 3 + 1] = dataview.getUint16(i + 2, littleEndian) + yOffset
    positions[curPtIdx * 3 + 2] = dataview.getUint16(i + 4, littleEndian) + zOffset
    i += 6

    intensities[curPtIdx] = dataview.getUint16(i, littleEndian)
    i += 2

    classifications[curPtIdx] = dataview.getUint8(i, littleEndian)
    i += 1

    curPtIdx += 1
  }

  return { positions, intensities, classifications }
}

function isLittleEndian () {
  const buffer = new ArrayBuffer(2)
  new DataView(buffer).setInt16(0, 256, true /* littleEndian */)
  // Int16Array uses the platform's endianness.
  return new Int16Array(buffer)[0] === 256
}
