/**
 * Mesh smoothing by clipping corners of the mesh with a plane - not quite working yet
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
const clipMeshWithPlane = require('../lib/clip-mesh-with-plane/clip-mesh-with-plane-0.0.2')
const geoao = require('geo-ambient-occlusion')
const mergeVertices = require('merge-vertices')
const mesh = require('primitive-icosphere')(10, { subdivisions: 1 })
// const mesh = require('bunny')
// const mesh = require('snowden')

const meshCenter = mesh.positions.reduce((av, pt) => [
  av[0] + pt[0] / mesh.positions.length,
  av[1] + pt[1] / mesh.positions.length,
  av[2] + pt[2] / mesh.positions.length
], [0, 0, 0])

const rico = window.rico = createRico()

const settings = {
  seed: 26,
  palette: 10,
  primitive: 'triangles',
  smoothingIterations: 1,
  cutDepth: 0.53,
  sampleCount: 2048,
  resolution: 512,
  bias: 0.04,
  aoPower: 0.8,
  lightFromInside: false,
  cameraDist: 50,
  roam: true
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'palette', 0, 100).step(1)
gui.add(settings, 'smoothingIterations', 0, 20).step(1).onChange(setup)
gui.add(settings, 'sampleCount', 1, 10000).step(1).onChange(setup)
gui.add(settings, 'cutDepth', 0, 1).onChange(setup)
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

  const positions = []
  const normals = []
  let k = settings.smoothingIterations
  let m = mesh
  while (k--) {
    m = smoothenMesh(m, settings.cutDepth)
  }
  for (const pointIdxs of m.cells) {
    const n = normal(scratch, ...pointIdxs.map(idx => m.positions[idx]))
    // vec3.scale(n, n, 0.5)
    // vec3.add(n, n, [0.5, 0.5, 0.5])
    for (const idx of pointIdxs) {
      positions.push(...m.positions[idx])
      normals.push(...n)
    }
  }

  if (!positions.length) {
    console.error('NO POSITIONS!')
    return
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
    .vertexAttributeBuffer(2, rico.createVertexBuffer(rico.gl.FLOAT, 1, new Float32Array(ao)))
  positionsCount = positions.length / 3
}

const draw = rico({
  depth: true,
  vertexArray: vertexArray,
  vs: injectGLSL(PALETTE_ANIMATOR_GLSL, NOISE_GLSL, `#version 300 es
  precision highp float;

  layout(location=0) in vec3 position;
  layout(location=1) in vec3 normal;
  layout(location=2) in float ao;

  out vec4 vColor;

  uniform mat4 projection;
  uniform mat4 view;
  uniform bool lightFromInside;
  uniform float aoPower;

  void main() {
    vec3 n = normal * 0.8 + 0.5;
    float average = (n.x + n.y + n.z) / 3.0;
    vec3 color = getColorFromPalette(average) + 0.1;
    float occ = lightFromInside ? ao + 0.1 : 1.0 - ao + 0.1;
    color *= pow(occ, aoPower);
    vColor = vec4(color, 1);
    gl_Position = projection * view * vec4(position, 1);
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

    draw({
      primitive: settings.primitive,
      count: positionsCount,
      uniforms: {
        ...paletteAnimator.uniforms(),
        view: camera.matrix,
        projection: mat4.perspective([], Math.PI / 4, width / height, 0.01, 1000),
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

function createNodeGraph (mesh) {
  const nodeGraph = {}
  for (const [pt1, pt2, pt3] of mesh.cells) {
    nodeGraph[pt1] = nodeGraph[pt1] || new Set()
    nodeGraph[pt2] = nodeGraph[pt2] || new Set()
    nodeGraph[pt3] = nodeGraph[pt3] || new Set()
    nodeGraph[pt1].add(pt2)
    nodeGraph[pt1].add(pt3)
    nodeGraph[pt2].add(pt1)
    nodeGraph[pt2].add(pt3)
    nodeGraph[pt3].add(pt1)
    nodeGraph[pt3].add(pt2)
  }
  for (const node of Object.keys(nodeGraph)) {
    nodeGraph[node] = Array.from(nodeGraph[node])
  }
  return nodeGraph
}

// cutDepth is the perc along the vertex normal to cut
function smoothenMesh (mesh, cutDepth) {
  mesh = mergeVertices(mesh.cells, mesh.positions)
  const nodeGraph = createNodeGraph(mesh)
  const clippingPlanes = []
  for (const vertex of Object.keys(nodeGraph)) {
    const vertexNormal = [0, 0, 0]
    const curPt = mesh.positions[vertex]
    const neighborCount = nodeGraph[vertex].length
    const neighborVectors = nodeGraph[vertex].map(neighbor => vec3.subtract([], mesh.positions[neighbor], curPt))
    for (const vec of neighborVectors) {
      vec3.scaleAndAdd(vertexNormal, vertexNormal, vec, 1 / neighborCount)
    }
    vec3.normalize(vertexNormal, vertexNormal)
    const nonZeroDots = neighborVectors.map(vec => vec3.dot(vec, vertexNormal)).filter(d => d !== 0)
    const greaterThanZeroDots = nonZeroDots.map(d => d > 0)
    // if the dot products of the average vector with all the vectors have the same sign, the points are on the "same side" and it is concave
    const isConcaveVertex = greaterThanZeroDots.length === 0 || greaterThanZeroDots.length === nonZeroDots.length
    if (!isConcaveVertex) continue
    let shortestNormal = null
    let shortestNormalLength = Infinity
    for (const vec of neighborVectors) {
      if (vec3.squaredLength(vec) < shortestNormalLength) {
        shortestNormalLength = vec3.squaredLength(vec)
        shortestNormal = vec
      }
    }
    const cutLeng = vec3.dot(vertexNormal, vec3.scale([], shortestNormal, cutDepth))
    const pointOnPlane = vec3.scaleAndAdd([], curPt, vertexNormal, cutLeng)
    const planeNormal = vertexNormal
    clippingPlanes.push({ pointOnPlane, planeNormal })
  }
  for (const { planeNormal, pointOnPlane } of clippingPlanes) {
    // TODO: alter this mesh so it just has the related cells to cut (we don't want to accidentally cut other parts of the mesh here)
    const [mesh1, mesh2] = clipMeshWithPlane(mesh, planeNormal, pointOnPlane)
    mesh = mesh1 // mesh1.cells.length > mesh2.cells.length ? mesh1 : mesh2
  }
  return mesh
}
