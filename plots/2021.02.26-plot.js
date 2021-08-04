const fs = require('fs')
const path = require('path')
const random = require('canvas-sketch-util/random')
const vec2 = require('gl-vec2')
const Delaunator = require('delaunator')
const optimizePathOrder = require('./optimize-path-order')

const BIN_SIZE = 100
const MAX_TRIES = 10000

const MM_PER_INCH = 25.4
const PIXELS_PER_INCH = 200
const WIDTH = 5 * PIXELS_PER_INCH
const HEIGHT = 3.5 * PIXELS_PER_INCH
const PIXELS_PER_MM = PIXELS_PER_INCH / MM_PER_INCH
const PIXELS_PER_CM = PIXELS_PER_MM * 10

const settings = {
  seed: 1910,
  canvasMargin: 0.05,
  lineWidthMM: 0.1,
  circleCount: 5000,
  minCircleSize: 10,
  maxCircleSize: 285,
  sizePower: 5,
  noiseOffset: 32515,
  noiseFreq: 0.005,
  triScale: 0.7,
  minTriSize: 10,
  minSideLength: 10,
  maxSideLength: 290
}

let lines1 = []
let lines2 = []
const width = WIDTH
const height = HEIGHT

const rand = random.createRandom(settings.seed)

// make a bunch of circles first and then insert the largest ones first
const circles = new Array(settings.circleCount).fill().map(getRandomCircle)
circles.sort((a, b) => b.r - a.r)

const circleBins = new Array(Math.ceil(WIDTH / BIN_SIZE)).fill().map(
  () => new Array(Math.ceil(HEIGHT / BIN_SIZE)).fill().map(() => [])
)

function insertCircle (c) {
  circleBins[c.x / BIN_SIZE | 0][c.y / BIN_SIZE | 0].push(c)
}

let count = 0

for (const c of circles) {
  if (!collides(c.x, c.y, c.r, circleBins, settings.maxCircleSize)) {
    insertCircle(c)
    count += 1
  }
}

let tries = 0
while (tries < MAX_TRIES && count < settings.circleCount) {
  const { x, y, r } = getRandomCircle()
  if (collides(x, y, r, circleBins, settings.maxCircleSize)) {
    tries += 1
  } else {
    insertCircle({ x, y, r })
    count += 1
    tries = 0
  }
}

// one last filter
circles.length = 0
for (const col of circleBins) {
  for (const cell of col) {
    for (const c of cell) {
      // const t = Math.floor(c.t * 100)
      // if (t === 20 || t === 40 || t === 60 || t === 80) {
      //   continue
      // }
      circles.push(c)
    }
  }
}

function getRandomCircle () {
  const circleSizeRange = settings.maxCircleSize - settings.minCircleSize
  const x = rand.range(WIDTH)
  const y = rand.range(HEIGHT)
  const t1 = (rand.noise2D(x + settings.noiseOffset, y, settings.noiseFreq, 0.5) + 0.5)
  const t2 = (rand.noise2D(x, y, settings.noiseFreq * 0.8, 0.5) + 0.5)
  const t = Math.min(t1, t2)
  const r = Math.pow(t, settings.sizePower) * circleSizeRange + settings.minCircleSize
  return { x, y, r, t }
}

const marginPx = width * settings.canvasMargin
function addMargin ([x, y]) {
  const x1 = x - width / 2
  const y1 = y - height / 2
  return [
    x1 * (1 - (marginPx * 2 / width)) + width / 2,
    y1 * (1 - (marginPx * 2 / height)) + height / 2
  ]
}

const triangles = []

const pts = circles.map(c => [c.x, c.y])
const triangulatedPositions = Delaunator.from(pts).triangles
for (let i = 0; i < triangulatedPositions.length; i += 3) {
  const pos1 = pts[triangulatedPositions[i]]
  const pos2 = pts[triangulatedPositions[i + 1]]
  const pos3 = pts[triangulatedPositions[i + 2]]
  triangles.push([pos1, pos2, pos3])
}

