/**
 * This sketch is about trying to wrap my head around quaternions
 */

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.9')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const createRoamingCamera = require('../lib/roaming-camera/roaming-camera-0.0.1')
const mat4 = require('gl-mat4')
const palettes = require('nice-color-palettes')
const primitiveIcosphere = require('primitive-icosphere')
const createPaletteAnimator = require('../lib/palette-animator/palette-animator-0.0.1')
const injectGLSL = require('../lib/inject-glsl/inject-glsl-0.0.1')
const NOISE_GLSL = require('../lib/noise-glsl/noise-glsl-0.0.1')

const paletteAnimator = createPaletteAnimator(palettes, 0.001, 0.1, [1, 1, 1])
const { PALETTE_ANIMATOR_GLSL } = paletteAnimator

const rico = window.rico = createRico()

const settings = {
  seed: 0,
  palette: 0,
  subdivisions: 5,
  pointSize: 24,
  colorVariance: 0.5,
  primitive: 'points',
  cameraDist: 1
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'palette', 0, 99).step(1)
gui.add(settings, 'subdivisions', 0, 5).step(1).onChange(setup)
gui.add(settings, 'colorVariance', 0, 2)
gui.add(settings, 'pointSize', 0.01, 30)
gui.add(settings, 'cameraDist', 0, 20)
gui.add(settings, 'primitive', ['points', 'lines', 'line loop', 'triangles', 'triangle strip'])
gui.add({ next: () => camera.moveToNextPosition() }, 'next')

let draw, randomVal
let rand = random.createRandom(settings.seed)

const camera = createRoamingCamera({
  canvas: rico.canvas,
  zoomSpeed: 4,
  center: [settings.cameraDist, settings.cameraDist, settings.cameraDist],
  eye: [0, 0.5, 0.5],
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
    vs: injectGLSL(NOISE_GLSL, PALETTE_ANIMATOR_GLSL, `#version 300 es
    precision highp float;

    layout(location=0) in vec3 position;
    layout(location=1) in vec4 rotation;

    out vec4 vColor;
    out float vDist;

    uniform float time;
    uniform float colorVariance;
    uniform float randomVal;
    uniform float pointSize;
    uniform mat4 projection;
    uniform mat4 view;

    vec4 makeQuaternion(float angle, vec3 axis) {
      return vec4(cos(angle / 2.0), sin(angle / 2.0) * axis);
    }

    vec3 transform(vec3 p, vec4 q) {
      return p + 2.0 * cross(cross(p, q.yzw) + q.x * p, q.yzw);
    }

    void main() {
      float colorT = noise3D(position * colorVariance + vec3((time + randomVal * 10.0) * 0.01, 0, 0), 1.0, vec2(0, 1));
      colorT *= 1.3;
      colorT -= 0.15;
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

      float z = pow(abs(gl_Position.z), 2.0);

      const vec4 RED = vec4(1, 0, 0, 1);
      const vec4 BLUE = vec4(0, 0, 1, 1);
      const vec4 GREEN = vec4(0, 1, 0, 1);

      z = abs(z * 2.0 - 1.0);

      // if (z < 0.5) {
      //   float t = smoothstep(0.0, 0.5, z);
      //   vColor = mix(RED, BLUE, t);
      // } else {
      //   float t = smoothstep(0.5, 1.0, z);
      //   vColor = mix(BLUE, GREEN, t);
      // }

      vDist = z;
      gl_PointSize = mix(pointSize, 5.0, vDist);
    }
    `),
    fs: `#version 300 es
    precision highp float;
    
    in vec4 vColor;
    in float vDist;
    out vec4 fragColor;

    void main() {
      vec2 cxy = 2.0 * gl_PointCoord - 1.0;
      float r = dot(cxy, cxy);
      float blurT = max(
        1.0 - smoothstep(0.0, 0.2, vDist),
        smoothstep(0.8, 1.0, vDist)
      );
      float delta = mix(fwidth(r), r * 4.0, blurT);
      // if (vDist < 0.2) {
      //   delta = mix(fwidth(r), 1.0, smoothstep(0.0, 0.2, vDist));
      // } else {
      //   delta = mix(1.0, fwidth(r), smoothstep(0.8, 1.0, vDist));
      // }
      float alpha = 1.0 - smoothstep(1.0 - delta, 1.0 + delta, r);
      alpha *= 1.0 - blurT * 0.3;
      if (r > 1.0) {
        discard;
      }
      fragColor = vColor * alpha;
    }
    `,
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
    camera.tick()
    rico.clear(0.18, 0.18, 0.18, 1)

    paletteAnimator.tick(settings.palette)

    draw({
      primitive: settings.primitive,
      uniforms: {
        view: camera.getMatrix(),
        projection: mat4.perspective([], Math.PI / 1.5, width / height, 0.01, 1000),
        time: time,
        rand: randomVal,
        pointSize: settings.pointSize,
        colorVariance: settings.colorVariance,
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
