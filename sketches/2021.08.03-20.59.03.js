const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const { createRico } = require('../lib/dlite/dlite-0.0.12')
const NOISE_GLSL = require('../lib/noise-glsl/noise-glsl-0.0.1')
const injectGLSL = require('../lib/inject-glsl/inject-glsl-0.0.1')

const settings = {
  seed: 1
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)

let rico
try {
  rico = createRico({
    contextAttributes: {
      antialias: true,
      alpha: false,
      depth: true,
      powerPreference: 'high-performance',
      desynchronized: true,
      stencil: false,
      failIfMajorPerformanceCaveat: true
    }
  })
  window.rico = rico
} catch (e) {
  throw new Error(`an error occured while creating a rico instance: ${e}`)
}

let rand, draw

function setup () {
  rand = random.createRandom(settings.seed)

  const vertexArray = rico.createVertexArray()
    .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 2, new Float32Array([
      -1, -1, -1, 1, 1, 1, 1, -1
    ])))

  draw = rico({
    depth: true,
    vertexArray: vertexArray,
    primitive: 'triangle fan',
    count: 4,
    vs: injectGLSL(NOISE_GLSL, `#version 300 es
    precision highp float;

    layout(location=0) in vec2 position;

    out vec4 vColor;

    uniform float time;

    void main() {
      vColor = vec4(1);
      gl_Position = vec4(position * 0.5, 0, 1);
    }
    `),
    fs: `#version 300 es
    precision highp float;
    
    in vec4 vColor;
    out vec4 fragColor;

    void main() {
      fragColor = vColor;
    }
    `
  })
}

const sketch = () => {
  setup()
  return ({ time }) => {
    draw({
      uniforms: {
        time: time
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
