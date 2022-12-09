const fs = require('fs')
const path = require('path')
const random = require('canvas-sketch-util/random')
const vec2 = require('gl-vec2')

const MM_PER_INCH = 25.4
const PIXELS_PER_INCH = 200
const WIDTH = 6.25 * PIXELS_PER_INCH
const HEIGHT = 4.5 * PIXELS_PER_INCH
const PIXELS_PER_MM = PIXELS_PER_INCH / MM_PER_INCH
const PIXELS_PER_CM = PIXELS_PER_MM * 10

const settings = {
  seed: 36,
  lines: 23,
  canvasMargin: 0.27,
  lineWidthMM: 0.1,
  lengNoiseFreq: 0.0033,
  minLeng: 0.02,
  maxLeng: 0.1,
  boxHeight: 0.0033,
  boxGap: 0.012,
  handdrawFreq: 0.0472,
  handdrawMag: 0.0005,
  handdrawGranularity: 0.005
}

let lines = []

const width = WIDTH
const height = HEIGHT
const margin = settings.canvasMargin * width

const rand = random.createRandom(settings.seed)

const h = settings.boxHeight * width
for (let i = 0; i < settings.lines; i++) {
  const y = margin + (height - margin * 2) * i / (settings.lines - 1) - h / 2
  let x = margin
  let lineStart = x
  while (x < width - margin) {
    const t = rand.noise2D(x + 999, y + 888, settings.lengNoiseFreq) * 0.5 + 0.5
    x += ((settings.maxLeng - settings.minLeng) * t + settings.minLeng) * width
    x = Math.min(x, width - margin)
    if (x + settings.boxGap * width >= width - margin) {
      x = width - margin
    }
    const yOffsetStart = 0
    const yOffsetEnd = 0
    const yStart = yOffsetStart + y
    const yEnd = yOffsetEnd + y
    lines.push([[lineStart, yStart], [x, yEnd], [x, yEnd + h], [lineStart, yStart + h], [lineStart, yStart]])
    x += settings.boxGap * width
    lineStart = x
  }
}

lines = lines.map(line => handdraw(line, settings.handdrawGranularity * width, rand, settings.handdrawFreq, settings.handdrawMag * width))

function handdraw (line, granularity, rand, noiseFreq, noiseMag) {
  const newLine = []
  let curPt = 0
  while (curPt < line.length - 1) {
    const length = vec2.dist(line[curPt], line[curPt + 1])
    let normal = vec2.sub([], line[curPt], line[curPt + 1])
    normal = [normal[1], -1 * normal[0]]
    normal = vec2.normalize(normal, normal)
    let l = 0
    const randOffset = rand.range(999999999)
    while (l <= length) {
      let pt = vec2.lerp([], line[curPt], line[curPt + 1], l / length)
      const mult = rand.noise2D(l, randOffset, noiseFreq, noiseMag)
      pt = vec2.scaleAndAdd(pt, pt, normal, mult)
      newLine.push(pt)
      if (l === length) break
      l += granularity
      l = Math.min(l, length)
    }
    curPt += 1
  }
  return newLine
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
const svg = polylinesToSVG(lines.map(line => {
  return line.map(pt => pt.map(v => v / PIXELS_PER_CM))
}), opts)

const pathParts = __filename.slice(0, -3).split('/')
const plotName = pathParts[pathParts.length - 1]

fs.writeFileSync(path.resolve(process.cwd(), `${plotName}-plot-seed${settings.seed}.svg`), svg)
