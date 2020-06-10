const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')

const WIDTH = 2048
const HEIGHT = 2048
const MARGIN = 200

const settings = {
  seed: 10,
  gridSize: 60,
  noiseFreq: 0.001,
  noiseAmp: 2,
  speed: 500
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'gridSize', 2, 300).step(1).onChange(setup)
gui.add(settings, 'noiseFreq', 0, 0.01).step(0.00001)
gui.add(settings, 'noiseAmp', 0, 5)
gui.add(settings, 'speed', 1, 1000)

let points, rand

function setup () {
  points = []
  rand = random.createRandom(settings.seed)

  const WORKSPACE = [WIDTH - MARGIN * 2, HEIGHT - MARGIN * 2]
  const GRID_SPACING = [WORKSPACE[0] / settings.gridSize, WORKSPACE[1] / settings.gridSize]

  for (let x = 0; x < settings.gridSize; x++) {
    const xVal = x / settings.gridSize * WORKSPACE[0] + MARGIN + GRID_SPACING[0] / 2
    for (let y = 0; y < settings.gridSize; y++) {
      const yVal = y / settings.gridSize * WORKSPACE[1] + MARGIN + GRID_SPACING[1] / 2
      points.push({
        position: [xVal, yVal]
      })
    }
  }
}

const sketch = () => {
  setup()
  return ({ context, width, height, time }) => {
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    for (const pt of points) {
      context.beginPath()
      const size = rand.noise3D(pt.position[0], pt.position[1], time * settings.speed, settings.noiseFreq, settings.noiseAmp) + settings.noiseAmp
      const angle = size / settings.noiseAmp * Math.PI
      const xOffset = Math.cos(angle) * 5
      const yOffset = Math.sin(angle) * 5
      context.arc(pt.position[0] + xOffset, pt.position[1] + yOffset, size, 0, Math.PI * 2)
      context.fillStyle = `rgba(50, 50, 50, ${1 - size / (settings.noiseAmp * 2)})`
      context.fill()
    }
  }
}

canvasSketch(sketch, {
  dimensions: [WIDTH, HEIGHT],
  animate: true
})
