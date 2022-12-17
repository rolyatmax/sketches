import * as canvasSketch from 'canvas-sketch'
import * as random from 'canvas-sketch-util/random'
import { GUI } from 'dat-gui'
import * as vec2 from 'gl-vec2'

const PLOTNAME = '2022.12.08-20.30.30'

const MM_PER_INCH = 25.4
const PIXELS_PER_INCH = 200
const WIDTH = 6 * PIXELS_PER_INCH
const HEIGHT = 4 * PIXELS_PER_INCH
const PIXELS_PER_MM = PIXELS_PER_INCH / MM_PER_INCH
const PIXELS_PER_CM = PIXELS_PER_MM * 10

const settings = {
  seed: 1192,
  canvasMargin: 0.25,
  fractures: 660,
  stdv: 16,
  lineWidthMM: 0.1
}

let shapes: Shape[]

type SketchArgs = { context: CanvasRenderingContext2D, viewportWidth: number, viewportHeight: number }

canvasSketch(({ render }) => {
  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(render)
  gui.add(settings, 'canvasMargin', 0, 0.5).step(0.01).onChange(render)
  gui.add(settings, 'fractures', 0, 1000).step(1).onChange(render)
  gui.add(settings, 'stdv', 1, 200).step(1).onChange(render)
  gui.add(settings, 'lineWidthMM', 0.05, 2).step(0.01).onChange(render)

  return (args: SketchArgs) => {
    const { context, viewportWidth, viewportHeight } = args
    const width = viewportWidth
    const height = viewportHeight

    const margin = settings.canvasMargin * height

    context.clearRect(0, 0, width, height)
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    const rand = random.createRandom(settings.seed)

    const circleRadius = (viewportHeight / 2 - margin)

    const s1 = rand.onCircle(circleRadius)
    const s2 = rand.onCircle(circleRadius)
    shapes = [
      [[s1, s2, [0, 0]], [s2, s1]],
      [[s2, s1, [0, 0]], [s1, s2]],
    ]

    for (let n = 0; n < settings.fractures; n++) {
      const idx = rand.rangeFloor(shapes.length)
      const line = getRandomLine()
      const newShapes = divideShapeWithLine(line, shapes[idx])
      if (newShapes === null) {
        n--
        continue
      }
      shapes.splice(idx, 1, ...newShapes)
    }

    console.log('shapes count:', shapes.length)

    context.save()
    context.translate(width / 2, height / 2)
    for (const shape of shapes) {
      context.save()
      const mag = rand.gaussian(5, settings.stdv)
      const offset = rand.onCircle(1).map(coord => coord * mag)
      context.translate(offset[0], offset[1])
      drawShape(context, shape)
      context.restore()
    }
    context.restore()

    function getRandomLine(): Line {
      const dir = rand.onCircle(1)
      const pt = [rand.range(-width / 2, width / 2), rand.range(-height / 2, height / 2)]
      return [
        vec2.scaleAndAdd([], pt, dir, 1000000),
        vec2.scaleAndAdd([], pt, dir, -1000000)
      ]
    }
  }
}, {
  dimensions: [WIDTH, HEIGHT]
})

type Vec2 = [number, number]
type Point = Vec2
type Dir = Vec2
type Line = [Point, Point]
type Curve = [Point, Point, Point] // start, end, center
type Ray = [Point, Dir]
type Segment = Line | Curve
type Shape = Segment[]
type ArcVals = {
  center: Point
  startAngle: number
  endAngle: number
  radius: number
}

function isPoint(obj: any): obj is Point {
  return Array.isArray(obj) && obj.length === 2 && typeof obj[0] === 'number' && typeof obj[1] === 'number'
}

function isLine(obj: any): obj is Line {
  return Array.isArray(obj) && obj.length === 2 && obj.every(isPoint)
}

function isCurve(obj: any): obj is Curve {
  return Array.isArray(obj) && obj.length === 3 && obj.every(isPoint)
}

