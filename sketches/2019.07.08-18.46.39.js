const canvasSketch = require('canvas-sketch')
const fit = require('canvas-fit')
const mat4 = require('gl-mat4')
const createCamera = require('3d-view-controls')
const PicoGL = require('picogl')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const primitiveIcosphere = require('primitive-icosphere')
const { interpolateCool } = require('d3-scale-chromatic')
const { rgb } = require('d3-color')

const canvas = document.body.appendChild(document.createElement('canvas'))
window.addEventListener('resize', fit(canvas), false)
const pico = PicoGL.createApp(canvas)
  .clearColor(0.13, 0.13, 0.13, 1)
  .depthTest()
  .blend()
  .blendFuncSeparate(PicoGL.SRC_ALPHA, PicoGL.ONE_MINUS_SRC_ALPHA, PicoGL.ONE, PicoGL.ONE)

window.PicoGL = PicoGL
window.pico = pico

const settings = {
  seed: 1,
  subdivisions: 3,
  colorNoiseMultiplier: 0.05,
  size: 31,
  wireframeThreshold: 0.01
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'subdivisions', 0, 5).step(1).onChange(setup)
gui.add(settings, 'colorNoiseMultiplier', 0.001, 2).onChange(setup)
gui.add(settings, 'size', 0, 100)
gui.add(settings, 'wireframeThreshold', 0, 0.334)

let rand, drawCall, vertexCount
const proj = [] // gonna reuse this array

const camera = createCamera(canvas, { zoomSpeed: 4 })
camera.lookAt(
  [50, 50, 50],
  [0, 0, 0],
  [0, 0, 1]
)

const vs = `#version 300 es
precision highp float;

layout(location=0) in vec3 position;
layout(location=1) in vec3 color;
layout(location=2) in vec3 bary;

layout(std140) uniform VertexUniforms {
  mat4 projection;
  mat4 view;
  float size;
};

out vec3 vColor;
out vec3 vBary;

void main() {
  vColor = color;
  vBary = bary;
  gl_Position = projection * view * vec4(position * size, 1);
  gl_PointSize = 4.0;
}`

const fs = `#version 300 es
precision highp float;

in vec3 vColor;
in vec3 vBary;

layout(std140) uniform FragmentUniforms {
  float wireframeThreshold;
};

out vec4 fragColor;

void main() {
  float minComponent = min(vBary.x, min(vBary.y, vBary.z));
  float afwidth = fwidth(minComponent) * 0.5;
  if (minComponent < wireframeThreshold + afwidth) {
    float alpha = 1.0 - smoothstep(wireframeThreshold - afwidth, wireframeThreshold + afwidth, minComponent);
    fragColor = vec4(vColor, alpha);
  } else {
    discard;
  }
}`

const program = pico.createProgram(vs, fs)
const attributes = pico.createVertexArray()
const vertexUniformBuffer = pico.createUniformBuffer([PicoGL.FLOAT_MAT4, PicoGL.FLOAT_MAT4, PicoGL.FLOAT])
const fragmentUniformBuffer = pico.createUniformBuffer([PicoGL.FLOAT])

function setup () {
  rand = random.createRandom(settings.seed)
  const mesh = primitiveIcosphere(1, { subdivisions: settings.subdivisions })
  const positions = pico.createVertexBuffer(PicoGL.FLOAT, 3, getPositions(mesh))
  const colors = pico.createVertexBuffer(PicoGL.FLOAT, 3, getColors(mesh))
  const barys = pico.createVertexBuffer(PicoGL.FLOAT, 3, getBarys(mesh))

  attributes
    .vertexAttributeBuffer(0, positions)
    .vertexAttributeBuffer(1, colors)
    .vertexAttributeBuffer(2, barys)

  drawCall = pico.createDrawCall(program, attributes)
  vertexCount = mesh.cells.length * 3
}

function getPositions (mesh) {
  let j = 0
  const positions = new Float32Array(mesh.cells.length * 3 * 3)
  for (let cell of mesh.cells) {
    for (let i of cell) {
      positions[j++] = mesh.positions[i][0]
      positions[j++] = mesh.positions[i][1]
      positions[j++] = mesh.positions[i][2]
    }
  }
  return positions
}

function getBarys (mesh) {
  let j = 0
  const barys = new Float32Array(mesh.cells.length * 3 * 3)
  for (let cell of mesh.cells) {
    barys[j++] = 1
    barys[j++] = 0
    barys[j++] = 0
    barys[j++] = 0
    barys[j++] = 1
    barys[j++] = 0
    barys[j++] = 0
    barys[j++] = 0
    barys[j++] = 1
  }
  return barys
}

function getColors (mesh) {
  let j = 0
  const colors = new Float32Array(mesh.cells.length * 3 * 3)
  const colorsByPosition = []
  for (let cell of mesh.cells) {
    for (let i of cell) {
      let color = colorsByPosition[i]
      if (!color) {
        const t = rand.noise3D(
          mesh.positions[i][0] * settings.colorNoiseMultiplier,
          mesh.positions[i][1] * settings.colorNoiseMultiplier,
          mesh.positions[i][2] * settings.colorNoiseMultiplier
        )
        const { r, g, b } = rgb(interpolateCool(t * 0.5 + 0.5))
        color = colorsByPosition[i] = [r / 255, g / 255, b / 255]
      }
      colors[j++] = color[0]
      colors[j++] = color[1]
      colors[j++] = color[2]
    }
  }
  return colors
}

const sketch = () => {
  setup()
  return () => {
    camera.tick()
    pico.clear()
    pico.viewport(0, 0, canvas.width, canvas.height)

    vertexUniformBuffer
      .set(0, mat4.perspective(proj, Math.PI / 4, canvas.width / canvas.height, 0.01, 1000)) // projection
      .set(1, camera.matrix) // view
      .set(2, settings.size) // size
      .update()

    fragmentUniformBuffer
      .set(0, settings.wireframeThreshold) // wireframeThreshold
      .update()

    drawCall
      .uniformBlock('VertexUniforms', vertexUniformBuffer)
      .uniformBlock('FragmentUniforms', fragmentUniformBuffer)
      .primitive(PicoGL.TRIANGLES)
      .drawRanges([0, vertexCount])
      .draw()
  }
}

canvasSketch(sketch, {
  canvas: canvas,
  context: 'webgl2',
  animate: true
})
