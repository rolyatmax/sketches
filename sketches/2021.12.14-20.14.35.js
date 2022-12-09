const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const vec2 = require('gl-vec2')

const MM_PER_INCH = 25.4
const PIXELS_PER_INCH = 200
const WIDTH = 6.25 * PIXELS_PER_INCH
const HEIGHT = 4.5 * PIXELS_PER_INCH
const PIXELS_PER_MM = PIXELS_PER_INCH / MM_PER_INCH
const PIXELS_PER_CM = PIXELS_PER_MM * 10

const settings = {
  seed: 1,
  lines: 30,
  canvasMargin: 0.11,
  lineWidthMM: 0.1,
  noise1Freq: 0.0025,
  noise1Mag: 0.055,
  noise2Freq: 0.0029,
  noise2Mag: 0.044,
  noise3Freq: 0.0014,
  noise3Mag: 0.053,
  lengNoiseFreq: 0.003,
  minLeng: 0.003,
  maxLeng: 0.135,
  boxHeight: 0.009,
  boxGap: 0.007,
  handdrawFreq: 0.006,
  handdrawMag: 0.0024,
  handdrawGranularity: 0.05
}

let lines = []

const sketch = ({ render }) => {
  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(render)
  gui.add(settings, 'lines', 1, 200).step(1).onChange(render)
  gui.add(settings, 'canvasMargin', 0, 0.5).step(0.01).onChange(render)
  gui.add(settings, 'lineWidthMM', 0.05, 2).step(0.01).onChange(render)
  // gui.add(settings, 'noise1Freq', 0.0001, 0.01).step(0.0001).onChange(render)
  // gui.add(settings, 'noise1Mag', 0, 0.2).step(0.001).onChange(render)
  // gui.add(settings, 'noise2Freq', 0.00001, 0.005).step(0.00001).onChange(render)
  // gui.add(settings, 'noise2Mag', 0, 0.1).step(0.001).onChange(render)
  // gui.add(settings, 'noise3Freq', 0.00001, 0.005).step(0.00001).onChange(render)
  // gui.add(settings, 'noise3Mag', 0, 0.1).step(0.001).onChange(render)
  gui.add(settings, 'lengNoiseFreq', 0.0001, 0.05).step(0.0001).onChange(render)
  gui.add(settings, 'minLeng', 0.001, 0.2).step(0.001).onChange(render)
  gui.add(settings, 'maxLeng', 0.001, 0.2).step(0.001).onChange(render)
  gui.add(settings, 'boxHeight', 0.0001, 0.1).step(0.0001).onChange(render)
  gui.add(settings, 'boxGap', 0.0001, 0.1).step(0.0001).onChange(render)
  gui.add(settings, 'handdrawFreq', 0.0001, 0.05).step(0.0001).onChange(render)
  gui.add(settings, 'handdrawMag', 0, 0.005).step(0.0001).onChange(render)
  gui.add(settings, 'handdrawGranularity', 0.001, 0.1).step(0.001).onChange(render)

  return (args) => {
    lines = []
    const { context, viewportWidth, viewportHeight } = args
    const width = viewportWidth
    const height = viewportHeight

    const margin = settings.canvasMargin * width

    context.clearRect(0, 0, width, height)
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

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
        // const yOffset1Start = rand.noise2D(lineStart, y, settings.noise1Freq, settings.noise1Mag * width)
        // const yOffset1End = rand.noise2D(x, y, settings.noise1Freq, settings.noise1Mag * width)
        // const yOffset2Start = rand.noise2D(lineStart, y, settings.noise2Freq, settings.noise2Mag * width)
        // const yOffset2End = rand.noise2D(x, y, settings.noise2Freq, settings.noise2Mag * width)
        // const yOffset3Start = rand.noise2D(lineStart, y, settings.noise3Freq, settings.noise3Mag * width)
        // const yOffset3End = rand.noise2D(x, y, settings.noise3Freq, settings.noise3Mag * width)
        const yOffsetStart = 0 // Math.min(yOffset1Start + yOffset2Start, yOffset3Start)
        const yOffsetEnd = 0 // Math.min(yOffset1End + yOffset2End, yOffset3End)
        const yStart = yOffsetStart + y
        const yEnd = yOffsetEnd + y
        lines.push([[lineStart, yStart], [x, yEnd], [x, yEnd + h], [lineStart, yStart + h], [lineStart, yStart]])
        x += settings.boxGap * width
        lineStart = x
      }
    }

    lines = lines.map(line => handdraw(line, settings.handdrawGranularity * width, rand, settings.handdrawFreq, settings.handdrawMag * width))

    for (const line of lines) {
      context.beginPath()
      context.lineWidth = settings.lineWidthMM / MM_PER_INCH * PIXELS_PER_INCH
      context.strokeStyle = 'rgba(30, 30, 30, 0.98)'
      context.moveTo(line[0][0], line[0][1])
      for (const pt of line.slice(1)) {
        context.lineTo(pt[0], pt[1])
      }
      context.stroke()
    }
    console.log('lines count:', lines.reduce((tot, line) => line.length + tot, 0))
  }
}

canvasSketch(sketch, {
  dimensions: [WIDTH, HEIGHT]
})

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
