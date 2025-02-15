/**
 * Trying implement some of the ideas here: https://www.sagejenson.com/physarum
 */

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.10')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const createRoamingCamera = require('../lib/roaming-camera/roaming-camera-0.0.1')
const mat4 = require('gl-mat4')
const palettes = require('nice-color-palettes')
const createPaletteAnimator = require('../lib/palette-animator/palette-animator-0.0.1')
const injectGLSL = require('../lib/inject-glsl/inject-glsl-0.0.1')
const NOISE_GLSL = require('../lib/noise-glsl/noise-glsl-0.0.1')

const DIMENSIONS = [256, 256, 256]

const rico = window.rico = createRico()

const settings = {
  seed: 0,
  palette: 15,
  agentCount: 60000,
  pointSize: 0.8,
  renderPointSize: 1.8,
  renderPointOpacity: 0.25,
  trailMapOpacity: 0.05,
  stepSize: 0.055,
  headingStepSpread: 0.28,
  sensorSpread: 0.4,
  sensorDist: 0.03,
  decay: 0.99,
  diffuse: 1,
  trailIntensity: 0.55,
  cameraDist: 4,
  wrap: true,
  renderPoints: true,
  renderTrails: true
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'palette', 10, 20).step(1)
gui.add(settings, 'agentCount', 1000, 800000).step(1).onChange(setup)
gui.add(settings, 'pointSize', 0.01, 8)
gui.add(settings, 'renderPointSize', 0.01, 8)
gui.add(settings, 'renderPointOpacity', 0.01, 1).step(0.01)
gui.add(settings, 'trailMapOpacity', 0.01, 1)
gui.add(settings, 'stepSize', 0.001, 0.2).step(0.001)
gui.add(settings, 'headingStepSpread', 0.01, 5).step(0.01)
gui.add(settings, 'sensorSpread', 0.01, 5).step(0.01)
gui.add(settings, 'sensorDist', 0.0001, 0.5)
gui.add(settings, 'decay', 0.3, 0.999).step(0.001)
gui.add(settings, 'diffuse', 0, 4).step(1)
gui.add(settings, 'trailIntensity', 0, 1)
gui.add(settings, 'cameraDist', 0, 20)
gui.add(settings, 'wrap')
gui.add(settings, 'renderPoints')
gui.add(settings, 'renderTrails')
gui.add({ next: () => camera.moveToNextPosition() }, 'next')
gui.add({ restart: setup }, 'restart')

const paletteAnimator = createPaletteAnimator(palettes, 0.001, 0.1, settings.palette - 1)
const { PALETTE_ANIMATOR_GLSL } = paletteAnimator

let updateAgents, agentsPositionsBuffers, agentsHeadingsBuffers, trailMapFramebuffers, layTrails, renderTrails, processTrails, drawPoints
let rand = random.createRandom(settings.seed)

const camera = createRoamingCamera({
  canvas: rico.canvas,
  zoomSpeed: 4,
  center: [settings.cameraDist, -settings.cameraDist, -settings.cameraDist],
  eye: [0, 0, 0],
  damping: 0.003,
  stiffness: 0.00001,
  getCameraPosition: () => rand.onSphere(settings.cameraDist)
})

const agentsVertexArray = rico.createVertexArray()

