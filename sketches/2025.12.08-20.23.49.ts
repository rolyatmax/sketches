import * as optimizePathOrder from '../plots/optimize-path-order'
import * as canvasSketch from 'canvas-sketch'
import * as random from 'canvas-sketch-util/random'
import { GUI } from 'dat-gui'
import { vec2, vec3 } from 'gl-matrix'

/**
 * Possible next steps:
 * - make some lines "thicker" by layering extra lines on top of each other
 *      (maybe start by drawing a circle on each point, then adding extra lines
 *       that go through points a little further from the center of each circle)
 * - try rendering each sphere with a perspective transform
 */

const PLOTNAME = '2025.12.08-20.23.49'

const MM_PER_INCH = 25.4
const PIXELS_PER_INCH = 200
const WIDTH = 6 * PIXELS_PER_INCH
const HEIGHT = 4 * PIXELS_PER_INCH
const PIXELS_PER_MM = PIXELS_PER_INCH / MM_PER_INCH
const PIXELS_PER_CM = PIXELS_PER_MM * 10

const settings = {
  seed: 8020,
  margin: 0.6, // margin around the canvas (in inches)
  lineWidthMM: 0.1,
  steps: 800,
  stepSize: 0.05,
  rows: 12,
  cols: 12,
  velocityVariance: 0.002,
  startVelocity: 0.01,
  lineRemovalThreshold: 1.05,
  sphereRadiusScale: 0.67,
}

type Line2D = vec2[]
type Line3D = vec3[]

type SketchArgs = { context: CanvasRenderingContext2D, viewportWidth: number, viewportHeight: number }

let lines: Line2D[] = []

