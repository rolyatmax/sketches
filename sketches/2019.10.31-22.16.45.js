/**
 * Drawing a circle on a plane that is perpendicular to a given heading
 */

const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { createRico } = require('../lib/dlite/dlite-0.0.10')
const { GUI } = require('dat-gui')
const mat4 = require('gl-mat4')
const vec3 = require('gl-vec3')
const normal = require('get-plane-normal')
const createCamera = require('3d-view-controls')
const palettes = require('nice-color-palettes')
const createPaletteAnimator = require('../lib/palette-animator/palette-animator-0.0.1')
const NOISE_GLSL = require('../lib/noise-glsl/noise-glsl-0.0.1')
const injectGLSL = require('../lib/inject-glsl/inject-glsl-0.0.1')
const clipMeshWithPlane = require('../lib/clip-mesh-with-plane/clip-mesh-with-plane-0.0.1')
const geoao = require('geo-ambient-occlusion')
const mesh = require('primitive-icosphere')(10, { subdivisions: 0 })
// const mesh = require('bunny')
// const mesh = require('snowden')

const meshCenter = mesh.positions.reduce((av, pt) => [
  av[0] + pt[0] / mesh.positions.length,
  av[1] + pt[1] / mesh.positions.length,
  av[2] + pt[2] / mesh.positions.length
], [0, 0, 0])

const rico = window.rico = createRico()

const settings = {
  seed: 5310,
  palette: 70,
  primitive: 'triangles',
  offset: 0,
  cuts: 3,
  rotationAmount: 0.01,
  translationAmount: 0.1,
  sampleCount: 2048,
  resolution: 512,
  bias: 0.04,
  aoPower: 0.8,
  lightFromInside: false,
  cameraDist: 22,
  roam: true
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'palette', 0, 100).step(1)
gui.add(settings, 'offset', 0, 2).onChange(setup)
gui.add(settings, 'cuts', 0, 28).step(1).onChange(setup)
gui.add(settings, 'rotationAmount', 0, 2)
gui.add(settings, 'translationAmount', 0, 10)
gui.add(settings, 'sampleCount', 1, 10000).step(1).onChange(setup)
gui.add(settings, 'resolution', 1, 2048).step(1).onChange(setup)
gui.add(settings, 'bias', 0, 0.5).step(0.001).onChange(setup)
gui.add(settings, 'aoPower', 0, 2)
gui.add(settings, 'lightFromInside')
gui.add(settings, 'primitive', ['points', 'lines', 'triangles'])
gui.add(settings, 'cameraDist', 0, 100)
gui.add(settings, 'roam')

const camera = createCamera(rico.canvas, { zoomSpeed: 4 })
camera.lookAt(
  [50, 50, 50],
  meshCenter,
  [0, 0, 1]
)

const vertexArray = rico.createVertexArray()
let positionsCount
let rand = random.createRandom(settings.seed)

palettes.unshift(['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'])
const paletteAnimator = createPaletteAnimator(palettes, 0.001, 0.1, [1, 1, 1])
const { PALETTE_ANIMATOR_GLSL } = paletteAnimator

const scratch = []

function setup () {
  rand = random.createRandom(settings.seed)
  let meshes = [mesh.cells.map(cell => cell.map(idx => mesh.positions[idx]))]

  const planeNormal = rand.onSphere(1)

  let n = settings.cuts
  while (n--) {
    const planePt = rand.insideSphere(10)
    meshes = meshes.map(m => {
      const [mesh1, mesh2] = clipMeshWithPlane(m, planeNormal, planePt)
      const offset1 = vec3.scale([], planeNormal, settings.offset)
      const offset2 = vec3.scale([], planeNormal, -settings.offset)
      return [
        mesh1.map(points => points.map(pt => vec3.add([], pt, offset1))),
        mesh2.map(points => points.map(pt => vec3.add([], pt, offset2)))
      ]
    }).flat()
  }

  const positions = []
  const normals = []
  const rotationAxes = []
  const rotationOffsets = []
  for (const triangles of meshes) {
    const rotationAxis = planeNormal // rand.onSphere(1)
    const center = getMeshCenter(triangles)
    const rotationOffset = center
    for (const points of triangles) {
      const n = normal(scratch, ...points)
      vec3.scale(n, n, 0.8)
      vec3.add(n, n, [0.5, 0.5, 0.5])
      for (const pt of points) {
        positions.push(...pt)
        normals.push(...n)
        rotationAxes.push(...rotationAxis)
        rotationOffsets.push(...rotationOffset)
      }
    }
  }

  const aoSampler = geoao(positions, {
    resolution: settings.resolution,
    bias: settings.bias,
    normals: normals
  })

  for (let i = 0; i < settings.sampleCount; i++) {
    aoSampler.sample()
  }

  const ao = aoSampler.report()

  aoSampler.dispose()

  vertexArray
    .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 3, new Float32Array(positions)))
    .vertexAttributeBuffer(1, rico.createVertexBuffer(rico.gl.FLOAT, 3, new Float32Array(normals)))
    .vertexAttributeBuffer(2, rico.createVertexBuffer(rico.gl.FLOAT, 3, new Float32Array(rotationAxes)))
    .vertexAttributeBuffer(3, rico.createVertexBuffer(rico.gl.FLOAT, 3, new Float32Array(rotationOffsets)))
    .vertexAttributeBuffer(4, rico.createVertexBuffer(rico.gl.FLOAT, 1, new Float32Array(ao)))
  positionsCount = positions.length / 3
}

