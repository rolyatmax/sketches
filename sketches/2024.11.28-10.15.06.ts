// NYC Building Lines Study
import * as optimizePathOrder from '../plots/optimize-path-order'
import * as canvasSketch from 'canvas-sketch'
import * as random from 'canvas-sketch-util/random'
import { GUI } from 'dat-gui'
import { vec2, mat4, vec3 } from 'gl-matrix'

const PLOTNAME = '2024.11.28-10.15.06'

const MM_PER_INCH = 25.4
const PIXELS_PER_INCH = 200
const WIDTH = 6 * PIXELS_PER_INCH
const HEIGHT = 4 * PIXELS_PER_INCH
const PIXELS_PER_MM = PIXELS_PER_INCH / MM_PER_INCH
const PIXELS_PER_CM = PIXELS_PER_MM * 10

const BUILDINGS_FACES_URL = 'resources/data/nyc-buildings/manhattan-faces.json'

const settings = {
  seed: 8020,
  margin: 1, // margin around the canvas (in inches)
  outlineSpacing: 30, // spacing between the outline and the lines (in pixels)

  // render faster for exploration
  renderFast: true,

  // camera settings
  cameraHeightMin: 700,
  cameraHeightMax: 1000,
  cameraDistanceMin: 100,
  cameraDistanceMax: 100,

  // perturb line settings
  perturbNoiseFreq: 0.5,
  perturbNoiseMag: 1.6,
  perturbDivisionSize: 4,

  lineWidthMM: 0.1
}

type Line2D = vec2[]
type Line = vec3[]
type Box = {
  x: number,
  y: number,
  width: number,
  height: number,
}

type Building = {
  bin: number
  bbox: [number, number, number, number, number, number]
  faces: number[][]
}

type SketchArgs = { context: CanvasRenderingContext2D, viewportWidth: number, viewportHeight: number }

let lines: Line2D[] = []

