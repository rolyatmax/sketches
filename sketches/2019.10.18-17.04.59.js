/**
 * Trying implement some of the ideas here: https://www.sagejenson.com/physarum
 */

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.10')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const palettes = require('nice-color-palettes')
const createPaletteAnimator = require('../lib/palette-animator/palette-animator-0.0.1')
const injectGLSL = require('../lib/inject-glsl/inject-glsl-0.0.1')
const NOISE_GLSL = require('../lib/noise-glsl/noise-glsl-0.0.1')

const paletteAnimator = createPaletteAnimator(palettes, 0.001, 0.1, 91)
const { PALETTE_ANIMATOR_GLSL } = paletteAnimator

const rico = window.rico = createRico()

const settings = {
  seed: 0,
  palette: 15,
  agentCount: 2000000,
  headingStartGranularity: 3,
  randomStart: true,
  pointSize: 0.01,
  stepSize: 0.0015,
  headingStepSize: 10,
  sensorAngle: 2,
  sensorDist: 0.04,
  decay: 0.98,
  diffuse: 2,
  trailIntensity: 0.02,
  wrap: true
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'palette', 0, 99).step(1)
gui.add(settings, 'agentCount', 1000, 4000000).step(1).onChange(setup)
gui.add(settings, 'headingStartGranularity', 1, 90).step(1).onChange(setup)
gui.add(settings, 'randomStart').onChange(setup)
gui.add(settings, 'pointSize', 0.01, 8)
gui.add(settings, 'stepSize', 0.0001, 0.005).step(0.0001)
gui.add(settings, 'headingStepSize', 1, 90)
gui.add(settings, 'sensorAngle', 1, 90)
gui.add(settings, 'sensorDist', 0.0001, 0.5)
gui.add(settings, 'decay', 0.8, 0.999).step(0.001)
gui.add(settings, 'diffuse', 0, 4).step(1)
gui.add(settings, 'trailIntensity', 0, 1)
gui.add(settings, 'wrap')

let updateAgents, agentsBufferData, trailMapFramebuffers, drawPoints, renderTrails, processTrails
let rand = random.createRandom(settings.seed)
const agentsVertexArray = rico.createVertexArray()

