const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const { createRico } = require('../lib/dlite/dlite-0.0.9')
const createRoamingCamera = require('../lib/roaming-camera/roaming-camera-0.0.1')
const mat4 = require('gl-mat4')
const vec3 = require('gl-vec3')

const settings = {
  seed: 2,
  lineWidth: 0.008,
  points: 5000,
  meanStep: 0.05,
  stdStep: 0.01,
  freqStep: 0.542,
  noiseMag: 0.3,
  noiseOffset: 0.1,
  cameraDist: 4,
  lineWidthPow: 0,
  animate: true
}

const rico = window.rico = createRico()

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'points', 200, 10000).step(1).onChange(setup)
gui.add(settings, 'meanStep', 0, 0.1).step(0.0001).onChange(setup)
gui.add(settings, 'stdStep', 0, 0.1).step(0.0001).onChange(setup)
gui.add(settings, 'freqStep', 0, 2).step(0.0001).onChange(setup)
gui.add(settings, 'noiseMag', 0.01, 2)
gui.add(settings, 'noiseOffset', 0.1, 2)
gui.add(settings, 'lineWidth', 0.001, 0.1).step(0.001)
gui.add(settings, 'lineWidthPow', 0.001, 10).step(0.001)
gui.add(settings, 'cameraDist', 0, 10)
gui.add(settings, 'animate')
gui.add({ next: () => camera.moveToNextPosition() }, 'next')

let draw, instances
let rand = random.createRandom(settings.seed)

const camera = createRoamingCamera({
  canvas: rico.canvas,
  zoomSpeed: 4,
  center: [3, 3, 3],
  eye: [0, 0, 0],
  damping: 0.003,
  stiffness: 0.00001,
  getCameraPosition: () => rand.onSphere(settings.cameraDist)
})

/*
  *  (0, -1)-------------_(1, -1)
  *       |          _,-"  |
  *       o      _,-"      o
  *       |  _,-"          |
  *   (0, 1)"-------------(1, 1)
  */
const positionsBuffer = rico.createVertexBuffer(rico.gl.FLOAT, 2, new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]))

