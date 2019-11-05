/**
 * TODO:
 * Figure out why some loops are 1 or 2 segments (some segments have same start/end point?)
 * Handle cases where there are more than one real loops (and holes)
 * Speed things up with kd-tree
 * Return newPoints/intersections
 * Investigate why line segment matching can loop forever in some cases (probably invalid loops / segments?)
 * Better memory management?
 */

const vec3 = require('gl-vec3')
const vec2 = require('gl-vec2')
const earcut = require('earcut')
const normal = require('get-plane-normal')
const removeDegenerateCells = require('remove-degenerate-cells')
const removeOrphanVertices = require('remove-orphan-vertices')

const EPSILON = 0.00000001

// searches for an element using a comparison function moving backwards through the array
function findBackwards (arr, iterator) {
  let n = arr.length
  while (n--) {
    if (iterator(arr[n])) return n
  }
  return -1
}

module.exports = function clipMeshWithPlane (mesh, planeNormal, pointOnPlane) {
  const mesh1 = { cells: [] }
  const mesh2 = { cells: [] }
  const newSegments = []
  const positions = mesh.positions.slice()
  const dotProductsByPosition = mesh.positions.map(pt => vec3.dot(planeNormal, vec3.subtract([], pt, pointOnPlane)))
  for (const cell of mesh.cells) {
    const dotProducts = cell.map(idx => dotProductsByPosition[idx])
    // if all points are on one side of the plane, then there is no intersection
    if (
      (dotProducts[0] > 0 && dotProducts[1] > 0 && dotProducts[2] > 0) ||
      (dotProducts[0] < 0 && dotProducts[1] < 0 && dotProducts[2] < 0)
    ) {
      if (dotProducts[0] > 0) mesh1.cells.push(cell)
      else mesh2.cells.push(cell)
      continue
    }

    // if any points lie on the plane, let's handle those
    const pointsOnPlaneIdxs = dotProducts
      .map((product, index) => Math.abs(product) < EPSILON ? index : false)
      .filter(v => v !== false)
    const pointsNotOnPlaneIdxs = dotProducts
      .map((product, index) => Math.abs(product) < EPSILON ? false : index)
      .filter(v => v !== false)
    if (pointsOnPlaneIdxs.length) {
      // if all points are on the plane, don't add to either mesh or to newSegments because the segments
      // are necessarily part of other triangles and will be added when processing them
      if (pointsOnPlaneIdxs.length === 3) continue

      // if two points are coplanar, put triangle into the mesh dictated by the third point
      if (pointsOnPlaneIdxs.length === 2) {
        newSegments.push(pointsOnPlaneIdxs.map(idx => cell[idx]))
        if (newSegments[newSegments.length - 1][0] === newSegments[newSegments.length - 1][1]) {
          console.log('segment with the same point!', newSegments[newSegments.length - 1].map(p => positions[p]))
        }
        const nonCoplanarPtIdx = pointsNotOnPlaneIdxs[0]
        if (dotProducts[nonCoplanarPtIdx] > 0) mesh1.cells.push(cell)
        else mesh2.cells.push(cell)
        continue
      }

      // if only one point is coplanar, let's see if the other two points are on the same side of the plane
      if ((dotProducts[pointsNotOnPlaneIdxs[0]] > 0) === (dotProducts[pointsNotOnPlaneIdxs[1]] > 0)) {
        if (dotProducts[pointsNotOnPlaneIdxs[0]] > 0) mesh1.cells.push(cell)
        else mesh2.cells.push(cell)
        continue
      }

      // if a point is coplanar and the remaining two points are on either side of the plane,
      // find the intersection and split the triangle into two triangles using the intersection
      const lineSegment = pointsNotOnPlaneIdxs.map(idx => mesh.positions[cell[idx]])
      const intersection = getLinePlaneIntersection(lineSegment, planeNormal, pointOnPlane)

      const ptIdx = cell[pointsOnPlaneIdxs[0]]
      let newPtIdx = findBackwards(positions, pt => vec3.equals(pt, intersection))
      if (newPtIdx < 0) {
        newPtIdx = positions.length
        positions.push(intersection)
      }
      newSegments.push([ptIdx, newPtIdx])
      if (newSegments[newSegments.length - 1][0] === newSegments[newSegments.length - 1][1]) {
        console.log('segment with the same point!', newSegments[newSegments.length - 1].map(p => positions[p]))
      }

      const tri1 = []
      const tri2 = []

      cell.forEach((pt, i) => {
        if (i === pointsOnPlaneIdxs[0]) {
          tri1.push(pt)
          tri2.push(pt)
        }
        if (dotProducts[i] > 0) {
          tri1.push(pt)
          tri2.push(newPtIdx)
        } else {
          tri1.push(newPtIdx)
          tri2.push(pt)
        }
      })

      mesh1.cells.push(tri1)
      mesh2.cells.push(tri2)

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
      [positions[cell[twoPoints[0]]], positions[cell[onePoint[0]]]],
      [positions[cell[twoPoints[1]]], positions[cell[onePoint[0]]]]
    )
    const intersectionIdxs = lineSegments.map(lineSegment => getLinePlaneIntersection(lineSegment, planeNormal, pointOnPlane)).map(intersection => {
      let newPtIdx = findBackwards(positions, pt => vec3.equals(pt, intersection))
      if (newPtIdx < 0) {
        newPtIdx = positions.length
        positions.push(intersection)
      }
      return newPtIdx
    })
    newSegments.push(intersectionIdxs.slice())
    if (newSegments[newSegments.length - 1][0] === newSegments[newSegments.length - 1][1]) {
      console.log('segment with the same point!', newSegments[newSegments.length - 1].map(p => positions[p]))
    }

    const tri1 = intersectionIdxs.slice()
    tri1.push(cell[onePoint[0]])
    const tri2 = twoPoints.map(idx => cell[idx])
    tri2.push(intersectionIdxs[0])
    const tri3 = [cell[twoPoints[1]]]
    tri3.push(...intersectionIdxs)

    const originalTriNormal = normal([], ...cell.map(idx => positions[idx]))
    const tris = [tri1, tri2, tri3]
    tris.forEach(tri => {
      const triNormal = normal([], ...tri.map(idx => positions[idx]))
      if (
        Math.abs(triNormal[0] - originalTriNormal[0]) > 0.1 ||
        Math.abs(triNormal[1] - originalTriNormal[1]) > 0.1 ||
        Math.abs(triNormal[2] - originalTriNormal[2]) > 0.1
      ) tri.reverse()
    })

    if (onePoint === mesh1Idxs) {
      mesh1.cells.push(tri1)
      mesh2.cells.push(tri2, tri3)
    } else {
      mesh2.cells.push(tri1)
      mesh1.cells.push(tri2, tri3)
    }
  }

  if (!newSegments.length) {
    mesh1.positions = positions.slice()
    mesh2.positions = positions.slice()
    return [mesh1, mesh2].map(m => removeOrphanVertices(removeDegenerateCells(m.cells, m.positions), m.positions))
  }

  const a = pointOnPlane
  const b = positions[newSegments[0][0]] // any point on the plane will do
  const ab = vec3.subtract([], b, a)
  vec3.normalize(ab, ab)
  const ad = planeNormal
  const ac = vec3.cross([], ab, ad)

  const invRotation = [
    ab[0], ac[0], ad[0],
    ab[1], ac[1], ad[1],
    ab[2], ac[2], ad[2]
  ]

  const rotatedPositions = []
  newSegments.forEach(seg => {
    seg.forEach(pt => {
      rotatedPositions[pt] = rotatedPositions[pt] || vec3.transformMat3([], positions[pt], invRotation)
    })
  })
  const rotatedPositions2D = rotatedPositions.map(pt => [pt[0], pt[1]])

  // this should create all the 2D polygons and holes then run earcut for every polygon and its
  // immediate, uh, hole children. Then it should return all the 2D triangles
  const tris = getPolygonTrisFromSegments(newSegments, rotatedPositions2D)

  for (const tri of tris) {
    // TODO!!! FIGURE OUT IF THESE FACES ARE POINTING THE RIGHT DIRECTION
    mesh1.cells.push(tri.slice())
    tri.reverse()
    mesh2.cells.push(tri)
  }

  mesh1.positions = positions.slice()
  mesh2.positions = positions.slice()
  // TODO: return newPoints
  return [mesh1, mesh2].map(m => removeOrphanVertices(removeDegenerateCells(m.cells, m.positions), m.positions))
}