;(async function main() {
  const buildings = await fetch(BUILDINGS_FACES_URL).then(res => res.json()) as Building[]

  console.log('buildings', buildings)

  canvasSketch(({ render }) => {
    const gui = new GUI()
    gui.add(settings, 'seed', 0, 9999).step(1).onChange(render)
    gui.add(settings, 'margin', 0, 1).step(0.01).onChange(render)
    gui.add(settings, 'outlineSpacing', 0, 100).step(1).onChange(render)
    gui.add(settings, 'cameraHeightMin', 100, 1000).step(1).onChange(render)
    gui.add(settings, 'cameraHeightMax', 100, 1000).step(1).onChange(render)
    gui.add(settings, 'cameraDistanceMin', 100, 2000).step(1).onChange(render)
    gui.add(settings, 'cameraDistanceMax', 100, 2000).step(1).onChange(render)
    gui.add(settings, 'perturbNoiseFreq', 0, 0.1).onChange(render)
    gui.add(settings, 'perturbNoiseMag', 0, 10).step(0.01).onChange(render)
    gui.add(settings, 'perturbDivisionSize', 1, 20).step(1).onChange(render)
    gui.add(settings, 'lineWidthMM', 0.05, 2).step(0.01).onChange(render)
    gui.add(settings, 'renderFast').onChange(render)

    return (args: SketchArgs) => {
      const { context, viewportWidth, viewportHeight } = args
      const margin = settings.margin * PIXELS_PER_INCH
      const width = viewportWidth - margin * 2
      const height = viewportHeight - margin * 2

      const rand = random.createRandom(settings.seed)

      // pick random building
      const building = buildings[rand.rangeFloor(buildings.length)]
      const center = vec3.fromValues(
        (building.bbox[0] + building.bbox[3]) / 2,
        (building.bbox[1] + building.bbox[4]) / 2,
        (building.bbox[2] + building.bbox[5]) / 2
      )

      // center the camera on its bounding box
      // calculate view-projection matrix
      const viewMatrix = mat4.lookAt(mat4.create(), getCameraEye(rand, center), center, [0, 0, 1])
      const projectionMatrix = mat4.perspective(mat4.create(), Math.PI / 3, width / height, 1, 4000)
      const viewProjectionMatrix = mat4.mul(mat4.create(), projectionMatrix, viewMatrix)

      // cull buildings
      const visibleBuildings = buildings.filter(b => true) //frustumIntersectsBox(b.bbox, viewProjectionMatrix))
      console.log('visibleBuildings', visibleBuildings.length)

      // transform face coords to screenspace
      const faces: vec3[][] = []
      for (const building of visibleBuildings) {
        for (const face of building.faces) {
          const transformedFace = chunkArray(face, 3).map(v => vec3.transformMat4(vec3.create(), vec3.fromValues(v[0], v[1], v[2]), viewProjectionMatrix))
          // const isBehind = transformedFace.every(v => v[2] < 0)
          const isOffScreen = transformedFace.every(v => v[0] < -1 || v[0] > 1 || v[1] < -1 || v[1] > 1 || v[2] < -1 || v[2] > 1)
          // cull backfaces
          if (!isOffScreen && isFrontFacing(transformedFace)) {
            faces.push(transformedFace.map(v => vec3.fromValues(
              (v[0] + 1) * width / 2 + margin,
              (v[1] * -1 + 1) * height / 2 + margin, // flip y
              v[2]
            )))
          }
        }
      }

      const initLines = faces.slice()

      // add margin outline
      initLines.push([
        vec3.fromValues(margin, margin, 0),
        vec3.fromValues(margin, height + margin, 0),
        vec3.fromValues(width + margin, height + margin, 0),
        vec3.fromValues(width + margin, margin, 0),
        vec3.fromValues(margin, margin, 0),
      ])

      console.log('lines count', initLines.length)
      const segmentStart = performance.now()
      // segment lines - break the lines into segments and then break the segments into smaller segments where they intersect with each other
      let segments: [vec3, vec3][] = []
      for (const line of initLines) {
        for (let i = 0; i < line.length - 1; i++) {
          segments.push([line[i], line[i + 1]])
        }
      }
      console.log('segments count', segments.length)

      segments = segments.filter(segment => !isSegmentTooShort(segment, 2))
      console.log('segments count after short removal', segments.length)

      if (!settings.renderFast) {
        segments = segmentLines(segments)
        console.log('segmentLines time', performance.now() - segmentStart)
        console.log('segments count after intersection breaks', segments.length)

        segments = segments.filter(segment => {
          return (segment[0][0] > margin && segment[0][0] < width + margin && segment[0][1] > margin && segment[0][1] < height + margin) &&
            (segment[1][0] > margin && segment[1][0] < width + margin && segment[1][1] > margin && segment[1][1] < height + margin)
        })
        console.log('segments count after culling offscreen', segments.length)

        const removeHiddenStart = performance.now()
        segments = removeHiddenSegments(segments, faces)
        console.log('removeHiddenSegments time', performance.now() - removeHiddenStart)
        console.log('segments count after hidden removal', segments.length)
      }

      const segments2d = segments.map(segment => convertLineTo2d(segment) as [vec2, vec2])

      const combineStart = performance.now()
      lines = combineSegments(segments2d, 2)
      console.log('combineSegments time', performance.now() - combineStart)

      lines = lines.filter(line => getLineLength(line) > 2)

      lines = artisticMergeLines(lines)

      lines = lines.map(line => perturbLine(rand, line))

      const outline = margin - settings.outlineSpacing
      lines.push([
        vec2.fromValues(outline, outline),
        vec2.fromValues(outline, viewportHeight - outline),
        vec2.fromValues(viewportWidth - outline, viewportHeight - outline),
        vec2.fromValues(viewportWidth - outline, outline),
        vec2.fromValues(outline, outline),
      ])

      console.log('segments2d count', segments2d.length)
      console.log('final lines count', lines.length)

      context.fillStyle = 'white'
      context.fillRect(0, 0, WIDTH, HEIGHT)

      for (const pts of lines) {
        const firstPt = pts[0]
        context.beginPath()
        context.moveTo(firstPt[0], firstPt[1])
        for (const pt of pts.slice(1)) {
          context.lineTo(pt[0], pt[1])
        }
        context.strokeStyle = 'rgba(0, 0, 0, 0.5)'
        context.lineWidth = 2
        context.stroke()
      }
    }
  }, {
    dimensions: [WIDTH, HEIGHT],
    animate: false
  })
})();

