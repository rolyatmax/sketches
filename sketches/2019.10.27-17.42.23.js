/**
 * Drawing a circle on a plane that is perpendicular to a given heading
 */

const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { createRico } = require('../lib/dlite/dlite-0.0.9')
const { GUI } = require('dat-gui')
const createCamera = require('3d-view-controls')
const mat4 = require('gl-mat4')
const vec3 = require('gl-vec3')
const normal = require('get-plane-normal')
const earcut = require('earcut')
const quickhull = require('quickhull3d')
// const mesh = require('primitive-icosphere')(10, { subdivisions: 1 })
const mesh = require('bunny')

const rico = window.rico = createRico()

const settings = {
  seed: 0,
  vX: 0,
  vY: 0,
  vZ: 0,
  primitive: 'triangles',
  offset: 1
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'vX', -10, 10).onChange(setup)
gui.add(settings, 'vY', -10, 10).onChange(setup)
gui.add(settings, 'vZ', -10, 10).onChange(setup)
gui.add(settings, 'offset', -5, 5).onChange(setup)
gui.add(settings, 'primitive', ['points', 'lines', 'triangles'])

const vertexArray = rico.createVertexArray()
let positionsCount, pointsCount

const camera = createCamera(rico.canvas, { zoomSpeed: 4 })

camera.lookAt(
  [50, 50, 50],
  [0, 0, 0],
  [1, 1, -1]
)

const scratch = []

function setup () {
  const rand = random.createRandom(settings.seed)
  const positions = []
  const normals = []
  const newPoints = []
  const triangles = mesh.cells.map(cell => cell.map(idx => mesh.positions[idx]))
  const planeNormal = rand.onSphere(1)
  const [mesh1, mesh2, intersections] = clipMeshWithPlane(triangles, planeNormal, [settings.vX, settings.vY, settings.vZ])
  const offset1 = vec3.scale([], planeNormal, settings.offset)
  const offset2 = vec3.scale([], planeNormal, -settings.offset)
  const tris = [
    ...mesh1.map(points => points.map(pt => vec3.add([], pt, offset1))),
    ...mesh2.map(points => points.map(pt => vec3.add([], pt, offset2)))
  ]

  for (const points of tris) {
    const n = normal(scratch, ...points)
    vec3.scale(n, n, 0.8)
    vec3.add(n, n, [0.5, 0.5, 0.5])
    for (const pt of points) {
      positions.push(...pt)
      normals.push(...n)
    }
  }

  for (const pt of intersections) newPoints.push(...vec3.add([], pt, offset1))
  for (const pt of intersections) newPoints.push(...vec3.add([], pt, offset2))

  vertexArray
    .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 3, new Float32Array(positions)))
    .vertexAttributeBuffer(1, rico.createVertexBuffer(rico.gl.FLOAT, 3, new Float32Array(normals)))
    .vertexAttributeBuffer(2, rico.createVertexBuffer(rico.gl.FLOAT, 3, new Float32Array(newPoints)))
  positionsCount = positions.length / 3
  pointsCount = newPoints.length / 3
}

const draw = rico({
  depth: true,
  vertexArray: vertexArray,
  vs: `#version 300 es
  precision highp float;

  layout(location=0) in vec3 position;
  layout(location=1) in vec3 normal;

  out vec4 vColor;

  uniform mat4 projection;
  uniform mat4 view;

  void main() {
    vColor = vec4(normal, 1);
    gl_Position = projection * view * vec4(position, 1);
  }
  `,
  fs: `#version 300 es
  precision highp float;
  
  in vec4 vColor;
  out vec4 fragColor;

  void main() {
    fragColor = vColor;
  }
  `
})

const drawPoints = rico({
  depth: true,
  primitive: 'points',
  vertexArray: vertexArray,
  vs: `#version 300 es
  precision highp float;

  layout(location=2) in vec3 position;

  out vec4 vColor;

  uniform vec3 color;
  uniform mat4 projection;
  uniform mat4 view;

  void main() {
    vColor = vec4(color, 1);
    gl_Position = projection * view * vec4(position, 1);
    gl_PointSize = 5.0;
  }
  `,
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
  return ({ width, height }) => {
    camera.tick()
    rico.clear(1, 1, 1, 1)

    const drawUniforms = {
      view: camera.matrix,
      projection: mat4.perspective([], Math.PI / 8, width / height, 0.01, 1000)
    }

    draw({
      primitive: settings.primitive,
      count: positionsCount,
      uniforms: { ...drawUniforms }
    })

    drawPoints({
      count: pointsCount,
      uniforms: { ...drawUniforms, color: [0.5, 0.6, 0.7] }
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
