const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const vec2 = require('gl-vec2')

const WIDTH = 1024
const HEIGHT = 1024

const settings = {
  seed: 1,
  lines: 1000,
  margin: 0.1,
  radsOffset: 1,
  radsNoiseFreq: 0.008,
  circleNoiseFreq: 0.008,
  circleNoiseMag: 0.1,
  lineWidth: 1
}

const sketch = ({ render }) => {
  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(render)
  gui.add(settings, 'lines', 0, 10000).step(1).onChange(render)
  gui.add(settings, 'margin', 0, 0.5).step(0.01).onChange(render)
  gui.add(settings, 'radsOffset', 0.01, 7).onChange(render)
  gui.add(settings, 'radsNoiseFreq', 0, 1).onChange(render)
  gui.add(settings, 'circleNoiseFreq', 0, 2).onChange(render)
  gui.add(settings, 'circleNoiseMag', 0, 0.15).step(0.01).onChange(render)
  gui.add(settings, 'lineWidth', 0, 2).step(0.01).onChange(render)

  return ({ context, width, height }) => {
    const rand = random.createRandom(settings.seed)
    const circleSize = Math.min(width, height) * (1 - settings.margin) / 2
    const lines = [positionPt(perturbPt(rand.onCircle()))]

    function perturbPt (pt) {
      const mag = 1 + rand.noise2D(pt[0], pt[1], settings.circleNoiseFreq, settings.circleNoiseMag)
      return [
        pt[0] * mag,
        pt[1] * mag
      ]
    }

    function positionPt (pt) {
      return vec2.add([], vec2.scale([], pt, circleSize), [width / 2, height / 2])
    }

    let n = settings.lines
    while (n--) {
      const lastPt = lines[lines.length - 1]
      const rads = ((rand.noise2D(lastPt[0], lastPt[1], settings.radsNoiseFreq) + 1) * (Math.PI + settings.radsOffset)) % (Math.PI * 2)
      const pt = [Math.cos(rads), Math.sin(rads)]
      lines.push(positionPt(perturbPt(pt)))
    }

    context.clearRect(0, 0, width, height)
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    context.beginPath()
    context.lineWidth = settings.lineWidth
    context.strokeStyle = 'rgba(30, 30, 30, 0.98)'
    context.moveTo(lines[0][0], lines[0][1])
    for (const pt of lines.slice(1)) {
      context.lineTo(pt[0], pt[1])
    }
    context.stroke()
  }
}

canvasSketch(sketch, {
  dimensions: [WIDTH, HEIGHT]
})
