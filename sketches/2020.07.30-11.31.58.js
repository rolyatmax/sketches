const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.11')
const { GUI } = require('dat-gui')
const injectGLSL = require('../lib/inject-glsl/inject-glsl-0.0.1')
const NOISE_GLSL = require('../lib/noise-glsl/noise-glsl-0.0.1')
const palettes = require('nice-color-palettes')
const vec3 = require('gl-vec3')
const createPaletteAnimator = require('../lib/palette-animator/palette-animator-0.0.1')

const paletteAnimator = createPaletteAnimator(palettes, 0.001, 0.1, 5)
const { PALETTE_ANIMATOR_GLSL } = paletteAnimator

const rico = window.rico = createRico()

const settings = {
  palette: 5,
  speed: 0.65,
  noiseFreq: 0.4,
  colorCount: 10,
  shadeIntensity: 0.21,
  threshold: 0.003,
  pixelSize: 0.001,
  sphereSize: 0.9,
  noiseMag: 0.4,
  sampleCount: 32
}

const gui = new GUI()
gui.add(settings, 'palette', 0, 99).step(1)
gui.add(settings, 'speed', 0.001, 1).step(0.001)
gui.add(settings, 'noiseFreq', 0.0001, 2).step(0.001)
gui.add(settings, 'colorCount', 0, 99).step(1)
gui.add(settings, 'shadeIntensity', 0, 0.5).step(0.01)
gui.add(settings, 'threshold', 0.000001, 0.1).step(0.000001)
gui.add(settings, 'pixelSize', 0.00001, 0.1).step(0.00001)
gui.add(settings, 'sphereSize', 0.1, 3)
gui.add(settings, 'noiseMag', 0.01, 2).step(0.01)
gui.add(settings, 'sampleCount', 16, 1024).step(1)

function rayQuad (Cp, Cc, up, fov, aspect) {
  // Calculate the normalized forward direction.
  const forward = vec3.normalize([], vec3.sub([], Cc, Cp))

  // Calculate the normalized right direction.
  const right = vec3.normalize([], vec3.cross([], forward, up))

  // Recalculate the normalized up direction.
  vec3.normalize(up, vec3.cross([], right, forward))

  // Calculate how far up, down, left, and right we need to move from the
  // center of the ray quad to find points a', b', c', and d'.
  const mu = Math.tan(fov / 2)
  const md = -mu
  const mr = aspect * mu
  const ml = -mr

  // Calculate Cp + forward to find the center of the ray quad.
  const Z = vec3.add([], Cp, forward)

  // Define vectors along up and right of lengths ml, mr, mu, and md.
  const muUp = vec3.scale([], up, mu)
  const mdUp = vec3.scale([], up, md)
  const mrRight = vec3.scale([], right, mr)
  const mlRight = vec3.scale([], right, ml)

  // Find points a', b', c', and d'.
  const a = vec3.add([], Z, vec3.add([], mdUp, mlRight))
  const b = vec3.add([], Z, vec3.add([], mdUp, mrRight))
  const c = vec3.add([], Z, vec3.add([], muUp, mrRight))
  const d = vec3.add([], Z, vec3.add([], muUp, mlRight))

  // Construct an unindexed vertex attribute array from a', b', c', and d'.
  const uv = []
  uv.push(...a)
  uv.push(...b)
  uv.push(...c)
  uv.push(...a)
  uv.push(...c)
  uv.push(...d)

  // Return the array.
  return new Float32Array(uv)
}

const cP = [3, 3, 3]
const cC = [0, 0, 0]
const up = [0, 1, 0]
const fov = Math.PI / 4
const aspect = rico.canvas.width / rico.canvas.height
const vertices = rayQuad(cP, cC, up, fov, aspect)
const positions = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1])

const draw = rico({
  vertexArray: rico.createVertexArray()
    .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 2, positions))
    .vertexAttributeBuffer(1, rico.createVertexBuffer(rico.gl.FLOAT, 3, vertices)),
  count: 6,
  primitive: 'triangles',
  vs: `#version 300 es
  precision highp float;
  layout(location=0) in vec2 position;
  layout(location=1) in vec3 rayQuad;
  out vec3 vRayQuad;
  void main() {
    vRayQuad = rayQuad;
    gl_Position = vec4(position, 0, 1);
  }
  `,
  fs: injectGLSL(NOISE_GLSL, PALETTE_ANIMATOR_GLSL, `#version 300 es
  precision highp float;
  in vec3 vRayQuad;
  out vec4 fragColor;

  uniform vec3 cameraPosition;
  uniform float speed;
  uniform float noiseFreq;
  uniform float time;
  uniform float colorCount;
  uniform float shadeIntensity;
  uniform float threshold;
  uniform float pixelSize;
  uniform float sphereSize;
  uniform float noiseMag;
  uniform float sampleCount;

  const vec3 lightDir = normalize(vec3(5, 1, 1));

  float getNoiseVal (vec3 p, vec3 viewDirection) {
    float dist = length(p);
    vec3 pos = dist > sphereSize ? normalize(p) * sphereSize : p;
    float t1 = noise3D(p + vec3(0, 0, time * speed), noiseFreq, vec2(-noiseMag, noiseMag));
    float t2 = noise3D(p + vec3(500, 200, time * speed * 0.5), noiseFreq * 2.0, vec2(-noiseMag, noiseMag));
    return max(t1, t2) + max(dist - sphereSize, 0.0) * sign(dot(viewDirection, pos - p));
  }

  vec3 getNormal (vec3 p, vec3 viewDirection) {
    return normalize(vec3(
      getNoiseVal(p + vec3(pixelSize, 0, 0), viewDirection) - getNoiseVal(p - vec3(pixelSize, 0, 0), viewDirection),
      getNoiseVal(p + vec3(0, pixelSize, 0), viewDirection) - getNoiseVal(p - vec3(0, pixelSize, 0), viewDirection),
      getNoiseVal(p + vec3(0, 0, pixelSize), viewDirection) - getNoiseVal(p - vec3(0, 0, pixelSize), viewDirection)
    ));
  }

  vec3 getColor (float t) {
    return getColorFromPalette(floor(t * colorCount) / colorCount);
  }

  vec3 ray (vec3 start, vec3 dir, float t) {
    return start + t * dir;
  }

  void main() {
    vec3 viewDirection = normalize(vRayQuad - cameraPosition);
    float t = 0.0;
    float dist;
    vec3 position;
    vec3 normal;
    vec3 color = vec3(0.82, 0.83, 0.84);

    int count = int(sampleCount);
    for (int i = 0; i < count; i++) {
      position = ray(cameraPosition, viewDirection, t);
      dist = getNoiseVal(position, viewDirection);

      if (abs(dist) < threshold) {
        normal = getNormal(position, viewDirection);
        float shade = clamp(dot(normal, lightDir), 0.0, 1.0);
        color = getColor(length(position)) + shade * vec3(shadeIntensity);
        break;
      }
      t = t + dist;
    }
    fragColor = vec4(color, 1);
  }
  `)
})

const sketch = () => {
  return ({ width, height, time }) => {
    rico.clear(1, 1, 1, 1)
    paletteAnimator.tick(settings.palette)

    draw({
      uniforms: {
        time: time,
        speed: settings.speed,
        cameraPosition: cP,
        noiseFreq: settings.noiseFreq,
        colorCount: settings.colorCount,
        threshold: settings.threshold,
        pixelSize: settings.pixelSize,
        sphereSize: settings.sphereSize,
        shadeIntensity: settings.shadeIntensity,
        sampleCount: settings.sampleCount,
        noiseMag: settings.noiseMag,
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