function getLinePlaneIntersection (line, planeNormal, pointOnPlane) {
  const [p0, p1] = line
  const dir = vec3.subtract([], p1, p0)
  const t = vec3.dot(vec3.subtract([], pointOnPlane, p0), planeNormal) / vec3.dot(dir, planeNormal)
  return t >= 0 && t <= 1 ? vec3.add([], vec3.scale([], dir, t), p0) : null
}

// this should create all the 2D polygons and holes then run earcut for every polygon and its
// immediate, uh, hole children. Then it should return all the 2D triangles
function getPolygonTrisFromSegments (segments, positions) {
  segments = segments.slice()
  let loops = []

  while (segments.length) {
    let loop = loops[loops.length - 1]
    if (!loops.length || loop[0][0] === loop[loop.length - 1][1]) {
      loops.push([segments.pop()])
      loop = loops[loops.length - 1]
    }
    const nextPt = loop[loop.length - 1][1]
    let foundMatch = false
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i]
      if (s[0] === nextPt) {
        loop.push(segments.splice(i, 1)[0])
        foundMatch = true
        break
      }
      if (s[1] === nextPt) {
        loop.push(segments.splice(i, 1)[0].slice().reverse())
        foundMatch = true
        break
      }
    }
    if (!foundMatch) {
      loop.pop()
      if (!loop.length) loops.pop()
    }
  }

  // TODO: HANDLE THIS!! SOME OF THESE LOOPS ARE LIKELY HOLES
  if (loops.length > 1) console.log('more than one loop!', loops)
  loops = loops.filter(loop => loop.length > 2)

  const tris = []
  for (const loop of loops) {
    const positionIdxs = loop.map(seg => seg[0])
    const newTriangles = earcut(positionIdxs.map(idx => positions[idx]).flat())
    for (let i = 0; i < newTriangles.length; i += 3) {
      const tri = [
        positionIdxs[newTriangles[i]],
        positionIdxs[newTriangles[i + 1]],
        positionIdxs[newTriangles[i + 2]]
      ]
      if (!isDegenerateTri(tri.map(idx => positions[idx]))) tris.push(tri)
      else {
        console.log('Degenerate triangle returned from earcut')
      }
    }
  }
  return tris
}

function isDegenerateTri (tri) {
  const n1 = vec2.normalize([], vec2.subtract([], tri[0], tri[1]))
  const n2 = vec2.normalize([], vec2.subtract([], tri[0], tri[2]))
  return vec2.equals(n1, n2) || vec2.equals(n1, vec2.negate(n2, n2))
}

// const ab = vec2.subtract([], tri[0], tri[1])
// const ac = vec2.subtract([], tri[0], tri[2])
// const perp = [-ac[1], ac[0]]
// return vec2.dot(ab, perp) < EPSILON
