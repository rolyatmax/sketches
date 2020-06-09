const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')

const WIDTH = 2048
const HEIGHT = 2048

const settings = {
  seed: 1
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)

let rand

function setup () {
  rand = random.createRandom(settings.seed)
}

const sketch = () => {
  setup()
  return ({ context, width, height }) => {
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)
  }
}

canvasSketch(sketch, {
  dimensions: [WIDTH, HEIGHT],
  animate: true
})