const draw = rico({
  depth: true,
  vertexArray: vertexArray,
  vs: injectGLSL(PALETTE_ANIMATOR_GLSL, NOISE_GLSL, `#version 300 es
  precision highp float;

  layout(location=0) in vec3 position;
  layout(location=1) in vec3 normal;
  layout(location=2) in vec3 rotationAxis;
  layout(location=3) in vec3 rotationOffset;
  layout(location=4) in float ao;

  out vec4 vColor;

  uniform mat4 projection;
  uniform mat4 view;
  uniform float time;
  uniform vec3 meshCenter;
  uniform float rotationAmount;
  uniform float translationAmount;
  uniform bool lightFromInside;
  uniform float aoPower;

  vec4 makeQuaternion(float angle, vec3 axis) {
    return vec4(cos(angle / 2.0), sin(angle / 2.0) * axis);
  }

  vec3 transform(vec3 p, vec4 q) {
    return p + 2.0 * cross(cross(p, q.yzw) + q.x * p, q.yzw);
  }

  void main() {
    float tOffset = random3(rotationOffset).x + 0.5;
    float t = sin(time * 0.8) * 0.5 + 0.5;
    t *= 1.0 + tOffset * 5.0;
    t *= random3(rotationOffset).y * 2.0;
    vec4 quat = makeQuaternion(3.1415 * t * rotationAmount, rotationAxis);
    vec3 translation = normalize(rotationOffset - meshCenter);
    vec3 offset = t * translationAmount * translation;
    vec3 n = transform(normal, quat);
    float average = clamp((n.x + n.y + n.z) / 3.0 + 0.05, 0.0, 1.0);
    vec3 color = getColorFromPalette(average) + vec3(0.15);
    float occ = lightFromInside ? ao + 0.1 : 1.0 - ao + 0.1;
    color *= pow(occ, aoPower);
    vColor = vec4(color, 1);
    vec3 p = transform(position - rotationOffset, quat) + rotationOffset + offset;
    gl_Position = projection * view * vec4(p, 1);
    gl_PointSize = 2.0;
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

const sketch = () => {
  setup()
  return ({ width, height, time }) => {
    if (settings.roam) {
      camera.up = [0, 1, 0]
      camera.center = [settings.cameraDist * Math.cos(time / 5), 0, settings.cameraDist * Math.sin(time / 5)]
    }
    camera.tick()
    paletteAnimator.tick(settings.palette)
    if (settings.lightFromInside) rico.clear(0.18, 0.18, 0.18, 1)
    else rico.clear(0.97, 0.98, 0.99, 1)

    const drawUniforms = {
      view: camera.matrix,
      projection: mat4.perspective([], Math.PI / 4, width / height, 0.01, 1000)
    }

    draw({
      primitive: settings.primitive,
      count: positionsCount,
      uniforms: {
        ...drawUniforms,
        ...paletteAnimator.uniforms(),
        meshCenter: meshCenter,
        time: time,
        rotationAmount: settings.rotationAmount,
        translationAmount: settings.translationAmount,
        lightFromInside: settings.lightFromInside,
        aoPower: settings.aoPower
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

function getMeshCenter (triangles) {
  const pointsCount = triangles.length * 3
  if (!pointsCount) return null
  const center = [0, 0, 0]
  for (const tri of triangles) {
    for (const pt of tri) {
      center[0] += pt[0] / pointsCount
      center[1] += pt[1] / pointsCount
      center[2] += pt[2] / pointsCount
    }
  }
  return center
}