function getLineLength(line: vec2[]): number {
  let length = 0
  for (let i = 0; i < line.length - 1; i++) {
    length += vec2.distance(line[i], line[i + 1])
  }
  return length
}

function isSegmentTooShort(segment: [vec3, vec3], threshold: number): boolean {
  const thresholdSquared = threshold * threshold
  return vec2.squaredDistance(vec2.fromValues(segment[0][0], segment[0][1]), vec2.fromValues(segment[1][0], segment[1][1])) < thresholdSquared
}

function perturbLine (rand: random.RandomGenerator, line: vec2[]): vec2[] {
  const outLine: vec2[] = []
  for (let j = 0; j < line.length - 1; j++) {
    const start = line[j]
    const end = line[j + 1]
    const dir = vec2.sub(vec2.create(), end, start)
    vec2.normalize(dir, dir)
    const norm = vec2.fromValues(dir[1], -dir[0])
    const tStart = rand.range(1000000)

    outLine.push(start)
    const divisions = Math.max(1, Math.floor(vec2.distance(start, end) / settings.perturbDivisionSize))
    // skipping first and last pt because we don't want to perturb the control points
    for (let i = 1; i < divisions; i++) {
      const t = i / divisions
      const noiseMagT = Math.sin(t * Math.PI)
      const pt = vec2.lerp(vec2.create(), start, end, t)
      const mag = rand.noise1D(t + tStart, settings.perturbNoiseFreq, settings.perturbNoiseMag * noiseMagT)
      vec2.add(pt, pt, vec2.scale(vec2.create(), norm, mag))
      outLine.push(pt)
    }
  }
  // don't forget to push very last control pt
  outLine.push(line[line.length - 1])

  return outLine
}

function convertLineTo2d(line: vec3[]): vec2[] {
  return line.map(v => vec2.fromValues(v[0], v[1]))
}

function boxSegmentIntersections (line: [vec2, vec2], box: Box): vec2[] {
  const segments: [vec2, vec2][] = [
    [[box.x, box.y], [box.x + box.width, box.y]],
    [[box.x + box.width, box.y], [box.x + box.width, box.y + box.height]],
    [[box.x + box.width, box.y + box.height], [box.x, box.y + box.height]],
    [[box.x, box.y + box.height], [box.x, box.y]],
  ]
  const intersections: vec2[] = []
  for (const segment of segments) {
    const int = segmentIntersection(segment, line)
    if (int !== null) intersections.push(int)
  }
  return intersections
}

// this takes 3d lines but segments them in 2d space
function segmentLines(segmentsToTest: [vec3, vec3][]): [vec3, vec3][] {
  segmentsToTest = segmentsToTest.slice()
  const segments: [vec3, vec3][] = []

  // for each segment
  while (segmentsToTest.length > 0) {
    const segment = segmentsToTest.shift()!
    // iterate until you find an intersection
    let i = 0
    let brokeIntoNewSegments = false
    while (i < segmentsToTest.length) {
      const otherSegment = segmentsToTest[i]
      const intersection = segmentIntersection(segment as [vec2, vec2], otherSegment as [vec2, vec2])
      if (intersection !== null) {
        // break into smaller segments and push new segments to test
        // if the intersection is close to the end of the segment, don't break that segment
        if (!isCloseToEnd(intersection, otherSegment as [vec2, vec2], 2)) {
          const newSegments = breakSegment(otherSegment, intersection)
          segmentsToTest.splice(i, 1)
          segmentsToTest.push(...newSegments)
        }
        if (!isCloseToEnd(intersection, segment as [vec2, vec2], 2)) {
          brokeIntoNewSegments = true
          const newSegments = breakSegment(segment, intersection)
          segmentsToTest.push(...newSegments)
          break
        }
      }
      i++
    }
    if (!brokeIntoNewSegments) {
      segments.push(segment)
    }
  }

  return segments
}

