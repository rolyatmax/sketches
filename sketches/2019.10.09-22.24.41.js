/**
 * This sketch is about trying to wrap my head around quaternions
 */

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite-0.0.9')
const random = require('canvas-sketch-util/random')
const palettes = require('nice-color-palettes')
const { GUI } = require('dat-gui')
const createRoamingCamera = require('../lib/create-roaming-camera')
const mat4 = require('gl-mat4')
const primitiveIcosphere = require('primitive-icosphere')
const { createSpring } = require('spring-animator-2')

const paletteSpring = createPaletteAnimator(0.001, 0.1, [
  [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]
])

const rico = window.rico = createRico()

const settings = {
  seed: 0,
  palette: 0,
  subdivisions: 4,
  pointSize: 8,
  colorVariance: 0.5,
  primitive: 'points',
  cameraDist: 10
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'palette', 0, 99).step(1)
gui.add(settings, 'subdivisions', 0, 5).step(1).onChange(setup)
gui.add(settings, 'colorVariance', 0, 2)
gui.add(settings, 'pointSize', 0, 10)
gui.add(settings, 'cameraDist', 0, 20)
gui.add(settings, 'primitive', ['points', 'lines', 'line loop', 'triangles', 'triangle strip'])
gui.add({ next: () => camera.moveToNextPosition() }, 'next')

let draw, randomVal
let rand = random.createRandom(settings.seed)

const camera = createRoamingCamera({
  canvas: rico.canvas,
  zoomSpeed: 4,
  center: [10, 10, 10],
  eye: [0, 0, 0],
  damping: 0.003,
  stiffness: 0.00001,
  getCameraPosition: () => rand.onSphere(settings.cameraDist)
})