// make sure line is well extended beyond bounds of the canvas
// because it just checks for segments
function divideShapeWithLine (line: Line, shape: Shape): [Shape, Shape] | null {
  const shape1: Segment[] = []
  const shape2: Segment[] = []
  const intersections: Point[] = []
  for (const segment of shape) {
    let pushTo = intersections.length === 1 ? shape2 : shape1
    if (intersections.length === 2) {
      pushTo.push(segment)
      continue
    }
    const int = isLine(segment) ? segmentIntersection(segment, line) : getValidCurveIntersections(segment, line)
    if (int === null) {
      pushTo.push(segment)
      continue
    }
    const firstChunk: Segment = isLine(segment) ? [segment[0], int] : [segment[0], int, segment[2]]
    pushTo.push(firstChunk)
    if (intersections.length === 1) {
      shape2.push([int, intersections[0]])
      shape1.push([intersections[0], int])
    }
    intersections.push(int)
    pushTo = intersections.length === 1 ? shape2 : shape1
    const secondChunk: Segment = isLine(segment) ? [int, segment[1]] : [int, segment[1], segment[2]]
    pushTo.push(secondChunk)
  }

  if (intersections.length !== 2) return null
  return [shape1, shape2]
}

// make sure line is well extended beyond bounds of the canvas
// because it just checks for segments
function shapeLineIntersections (line: Line, shape: Shape): Point[] {
  const intersections: Point[] = []
  for (const segment of shape) {
    if (isLine(segment)) {
      const int = segmentIntersection(segment, line)
      if (int !== null) intersections.push(int)
      continue
    }
    const ints = curveLineIntersection(segment, line)
    if (ints !== null) {
      for (const pt of ints) intersections.push(pt)
    }
  }
  return intersections
}

function distRayToShape (ray: Ray, shape: Shape): number | null {
  const [pt, dir] = ray
  const p2 = vec2.scaleAndAdd([], pt, dir, 1000000)
  const intersections = shapeLineIntersections([pt, p2], shape)
  let min = Infinity
  for (const int of intersections) {
    const dist = vec2.distance(pt, int)
    min = Math.min(min, dist)
  }
  return Number.isFinite(min) ? min : null
}

function getArcValsForCurve (curve: Curve): ArcVals {
  const [start, end, center] = curve
  const radius = vec2.distance(start, center)
  const dirStart: Vec2 = vec2.sub([], start, center)
  const dirEnd: Vec2 = vec2.sub([], end, center)
  const startAngle = Math.atan2(dirStart[1], dirStart[0])
  const endAngle = Math.atan2(dirEnd[1], dirEnd[0])
  return { center, radius, startAngle, endAngle }
}

// special function that returns null if there's not exactly one intersection
// for a given curve
function getValidCurveIntersections(curve: Curve, line: Line): Point | null {
  const intersections = curveLineIntersection(curve, line)
  return intersections.length === 1 ? intersections[0] : null
}

// special function that returns null if no intersection or if line is tangent to curve
function curveLineIntersection(curve: Curve, line: Line): Point[] {
  const [start, end, center] = curve
  const radius = vec2.distance(start, center)
  const intersections = findCircleLineIntersections(radius, center, line[0], line[1])
  if (intersections.length < 2) return []
  const dirStart: Vec2 = vec2.sub([], start, center)
  const dirEnd: Vec2 = vec2.sub([], end, center)
  const startAngle = Math.atan2(dirStart[1], dirStart[0])
  let endAngle = Math.atan2(dirEnd[1], dirEnd[0])
  if (endAngle < startAngle) endAngle += Math.PI * 2
  const filteredIntersections = intersections.filter(pt => {
    const dir: Vec2 = vec2.sub([], pt, center)
    let angle = Math.atan2(dir[1], dir[0])
    if (angle < startAngle) angle += Math.PI * 2
    else if (angle > endAngle) angle -= Math.PI * 2
    return startAngle < angle && endAngle > angle
  })
  return filteredIntersections
}

