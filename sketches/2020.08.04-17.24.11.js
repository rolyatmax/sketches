const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.9')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const { createSpring } = require('spring-animator')
const createRoamingCamera = require('../lib/roaming-camera/roaming-camera-0.0.1')
const mat4 = require('gl-mat4')
const palettes = require('nice-color-palettes')
const createPaletteAnimator = require('../lib/palette-animator/palette-animator-0.0.1')
const injectGLSL = require('../lib/inject-glsl/inject-glsl-0.0.1')
const NOISE_GLSL = require('../lib/noise-glsl/noise-glsl-0.0.1')

const paletteAnimator = createPaletteAnimator(palettes, 0.001, 0.1, 0)
const { PALETTE_ANIMATOR_GLSL } = paletteAnimator

const rico = window.rico = createRico()

const settings = {
  seed: 0,
  palette: 50,
  pointSize: 0.01,
  pointCount: 1000000,
  colorVariance: 2,
  fov: Math.PI / 4,
  cameraDist: 0.8
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'palette', 0, 99).step(1)
gui.add(settings, 'pointCount', 1, 1000000).step(1).onChange(setup)
gui.add(settings, 'colorVariance', 0, 3)
gui.add(settings, 'fov', Math.PI / 100, Math.PI * 0.95)
gui.add(settings, 'pointSize', 0.001, 0.01).step(0.0001)
gui.add(settings, 'cameraDist', 0, 20)
gui.add({ next: () => camera.moveToNextPosition() }, 'next')

let draw, randomVal
let rand = random.createRandom(settings.seed)

const camera = createRoamingCamera({
  canvas: rico.canvas,
  zoomSpeed: 4,
  center: [0.1, 0.1, 0.1],
  eye: [0, 0, 0],
  damping: 0.003,
  stiffness: 0.00001,
  getCameraPosition: () => rand.onSphere(settings.cameraDist)
})

const colorVarianceSpring = createSpring(0.001, 0.03, settings.colorVariance)
const fovSpring = createSpring(0.001, 0.03, settings.fov)

function setup () {
  rand = random.createRandom(settings.seed)
  randomVal = rand.value()

  const pointsCount = settings.pointCount

  const positionsData = new Float32Array(pointsCount * 3)
  const rotationsData = new Float32Array(pointsCount * 4)

  let i = pointsCount
  while (i--) {
    const pos = rand.onSphere()
    positionsData[i * 3 + 0] = pos[0]
    positionsData[i * 3 + 1] = pos[1]
    positionsData[i * 3 + 2] = pos[2]

    const axis = rand.onSphere()
    rotationsData[i * 4 + 0] = Math.PI // rand.range(Math.PI * 2)
    rotationsData[i * 4 + 1] = axis[0]
    rotationsData[i * 4 + 2] = axis[1]
    rotationsData[i * 4 + 3] = axis[2]
  }

  draw = rico({
    vertexArray: rico.createVertexArray()
      .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 2, new Float32Array([-1, 1, -1, -1, 1, -1, 1, 1])))
      .instanceAttributeBuffer(1, rico.createVertexBuffer(rico.gl.FLOAT, 3, positionsData))
      .instanceAttributeBuffer(2, rico.createVertexBuffer(rico.gl.FLOAT, 4, rotationsData)),
    instanceCount: pointsCount,
    primitive: 'triangle fan',
    depth: true,
    vs: injectGLSL(NOISE_GLSL, PALETTE_ANIMATOR_GLSL, `#version 300 es
    precision highp float;

    layout(location=0) in vec2 quadPosition;
    layout(location=1) in vec3 position;
    layout(location=2) in vec4 rotation;

    out vec3 vColor;
    out vec3 vPosition;
    out vec2 vQuadPosition;
    out vec3 vRandom;

    uniform float time;
    uniform float colorVariance;
    uniform float randomVal;
    uniform float pointSize;
    uniform mat4 projection;
    uniform mat4 view;

    void main() {
      vec2 range = vec2(-0.1, 1.1);
      vec3 p = position;
      float colorT1 = noise3D(p * colorVariance + vec3((time + randomVal * 10.0) * 0.1, 0, 0), 1.0, range);
      float colorT2 = noise3D(p * colorVariance * 2.0 + vec3((time + randomVal * 100.0) * 0.1, 50, 980), 1.0, range);
      float colorT3 = noise3D(p * colorVariance * 1.5 + vec3((time + randomVal * 10.0) * 0.2, 99999, 2), 1.0, range);
      float colorT4 = noise3D(p * colorVariance * 0.5 + vec3((time + randomVal * 6.0) * 0.6, 0, 200), 1.0, range);
      float colorT5 = noise3D(p * colorVariance * 2.5 + vec3((time + randomVal * 2.0) * 0.05, 999, -51), 1.0, range);
      float colorT = max(max(max(max(colorT1, colorT2), colorT3), colorT4), colorT5);
      vColor = getColorFromPalette(colorT);
      vPosition = position;
      vQuadPosition = quadPosition;
      vRandom = rotation.yzw;

      vec4 rotated = view * vec4(position, 1);
      rotated.xy += quadPosition * pointSize;
      gl_Position = projection * rotated;
    }
    `),
    fs: injectGLSL(NOISE_GLSL, `#version 300 es
    precision highp float;
    
    in vec3 vColor;
    in vec3 vPosition;
    in vec2 vQuadPosition;
    in vec3 vRandom;
    out vec4 fragColor;

    uniform mat4 view;
    uniform float pointSize;

    void main() {
      float xySquared = dot(vQuadPosition, vQuadPosition);
      float d = 1.0 - step(1.0, xySquared);
      if (d == 0.0) {
        discard;
        return;
      }
      vec3 r = random3(vec3(vQuadPosition + vRandom.xy, vRandom.z));
      fragColor = vec4(vColor, 1);
    }
    `)
  })
}

const sketch = () => {
  setup()
  return ({ width, height, time }) => {
    camera.tick()
    rico.clear(1, 1, 1, 1)
    colorVarianceSpring.setDestination(settings.colorVariance)
    colorVarianceSpring.tick()
    fovSpring.setDestination(settings.fov)
    fovSpring.tick()
    paletteAnimator.tick(settings.palette)

    draw({
      uniforms: {
        cameraPosition: camera._camera.eye,
        view: camera.getMatrix(),
        projection: mat4.perspective([], fovSpring.getCurrentValue(), width / height, 0.01, 1000),
        time: time,
        rand: randomVal,
        pointSize: settings.pointSize,
        colorVariance: colorVarianceSpring.getCurrentValue(),
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
