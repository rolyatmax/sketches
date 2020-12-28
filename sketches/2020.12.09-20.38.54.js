const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const vec2 = require('gl-vec2')

const WIDTH = 3840
const HEIGHT = 2160

const settings = {
  seed: 1,
  lines: 600,
  minCanvasMargin: 0.1,
  radsOffset: 0.1,
  radsNoiseFreq: 0.1,
  circleNoiseFreq: 0.008,
  circleNoiseMag: 0.1,
  lineWidth: 0.2,
  gridCellSize: 100,
  gridCellSpacing: 0.5
}

const sketch = ({ render }) => {
  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(render)
  gui.add(settings, 'lines', 0, 10000).step(1).onChange(render)
  gui.add(settings, 'minCanvasMargin', 0, 0.5).step(0.01).onChange(render)
  gui.add(settings, 'radsOffset', 0.01, 1).onChange(render)
  gui.add(settings, 'radsNoiseFreq', 0, 0.5).onChange(render)
  gui.add(settings, 'circleNoiseFreq', 0, 4).onChange(render)
  gui.add(settings, 'circleNoiseMag', 0, 0.5).step(0.01).onChange(render)
  gui.add(settings, 'lineWidth', 0, 2).step(0.01).onChange(render)
  gui.add(settings, 'gridCellSize', 10, 500).onChange(render)
  gui.add(settings, 'gridCellSpacing', 0, 1).step(0.01).onChange(render)

  return ({ context, width, height }) => {
    context.clearRect(0, 0, width, height)
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    const rand = random.createRandom(settings.seed)
    const circleSize = settings.gridCellSize

    const cellPlusSpacing = (1 + settings.gridCellSpacing) * settings.gridCellSize

    const columnCount = Math.floor((1 - settings.minCanvasMargin) * width / cellPlusSpacing)
    const rowCount = Math.floor((1 - settings.minCanvasMargin) * height / cellPlusSpacing)

    const xOffset = (width - (columnCount * settings.gridCellSize + (columnCount - 1) * settings.gridCellSize * settings.gridCellSpacing)) / 2
    const yOffset = (height - (rowCount * settings.gridCellSize + (rowCount - 1) * settings.gridCellSize * settings.gridCellSpacing)) / 2

    function perturbPt (pt, xPerc, yPerc) {
      const mag = rand.noise2D(pt[0], pt[1], settings.circleNoiseFreq, settings.circleNoiseMag)
      return [
        pt[0] * (1 + mag * xPerc),
        pt[1] * (1 + mag * yPerc)
      ]
    }

    function positionPt (pt, offset) {
      return vec2.add([], vec2.scale([], pt, circleSize / 2), offset)
    }

    for (let x = 0; x < columnCount; x++) {
      for (let y = 0; y < rowCount; y++) {
        const center = [
          x * cellPlusSpacing + xOffset + circleSize / 2,
          y * cellPlusSpacing + yOffset + circleSize / 2
        ]
        const xPerc = x / (columnCount - 1)
        const yPerc = y / (rowCount - 1)
        const lines = [positionPt(perturbPt(rand.onCircle(), xPerc, yPerc), center)]
        let n = settings.lines
        while (n--) {
          const lastPt = lines[lines.length - 1]
          const rads = ((rand.noise2D(lastPt[0], lastPt[1], settings.radsNoiseFreq) + 1) * (Math.PI + settings.radsOffset)) % (Math.PI * 2)
          const pt = [Math.cos(rads), Math.sin(rads)]
          lines.push(positionPt(perturbPt(pt, xPerc, yPerc), center))
        }

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
  }
}

canvasSketch(sketch, {
  dimensions: [WIDTH, HEIGHT]
})