function setup () {
  rand = random.createRandom(settings.seed)

  const agentsPositionData1 = new Float32Array(settings.agentCount * 3)
  const agentsPositionData2 = new Float32Array(settings.agentCount * 3)

  const agentsHeadingData1 = new Float32Array(settings.agentCount * 3)
  const agentsHeadingData2 = new Float32Array(settings.agentCount * 3)

  const agentsRandData = new Float32Array(settings.agentCount)

  let i = settings.agentCount
  while (i--) {
    // position as vec3
    agentsPositionData1[i * 3 + 0] = rand.range(-1, 1)
    agentsPositionData1[i * 3 + 1] = rand.range(-1, 1)
    agentsPositionData1[i * 3 + 2] = rand.range(-1, 1)

    // heading as vec3
    const heading = rand.onSphere()
    agentsHeadingData1[i * 3 + 0] = heading[0]
    agentsHeadingData1[i * 3 + 1] = heading[1]
    agentsHeadingData1[i * 3 + 2] = heading[2]

    // randVal
    agentsRandData[i] = rand.range(0, 1)
  }

  agentsPositionsBuffers = [
    rico.createVertexBuffer(rico.gl.FLOAT, 3, agentsPositionData1),
    rico.createVertexBuffer(rico.gl.FLOAT, 3, agentsPositionData2)
  ]

  agentsHeadingsBuffers = [
    rico.createVertexBuffer(rico.gl.FLOAT, 3, agentsHeadingData1),
    rico.createVertexBuffer(rico.gl.FLOAT, 3, agentsHeadingData2)
  ]

  const agentsRandsBuffer = rico.createVertexBuffer(rico.gl.FLOAT, 1, agentsRandData)

  updateAgents = rico({
    count: settings.agentCount,
    vertexArray: agentsVertexArray
      .vertexAttributeBuffer(0, agentsPositionsBuffers[0])
      .vertexAttributeBuffer(1, agentsHeadingsBuffers[0])
      .vertexAttributeBuffer(2, agentsRandsBuffer),
    transform: {
      vPosition: agentsPositionsBuffers[1],
      vHeading: agentsHeadingsBuffers[1]
    },
    vs: injectGLSL(NOISE_GLSL, `#version 300 es
    precision highp float;
    precision lowp sampler3D;

    layout(location=0) in vec3 p;
    layout(location=1) in vec3 h;
    layout(location=2) in float randVal;

    uniform float stepSize;
    uniform float headingStepSpread;
    uniform float sensorSpread;
    uniform float sensorDist;
    uniform float time;
    uniform sampler3D trailMap;
    uniform vec3 dimensions;
    uniform float wrap;

    out vec3 vPosition;
    out vec3 vHeading;

    #define TWO_PI 6.28318
    // SENSORS_COUNT - not including the front sensor
    #define SENSORS_COUNT 3.0

    vec3 getPoint(mat3 m, float angleSize, float ptIdx, float offset) {
      float rads = ptIdx * TWO_PI;
      vec2 position = vec2(cos(rads), sin(rads));
      vec3 p = m * vec3(position * angleSize, 1.0);
      return normalize(p);
    }

    void main() {
      vec3 position = p;
      vec3 heading = h;

      vec3 a = heading;
      vec3 r = vec3(dot(a, a) / a.x, 0, 0);
      vec3 ar = normalize(r - a);
      r = a + ar;
      vec3 oa = a;
      vec3 an = cross(ar, oa);
      mat3 m = mat3(ar, an, oa);

      float angleOffset = random3((heading.yzx + position) * time * randVal).x * TWO_PI * 0.5;

      vec3 sensor0Vec = heading * sensorDist;
      vec3 sensor1Vec = getPoint(m, sensorSpread, 0.0, angleOffset) * sensorDist;
      vec3 sensor2Vec = getPoint(m, sensorSpread, 1.0 / SENSORS_COUNT, angleOffset) * sensorDist;
      vec3 sensor3Vec = getPoint(m, sensorSpread, 2.0 / SENSORS_COUNT, angleOffset) * sensorDist;

      vec3 uv0 = ((position + sensor0Vec) + 1.0) / 2.0;
      vec3 uv1 = ((position + sensor1Vec) + 1.0) / 2.0;
      vec3 uv2 = ((position + sensor2Vec) + 1.0) / 2.0;
      vec3 uv3 = ((position + sensor3Vec) + 1.0) / 2.0;

      float val0 = texture(trailMap, uv0).x;
      float val1 = texture(trailMap, uv1).x;
      float val2 = texture(trailMap, uv2).x;
      float val3 = texture(trailMap, uv3).x;

      if (val0 > val1 && val0 > val2 && val0 > val3) {
        heading += vec3(0);
      } else if (val0 < val1 && val0 < val2 && val0 < val3) {
        float r = random3((position.yzx + heading) * time * randVal).x + 0.5;
        if (r < 0.33) {
          heading = getPoint(m, headingStepSpread, 0.0, angleOffset);
        } else if (r < 0.66) {
          heading = getPoint(m, headingStepSpread, 1.0 / SENSORS_COUNT, angleOffset);
        } else {
          heading = getPoint(m, headingStepSpread, 2.0 / SENSORS_COUNT, angleOffset);
        }
      } else if (val1 > val2 && val1 > val3) {
        heading = getPoint(m, headingStepSpread, 0.0, angleOffset);
      } else if (val2 > val1 && val2 > val3) {
        heading = getPoint(m, headingStepSpread, 1.0 / SENSORS_COUNT, angleOffset);
      } else if (val3 > val1 && val3 > val2) {
        heading = getPoint(m, headingStepSpread, 2.0 / SENSORS_COUNT, angleOffset);
      }

      vec3 velocity = heading * stepSize * 0.1;
      position += velocity;

      if (wrap == 1.0 && dot(position, position) > 1.0) {
        position *= -1.0;
        position = normalize(position);
        // if (position.x < -1.0) position.x += 2.0;
        // if (position.y < -1.0) position.y += 2.0;
        // if (position.z < -1.0) position.z += 2.0;
        // if (position.x > 1.0) position.x -= 2.0;
        // if (position.y > 1.0) position.y -= 2.0;
        // if (position.z > 1.0) position.z -= 2.0;
      }

      vPosition = position;
      vHeading = heading;
    }
    `)
  })

  const trailMapTexture1 = rico.createTexture3D(...DIMENSIONS)
  const trailMapTexture2 = rico.createTexture3D(...DIMENSIONS)

  trailMapFramebuffers = [
    rico.createFramebuffer().colorTarget(0, trailMapTexture1),
    rico.createFramebuffer().colorTarget(0, trailMapTexture2)
  ]

  layTrails = rico({
    vertexArray: agentsVertexArray
      .vertexAttributeBuffer(0, agentsPositionsBuffers[1]),
    count: settings.agentCount,
    viewport: [0, 0, DIMENSIONS[0], DIMENSIONS[1]],
    primitive: 'points',
    vs: `#version 300 es
    precision highp float;

    layout(location=0) in vec3 position;

    uniform float pointSize;
    uniform float layerIdx;
    uniform vec3 dimensions;

    out vec4 vColor;

    void main() {
      vColor = vec4(1);
      float layerSize = 2.0 / dimensions.z;
      float curLayer = layerIdx / dimensions.z * 2.0 - 1.0;
      float prevLayer = curLayer - layerSize;
      float nextLayer = curLayer + layerSize;
      bool isInLayer = position.z > prevLayer && position.z < nextLayer;
      if (isInLayer == false || dot(position, position) > 3.0) {
        gl_Position = vec4(0);
        gl_PointSize = 0.0;
      } else {
        gl_Position = vec4(position.xy, 0, 1);
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
    viewport: [0, 0, DIMENSIONS[0], DIMENSIONS[1]],
    primitive: 'triangle fan',
    vs: `#version 300 es
    precision highp float;
    layout(location=0) in vec2 position;
    out vec3 vUV;
    uniform vec3 dimensions;
    uniform float layerIdx;
    void main() {
      vUV = vec3(0.5 * (1.0 + position), layerIdx / dimensions.z);
      gl_Position = vec4(position, 0, 1);
    }
    `,
    fs: `#version 300 es
    precision highp float;
    precision lowp sampler3D;

    in vec3 vUV;
    out vec4 fragColor;

    uniform sampler3D trailMap;
    uniform float decay;
    uniform float diffuse;
    uniform vec3 dimensions;

    void main() {
      float totalPixels = pow(diffuse * 2.0 + 1.0, 3.0);
      float sum = texture(trailMap, vUV).x / totalPixels;

      for (float w = -diffuse; w <= diffuse; w += 1.0) {
        for (float h = -diffuse; h <= diffuse; h += 1.0) {
          for (float d = -diffuse; d <= diffuse; d += 1.0) {
            vec3 pixel = vUV + vec3(w, h, d) / dimensions;
            if (pixel == vUV || pixel.x < 0.0 || pixel.x > 1.0 || pixel.y < 0.0 || pixel.y > 1.0 || pixel.z < 0.0 || pixel.z > 1.0) {
              continue;
            }
            sum += texture(trailMap, pixel).x / totalPixels * decay;
          }
        }
      }

      float value = sum;
      fragColor = vec4(value, value, value, 1);
    }
    `,
    blend: false
  })

  drawPoints = rico({
    vertexArray: agentsVertexArray
      .vertexAttributeBuffer(0, agentsPositionsBuffers[1]),
    count: settings.agentCount,
    primitive: 'points',
    vs: `#version 300 es
    precision highp float;

    layout(location=0) in vec3 position;

    uniform float pointSize;
    uniform mat4 view;
    uniform mat4 projection;

    out vec4 vColor;

    void main() {
      vColor = vec4(1);
      gl_Position = projection * view * vec4(position, 1);
      gl_PointSize = pointSize;
    }
    `,
    fs: `#version 300 es
    precision highp float;
    
    in vec4 vColor;
    out vec4 fragColor;

    uniform float pointOpacity;

    void main() {
      vec2 cxy = 2.0 * gl_PointCoord - 1.0;
      float r = dot(cxy, cxy);
      float delta = fwidth(r);
      float alpha = 1.0 - smoothstep(1.0 - delta, 1.0 + delta, r);
      if (r > 1.0) {
        discard;
      }
      fragColor = vColor;
      fragColor *= alpha * pointOpacity;
    }
    `,
    blend: {
      equation: 'func add',
      src: 'one',
      dest: 'one'
    }
  })

  renderTrails = rico({
    vertexArray: rico.createVertexArray()
      .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 2, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]))),
    count: 4,
    primitive: 'triangle fan',
    vs: `#version 300 es
    precision highp float;
    layout(location=0) in vec2 position;
    out vec3 vUV;
    uniform vec3 dimensions;
    uniform float layerIdx;
    uniform mat4 view;
    uniform mat4 projection;
    void main() {
      vUV = vec3(0.5 * (1.0 + position), layerIdx / dimensions.z);
      float z = layerIdx / dimensions.z * 2.0 - 1.0;
      gl_Position = projection * view * vec4(position, z, 1);
    }
    `,
    fs: injectGLSL(PALETTE_ANIMATOR_GLSL, `#version 300 es
    precision highp float;
    precision lowp sampler3D;

    in vec3 vUV;
    out vec4 fragColor;

    uniform sampler3D trailMap;
    uniform float trailMapOpacity;

    void main() {
      float val = texture(trailMap, vUV).x;
      if (val < 0.01) {
        discard;
      }
      vec3 color = getColorFromPalette(val);
      fragColor = vec4(color, trailMapOpacity * val);
    }
    `),
    blend: {
      csrc: 'src alpha',
      asrc: 'src alpha',
      cdest: 'one',
      adest: 'one'
    }
  })
}

const sketch = () => {
  setup()
  camera.moveToNextPosition()
  return ({ width, height, time }) => {
    camera.tick()

    const cameraUniforms = {
      view: camera.getMatrix(),
      projection: mat4.perspective([], Math.PI / 4, width / height, 0.01, 1000)
    }

    rico.clear(0, 0, 0, 1)

    paletteAnimator.tick(settings.palette)

    updateAgents({
      vertexArray: agentsVertexArray
        .vertexAttributeBuffer(0, agentsPositionsBuffers[0])
        .vertexAttributeBuffer(1, agentsHeadingsBuffers[0]),
      transform: {
        vPosition: agentsPositionsBuffers[1],
        vHeading: agentsHeadingsBuffers[1]
      },
      uniforms: {
        stepSize: settings.stepSize,
        headingStepSpread: settings.headingStepSpread,
        sensorSpread: settings.sensorSpread,
        sensorDist: settings.sensorDist,
        time: time,
        trailMap: trailMapFramebuffers[0].colorAttachments[0],
        dimensions: DIMENSIONS,
        wrap: settings.wrap ? 1 : 0
      }
    })

    agentsVertexArray.vertexAttributeBuffer(0, agentsPositionsBuffers[1])
    for (let i = 0; i < DIMENSIONS[2]; i++) {
      trailMapFramebuffers[0].colorTarget(0, trailMapFramebuffers[0].colorAttachments[0], i)
      layTrails({
        framebuffer: trailMapFramebuffers[0],
        vertexArray: agentsVertexArray,
        uniforms: {
          layerIdx: i,
          dimensions: DIMENSIONS,
          pointSize: settings.pointSize,
          trailIntensity: settings.trailIntensity
        }
      })
    }

    for (let i = 0; i < DIMENSIONS[2]; i++) {
      trailMapFramebuffers[1].colorTarget(0, trailMapFramebuffers[1].colorAttachments[0], i)
      processTrails({
        framebuffer: trailMapFramebuffers[1],
        uniforms: {
          layerIdx: i,
          dimensions: DIMENSIONS,
          decay: settings.decay,
          diffuse: settings.diffuse,
          trailMap: trailMapFramebuffers[0].colorAttachments[0]
        }
      })
    }

    if (settings.renderPoints) {
      drawPoints({
        vertexArray: agentsVertexArray
          .vertexAttributeBuffer(0, agentsPositionsBuffers[1]),
        uniforms: {
          ...cameraUniforms,
          pointSize: settings.renderPointSize,
          pointOpacity: settings.renderPointOpacity
        }
      })
    }

    if (settings.renderTrails) {
      for (let i = 0; i < DIMENSIONS[2]; i++) {
        renderTrails({
          uniforms: {
            layerIdx: i,
            dimensions: DIMENSIONS,
            trailMap: trailMapFramebuffers[0].colorAttachments[0],
            trailMapOpacity: settings.trailMapOpacity,
            ...cameraUniforms,
            ...paletteAnimator.uniforms()
          }
        })
      }
    }

    rotate(agentsPositionsBuffers)
    rotate(agentsHeadingsBuffers)
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
