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
  lines: 80,
  canvasMargin: 0.1,
  lineWidthMM: 0.1,
  noise1Freq: 0.0025,
  noise1Mag: 0.055,
  noise2Freq: 0.0029,
  noise2Mag: 0.044,
  noise3Freq: 0.0014,
  noise3Mag: 0.053,
  lengNoiseFreq: 0.044,
  minLeng: 0.003,
  maxLeng: 0.02
}

let lines = []

const sketch = ({ render }) => {
  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(render)
  gui.add(settings, 'lines', 0, 4000).step(1).onChange(render)
  gui.add(settings, 'canvasMargin', 0, 0.5).step(0.01).onChange(render)
  gui.add(settings, 'lineWidthMM', 0.05, 2).step(0.01).onChange(render)
  gui.add(settings, 'noise1Freq', 0.0001, 0.01).step(0.0001).onChange(render)
  gui.add(settings, 'noise1Mag', 0, 0.2).step(0.001).onChange(render)
  gui.add(settings, 'noise2Freq', 0.00001, 0.005).step(0.00001).onChange(render)
  gui.add(settings, 'noise2Mag', 0, 0.1).step(0.001).onChange(render)
  gui.add(settings, 'noise3Freq', 0.00001, 0.005).step(0.00001).onChange(render)
  gui.add(settings, 'noise3Mag', 0, 0.1).step(0.001).onChange(render)
  gui.add(settings, 'lengNoiseFreq', 0.0001, 0.05).step(0.0001).onChange(render)
  gui.add(settings, 'minLeng', 0.001, 0.2).step(0.001).onChange(render)
  gui.add(settings, 'maxLeng', 0.001, 0.2).step(0.001).onChange(render)

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

    for (let i = 0; i < settings.lines; i++) {
      const y = margin + (height - margin * 2) * i / (settings.lines - 1)
      let x = margin
      let lineStart = rand.boolean() ? x : null
      while (x < width - margin) {
        const t = rand.noise2D(x + 999, y + 888, settings.lengNoiseFreq) * 0.5 + 0.5
        x += ((settings.maxLeng - settings.minLeng) * t + settings.minLeng) * width
        x = Math.min(x, width - margin)
        if (lineStart === null) {
          lineStart = x
        } else {
          const yOffset1Start = rand.noise2D(lineStart, y, settings.noise1Freq, settings.noise1Mag * width)
          const yOffset1End = rand.noise2D(x, y, settings.noise1Freq, settings.noise1Mag * width)
          const yOffset2Start = rand.noise2D(lineStart, y, settings.noise2Freq, settings.noise2Mag * width)
          const yOffset2End = rand.noise2D(x, y, settings.noise2Freq, settings.noise2Mag * width)
          const yOffset3Start = rand.noise2D(lineStart, y, settings.noise3Freq, settings.noise3Mag * width)
          const yOffset3End = rand.noise2D(x, y, settings.noise3Freq, settings.noise3Mag * width)
          const yOffsetStart = Math.min(yOffset1Start + yOffset2Start, yOffset3Start)
          const yOffsetEnd = Math.min(yOffset1End + yOffset2End, yOffset3End)
          lines.push([[lineStart, y + yOffsetStart], [x, y + yOffsetEnd]])
          lineStart = null
        }
      }
    }

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