// this takes a 3d segment and breaks it at the 2d intersection point
function breakSegment(segment: [vec3, vec3], intersection: vec2): [vec3, vec3][] {
  // find the z value of the intersection point
  const z = getSegmentZValue(segment, intersection)
  return [
    [segment[0], [intersection[0], intersection[1], z] as vec3],
    [[intersection[0], intersection[1], z] as vec3, segment[1]]
  ]
}

function getSegmentZValue(segment: [vec3, vec3], intersection: vec2): number {
  const t = (intersection[0] - segment[0][0]) / (segment[1][0] - segment[0][0])
  return segment[0][2] + t * (segment[1][2] - segment[0][2])
}

function isCloseToEnd(point: vec2, segment: [vec2, vec2], threshold: number): boolean {
  const thresholdSquared = threshold * threshold
  return vec2.squaredDistance(point, segment[1]) < thresholdSquared || vec2.squaredDistance(point, segment[0]) < thresholdSquared
}

function segmentIntersection(segment1: [vec2, vec2], segment2: [vec2, vec2]): vec2 | null {
  const x1 = segment1[0][0]
  const y1 = segment1[0][1]
  const x2 = segment1[1][0]
  const y2 = segment1[1][1]

  const x3 = segment2[0][0]
  const y3 = segment2[0][1]
  const x4 = segment2[1][0]
  const y4 = segment2[1][1]

  var x = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) /
          ((x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4))
  var y = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) /
          ((x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4))
  if (isNaN(x) || isNaN(y)) {
    return null
  }
  if (x1 >= x2) {
    if (!between(x2, x, x1)) return null
  } else {
    if (!between(x1, x, x2)) return null
  }
  if (y1 >= y2) {
    if (!between(y2, y, y1)) return null
  } else {
    if (!between(y1, y, y2)) return null
  }
  if (x3 >= x4) {
    if (!between(x4, x, x3)) return null
  } else {
    if (!between(x3, x, x4)) return null
  }
  if (y3 >= y4) {
    if (!between(y4, y, y3)) return null
  } else {
    if (!between(y3, y, y4)) return null
  }
  return [x, y]
}

function removeHiddenSegments(segments: [vec3, vec3][], faces: vec3[][]): [vec3, vec3][] {
  const visibleSegments: [vec3, vec3][] = []
  let nonConvexFaces = 0
  // make sure all faces have been transformed to screenspace and we have calculated:
  // 1. the plane values for each face
  // 2. the 2D bounding box for each face
  // 3. should probably make sure all 2d transformed faces are convex
  // 4. potential optimization: split the screenspace into a grid and keep a list of faces that overlap each cell
  const faceData: {
    plane: { normal: vec3, d: number },
    box: Box,
    face2d: vec2[],
  }[] = faces.map(face => {
    const face2d = face.map(v => vec2.fromValues(v[0], v[1]))
    if (!isConvex(face2d.slice(0, -1))) {
      nonConvexFaces++
    }
    return {
      plane: getPlaneValues(face[0], face[1], face[2]),
      box: getBoundingBox(face2d),
      face2d,
    }
  })

  console.log('faces count:', faces.length)
  console.log('non convex faces:', nonConvexFaces)

  // then for each segment, find the midpoint
  for (const segment of segments) {
    const midpoint = getSegmentMidpoint(segment)
    const midpoint2d = vec2.fromValues(midpoint[0], midpoint[1])

    let isVisible = true
    for (const face of faceData) {
      // check if the midpoint is in the 2d bounding box of any face
      if (!isPointInBoundingBox(midpoint2d, face.box)) continue

      // check if the midpoint is in the face's 2d polygon
      if (!isPointInPolygon(midpoint2d, face.face2d)) continue

      // if it is, get the Z value of the plane at that point
      const z = calculatePlaneZValue(face.plane, midpoint2d)
      // if the Z value is less than the midpoint's Z value, the segment is hidden and should be culled
      if (z < midpoint[2] && Math.abs(z - midpoint[2]) > 0.00001) {
        isVisible = false
        break
      }
    }
    if (isVisible) visibleSegments.push(segment)
  }

  return visibleSegments
}

