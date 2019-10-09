const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const { createRico } = require('../lib/dlite-0.0.9')
const createRoamingCamera = require('../lib/create-roaming-camera')
const mat4 = require('gl-mat4')
const vec3 = require('gl-vec3')

const settings = {
  seed: 2,
  lineWidth: 0.003,
  points: 8600,
  meanStep: 0.025,
  stdStep: 0.027,
  freqStep: 0,
  noiseMag: 2,
  noiseOffset: 1.29,
  cameraDist: 1.3,
  lineWidthPow: 0,
  animate: true
}

const rico = window.rico = createRico()

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'points', 2, 100000).step(1).onChange(setup)
gui.add(settings, 'meanStep', 0, 0.1).step(0.0001).onChange(setup)
gui.add(settings, 'stdStep', 0, 0.1).step(0.0001).onChange(setup)
gui.add(settings, 'freqStep', 0, 2).step(0.0001).onChange(setup)
gui.add(settings, 'noiseMag', 0, 2)
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
    const step = rand.onSphere(stepSize, [])
    vec3.add(velocity, velocity, step)
    // vec3.normalize(velocity, velocity)
    vec3.add(curPosition, curPosition, velocity)
    vec3.normalize(curPosition, curPosition)
  }

  // repeat the first and last points to show when the line is done
  line.unshift(line[0], line[1], line[2])
  line.push(line[line.length - 3], line[line.length - 2], line[line.length - 1])

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

    uniform float aspect;
    uniform float time;
    uniform float lineWidth;
    uniform float lineWidthPow;
    uniform float noiseFreq;
    uniform float noiseMag;
    uniform float noiseOffset;
    uniform mat4 projection;
    uniform mat4 view;

    void main() {
      vec3 preStart = iPreStart;
      vec3 start = iStart;
      vec3 end = iEnd;
      vec3 postEnd = iPostEnd;

      preStart *= ((snoiseFractal((preStart + vec3(noiseOffset)) * noiseFreq * 2.0) * 0.5 + 0.5) * noiseMag * (snoise(preStart) * 0.5 + 0.5) + 0.2);
      start *= ((snoiseFractal((start + vec3(noiseOffset)) * noiseFreq * 2.0) * 0.5 + 0.5) * noiseMag * (snoise(start) * 0.5 + 0.5) + 0.2);
      end *= ((snoiseFractal((end + vec3(noiseOffset)) * noiseFreq * 2.0) * 0.5 + 0.5) * noiseMag * (snoise(end) * 0.5 + 0.5) + 0.2);
      postEnd *= ((snoiseFractal((postEnd + vec3(noiseOffset)) * noiseFreq * 2.0) * 0.5 + 0.5) * noiseMag * (snoise(postEnd) * 0.5 + 0.5) + 0.2);

      vec2 aspectVec = vec2(aspect, 1);
      mat4 projView = projection * view;
      vec4 aProj = projView * vec4(preStart, 1);
      vec4 bProj = projView * vec4(start, 1);
      vec4 cProj = projView * vec4(end, 1);
      vec4 dProj = projView * vec4(postEnd, 1);

      vec2 aScreen = aProj.xy / aProj.w * aspectVec;
      vec2 bScreen = bProj.xy / bProj.w * aspectVec;
      vec2 cScreen = cProj.xy / cProj.w * aspectVec;
      vec2 dScreen = dProj.xy / dProj.w * aspectVec;

      float len1 = lineWidth;
      vec2 dir1 = vec2(0);
      if (aScreen == bScreen) {
        dir1 = normalize(cScreen - bScreen);
      } else {
        vec2 a = normalize(bScreen - aScreen);
        vec2 b = normalize(cScreen - bScreen);
        vec2 tangent = normalize(a + b);
        vec2 perp = vec2(-a.y, a.x);
        vec2 miter = vec2(-tangent.y, tangent.x);
        dir1 = tangent;
        len1 = lineWidth / dot(miter, perp);
      }

      vec2 normal1 = vec2(-dir1.y, dir1.x);
      normal1 *= len1;
      normal1.x /= aspect;
      vec4 offset1 = vec4(normal1 * position.y, 0, 1);
      vec4 p1 = bProj + offset1;


      float len2 = lineWidth;
      vec2 dir2 = vec2(0);
      if (cScreen == dScreen) {
        dir2 = normalize(dScreen - cScreen);
      } else {
        vec2 a = normalize(cScreen - bScreen);
        vec2 b = normalize(dScreen - cScreen);
        vec2 tangent = normalize(a + b);
        vec2 perp = vec2(-a.y, a.x);
        vec2 miter = vec2(-tangent.y, tangent.x);
        dir2 = tangent;
        len2 = lineWidth / dot(miter, perp);
      }

      vec2 normal2 = vec2(-dir2.y, dir2.x);
      normal2 *= len2;
      normal2.x /= aspect;
      vec4 offset2 = vec4(normal2 * position.y, 0, 1);
      vec4 p2 = cProj + offset2;
      
      vAlpha = 0.7;

      gl_Position = mix(p1, p2, position.x);
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
      aspect: width / height,
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
