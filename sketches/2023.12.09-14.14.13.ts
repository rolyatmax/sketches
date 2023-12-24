// subdivision study (newspaper layout)

import * as canvasSketch from 'canvas-sketch'
import * as random from 'canvas-sketch-util/random'
import { GUI } from 'dat-gui'
import { vec2 } from 'gl-matrix'

const PLOTNAME = '2023.12.09-14.14.13'

const MM_PER_INCH = 25.4
const PIXELS_PER_INCH = 200
const WIDTH = 4 * PIXELS_PER_INCH
const HEIGHT = 6 * PIXELS_PER_INCH
const PIXELS_PER_MM = PIXELS_PER_INCH / MM_PER_INCH
const PIXELS_PER_CM = PIXELS_PER_MM * 10

const settings = {
  seed: 7153,
  boxes: 35,
  minMargin: 200, // minimum margin around the canvas
  minHeight: 3, // each box must be at least this tall (in lineHeight units)
  minWidth: 30, // each box must be at least this wide
  lineHeight: 12, // each box height must be divisible by this number
  boxMargin: 0.5, // margin between boxes (in lineHeight units)

  // handwriting settings
  lineDivisions: 8,
  maxControlPtPerturb: 1,
  perturbNoiseFreq: 1.5,
  perturbNoiseMag: 4.3,
  perturbDivisionSize: 6,

  // box fill settings
  minDist: 3,
  maxDist: 4,
  fillPasses: 1,
  lineNoiseFreq: 0.7,
  lineNoiseMag: 2.7,
  lineDivisionSize: 1,
  lineWidthMM: 0.1
}

type Line = vec2[]
type Box = {
  x: number,
  y: number,
  width: number,
  height: number,
}

type SketchArgs = { context: CanvasRenderingContext2D, viewportWidth: number, viewportHeight: number }

let lines: Line[] = []

canvasSketch(({ render }) => {
  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(render)
  gui.add(settings, 'boxes', 1, 40).step(1).onChange(render)
  gui.add(settings, 'minMargin', 1, 300).step(1).onChange(render)
  gui.add(settings, 'minHeight', 1, 20).step(1).onChange(render)
  gui.add(settings, 'minWidth', 10, 400).step(1).onChange(render)
  gui.add(settings, 'lineHeight', 10, 70).step(1).onChange(render)
  gui.add(settings, 'boxMargin', 0.5, 4).step(0.5).onChange(render)
  gui.add(settings, 'lineDivisions', 1, 100).step(1).onChange(render)
  gui.add(settings, 'maxControlPtPerturb', 1, 100).step(1).onChange(render)
  gui.add(settings, 'perturbNoiseFreq', 0, 4).onChange(render)
  gui.add(settings, 'perturbNoiseMag', 0, 20).step(0.01).onChange(render)
  gui.add(settings, 'perturbDivisionSize', 1, 20).step(1).onChange(render)
  gui.add(settings, 'minDist', 0, 50).step(1).onChange(render)
  gui.add(settings, 'maxDist', 0, 50).step(1).onChange(render)
  gui.add(settings, 'fillPasses', 0, 5).step(1).onChange(render)
  gui.add(settings, 'lineNoiseFreq', 0, 3).onChange(render)
  gui.add(settings, 'lineNoiseMag', 0, 5).step(0.01).onChange(render)
  gui.add(settings, 'lineDivisionSize', 1, 100).step(1).onChange(render)
  gui.add(settings, 'lineWidthMM', 0.05, 2).step(0.01).onChange(render)

  return (args: SketchArgs) => {
    const { context, viewportWidth, viewportHeight } = args
    const width = viewportWidth
    const height = viewportHeight

    const rand = random.createRandom(settings.seed)

    // height needs to be divisible by lineHeight
    const h = Math.floor((height - settings.minMargin * 2) / settings.lineHeight) * settings.lineHeight
    const actualMargin = (height - h) / 2
    const w = width - actualMargin * 2

    const boxes: Box[] = [{
      x: actualMargin,
      y: actualMargin,
      width: w,
      height: h,
    }]

    let iterations = 0
    while (boxes.length < settings.boxes) {
      if (iterations > 10000) break
      iterations += 1
      const idx = rand.rangeFloor(boxes.length)
      const box = boxes.splice(idx, 1)[0]
      divideBox(box).filter(Boolean).forEach(b => boxes.push(b))
    }

    lines = []

    const boxMargin = settings.boxMargin * settings.lineHeight
    for (const box of boxes) {
      box.x += boxMargin
      box.y += boxMargin
      box.width -= boxMargin * 2
      box.height -= boxMargin * 2

      if (rand.chance(0.5)) {
        lines.push(...handwriting(box, rand))
      } else {
        lines.push(...boxFill(box, rand))
      }
    }

    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

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

    function divideBox(box: Box): [Box, Box] | [Box] {
      const { x, y, width, height } = box

      // divide horizontally
      if (rand.chance(0.5)) {
        const minX = x + settings.minWidth
        const maxX = x + width - settings.minWidth
        if (maxX < minX) return [box]
        const divX = rand.rangeFloor(minX, maxX)
        const box1: Box = {
          x,
          y,
          width: divX - x,
          height,
        }
        const box2: Box = {
          x: divX,
          y,
          width: width - box1.width,
          height,
        }
        return [box1, box2]
      }

      // otherwise divide vertically
      // boxMargin
      // boxes must have a minimum vertical height
      const minH = settings.minHeight * settings.lineHeight
      const minY = y + minH
      const maxY = y + height - minH
      if (maxY < minY) return [box]
      const span = maxY - minY
      const divY = rand.rangeFloor(0, span / settings.lineHeight) * settings.lineHeight + minY
      const box1: Box = {
        x,
        y,
        width,
        height: divY - y,
      }
      const box2: Box = {
        x,
        y: divY,
        width,
        height: height - box1.height,
      }
      return [box1, box2]
    }
  }
}, {
  dimensions: [WIDTH, HEIGHT],
  animate: true
})