function isPointInPolygon(point: vec2, polygon: vec2[]): boolean {
  let inside = false

  // Ray casting algorithm - cast a ray from point to the right
  // Count number of intersections with polygon edges
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1]
    const xj = polygon[j][0], yj = polygon[j][1]

    // Check if point is on polygon vertex
    if ((xi === point[0] && yi === point[1]) || (xj === point[0] && yj === point[1])) {
      return true
    }

    // Check if ray intersects with polygon edge
    if ((yi > point[1]) !== (yj > point[1]) &&
        point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function isPointInBoundingBox(point: vec2, box: Box): boolean {
  return point[0] > box.x && point[0] < box.x + box.width && point[1] > box.y && point[1] < box.y + box.height
}

function getBoundingBox(face: vec2[]): Box {
  const minX = Math.min(...face.map(v => v[0]))
  const maxX = Math.max(...face.map(v => v[0]))
  const minY = Math.min(...face.map(v => v[1]))
  const maxY = Math.max(...face.map(v => v[1]))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function isConvex(face: vec2[]): boolean {
  if (face.length < 3) return false

  let sign = 0

  for (let i = 0; i < face.length; i++) {
    const p1 = face[i]
    const p2 = face[(i + 1) % face.length]
    const p3 = face[(i + 2) % face.length]

    // Calculate cross product of vectors (p2-p1) and (p3-p2)
    const v1x = p2[0] - p1[0]
    const v1y = p2[1] - p1[1]
    const v2x = p3[0] - p2[0]
    const v2y = p3[1] - p2[1]

    const cross = v1x * v2y - v1y * v2x

    // Check if cross product sign changes
    if (sign === 0) {
      sign = Math.sign(cross)
    } else if (sign * cross < 0) {
      return false
    }
  }

  return true
}

function getSegmentMidpoint(segment: [vec3, vec3]): vec3 {
  return vec3.scale(vec3.create(), vec3.add(vec3.create(), segment[0], segment[1]), 0.5)
}

function getPlaneValues(p1: vec3, p2: vec3, p3: vec3): { normal: vec3, d: number } {
  // Calculate plane equation coefficients (Ax + By + Cz + D = 0)
  const v1: vec3 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]]
  const v2: vec3 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]]

  // Calculate normal vector using cross product
  const normal: vec3 = [
    v1[1] * v2[2] - v1[2] * v2[1],
    v1[2] * v2[0] - v1[0] * v2[2],
    v1[0] * v2[1] - v1[1] * v2[0]
  ]

  // Calculate D in the plane equation
  const d = -(normal[0] * p1[0] + normal[1] * p1[1] + normal[2] * p1[2])
  return { normal, d }
}

function calculatePlaneZValue(plane: { normal: vec3, d: number }, point: vec2): number {
  // Solve for Z using the plane equation: Ax + By + Cz + D = 0
  // Rearrange to: z = -(Ax + By + D) / C
  const z = -(plane.normal[0] * point[0] + plane.normal[1] * point[1] + plane.d) / plane.normal[2]
  return z
}

const EPS = 0.0000001
function between (a: number, b: number, c: number): boolean {
  return a - EPS <= b && b <= c + EPS
}

function isFrontFacing(face: vec3[]): boolean {
  const normal = vec3.cross(vec3.create(), face[1], face[0])
  return vec3.dot(normal, face[2]) < 0
}

function getCameraEye(random: random.RandomGenerator, center: vec3): vec3 {
  const CAMERA_HEIGHT = random.range(settings.cameraHeightMin, settings.cameraHeightMax)
  const CAMERA_DISTANCE = random.range(settings.cameraDistanceMin, settings.cameraDistanceMax)
  const CAMERA_ANGLE = random.range(Math.PI * 2)
  return vec3.fromValues(
    center[0] + Math.cos(CAMERA_ANGLE) * CAMERA_DISTANCE,
    center[1] + Math.sin(CAMERA_ANGLE) * CAMERA_DISTANCE,
    center[2] + CAMERA_HEIGHT
  )
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}

