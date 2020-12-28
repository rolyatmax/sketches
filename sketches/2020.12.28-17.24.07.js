const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const vec2 = require('gl-vec2')

const WIDTH = 3840
const HEIGHT = 2160

const settings = {
  seed: 1,
  noiseOffset: 1000,
  noiseFreq: 0.1,
  noiseMag: 0.1,
  lineWidth: 0.2
}

const sketch = ({ render }) => {
  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(render)
  gui.add(settings, 'noiseOffset', 0, 99999).onChange(render)
  gui.add(settings, 'noiseFreq', 0, 0.5).onChange(render)
  gui.add(settings, 'noiseMag', 0, 0.5).step(0.01).onChange(render)
  gui.add(settings, 'lineWidth', 0, 2).step(0.01).onChange(render)

  return ({ context, width, height }) => {
    context.clearRect(0, 0, width, height)
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    const rand = random.createRandom(settings.seed)

    const mag = rand.noise2D(x + settings.noiseOffset, y, settings.noiseFreq, settings.noiseMag)
  }
}

canvasSketch(sketch, {
  dimensions: [WIDTH, HEIGHT]
})
