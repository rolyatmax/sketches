const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.11')
const { GUI } = require('dat-gui')
const injectGLSL = require('../lib/inject-glsl/inject-glsl-0.0.1')
const NOISE_GLSL = require('../lib/noise-glsl/noise-glsl-0.0.1')
const palettes = require('nice-color-palettes')
const createPaletteAnimator = require('../lib/palette-animator/palette-animator-0.0.1')

const paletteAnimator = createPaletteAnimator(palettes, 0.001, 0.1, [0.95, 0.96, 0.97])
const { PALETTE_ANIMATOR_GLSL } = paletteAnimator

const rico = window.rico = createRico()

const settings = {
  palette: 15,
  speed: 0.1,
  noiseFreq: 2.5,
  colorCount: 14,
  colorShift: 0,
  shadeIntensity: 0.15
}

const gui = new GUI()
gui.add(settings, 'palette', 0, 99).step(1)
gui.add(settings, 'speed', 0.001, 1).step(0.001)
gui.add(settings, 'noiseFreq', 0.0001, 10).step(0.001)
gui.add(settings, 'colorCount', 0, 99).step(1)
gui.add(settings, 'colorShift', 0, 0.2).step(0.001)
gui.add(settings, 'shadeIntensity', 0, 0.5).step(0.01)

const draw = rico({
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
  fs: injectGLSL(NOISE_GLSL, PALETTE_ANIMATOR_GLSL, `#version 300 es
  precision highp float;
  in vec2 vUV;
  out vec4 fragColor;

  uniform float speed;
  uniform float noiseFreq;
  uniform float time;
  uniform float colorCount;
  uniform float colorShift;
  uniform float shadeIntensity;

  float getNoiseVal (vec2 vUV) {
    float t1 = noise3D(vec3(vUV, time * speed), noiseFreq, vec2(0.0, 1.0));
    float t2 = noise3D(vec3(vUV + 500.0, time * speed * 0.5), noiseFreq * 2.0, vec2(0.0, 1.0));
    float t3 = noise3D(vec3(vUV + 50.0, time * speed * 0.25), noiseFreq * 3.0, vec2(0.0, 1.0));
    float t4 = noise3D(vec3(vUV + 900.0, time * speed * 0.75), noiseFreq * 1.5, vec2(0.0, 1.0));
    return max(min(t1, t2), min(t3, t4));
  }

  vec3 getColor (float t) {
    return getColorFromPalette(floor(t * colorCount) / colorCount);
  }

  const float pixelSize = 0.01;
  const vec3 lightDir = normalize(vec3(1));

  void main() {
    vec2 pos = vUV;
    float z = getNoiseVal(pos);
    vec3 color1 = getColor(getNoiseVal(pos + colorShift * vec2(cos(time * speed), sin(time * speed))));
    vec3 color2 = getColor(getNoiseVal(pos - colorShift * vec2(cos(time * speed), sin(time * speed))));
    vec3 color3 = getColor(z);

    float z1 = getNoiseVal(pos + vec2(pixelSize, 0));
    float z2 = getNoiseVal(pos + vec2(0, pixelSize));
    vec3 dx = vec3(pixelSize, 0, z1 - z);
    vec3 dy = vec3(0, pixelSize, z2 - z);

    vec3 n = normalize(cross(dx, dy));

    float shade = dot(n, lightDir) * 0.5 + 0.5;

    vec3 color = vec3(color1.r, color2.g, color3.b) + shade * vec3(shadeIntensity);
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
        noiseFreq: settings.noiseFreq,
        colorCount: settings.colorCount,
        colorShift: settings.colorShift,
        shadeIntensity: settings.shadeIntensity,
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