function combineSegments(segments: [vec2, vec2][], threshold: number): Line2D[] {
  segments = segments.slice()
  const thresholdSquared = threshold * threshold
  // index segments by start/end points
  // the first key is the one the point is actually on
  const getKeys = (endpoint: vec2) => {
    const granularity = 10
    const x = Math.floor(endpoint[0] / granularity)
    const y = Math.floor(endpoint[1] / granularity)
    return [
      `${x},${y}`,
      `${x + 1},${y + 1}`,
      `${x - 1},${y - 1}`,
      `${x + 1},${y - 1}`,
      `${x - 1},${y + 1}`,
      `${x},${y + 1}`,
      `${x + 1},${y}`,
      `${x},${y - 1}`,
      `${x - 1},${y}`,
    ]
  }

  const index: Map<string, [vec2, vec2][]> = new Map()
  for (const segment of segments) {
    const key1 = getKeys(segment[0])[0]
    const key2 = getKeys(segment[1])[0]
    if (!index.has(key1)) index.set(key1, [])
    if (!index.has(key2)) index.set(key2, [])
    index.get(key1)!.push(segment)
    index.get(key2)!.push(segment)
  }

  function removeFromSegmentsAndIndex(segment: [vec2, vec2]) {
    const key1 = getKeys(segment[0])[0]
    const key2 = getKeys(segment[1])[0]
    index.get(key1)!.splice(index.get(key1)!.indexOf(segment), 1)
    index.get(key2)!.splice(index.get(key2)!.indexOf(segment), 1)
    segments.splice(segments.indexOf(segment), 1)
  }

  const combined: Line2D[] = []
  while (segments.length > 0) {
    combined.push(segments[0]!.slice())
    removeFromSegmentsAndIndex(segments[0]!)
    while (true) {
      const segment = combined[combined.length - 1]!
      const lastPoint = segment[segment.length - 1]
      const keys = getKeys(lastPoint)
      const candidates = flatten(keys.map(k => index.get(k) ?? []))
      const sortedCandidates = sortByMinValue(candidates, c => {
        return Math.min(vec2.squaredDistance(c[0], lastPoint), vec2.squaredDistance(c[1], lastPoint))
      })
      const bestCandidate = sortedCandidates[0]
      if (!bestCandidate) break
      if (vec2.squaredDistance(bestCandidate[0], lastPoint) < thresholdSquared) {
        segment.push(bestCandidate[1])
        removeFromSegmentsAndIndex(bestCandidate)
      } else if (vec2.squaredDistance(bestCandidate[1], lastPoint) < thresholdSquared) {
        segment.push(bestCandidate[0])
        removeFromSegmentsAndIndex(bestCandidate)
      } else {
        break
      }
    }
  }

  return combined
}

function artisticMergeLines(lines: Line2D[]): Line2D[] {
  lines = lines.slice()
  // index segments by start/end points
  // the first key is the one the point is actually on
  const getKeys = (endpoint: vec2) => {
    const granularity = 50
    const x = Math.floor(endpoint[0] / granularity)
    const y = Math.floor(endpoint[1] / granularity)
    return [
      `${x},${y}`,
      `${x + 1},${y + 1}`,
      `${x - 1},${y - 1}`,
      `${x + 1},${y - 1}`,
      `${x - 1},${y + 1}`,
      `${x},${y + 1}`,
      `${x + 1},${y}`,
      `${x},${y - 1}`,
      `${x - 1},${y}`,
    ]
  }

  const index: Map<string, Line2D[]> = new Map()
  for (const line of lines) {
    const key1 = getKeys(line[0])[0]
    const key2 = getKeys(line[line.length - 1])[0]
    if (!index.has(key1)) index.set(key1, [])
    if (!index.has(key2)) index.set(key2, [])
    index.get(key1)!.push(line)
    index.get(key2)!.push(line)
  }

  function removeFromLinesAndIndex(line: Line2D) {
    const key1 = getKeys(line[0])[0]
    const key2 = getKeys(line[line.length - 1])[0]
    index.get(key1)!.splice(index.get(key1)!.indexOf(line), 1)
    index.get(key2)!.splice(index.get(key2)!.indexOf(line), 1)
    lines.splice(lines.indexOf(line), 1)
  }

  const combined: Line2D = lines[0]!.slice()
  while (lines.length > 0) {
    const lastPoint = combined[combined.length - 1]!
    const keys = getKeys(lastPoint)
    let candidates = flatten(keys.map(k => index.get(k) ?? []))
    if (!candidates.length) {
      // candidates = lines.slice()
      break
    }
    const sortedCandidates = sortByMinValue(candidates, c => {
      return Math.min(vec2.squaredDistance(c[0], lastPoint), vec2.squaredDistance(c[1], lastPoint))
    })
    let bestCandidate = sortedCandidates[0]
    removeFromLinesAndIndex(bestCandidate)
    bestCandidate = bestCandidate.slice()
    const shouldReverse = (vec2.squaredDistance(bestCandidate[0], lastPoint) > vec2.squaredDistance(bestCandidate[1], lastPoint))
    if (shouldReverse) bestCandidate.reverse()
    for (const pt of bestCandidate.slice(1)) {
      combined.push(pt)
    }
  }
  return [combined]
}