function setup () {
  rand = random.createRandom(settings.seed)

  const agentsData1 = new Float32Array(settings.agentCount * 4)
  const agentsData2 = new Float32Array(settings.agentCount * 4)

  let i = settings.agentCount
  while (i--) {
    const g = 10
    const s = settings.headingStartGranularity
    const a = rand.boolean()
    const heading = ((rand.range(0, s) | 0) / s) * Math.PI * 2
    if (settings.randomStart) {
      agentsData1[i * 4 + 0] = rand.range(-1, 1)
      agentsData1[i * 4 + 1] = rand.range(-1, 1)
    } else {
      agentsData1[i * 4 + 0] = a ? rand.range(-1, 1) : (rand.range(-g, g) | 0) / g
      agentsData1[i * 4 + 1] = a ? (rand.range(-g, g) | 0) / g : rand.range(-1, 1)
    }
    agentsData1[i * 4 + 2] = heading + Math.PI / 8
    agentsData1[i * 4 + 3] = rand.range(0, 1)
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
    uniform float sensorAngle;
    uniform float sensorDist;
    uniform float time;
    uniform sampler2D trailMap;
    uniform vec2 dimensions;
    uniform float wrap;

    out vec4 vAgent;

    #define TWO_PI 6.28318

    void main() {
      vec2 position = agent.xy;
      float heading = agent.z;
      float randVal = agent.w;

      float sAngle = sensorAngle / 360.0 * TWO_PI;

      float aspect = dimensions.x / dimensions.y;

      vec2 fSensorVec = vec2(cos(heading), sin(heading)) * sensorDist;
      fSensorVec.x /= aspect;
      vec2 lSensorVec = vec2(cos(heading - sAngle), sin(heading - sAngle)) * sensorDist;
      lSensorVec.x /= aspect;
      vec2 rSensorVec = vec2(cos(heading + sAngle), sin(heading + sAngle)) * sensorDist;
      rSensorVec.x /= aspect;

      vec2 fUV = ((position + fSensorVec) + 1.0) / 2.0;
      vec2 lUV = ((position + lSensorVec) + 1.0) / 2.0;
      vec2 rUV = ((position + rSensorVec) + 1.0) / 2.0;

      float fVal = texture(trailMap, fUV).x;
      float lVal = texture(trailMap, lUV).x;
      float rVal = texture(trailMap, rUV).x;

      float hAngleStep = headingStepSize / 360.0 * TWO_PI;

      if (fVal > lVal && fVal > rVal) {
        heading += 0.0;
      } else if (fVal < lVal && fVal < rVal) {
        float r = random3(agent.yzw * time * agent.w).x;
        heading += r > 0.0 ? hAngleStep : -hAngleStep;
      } else if (lVal < rVal) {
        heading += hAngleStep;
      } else if (rVal < lVal) {
        heading -= hAngleStep;
      }

      vec2 velocity = vec2(cos(heading), sin(heading)) * stepSize;
      velocity.x /= aspect;
      position += velocity;

      if (wrap == 1.0) {
        if (length(position) > 0.8) {
          position = normalize(position) * -0.8;
        }
      }

      vAgent = vec4(position, heading, randVal);
    }
    `)
  })

  const trailMapTexture1 = rico.createTexture2D(rico.gl.drawingBufferWidth, rico.gl.drawingBufferHeight)
  const trailMapTexture2 = rico.createTexture2D(rico.gl.drawingBufferWidth, rico.gl.drawingBufferHeight)

  trailMapFramebuffers = [
    rico.createFramebuffer().colorTarget(0, trailMapTexture1),
    rico.createFramebuffer().colorTarget(0, trailMapTexture2)
  ]

  drawPoints = rico({
    vertexArray: agentsVertexArray.vertexAttributeBuffer(0, agentsBufferData[1]),
    count: settings.agentCount,
    primitive: 'points',
    vs: `#version 300 es
    precision highp float;

    layout(location=0) in vec4 agent;

    uniform float pointSize;

    out vec4 vColor;

    void main() {
      vColor = vec4(1);
      if (dot(agent.xy, agent.xy) > 2.0) {
        gl_Position = vec4(0);
        gl_PointSize = 0.0;
      } else {
        gl_Position = vec4(agent.xy, 0, 1);
        gl_PointSize = pointSize;
      }
    }
    `,
    fs: `#version 300 es
    precision highp float;
    
    in vec4 vColor;
    out vec4 fragColor;

    uniform float trailIntensity;

    void main() {
      vec2 cxy = 2.0 * gl_PointCoord - 1.0;
      float r = dot(cxy, cxy);
      float delta = fwidth(r);
      float alpha = 1.0 - smoothstep(1.0 - delta, 1.0 + delta, r);
      if (r > 1.0) {
        discard;
      }
      fragColor = vColor;
      fragColor *= alpha * trailIntensity;
    }
    `,
    blend: {
      equation: 'func add',
      src: 'one',
      dest: 'one'
    }
  })

  processTrails = rico({
    vertexArray: rico.createVertexArray()
      .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 2, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]))),
    count: 4,
    primitive: 'triangle fan',
    vs: `#version 300 es
    precision highp float;
    layout(location=0) in vec2 position;
    out vec2 vUV;
    void main() {
      vUV = 0.5 * (1.0 + position);
      gl_Position = vec4(position, 0, 1);
    }
    `,
    fs: `#version 300 es
    precision highp float;
    in vec2 vUV;
    out vec4 fragColor;
    uniform sampler2D trailMap;
    uniform vec2 dimensions;
    uniform float decay;
    uniform float diffuse;
    void main() {
      float totalPixels = pow(diffuse * 2.0 + 1.0, 2.0);
      float sum = texture(trailMap, vUV).x / totalPixels;
      for (float w = -diffuse; w <= diffuse; w += 1.0) {
        for (float h = -diffuse; h <= diffuse; h += 1.0) {
          vec2 pixel = vUV + vec2(w, h) / dimensions;
          if (pixel == vUV || pixel.x < 0.0 || pixel.x > 1.0 || pixel.y < 0.0 || pixel.y > 1.0) {
            continue;
          }
          sum += texture(trailMap, pixel).x / totalPixels * decay;
        }
      }

      float value = sum;
      fragColor = vec4(value, value, value, 1);
    }
    `,
    blend: false
  })

  renderTrails = rico({
    vertexArray: rico.createVertexArray()
      .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 2, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]))),
    count: 4,
    primitive: 'triangle fan',
    vs: `#version 300 es
    precision highp float;
    layout(location=0) in vec2 position;
    out vec2 vUV;
    void main() {
      vUV = 0.5 * (1.0 + position);
      gl_Position = vec4(position, 0, 1);
    }
    `,
    fs: injectGLSL(PALETTE_ANIMATOR_GLSL, `#version 300 es
    precision highp float;
    in vec2 vUV;
    out vec4 fragColor;
    uniform sampler2D trailMap;
    void main() {
      float val = texture(trailMap, vUV).x;
      vec3 color = getColorFromPalette(val);
      fragColor = vec4(color, 1);
    }
    `),
    blend: false
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
        sensorAngle: settings.sensorAngle,
        sensorDist: settings.sensorDist,
        time: time,
        trailMap: trailMapFramebuffers[0].colorAttachments[0],
        dimensions: [width, height],
        wrap: settings.wrap ? 1 : 0
      }
    })

    drawPoints({
      framebuffer: trailMapFramebuffers[0],
      vertexArray: agentsVertexArray.vertexAttributeBuffer(0, agentsBufferData[1]),
      uniforms: {
        pointSize: settings.pointSize,
        trailIntensity: settings.trailIntensity
      }
    })

    processTrails({
      framebuffer: trailMapFramebuffers[1],
      uniforms: {
        dimensions: [width, height],
        decay: settings.decay,
        diffuse: settings.diffuse,
        trailMap: trailMapFramebuffers[0].colorAttachments[0]
      }
    })

    renderTrails({
      uniforms: {
        trailMap: trailMapFramebuffers[1].colorAttachments[0],
        ...paletteAnimator.uniforms()
      }
    })

    drawPoints({
      vertexArray: agentsVertexArray.vertexAttributeBuffer(0, agentsBufferData[1]),
      uniforms: {
        pointSize: settings.pointSize,
        trailIntensity: 0.1
      }
    })

    rotate(agentsBufferData)
    rotate(trailMapFramebuffers)
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