let minArea = Infinity
let maxArea = 0
for (const t of triangles) {
  const center = t.reduce((memo, p) => [memo[0] + p[0] / 3, memo[1] + p[1] / 3], [0, 0])
  const pts = t.map(p => {
    const cp = vec2.sub([], p, center)
    return addMargin(vec2.scaleAndAdd([], center, cp, settings.triScale))
  })

  const area = getTriArea(pts[0], pts[1], pts[2])
  minArea = Math.min(minArea, area)
  maxArea = Math.max(maxArea, area)

  if (area < settings.minTriSize) continue
  const l1 = vec2.dist(pts[0], pts[1])
  const l2 = vec2.dist(pts[1], pts[2])
  const l3 = vec2.dist(pts[2], pts[0])
  if (l1 < settings.minSideLength) continue
  if (l2 < settings.minSideLength) continue
  if (l3 < settings.minSideLength) continue
  if (l1 > settings.maxSideLength) continue
  if (l2 > settings.maxSideLength) continue
  if (l3 > settings.maxSideLength) continue

  const triangle = [
    [pts[0][0], pts[0][1]],
    [pts[1][0], pts[1][1]],
    [pts[2][0], pts[2][1]],
    [pts[0][0], pts[0][1]]
  ]

  if (rand.boolean()) {
    lines1.push(triangle)
  } else {
    lines2.push(triangle)
  }
}

lines1 = optimizePathOrder(lines1, false)
lines2 = optimizePathOrder(lines2, false)

function collides (x, y, r, circleBins, maxCircleSize) {
  const maxDist = maxCircleSize + r
  const bins = Math.ceil(maxDist / BIN_SIZE) + 1
  const i = x / BIN_SIZE | 0
  const j = y / BIN_SIZE | 0
  for (let di = -bins; di <= bins; di++) {
    for (let dj = -bins; dj <= bins; dj++) {
      if (
        i + di < circleBins.length && j + dj < circleBins[0].length &&
        i + di >= 0 && j + dj >= 0
      ) {
        for (const c of circleBins[i + di][j + dj]) {
          if (circleIntersect(x, y, r, c.x, c.y, c.r)) {
            return true
          }
        }
      }
    }
  }
  return false
}

function circleIntersect (x1, y1, r1, x2, y2, r2) {
  const d = r1 + r2
  const dSquared = d * d
  const dx = x2 - x1
  const dy = y2 - y1
  return (dx * dx + dy * dy) < dSquared
}

// x1y2+x2y3+x3y1−y1x2−y2x3−y3x1
function getTriArea (p1, p2, p3) {
  const [x1, y1] = p1
  const [x2, y2] = p2
  const [x3, y3] = p3
  return Math.abs(x1 * y2 + x2 * y3 + x3 * y1 - y1 * x2 - y2 * x3 - y3 * x1) / 2
}

// stolen from penplot by mattdesl (couldn't require it because it uses import/export)
const TO_PX = 35.43307
const DEFAULT_SVG_LINE_WIDTH = 0.03

function polylinesToSVG (polylines, opt = {}) {
  const dimensions = opt.dimensions
  if (!dimensions) throw new TypeError('must specify dimensions currently')
  const decimalPlaces = 5

  const commands = []
  polylines.forEach(line => {
    line.forEach((point, j) => {
      const type = (j === 0) ? 'M' : 'L'
      const x = (TO_PX * point[0]).toFixed(decimalPlaces)
      const y = (TO_PX * point[1]).toFixed(decimalPlaces)
      commands.push(`${type} ${x} ${y}`)
    })
  })

  const svgPath = commands.join(' ')
  const viewWidth = (dimensions[0] * TO_PX).toFixed(decimalPlaces)
  const viewHeight = (dimensions[1] * TO_PX).toFixed(decimalPlaces)
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

const opts = {
  dimensions: [WIDTH / PIXELS_PER_CM, HEIGHT / PIXELS_PER_CM], // in cm
  lineWidth: settings.lineWidthMM / 10 // in cm
}
const svg1 = polylinesToSVG(lines1.map(line => {
  return line.map(pt => pt.map(v => v / PIXELS_PER_CM))
}), opts)

const svg2 = polylinesToSVG(lines2.map(line => {
  return line.map(pt => pt.map(v => v / PIXELS_PER_CM))
}), opts)

fs.writeFileSync(path.resolve(process.cwd(), `2021.02.26-plot-seed${settings.seed}-1.svg`), svg1)
fs.writeFileSync(path.resolve(process.cwd(), `2021.02.26-plot-seed${settings.seed}-2.svg`), svg2)