function sortByMinValue<T>(arr: T[], fn: (t: T) => number): T[] {
  return arr.sort((a, b) => fn(a) - fn(b))
}

function flatten<T>(arr: T[][]): T[] {
  const out: T[] = []
  for (const sub of arr) {
    out.push(...sub)
  }
  return out
}

// stolen from penplot by mattdesl (couldn't require it because it uses import/export)
const TO_PX = 35.43307
const DEFAULT_SVG_LINE_WIDTH = 0.03

const convert = (num: number) => Number((TO_PX * num).toFixed(5))

type Opts = {
  dimensions: vec2
  fillStyle?: string
  strokeStyle?: string
  lineWidth?: number
}
function linesToSVG (lines: Line2D[], opt: Opts) {
  const dimensions = opt?.dimensions
  if (!dimensions) throw new TypeError('must specify dimensions currently')

  const commands: string[] = []
  lines.forEach(line => {
    const start = line[0]
    commands.push(`M ${convert(start[0])},${convert(start[1])}`)
    line.slice(1).forEach(pt => {
      const x = convert(pt[0])
      const y = convert(pt[1])
      commands.push(`L ${x},${y}`)
    })
  })

  const svgPath = commands.join(' ')
  const viewWidth = convert(dimensions[0])
  const viewHeight = convert(dimensions[1])
  const fillStyle = opt.fillStyle || 'none'
  const strokeStyle = opt.strokeStyle || 'black'
  const lineWidth = opt.lineWidth || DEFAULT_SVG_LINE_WIDTH

  return `<?xml version="1.0" standalone="no"?>
  <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN"
    "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
  <svg width="${dimensions[0]}cm" height="${dimensions[1]}cm"
       xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 ${viewWidth} ${viewHeight}">
   <g>
     <path d="${svgPath}" fill="${fillStyle}" stroke="${strokeStyle}" stroke-width="${lineWidth}cm" />
   </g>
</svg>`
}

console.log('press shift-S to send a plot localhost:8080 to be written to disk')
window.addEventListener('keypress', (e) => {
  if (e.code === 'KeyS' && e.shiftKey) {
    e.preventDefault()
    e.stopPropagation()

    const optimizedLines = optimizePathOrder(lines, false)

    const svg = linesToSVG(optimizedLines.map(line => line.map(v => vec2.scale(v, v, 1 / PIXELS_PER_CM))), {
      dimensions: [WIDTH / PIXELS_PER_CM, HEIGHT / PIXELS_PER_CM], // in cm
      lineWidth: settings.lineWidthMM / 10 // in cm
    })

    console.log('THE SVG:', svg)

    // TODO: hash the params
    const hash = settings.seed
    const filename = `${PLOTNAME}-plot-hash-${hash}.svg`
    fetch('http://localhost:8080/save-plot', {
      method: 'POST',
      body: JSON.stringify({ filename, svg })
    }).then(res => {
      if (res.status !== 200) {
        console.error('Attempt to save plot failed')
      } else {
        console.log(`Saved plot: ${filename}`)
      }
    })
  }
})
