/**
 * Trying implement some of the ideas here: https://www.sagejenson.com/physarum
 */

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.9')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const palettes = require('nice-color-palettes')
const createPaletteAnimator = require('../lib/palette-animator/palette-animator-0.0.1')
const injectGLSL = require('../lib/inject-glsl/inject-glsl-0.0.1')
const NOISE_GLSL = require('../lib/noise-glsl/noise-glsl-0.0.1')

const paletteAnimator = createPaletteAnimator(palettes, 0.001, 0.1, [1, 1, 1])
const { PALETTE_ANIMATOR_GLSL } = paletteAnimator

const rico = window.rico = createRico()

const settings = {
  seed: 0,
  palette: 15,
  agentCount: 2000000,
  pointSize: 1.5,
  stepSize: 0.005,
  headingStepSize: 0.1,
  headingNoiseFreq: 0.1,
  opacity: 0.85
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'palette', 0, 99).step(1)
gui.add(settings, 'agentCount', 1000, 4000000).step(1).onChange(setup)
gui.add(settings, 'pointSize', 0.01, 8)
gui.add(settings, 'stepSize', 0.001, 0.05).step(0.001)
gui.add(settings, 'headingStepSize', 0.01, Math.PI * 0.25)
gui.add(settings, 'headingNoiseFreq', 0, 2)
gui.add(settings, 'opacity', 0, 1)

let updateAgents, agentsBufferData, draw
let rand = random.createRandom(settings.seed)
const agentsVertexArray = rico.createVertexArray()

function setup () {
  rand = random.createRandom(settings.seed)

  const agentsData1 = new Float32Array(settings.agentCount * 4)
  const agentsData2 = new Float32Array(settings.agentCount * 4)

  let i = settings.agentCount
  while (i--) {
    const a = rand.boolean()
    const heading = rand.range(0, Math.PI * 2)
    agentsData1[i * 4 + 0] = a ? rand.range(-1, 1) : (rand.range(-15, 15) | 0) / 15
    agentsData1[i * 4 + 1] = a ? (rand.range(-15, 15) | 0) / 15 : rand.range(-1, 1)
    agentsData1[i * 4 + 2] = heading
    agentsData1[i * 4 + 3] = 0
  }

  agentsBufferData = [
    rico.createVertexBuffer(rico.gl.FLOAT, 4, agentsData1),
    rico.createVertexBuffer(rico.gl.FLOAT, 4, agentsData2)
  ]

  updateAgents = rico({
    count: settings.agentCount,
    vertexArray: agentsVertexArray.vertexAttributeBuffer(0, agentsBufferData[0]),
    transform: { vAgent: agentsBufferData[1] },
    vs: injectGLSL(NOISE_GLSL, `#version 300 es
    precision highp float;

    layout(location=0) in vec4 agent;

    uniform float stepSize;
    uniform float headingStepSize;
    uniform float headingNoiseFreq;
    uniform float time;

    out vec4 vAgent;

    #define TWO_PI 6.28318

    void main() {
      vec2 position = agent.xy;
      float heading = agent.z;

      heading += noiseFractal2D(position + vec2(0, time * 0.2), headingNoiseFreq, vec2(-headingStepSize, headingStepSize));

      position += vec2(cos(heading), sin(heading)) * stepSize;

      // if (dot(position, position) > 3.0) {
      //   position = (random3(agent.zzx * time) + random3(agent.zyy * time).x).yz * 2.0 - vec2(1);
      //   heading = random3(agent.yxx * time).z * TWO_PI;
      // }

      float colorT = noiseFractal2D(position + time * 0.1, 1.0, vec2(-0.15, 1.15));

      vAgent = vec4(position, heading, colorT);
    }
    `)
  })

  draw = rico({
    vertexArray: agentsVertexArray.vertexAttributeBuffer(0, agentsBufferData[1]),
    count: settings.agentCount,
    vs: injectGLSL(PALETTE_ANIMATOR_GLSL, `#version 300 es
    precision highp float;

    layout(location=0) in vec4 agent;

    uniform float pointSize;

    out vec4 vColor;

    void main() {
      vec3 color = getColorFromPalette(agent.w);
      vColor = vec4(color, 1);
      if (dot(agent.xy, agent.xy) > 2.0) {
        gl_Position = vec4(0);
        gl_PointSize = 0.0;
      } else {
        gl_Position = vec4(agent.xy, 0, 1);
        gl_PointSize = pointSize;
      }
    }
    `),
    fs: `#version 300 es
    precision highp float;
    
    in vec4 vColor;
    out vec4 fragColor;

    uniform float opacity;

    void main() {
      vec2 cxy = 2.0 * gl_PointCoord - 1.0;
      float r = dot(cxy, cxy);
      float delta = fwidth(r);
      float alpha = 1.0 - smoothstep(1.0 - delta, 1.0 + delta, r);
      if (r > 1.0) {
        discard;
      }
      fragColor = vColor;
      fragColor.a *= alpha * opacity;
    }
    `,
    blend: {
      csrc: 'src alpha',
      asrc: 'one',
      cdest: 'one minus src alpha',
      adest: 'one minus src alpha'
    }
  })
}

const sketch = () => {
  setup()
  return ({ width, height, time }) => {
    rico.clear(1, 1, 1, 1)

    paletteAnimator.tick(settings.palette)

    updateAgents({
      vertexArray: agentsVertexArray.vertexAttributeBuffer(0, agentsBufferData[0]),
      transform: { vAgent: agentsBufferData[1] },
      uniforms: {
        stepSize: settings.stepSize,
        headingStepSize: settings.headingStepSize,
        headingNoiseFreq: settings.headingNoiseFreq,
        time: time
      }
    })

    draw({
      vertexArray: agentsVertexArray.vertexAttributeBuffer(0, agentsBufferData[1]),
      uniforms: {
        pointSize: settings.pointSize,
        opacity: settings.opacity,
        ...paletteAnimator.uniforms()
      }
    })

    rotate(agentsBufferData)
  }
}

canvasSketch(sketch, {
  canvas: rico.canvas,
  context: 'webgl2',
  pixelRatio: 1,
  animate: true
})

function rotate (arr) {
  arr.push(arr.shift())
  return arr
}
