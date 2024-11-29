// NYC Building Lines Study
import * as optimizePathOrder from '../plots/optimize-path-order'
import * as canvasSketch from 'canvas-sketch'
import * as random from 'canvas-sketch-util/random'
import { GUI } from 'dat-gui'
import { vec2, mat4, vec3 } from 'gl-matrix'

const PLOTNAME = '2024.11.17-18.02.10'

const MM_PER_INCH = 25.4
const PIXELS_PER_INCH = 200
const WIDTH = 6 * PIXELS_PER_INCH
const HEIGHT = 4 * PIXELS_PER_INCH
const PIXELS_PER_MM = PIXELS_PER_INCH / MM_PER_INCH
const PIXELS_PER_CM = PIXELS_PER_MM * 10

const BUILDINGS_FACES_URL = 'resources/data/nyc-buildings/manhattan-faces.json'

const settings = {
  seed: 8020,
  margin: 1, // margin around the canvas

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

type Line = vec2[]
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

let lines: Line[] = []

;(async function main() {
  const buildings = await fetch(BUILDINGS_FACES_URL).then(res => res.json()) as Building[]

  console.log('buildings', buildings)

  canvasSketch(({ render }) => {
    const gui = new GUI()
    gui.add(settings, 'seed', 0, 9999).step(1).onChange(render)
    gui.add(settings, 'margin', 0, 1).step(0.01).onChange(render)
    gui.add(settings, 'cameraHeightMin', 100, 1000).step(1).onChange(render)
    gui.add(settings, 'cameraHeightMax', 100, 1000).step(1).onChange(render)
    gui.add(settings, 'cameraDistanceMin', 100, 2000).step(1).onChange(render)
    gui.add(settings, 'cameraDistanceMax', 100, 2000).step(1).onChange(render)
    gui.add(settings, 'perturbNoiseFreq', 0, 2).onChange(render)
    gui.add(settings, 'perturbNoiseMag', 0, 10).step(0.01).onChange(render)
    gui.add(settings, 'perturbDivisionSize', 1, 20).step(1).onChange(render)
    gui.add(settings, 'lineWidthMM', 0.05, 2).step(0.01).onChange(render)

    return (args: SketchArgs) => {
      const { context, viewportWidth, viewportHeight } = args
      const margin = settings.margin * PIXELS_PER_INCH
      const width = viewportWidth - margin * 2
      const height = viewportHeight - margin * 2

      const rand = random.createRandom(settings.seed)

      lines = []

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
      const faces: vec2[][] = []
      for (const building of visibleBuildings) {
        for (const face of building.faces) {
          const transformedFace = chunkArray(face, 3).map(v => vec3.transformMat4(vec3.create(), vec3.fromValues(v[0], v[1], v[2]), viewProjectionMatrix))
          // const isBehind = transformedFace.every(v => v[2] < 0)
          const isOffScreen = transformedFace.every(v => v[0] < -1 || v[0] > 1 || v[1] < -1 || v[1] > 1 || v[2] < -1 || v[2] > 1)
          // cull backfaces
          if (!isOffScreen && isFrontFacing(transformedFace)) {
            faces.push(transformedFace.map(v => vec2.fromValues(v[0], v[1])))
          }
        }
      }

      // --------------------------------
      //    NEXT STEPS:
      //     - add margin
      //     - break lines into segments
      //     - hidden line removal
      // --------------------------------

      // draw lines
      for (const face of faces) {
        lines.push(face.map(v => vec2.fromValues(
          (v[0] + 1) * width / 2 + margin,
          (v[1] * -1 + 1) * height / 2 + margin // flip y
        )))
      }

      // add margin outline
      lines.push([
        vec2.fromValues(margin, margin),
        vec2.fromValues(margin, height + margin),
        vec2.fromValues(width + margin, height + margin),
        vec2.fromValues(width + margin, margin),
        vec2.fromValues(margin, margin),
      ])

      console.log('segments count before intersection breaks', lines.length)
      const segmentStart = performance.now()
      // segment lines - break the lines into segments and then break the segments into smaller segments where they intersect with each other
      lines = segmentLines(lines)
      console.log('segmentLines time', performance.now() - segmentStart)
      console.log('segments count after intersection breaks', lines.length)
      console.log('faces', faces.length, faces.slice(0, 10))

      lines = lines.filter(line => {
        return (line[0][0] > margin && line[0][0] < width + margin && line[0][1] > margin && line[0][1] < height + margin) &&
          (line[1][0] > margin && line[1][0] < width + margin && line[1][1] > margin && line[1][1] < height + margin)
      })

      console.log('segments count after culling offscreen', lines.length)

      lines = lines.map(line => perturbLine(rand, line))

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

function perturbLine (rand: random.RandomGenerator, line: Line): Line {
  const outLine: Line = []
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

function segmentLines(lines: Line[]): [vec2, vec2][] {
  const segmentsToTest: [vec2, vec2][] = []
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      segmentsToTest.push([line[i], line[i + 1]])
    }
  }

  const segments: [vec2, vec2][] = []

  // for each segment
  while (segmentsToTest.length > 0) {
    const segment = segmentsToTest.shift()!
    // iterate until you find an intersection
    let i = 0
    let brokeIntoNewSegments = false
    while (i < segmentsToTest.length) {
      const otherSegment = segmentsToTest[i]
      const intersection = segmentIntersection(segment, otherSegment)
      if (intersection !== null) {
        // break into smaller segments and push new segments to test
        // if the intersection is close to the end of the segment, don't break that segment
        if (!isCloseToEnd(intersection, otherSegment)) {
          const newSegments = breakSegment(otherSegment, intersection)
          segmentsToTest.splice(i, 1)
          segmentsToTest.push(...newSegments)
        }
        if (!isCloseToEnd(intersection, segment)) {
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

function breakSegment(segment: [vec2, vec2], intersection: vec2): [vec2, vec2][] {
  return [
    [segment[0], intersection],
    [intersection, segment[1]]
  ]
}

function isCloseToEnd(intersection: vec2, segment: [vec2, vec2]): boolean {
  const thresholdSquared = 100
  return vec2.squaredDistance(intersection, segment[1]) < thresholdSquared || vec2.squaredDistance(intersection, segment[0]) < thresholdSquared
}

function segmentIntersection (segment1: [vec2, vec2], segment2: [vec2, vec2]): vec2 | null {
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
function linesToSVG (lines: Line[], opt: Opts) {
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