;(async function main() {
  canvasSketch(({ render }) => {
    const gui = new GUI()
    gui.add(settings, 'seed', 0, 9999).step(1).onChange(render)
    gui.add(settings, 'margin', 0, 4).step(0.01).onChange(render)
    gui.add(settings, 'lineWidthMM', 0.05, 2).step(0.01).onChange(render)
    gui.add(settings, 'steps', 10, 3000).step(1).onChange(render)
    gui.add(settings, 'stepSize', 0.01, 1).step(0.01).onChange(render)
    gui.add(settings, 'rows', 1, 20).step(1).onChange(render)
    gui.add(settings, 'cols', 1, 20).step(1).onChange(render)
    gui.add(settings, 'velocityVariance', 0.00001, 0.01).step(0.00001).onChange(render)
    gui.add(settings, 'startVelocity', 0, 0.5).step(0.01).onChange(render)
    gui.add(settings, 'lineRemovalThreshold', 0, 2).step(0.01).onChange(render)
    gui.add(settings, 'sphereRadiusScale', 0, 1).step(0.01).onChange(render)
    return (args: SketchArgs) => {
      const { context, viewportWidth, viewportHeight } = args
      const margin = settings.margin * PIXELS_PER_INCH
      const width = viewportWidth - margin * 2
      const height = viewportHeight - margin * 2

      const rand = random.createRandom(settings.seed)
      const baseLine3d = generateSpherePath(rand, settings.steps, settings.stepSize, settings.velocityVariance, settings.startVelocity)

      lines = []

      const numRows = settings.rows
      const numCols = settings.cols
      const numSpheres = numRows * numCols

      const colSpacing = width / numCols
      const rowSpacing = height / numRows
      const spacing = Math.min(colSpacing, rowSpacing)
      // Scale radius based on cell size, keeping some padding
      const sphereRadiusScale = spacing / 2 * settings.sphereRadiusScale
      const marginX = (viewportWidth - numCols * spacing) / 2
      const marginY = (viewportHeight - numRows * spacing) / 2

      for (let i = 0; i < numSpheres; i++) {
        const row = Math.floor(i / numCols)
        const col = i % numCols

        // Calculate center for this sphere
        // Add margin offset + cell offset + center of cell
        const cx = marginX + col * spacing + spacing / 2
        const cy = marginY + row * spacing + spacing / 2

        // Rotate the sphere
        // Determine rotation axis based on row and col
        // Horizontal rotation (around Y axis) from left to right
        const angleY = numCols > 1 ? (col / (numCols - 1)) * Math.PI * 2 : 0

        // Vertical rotation (around X axis) from top to bottom - only go halfway around
        const angleX = numRows > 1 ? (row / (numRows - 1)) * Math.PI : 0

        const line2d: Line2D = baseLine3d.map(pt => {
          const rotatedPt = vec3.create()

          // Apply horizontal rotation (around Y axis)
          vec3.rotateY(rotatedPt, pt, [0, 0, 0], angleY)

          // Apply vertical rotation (around X axis)
          // Note: Rotating the already rotated point
          vec3.rotateX(rotatedPt, rotatedPt, [0, 0, 0], angleX)

          // Project to 2D
          const x = rotatedPt[0] * sphereRadiusScale + cx
          const y = rotatedPt[1] * sphereRadiusScale + cy
          return vec2.fromValues(x, y)
        })
        lines.push(simplifyLines(line2d, settings.lineRemovalThreshold))
      }

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


function simplifyLines(line: Line2D, threshold: number): Line2D {
  const simplified: Line2D = [line[0]]
  for (let i = 1; i < line.length; i++) {
    const curPt = simplified[simplified.length - 1]
    const nextPt = line[i]
    const distance = vec2.distance(curPt, nextPt)
    if (distance > threshold) {
      simplified.push(nextPt)
    }
  }
  if (simplified.length > 1) {
    return simplified
  } else {
    return []
  }
}


function getLineLength(line: vec2[]): number {
  let length = 0
  for (let i = 0; i < line.length - 1; i++) {
    length += vec2.distance(line[i], line[i + 1])
  }
  return length
}

function generateSpherePath(rand: any, steps: number, stepSize: number, velocityVariance: number, startVelocity: number): Line3D {
  const line3d: Line3D = []
  line3d.push(rand.onSphere(1))
  let curAngle = rand.range(0, Math.PI * 2)
  let curAngleVelocity = rand.range(-startVelocity, startVelocity)

  while (steps--) {
    const accel = rand.gaussian(0, velocityVariance)
    curAngleVelocity += accel
    curAngle += curAngleVelocity

    const nextPoint = stepOnSphere(line3d[line3d.length - 1]!, curAngle, stepSize)
    line3d.push(nextPoint)
  }
  return line3d
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

const EPS = 0.0000001
function between (a: number, b: number, c: number): boolean {
  return a - EPS <= b && b <= c + EPS
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

function findFurthest2DPoints(pts: vec2[]): [vec2, vec2] {
  let maxDist = 0
  let maxPair: [vec2, vec2] = [pts[0]!, pts[1]!]
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dist = vec2.squaredDistance(pts[i]!, pts[j]!)
      if (dist > maxDist) {
        maxDist = dist
        maxPair = [pts[i]!, pts[j]!]
      }
    }
  }
  return maxPair
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

function stepOnSphere(point: vec3, angle: number, distance: number): vec3 {
  // 1. Get a tangent plane basis
  const up = vec3.fromValues(0, 1, 0)
  // If point is too close to up, pick another one
  if (Math.abs(vec3.dot(point, up)) > 0.99) {
    vec3.set(up, 1, 0, 0)
  }

  // Calculate tangent basis
  // u = normalize(cross(up, point))
  const u = vec3.create()
  vec3.cross(u, up, point)
  vec3.normalize(u, u)

  // v = cross(point, u)
  const v = vec3.create()
  vec3.cross(v, point, u)

  // 2. Calculate step vector in tangent plane
  // step = distance * (cos(angle) * u + sin(angle) * v)
  const step = vec3.create()
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  vec3.scale(u, u, distance * cos)
  vec3.scale(v, v, distance * sin)
  vec3.add(step, u, v)

  // 3. New point
  const next = vec3.create()
  vec3.add(next, point, step)
  vec3.normalize(next, next)

  return next
}
