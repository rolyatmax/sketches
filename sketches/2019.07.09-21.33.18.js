const canvasSketch = require('canvas-sketch')
const fit = require('canvas-fit')
const PicoGL = require('picogl')
const { GUI } = require('dat-gui')

const canvas = document.body.appendChild(document.createElement('canvas'))
window.addEventListener('resize', fit(canvas), false)
const pico = PicoGL.createApp(canvas)
  .clearColor(0.13, 0.13, 0.13, 1)

window.PicoGL = PicoGL
window.pico = pico

const settings = {
  seed: 1
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)

let drawCall

const vs = `#version 300 es
precision highp float;

layout(location=0) in vec2 position;

out vec2 uv;

void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0, 1);
}`

const fs = `#version 300 es
precision highp float;

in vec2 uv;

layout(std140) uniform FragmentUniforms {
  float time;
};

out vec4 fragColor;

// from samlo's Paint Archipelago demo: https://www.shadertoy.com/view/3lf3z2

float hash(vec2 p) { return fract(1e4 * sin(17.0 * p.x + p.y * 0.1) * (0.1 + abs(sin(p.y * 13.0 + p.x)))); }
float noise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

#define octaves 14
float turbulance (in vec2 p) {
  float value = 0.0;
  float freq = 1.0;
  float amp = 0.5;

  for (int i = 0; i < octaves; i++) {
    value += amp * (noise((p - vec2(1.0)) * freq));
    freq *= 1.9;
    amp *= 0.6;
  }
  return value;
}

float convolution(vec2 p, float time) {
  vec2 aPos = vec2(sin(time * 0.005), sin(time * 0.01)) * 6.;
  vec2 aScale = vec2(3.0);
  float a = turbulance(p * aScale + aPos);

  vec2 bPos = vec2(sin(time * 0.01), sin(time * 0.01)) * 1.;
  vec2 bScale = vec2(0.6);
  float b = turbulance((p + a) * bScale + bPos);

  vec2 cPos = vec2(-0.6, -0.5) + vec2(sin(-time * 0.001), sin(time * 0.01)) * 2.;
  vec2 cScale = vec2(2.6);
  float c = turbulance((p + b) * cScale + cPos);
  return c;
}

void main() {
  float val = convolution(uv, time);
  fragColor = vec4(vec3(val), 1);
}`

const program = pico.createProgram(vs, fs)
const attributes = pico.createVertexArray()
const fragmentUniformBuffer = pico.createUniformBuffer([PicoGL.FLOAT])

function setup () {
  const positions = pico.createVertexBuffer(PicoGL.FLOAT, 2, new Float32Array([-1, -1, -1, 1, 1, -1, 1, 1]))
  attributes.vertexAttributeBuffer(0, positions)
  drawCall = pico.createDrawCall(program, attributes)
}

const sketch = () => {
  setup()
  return ({ time }) => {
    pico.clear()
    pico.viewport(0, 0, canvas.width, canvas.height)

    fragmentUniformBuffer.set(0, time).update()

    drawCall
      .uniformBlock('FragmentUniforms', fragmentUniformBuffer)
      .primitive(PicoGL.TRIANGLE_STRIP)
      .draw()
  }
}

canvasSketch(sketch, {
  canvas: canvas,
  context: 'webgl2',
  animate: true
})
