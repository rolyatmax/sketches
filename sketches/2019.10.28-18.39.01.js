/**
 * Clip a mesh with a plane
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
// const earcut = require('earcut')
// const quickhull = require('quickhull3d')
// const mesh = require('primitive-icosphere')(10, { subdivisions: 1 })
const mesh = require('bunny')
// const mesh = require('snowden')

const meshCenter = mesh.positions.reduce((av, pt) => [
  av[0] + pt[0] / mesh.positions.length,
  av[1] + pt[1] / mesh.positions.length,
  av[2] + pt[2] / mesh.positions.length
], [0, 0, 0])

const rico = window.rico = createRico()

const settings = {
  seed: 0,
  palette: 11,
  primitive: 'triangles',
  offset: 0.01,
  cuts: 12,
  cameraDist: 18,
  roam: true
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'palette', 0, 99).step(1)
gui.add(settings, 'offset', -1, 1).onChange(setup)
gui.add(settings, 'cuts', 0, 35).step(1).onChange(setup)
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

const paletteAnimator = createPaletteAnimator(palettes, 0.001, 0.1, [1, 1, 1])
const { PALETTE_ANIMATOR_GLSL } = paletteAnimator

const scratch = []

function setup () {
  rand = random.createRandom(settings.seed)
  let meshes = [mesh.cells.map(cell => cell.map(idx => mesh.positions[idx]))]

  let n = settings.cuts
  while (n--) {
    meshes = meshes.map(subdivideMeshes).flat()
  }

  function subdivideMeshes (mesh) {
    const planeNormal = rand.onSphere(1)
    const planePt = rand.insideSphere(5)
    const [mesh1, mesh2] = clipMeshWithPlane(mesh, planeNormal, planePt)
    const offset1 = vec3.scale([], planeNormal, settings.offset)
    const offset2 = vec3.scale([], planeNormal, -settings.offset)
    // const rotation = mat4.fromRotation([], rand.range(0, Math.PI * 0.5), planeNormal)
    return [
      mesh1.map(points => points.map(pt => vec3.add([], pt, offset1))),
      mesh2.map(points => points.map(pt => vec3.add([], pt, offset2)))
      // mesh1.map(points => points.map(pt => vec3.transformMat4([], pt, rotation))),
      // mesh2
    ]
  }

  const positions = []
  const normals = []
  const rotationAxes = []
  const rotationOffsets = []
  for (const triangles of meshes) {
    const rotationAxis = rand.onSphere(1)
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

  vertexArray
    .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 3, new Float32Array(positions)))
    .vertexAttributeBuffer(1, rico.createVertexBuffer(rico.gl.FLOAT, 3, new Float32Array(normals)))
    .vertexAttributeBuffer(2, rico.createVertexBuffer(rico.gl.FLOAT, 3, new Float32Array(rotationAxes)))
    .vertexAttributeBuffer(3, rico.createVertexBuffer(rico.gl.FLOAT, 3, new Float32Array(rotationOffsets)))
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

  out vec4 vColor;

  uniform mat4 projection;
  uniform mat4 view;
  uniform float time;
  uniform vec3 meshCenter;

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
    vec4 quat = makeQuaternion(3.1415 * t * 2.0, rotationAxis);
    vec3 translation = normalize(rotationOffset - meshCenter);
    vec3 offset = t * 5.0 * translation;
    vec3 n = transform(normal, quat);
    float average = (n.x + n.y + n.z) / 3.0 + 0.05;
    vec3 color = getColorFromPalette(average);
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
    rico.clear(1, 1, 1, 1)

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
        time: time
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

function clipMeshWithPlane (triangles, planeNormal, pointOnPlane) {
  const mesh1 = []
  const mesh2 = []
  const newPoints = []
  for (const points of triangles) {
    const dotProducts = points.map(pt => vec3.dot(planeNormal, vec3.subtract([], pt, pointOnPlane)))
    // if all points are on one side of the plane, then there is no intersection
    if (
      (dotProducts[0] > 0 && dotProducts[1] > 0 && dotProducts[2] > 0) ||
      (dotProducts[0] < 0 && dotProducts[1] < 0 && dotProducts[2] < 0)
    ) {
      if (dotProducts[0] > 0) mesh1.push(points)
      else mesh2.push(points)
      continue
    }

    const EPSILON = 0.00000001
    // if any points lie on the plane, let's handle those
    const pointsOnPlaneIdxs = dotProducts.map((product, index) => Math.abs(product) < EPSILON ? index : false).filter(v => v !== false)
    const pointsNotOnPlaneIdxs = dotProducts.map((product, index) => Math.abs(product) < EPSILON ? false : index).filter(v => v !== false)
    if (pointsOnPlaneIdxs.length) {
      console.log('points on plane!')

      // all coplanar points are intersections, add them to the newPoints list
      newPoints.push(...pointsOnPlaneIdxs.map(idx => points[idx]))

      // if all points are on the plane, don't add to either mesh
      if (pointsOnPlaneIdxs.length === 3) continue

      // if two points are coplanar, put triangle into the mesh dictated by the third point
      if (pointsOnPlaneIdxs.length === 2) {
        const nonCoplanarPtIdx = pointsNotOnPlaneIdxs[0]
        if (dotProducts[nonCoplanarPtIdx] > 0) mesh1.push(points)
        else mesh2.push(points)
        continue
      }

      // if only one point is coplanar, let's see if the other two points are on the same side of the plane
      if ((dotProducts[pointsNotOnPlaneIdxs[0]] > 0) === (dotProducts[pointsNotOnPlaneIdxs[1]] > 0)) {
        if (dotProducts[pointsNotOnPlaneIdxs[0]] > 0) mesh1.push(points)
        else mesh2.push(points)
        continue
      }

      // if a point is coplanar and the remaining two points are on either side of the plane,
      // find the intersection and split the triangle into two triangles using the intersection
      const lineSegment = pointsNotOnPlaneIdxs.map(idx => points[idx])
      const intersection = getLinePlaneIntersection(lineSegment, planeNormal, pointOnPlane)
      const tri1 = []
      const tri2 = []

      points.forEach((pt, i) => {
        if (i === pointsOnPlaneIdxs[0]) {
          tri1.push(pt)
          tri2.push(pt)
        }
        if (dotProducts[i] > 0) {
          tri1.push(pt)
          tri2.push(intersection)
        } else {
          tri1.push(intersection)
          tri2.push(pt)
        }
      })
      mesh1.push(tri1)
      mesh2.push(tri2)

      continue
    }

    // find intersecting points
    const mesh1Idxs = []
    const mesh2Idxs = []
    dotProducts.forEach((product, i) => {
      if (product > 0) mesh1Idxs.push(i)
      else mesh2Idxs.push(i)
    })

    const lineSegments = []
    const twoPoints = mesh1Idxs.length > mesh2Idxs.length ? mesh1Idxs : mesh2Idxs
    const onePoint = mesh1Idxs.length > mesh2Idxs.length ? mesh2Idxs : mesh1Idxs
    lineSegments.push(
      [points[twoPoints[0]], points[onePoint[0]]],
      [points[twoPoints[1]], points[onePoint[0]]]
    )
    const intersections = lineSegments.map(lineSegment => getLinePlaneIntersection(lineSegment, planeNormal, pointOnPlane))
    const tri1 = intersections.slice()
    tri1.push(points[onePoint[0]])
    const tri2 = twoPoints.map(idx => points[idx])
    tri2.push(intersections[0])
    const tri3 = [points[twoPoints[1]]]
    tri3.push(...intersections)

    const originalTriNormal = normal([], ...points)
    const tris = [tri1, tri2, tri3]
    tris.forEach(tri => {
      const triNormal = normal([], ...tri)
      if (
        Math.abs(triNormal[0] - originalTriNormal[0]) > 0.1 ||
        Math.abs(triNormal[1] - originalTriNormal[1]) > 0.1 ||
        Math.abs(triNormal[2] - originalTriNormal[2]) > 0.1
      ) tri.reverse()
    })

    if (onePoint === mesh1Idxs) {
      mesh1.push(tri1)
      mesh2.push(tri2, tri3)
    } else {
      mesh2.push(tri1)
      mesh1.push(tri2, tri3)
    }

    newPoints.push(...intersections)
  }

  // TODO: rotate this to x/y then do convexHull then rotate back??????????????????
  // const hullMesh = quickhull(newPoints).flat()
  // earcut.flatten(hullMesh.map(idxs => idxs.map(idx => newPoints[idx])))
  // const newTriangles = earcut(hullMesh.flat(), [], 3)
  // for (let i = 0; i < newTriangles.length; i += 3) {
  //   const tri = [newPoints[newTriangles[i]], newPoints[newTriangles[i + 1]], newPoints[newTriangles[i + 2]]]
  //   mesh1.push(tri.slice())
  //   tri.reverse()
  //   mesh2.push(tri)
  // }

  return [mesh1, mesh2, newPoints]
}

function getLinePlaneIntersection (line, planeNormal, pointOnPlane) {
  const [p0, p1] = line
  const dir = vec3.subtract([], p1, p0)
  const t = vec3.dot(vec3.subtract([], pointOnPlane, p0), planeNormal) / vec3.dot(dir, planeNormal)
  return t >= 0 && t <= 1 ? vec3.add([], vec3.scale([], dir, t), p0) : null
}

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