function findCircleLineIntersections (r: number, center: Point, p1: Point, p2: Point): Point[] {
  // circle: (x - h)^2 + (y - k)^2 = r^2
  // line: y = m * x + n
  // r: circle radius
  // center: circle center
  // p1 & p2: two points on the intersecting line

  // m: slope
  // n: y-intercept
  const h = center[0]
  const k = center[1]
  const m = (p2[1] - p1[1]) / (p2[0] - p1[0])
  const n = p2[1] - m * p2[0]

  // get a, b, c values
  const a = 1 + m * m
  const b = -h * 2 + (m * (n - k)) * 2
  const c = h * h + (n - k) * (n - k) - r * r

  // insert into quadratic formula
  const i1 = getPt((-b + Math.sqrt(Math.pow(b, 2) - 4 * a * c)) / (2 * a))
  const i2 = getPt((-b - Math.sqrt(Math.pow(b, 2) - 4 * a * c)) / (2 * a))

  if (isEqual(i1[0], i2[0]) && isEqual(i1[1], i2[1])) {
    return [i1]
  }

  return [i1, i2].filter(pt => Number.isFinite(pt[0]) && Number.isFinite(pt[1]))

  function getPt (x: number): Point {
    return [x, m * x + n]
  }
}

function isEqual (a: number, b: number) {
  return Math.abs(a - b) < 1
}

const EPS = 0.0000001
function between (a: number, b: number, c: number): boolean {
  return a - EPS <= b && b <= c + EPS
}
function segmentIntersection (segment1: Line, segment2: Line): Point | null {
  const [[x1, y1], [x2, y2]] = segment1
  const [[x3, y3], [x4, y4]] = segment2
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

// not really a centroid
function getCentroid (pts: Point[]): Point {
  const total: Point = [0, 0]
  pts.forEach(pt => {
    total[0] += pt[0] / pts.length
    total[1] += pt[1] / pts.length
  })
  return total
}

function drawShape(context: CanvasRenderingContext2D, shape: Shape) {
  context.beginPath()
  context.moveTo(shape[0][0][0], shape[0][0][1])
  for (const seg of shape) {
    if (isLine(seg)) context.lineTo(seg[1][0], seg[1][1])
    if (isCurve(seg)) {
      const { center, radius, startAngle, endAngle } = getArcValsForCurve(seg)
      context.arc(center[0], center[1], radius, startAngle, endAngle)
    }
  }
  context.strokeStyle = 'rgba(0, 0, 0, 0.5)'
  context.stroke()
}


// stolen from penplot by mattdesl (couldn't require it because it uses import/export)
const TO_PX = 35.43307
const DEFAULT_SVG_LINE_WIDTH = 0.03

const convert = (num: number) => Number((TO_PX * num).toFixed(5))

type Opts = {
  dimensions: Vec2
  fillStyle?: string
  strokeStyle?: string
  lineWidth?: number
}
function shapesToSVG (shapes: Shape[], opt: Opts) {
  const dimensions = opt?.dimensions
  if (!dimensions) throw new TypeError('must specify dimensions currently')

  const commands: string[] = []
  shapes.forEach(shape => {
    const start = shape[0][0]
    commands.push(`M ${convert(start[0])},${convert(start[1])}`)
    shape.forEach(segment => {
      const x = convert(segment[1][0])
      const y = convert(segment[1][1])
      if (isLine(segment)) {
        commands.push(`L ${x},${y}`)
      } else {
        // rx ry angle large-arc-flag sweep-flag x y
        const [start, end, center] = segment
        const r = convert(vec2.distance(start, center))
        const sDir = vec2.sub([], start, center)
        const eDir = vec2.sub([], end, center)
        const sAngle = Math.atan2(sDir[1], sDir[0]) / Math.PI / 2 * 360
        const eAngle = Math.atan2(eDir[1], eDir[0]) / Math.PI / 2 * 360
        const angle = (eAngle - sAngle).toFixed(2)
        commands.push(`A ${r},${r} ${angle} 0,1 ${x},${y}`)
      }
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

    const opts: Opts = {
      dimensions: [WIDTH / PIXELS_PER_CM, HEIGHT / PIXELS_PER_CM], // in cm
      lineWidth: settings.lineWidthMM / 10 // in cm
    }
    const halfPxDimensions = [WIDTH / 2, HEIGHT / 2]
    const svg = shapesToSVG(shapes.map((shape: Shape) =>
      shape.map(seg =>
        seg.map((v: Vec2) => {
          const pt = vec2.add([], v, halfPxDimensions)
          vec2.scale(pt, pt, 1 / PIXELS_PER_CM)
          return pt
        }) as Segment
      ) as Shape
    ), opts)

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