function setup () {
  instances = 0
  rand = random.createRandom(settings.seed)

  const lineSegmentsCount = settings.points - 1
  const line = []
  const lastPt = []
  const curPosition = vec3.normalize([], [
    rand.value(), rand.value(), rand.value()
  ])
  let n = settings.points
  while (n--) {
    if (line.length) {
      lastPt[0] = line[line.length - 3]
      lastPt[1] = line[line.length - 2]
      lastPt[2] = line[line.length - 1]
    } else {
      lastPt[0] = curPosition[0]
      lastPt[1] = curPosition[1]
      lastPt[2] = curPosition[2]
    }

    const velocity = vec3.subtract([], curPosition, lastPt)

    line.push(...curPosition)
    const stepSize = rand.gaussian(settings.meanStep, settings.stdStep)
    const step = rand.onSphere(stepSize * 0.1, [])
    vec3.add(velocity, velocity, step)
    // vec3.normalize(velocity, velocity)
    vec3.add(curPosition, curPosition, velocity)
    vec3.normalize(curPosition, curPosition)
  }

  // add "null" indicators to beginning and end of line
  line.unshift(99999, 99999, 99999)
  line.push(99999, 99999, 99999)

  const lineData = new Float32Array(line)

  const stride = 12
  const lineDataBuffer = rico.createInterleavedBuffer(stride, lineData)

  draw = rico({
    vs: inject(`#version 300 es
    precision highp float;

    layout(location=0) in vec2 position;
    layout(location=1) in vec3 iPreStart;
    layout(location=2) in vec3 iStart;
    layout(location=3) in vec3 iEnd;
    layout(location=4) in vec3 iPostEnd;

    out float vAlpha;

    uniform float time;
    uniform float lineWidth;
    uniform float lineWidthPow;
    uniform float noiseFreq;
    uniform float noiseMag;
    uniform float noiseOffset;
    uniform mat4 projection;
    uniform mat4 view;

    void main() {
      // TODO: come up with a way to do this with just angles, because mixing vecs like this won't work
      // when mixing two vecs that point equally in opposite directions
      vec3 normal1;
      float widthMult1;
      if (iPreStart.x > 999.0) {
        vec3 n = normalize(iEnd - iStart);
        normal1 = vec3(-n.y, n.x, n.z);
        widthMult1 = 1.0;
      } else {
        vec3 a = iPreStart - iStart;
        vec3 b = iEnd - iStart;
        normal1 = normalize(mix(normalize(a), normalize(b), 0.5));
        widthMult1 = mix(length(a), length(b), 0.5);
      }
      
      vec3 offset1 = normal1 * position.y * lineWidth * pow(widthMult1, lineWidthPow);
      vec3 p1 = offset1 + iStart;

      vec3 normal2;
      float widthMult2;
      if (iPostEnd.x > 999.0) {
        vec3 n = normalize(iStart - iEnd);
        normal2 = vec3(-n.y, n.x, n.z);
        widthMult2 = 1.0;
      } else {
        vec3 a = iStart - iEnd;
        vec3 b = iPostEnd - iEnd;
        normal2 = normalize(mix(normalize(a), normalize(b), 0.5));
        widthMult2 = mix(length(a), length(b), 0.5);
      }
      
      vec3 offset2 = normal2 * position.y * lineWidth * pow(widthMult2, lineWidthPow);
      vec3 p2 = offset2 + iEnd;

      vec3 p = mix(p1, p2, position.x);
      
      vAlpha = 0.8;

      float mag = snoiseFractal((p + vec3(noiseOffset)) * noiseFreq * 2.0) * 0.5 + 0.5;
      p *= (mag * noiseMag * (snoise(p) * 0.5 + 0.5) + 0.2);

      gl_Position = projection * view * vec4(p, 1);
      gl_PointSize = 2.0;
    }
    `, NOISE_GLSL),
    fs: `#version 300 es
    precision highp float;
    
    in float vAlpha;
    out vec4 fragColor;

    void main() {
      fragColor = vec4(0.5, 0.6, 0.7, vAlpha);
    }
    `,
    vertexArray: rico.createVertexArray()
      .vertexAttributeBuffer(0, positionsBuffer)
      .instanceAttributeBuffer(1, lineDataBuffer, { type: rico.gl.FLOAT, size: 3, stride, offset: 0 * stride })
      .instanceAttributeBuffer(2, lineDataBuffer, { type: rico.gl.FLOAT, size: 3, stride, offset: 1 * stride })
      .instanceAttributeBuffer(3, lineDataBuffer, { type: rico.gl.FLOAT, size: 3, stride, offset: 2 * stride })
      .instanceAttributeBuffer(4, lineDataBuffer, { type: rico.gl.FLOAT, size: 3, stride, offset: 3 * stride }),
    primitive: 'triangle strip',
    count: 4,
    instanceCount: lineSegmentsCount,
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
  return ({ width, height, time }) => {
    const totalInstances = settings.points - 1
    const instanceDeltaPerFrame = (totalInstances / 120 / 10)
    instances += instanceDeltaPerFrame
    camera.tick()
    rico.clear(0.18, 0.18, 0.18, 1)

    const drawUniforms = {
      lineWidth: settings.lineWidth,
      lineWidthPow: settings.lineWidthPow,
      view: camera.getMatrix(),
      noiseFreq: settings.freqStep,
      time: time,
      projection: mat4.perspective([], Math.PI / 4, width / height, 0.01, 1000)
    }

    let n = 1
    while (n--) {
      draw({
        instanceCount: settings.animate ? Math.min(totalInstances, instances | 0) : totalInstances,
        uniforms: {
          ...drawUniforms,
          noiseMag: settings.noiseMag + 0.05,
          noiseOffset: settings.noiseOffset * (Math.cos(time + n / 2) * 0.5 + 0.5) + 0.4 * n / 1000
        }
      })
    }
  }
}

canvasSketch(sketch, {
  canvas: rico.canvas,
  context: 'webgl2',
  pixelRatio: 1,
  animate: true
})

function inject (glsl, injection) {
  const RETURN = `
`
  const splitAt = glsl.startsWith('#version 300 es') ? glsl.indexOf(RETURN) + 1 : 0
  const head = glsl.slice(0, splitAt)
  const body = glsl.slice(splitAt)
  return head + RETURN + injection + RETURN + body
}

const NOISE_GLSL = `
// <www.shadertoy.com/view/XsX3zB>
// by Nikita Miropolskiy

/* discontinuous pseudorandom uniformly distributed in [-0.5, +0.5]^3 */
vec3 random3(vec3 c) {
  float j = 4096.0*sin(dot(c,vec3(17.0, 59.4, 15.0)));
  vec3 r;
  r.z = fract(512.0*j);
  j *= .125;
  r.x = fract(512.0*j);
  j *= .125;
  r.y = fract(512.0*j);
  return r-0.5;
}

const float F3 =  0.3333333;
const float G3 =  0.1666667;
float snoise(vec3 p) {

  vec3 s = floor(p + dot(p, vec3(F3)));
  vec3 x = p - s + dot(s, vec3(G3));
   
  vec3 e = step(vec3(0.0), x - x.yzx);
  vec3 i1 = e*(1.0 - e.zxy);
  vec3 i2 = 1.0 - e.zxy*(1.0 - e);
     
  vec3 x1 = x - i1 + G3;
  vec3 x2 = x - i2 + 2.0*G3;
  vec3 x3 = x - 1.0 + 3.0*G3;
   
  vec4 w, d;
   
  w.x = dot(x, x);
  w.y = dot(x1, x1);
  w.z = dot(x2, x2);
  w.w = dot(x3, x3);
   
  w = max(0.6 - w, 0.0);
   
  d.x = dot(random3(s), x);
  d.y = dot(random3(s + i1), x1);
  d.z = dot(random3(s + i2), x2);
  d.w = dot(random3(s + 1.0), x3);
   
  w *= w;
  w *= w;
  d *= w;
   
  return dot(d, vec4(52.0));
}

float snoiseFractal(vec3 m) {
  return   0.5333333* snoise(m)
        +0.2666667* snoise(2.0*m)
        +0.1333333* snoise(4.0*m)
        +0.0666667* snoise(8.0*m);
}
`