function boxFill(box: Box, rand: random.RandomGenerator): Line[] {
  const lines: Line[] = [[
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x + box.width, box.y + box.height],
    [box.x, box.y + box.height],
    [box.x, box.y],
  ]]

  let loops = settings.fillPasses
  while (loops--) {
    const angle = rand.range(Math.PI * 2)
    const dir = vec2.fromValues(Math.cos(angle), Math.sin(angle))

    const perpDir = vec2.fromValues(dir[1], -dir[0])

    const initOffset = vec2.fromValues(box.width / 2 + box.x, box.height / 2 + box.y)
    vec2.add(initOffset, initOffset, rand.onCircle(rand.range(50)))

    ;[-1, 1].forEach(mult => {
      const offset = initOffset.slice() as vec2
      let lineCount = 0
      if (mult === -1) vec2.add(offset, offset, vec2.scale(vec2.create(), perpDir, rand.range(mult * settings.minDist, mult * settings.maxDist)))
      while (true) {
        const segment: [vec2, vec2] = [
          vec2.scaleAndAdd(vec2.create(), offset, dir, -1000),
          vec2.scaleAndAdd(vec2.create(), offset, dir, 1000)
        ]
        vec2.add(offset, offset, vec2.scale(vec2.create(), perpDir, rand.range(mult * settings.minDist, mult * settings.maxDist)))

        const intersections = boxSegmentIntersections(segment, box)
        lineCount += 1
        if (!intersections.length || lineCount > 100000) break
        lines.push(perturbLine([intersections[0], intersections[1]]))
      }
    })
  }

  function perturbLine (segment: [vec2, vec2]): Line {
    const [start, end] = segment
    const dir = vec2.sub(vec2.create(), end, start)
    vec2.normalize(dir, dir)
    const norm: vec2 = [dir[1], -dir[0]]
    const tStart = rand.range(1000000)

    const divisions = Math.max(1, Math.floor(vec2.distance(start, end) / settings.lineDivisionSize))
    const line: Line = []
    let prevPt: vec2 | null = null
    for (let i = 0; i <= divisions; i++) {
      const t = i / divisions
      const noiseMagT = Math.sin(t * Math.PI)
      const pt = vec2.lerp(vec2.create(), start, end, t)
      const mag = rand.noise1D(t + tStart, settings.lineNoiseFreq, settings.lineNoiseMag * noiseMagT)
      vec2.add(pt, pt, vec2.scale(vec2.create(), norm, mag))
      if (prevPt !== null) {
        line.push([prevPt[0], prevPt[1]])
      }
      prevPt = pt
    }
    return line
  }

  return lines
}

function handwriting(box: Box, rand: random.RandomGenerator): Line[] {
  const lineCount = Math.floor(box.height / settings.lineHeight)
  const lineSectionStart = [box.x, box.y]
  return Array.from({ length: lineCount }, (_, i) => {
    const y = lineSectionStart[1] + (i * settings.lineHeight) + settings.lineHeight / 2
    const startX = lineSectionStart[0]
    const start: vec2 = [lineSectionStart[0], y]
    const pts = [start]

    for (let j = 0; j < settings.lineDivisions; j++) {
      const t = (j + 1) / settings.lineDivisions
      const x = startX + t * box.width
      const pt: vec2 = [x, y]
      const dir = rand.insideCircle(settings.maxControlPtPerturb, vec2.create())
      vec2.add(pt, pt, dir)
      pts.push(pt)
    }

    return perturbLine(pts)
  })

  function perturbLine (line: Line): Line {
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

    const opts: Opts = {
      dimensions: [WIDTH / PIXELS_PER_CM, HEIGHT / PIXELS_PER_CM], // in cm
      lineWidth: settings.lineWidthMM / 10 // in cm
    }
    const halfPxDimensions: vec2 = [WIDTH / 2, HEIGHT / 2]
    const svg = linesToSVG(lines.map(line =>
      line.map(v => {
        const pt = vec2.add(vec2.create(), v, halfPxDimensions)
        vec2.scale(pt, pt, 1 / PIXELS_PER_CM)
        return pt
      })
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