function setup () {
  rand = random.createRandom(settings.seed)
  randomVal = rand.value()

  const mesh = primitiveIcosphere(1, { subdivisions: settings.subdivisions })

  const pointsCount = mesh.positions.length

  const positionsData = new Float32Array(pointsCount * 3)
  const rotationsData = new Float32Array(pointsCount * 4)

  let i = pointsCount
  while (i--) {
    const pos = mesh.positions[i]
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
      .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 3, positionsData))
      .vertexAttributeBuffer(1, rico.createVertexBuffer(rico.gl.FLOAT, 4, rotationsData)),
    count: pointsCount,
    vs: inject(NOISE_GLSL, `#version 300 es
    precision highp float;

    layout(location=0) in vec3 position;
    layout(location=1) in vec4 rotation;

    out vec4 vColor;

    uniform vec3 color1;
    uniform vec3 color2;
    uniform vec3 color3;
    uniform vec3 color4;
    uniform vec3 color5;
    uniform float time;
    uniform float colorVariance;
    uniform float randomVal;
    uniform float pointSize;
    uniform mat4 projection;
    uniform mat4 view;

    vec3 getColorFromPalette(float inputT) {
      float t = inputT * 1.3 - 0.15;
      if (t < 0.25) {
        return mix(color1, color2, smoothstep(0.0, 0.25, t));
      }
      if (t < 0.5) {
        return mix(color2, color3, smoothstep(0.25, 0.5, t));
      }
      if (t < 0.75) {
        return mix(color3, color4, smoothstep(0.5, 0.75, t));
      }
      return mix(color4, color5, smoothstep(0.75, 1.0, t));
    }

    vec4 makeQuaternion(float angle, vec3 axis) {
      return vec4(cos(angle / 2.0), sin(angle / 2.0) * axis);
    }

    vec3 transform(vec3 p, vec4 q) {
      return p + 2.0 * cross(cross(p, q.yzw) + q.x * p, q.yzw);
    }

    void main() {
      float colorT = noise3D(position * colorVariance + vec3((time + randomVal * 10.0) * 0.01, 0, 0), 1.0, vec2(0, 1));
      vec3 color = getColorFromPalette(colorT);
      vColor = vec4(color, 1);

      float timeOffset = noise3D(position, 0.1, vec2(-2, 2));

      float t = sin(time + timeOffset) * 0.5 + 0.5;
      float angle = mix(0.0, rotation.x, t);
      vec4 q = makeQuaternion(angle, rotation.yzw);

      float offsetMag = noise3D(position + vec3(time * 0.02), 1.0, vec2(0, 1));
      float magRangeSize = noise3D(position, 50.0, vec2(0, 2));
      vec3 offset = position * (offsetMag * magRangeSize + 1.0 - magRangeSize / 2.0);

      vec3 p = transform(position - offset, q) + offset;

      gl_Position = projection * view * vec4(p, 1);
      gl_PointSize = pointSize * noise3D(position + time * 0.01, 2.0, vec2(0.01, 1));
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
  return ({ width, height, time }) => {
    camera.tick()
    rico.clear(1, 1, 1, 1)

    paletteSpring.setDestination(palettes[settings.palette].map(hexToRgb))
    paletteSpring.tick()
    const palette = paletteSpring.getCurrentValue()

    draw({
      primitive: settings.primitive,
      uniforms: {
        view: camera.getMatrix(),
        projection: mat4.perspective([], Math.PI / 8, width / height, 0.01, 1000),
        time: time,
        rand: randomVal,
        pointSize: settings.pointSize,
        colorVariance: settings.colorVariance,
        color1: palette[0],
        color2: palette[1],
        color3: palette[2],
        color4: palette[3],
        color5: palette[4]
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

function inject (...args) {
  const RETURN = `
`
  const glsl = args.pop()
  const codeChunks = args
  const splitAt = glsl.startsWith('#version 300 es') ? glsl.indexOf(RETURN) + 1 : 0
  const head = glsl.slice(0, splitAt)
  const body = glsl.slice(splitAt)
  codeChunks.unshift(head)
  codeChunks.push(body)
  return codeChunks.join(RETURN)
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
  return 0.5333333* snoise(m)
        +0.2666667* snoise(2.0*m)
        +0.1333333* snoise(4.0*m)
        +0.0666667* snoise(8.0*m);
}

float noise3D(vec3 xyz, float freq, vec2 range) {
  float value = snoise(xyz * freq) * 0.5 + 0.5;
  return mix(range.x, range.y, value);
}

float noise2D(vec2 xy, float freq, vec2 range) {
  return noise3D(vec3(xy, 0), freq, range);
}

float noise1D(float x, float freq, vec2 range) {
  return noise3D(vec3(x, 0, 0), freq, range);
}

float noiseFractal3D(vec3 xyz, float freq, vec2 range) {
  float value = snoiseFractal(xyz * freq) * 0.5 + 0.5;
  return mix(range.x, range.y, value);
}

float noiseFractal2D(vec2 xy, float freq, vec2 range) {
  return noiseFractal3D(vec3(xy, 0), freq, range);
}

float noiseFractal1D(float x, float freq, vec2 range) {
  return noiseFractal3D(vec3(x, 0, 0), freq, range);
}

float noise3D(vec3 xyz, float freq) {
  vec2 range = vec2(-1, 1);
  float value = snoise(xyz * freq) * 0.5 + 0.5;
  return mix(range.x, range.y, value);
}

float noise2D(vec2 xy, float freq) {
  return noise3D(vec3(xy, 0), freq);
}

float noise1D(float x, float freq) {
  return noise3D(vec3(x, 0, 0), freq);
}

float noiseFractal3D(vec3 xyz, float freq) {
  vec2 range = vec2(-1, 1);
  float value = snoiseFractal(xyz * freq) * 0.5 + 0.5;
  return mix(range.x, range.y, value);
}

float noiseFractal2D(vec2 xy, float freq) {
  return noiseFractal3D(vec3(xy, 0), freq);
}

float noiseFractal1D(float x, float freq) {
  return noiseFractal3D(vec3(x, 0, 0), freq);
}

float noise3D(vec3 xyz) {
  float freq = 1.0;
  vec2 range = vec2(-1, 1);
  float value = snoise(xyz * freq) * 0.5 + 0.5;
  return mix(range.x, range.y, value);
}

float noise2D(vec2 xy) {
  return noise3D(vec3(xy, 0));
}

float noise1D(float x) {
  return noise3D(vec3(x, 0, 0));
}

float noiseFractal3D(vec3 xyz) {
  float freq = 1.0;
  vec2 range = vec2(-1, 1);
  float value = snoiseFractal(xyz * freq) * 0.5 + 0.5;
  return mix(range.x, range.y, value);
}

float noiseFractal2D(vec2 xy) {
  return noiseFractal3D(vec3(xy, 0));
}

float noiseFractal1D(float x) {
  return noiseFractal3D(vec3(x, 0, 0));
}

`

function hexToRgb (hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255
  ]
}

function createPaletteAnimator (stiffness, damping, initialPalette) {
  const color1Spring = createSpring(stiffness, damping, initialPalette[0])
  const color2Spring = createSpring(stiffness, damping, initialPalette[1])
  const color3Spring = createSpring(stiffness, damping, initialPalette[2])
  const color4Spring = createSpring(stiffness, damping, initialPalette[3])
  const color5Spring = createSpring(stiffness, damping, initialPalette[4])

  function setDestination (palette) {
    color1Spring.setDestination(palette[0])
    color2Spring.setDestination(palette[1])
    color3Spring.setDestination(palette[2])
    color4Spring.setDestination(palette[3])
    color5Spring.setDestination(palette[4])
  }

  function tick (s, d) {
    color1Spring.tick(s, d)
    color2Spring.tick(s, d)
    color3Spring.tick(s, d)
    color4Spring.tick(s, d)
    color5Spring.tick(s, d)
  }

  function getCurrentValue () {
    return [
      color1Spring.getCurrentValue(),
      color2Spring.getCurrentValue(),
      color3Spring.getCurrentValue(),
      color4Spring.getCurrentValue(),
      color5Spring.getCurrentValue()
    ]
  }

  return { setDestination, tick, getCurrentValue }
}
