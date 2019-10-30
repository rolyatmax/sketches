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
const earcut = require('earcut')
const normal = require('get-plane-normal')

const EPSILON = 0.00000001

module.exports = function clipMeshWithPlane (triangles, planeNormal, pointOnPlane) {
  const mesh1 = []
  const mesh2 = []
  const newSegments = []
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

    // if any points lie on the plane, let's handle those
    const pointsOnPlaneIdxs = dotProducts.map((product, index) => Math.abs(product) < EPSILON ? index : false).filter(v => v !== false)
    const pointsNotOnPlaneIdxs = dotProducts.map((product, index) => Math.abs(product) < EPSILON ? false : index).filter(v => v !== false)
    if (pointsOnPlaneIdxs.length) {
      // if all points are on the plane, don't add to either mesh or to newSegments because the segments
      // are necessarily part of other triangles and will be added when processing them
      if (pointsOnPlaneIdxs.length === 3) continue

      // if two points are coplanar, put triangle into the mesh dictated by the third point
      if (pointsOnPlaneIdxs.length === 2) {
        newSegments.push(pointsOnPlaneIdxs.map(idx => points[idx]))
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

      newSegments.push([points[pointsOnPlaneIdxs[0]], intersection])

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
    newSegments.push(intersections.slice())
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
  }

  if (!newSegments.length) {
    return [mesh1, mesh2, newSegments]
  }

  const a = pointOnPlane
  const b = newSegments[0][0] // any point on the plane will do
  const ab = vec3.subtract([], b, a)
  vec3.normalize(ab, ab)
  const ad = planeNormal
  const ac = vec3.cross([], ab, ad)

  const rotation = [
    ab[0], ab[1], ab[2],
    ac[0], ac[1], ac[2],
    ad[0], ad[1], ad[2]
  ]

  const invRotation = [
    ab[0], ac[0], ad[0],
    ab[1], ac[1], ad[1],
    ab[2], ac[2], ad[2]
  ]

  const rotatedSegments = newSegments.map(seg => seg.map(pt => vec3.transformMat3([], pt, invRotation)))
  const zValue = rotatedSegments[0][0][2]
  const rotatedSegments2D = rotatedSegments.map(seg => seg.map(pt => [pt[0], pt[1]]))

  // this should create all the 2D polygons and holes then run earcut for every polygon and its
  // immediate, uh, hole children. Then it should return all the 2D triangles
  const tris = getPolygonTrisFromSegments(rotatedSegments2D)

  for (const tri of tris) {
    const rotated = tri.map(pt => vec3.transformMat3([], [pt[0], pt[1], zValue], rotation))
    // TODO!!! FIGURE OUT IF THESE FACES ARE POINTING THE RIGHT DIRECTION
    mesh1.push(rotated.slice())
    rotated.reverse()
    mesh2.push(rotated)
  }

  return [mesh1, mesh2] // TODO: return newPoints
}

function getLinePlaneIntersection (line, planeNormal, pointOnPlane) {
  const [p0, p1] = line
  const dir = vec3.subtract([], p1, p0)
  const t = vec3.dot(vec3.subtract([], pointOnPlane, p0), planeNormal) / vec3.dot(dir, planeNormal)
  return t >= 0 && t <= 1 ? vec3.add([], vec3.scale([], dir, t), p0) : null
}

// this should create all the 2D polygons and holes then run earcut for every polygon and its
// immediate, uh, hole children. Then it should return all the 2D triangles
function getPolygonTrisFromSegments (segments) {
  segments = segments.slice()
  const loops = []

  while (segments.length) {
    let loop = loops[loops.length - 1]
    if (!loops.length || isEqual(loop[0][0], loop[loop.length - 1][1])) {
      loops.push([segments.pop()])
      loop = loops[loops.length - 1]
    }
    const nextPt = loop[loop.length - 1][1]
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i]
      if (isEqual(s[0], nextPt)) {
        loop.push(segments.splice(i, 1)[0])
        break
      }
      if (isEqual(s[1], nextPt)) {
        loop.push(segments.splice(i, 1)[0].slice().reverse())
        break
      }
    }
  }

  // TODO: HANDLE THIS!! SOME OF THESE LOOPS ARE LIKELY HOLES
  if (loops.length > 1) console.log('more than one loop!', loops)

  const tris = []
  const points = loops[0].map(seg => seg[0])
  const newTriangles = earcut(points.flat())
  for (let i = 0; i < newTriangles.length; i += 3) {
    tris.push([
      points[newTriangles[i]],
      points[newTriangles[i + 1]],
      points[newTriangles[i + 2]]
    ])
  }
  return tris
}

function isEqual (pt1, pt2) {
  return Math.abs(pt1[0] - pt2[0]) < EPSILON && Math.abs(pt1[1] - pt2[1]) < EPSILON
}
