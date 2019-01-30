const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const vec2 = require('gl-vec2')

const SIZE = 2048

const settings = {
  seed: 1,
  drawersCount: 5000,
  startRadius: 500,
  radius: 1.5,
  stdvRads: 1,
  stdvDist: 100,
  speed: 0.5,
  opacity: 5,
  freq: 1,
  amp: 2000,
  debugNoise: false
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'drawersCount', 1, 10000).step(1).onChange(setup)
gui.add(settings, 'startRadius', 0, 1000).onChange(setup)
gui.add(settings, 'radius', 1, 10)
gui.add(settings, 'stdvRads', 0, 4).onChange(setup)
gui.add(settings, 'stdvDist', 0, 500).onChange(setup)
gui.add(settings, 'opacity', 0, 100)
gui.add(settings, 'freq', 0, 8)
gui.add(settings, 'amp', 0, 10000)
gui.add(settings, 'speed', 0, 10)
gui.add(settings, 'debugNoise').onChange(setup)

let rand, drawers, isFirstDraw, radsOffset

function setup () {
  rand = random.createRandom(settings.seed)
  rand.setSeed(settings.seed)
  radsOffset = rand.range(Math.PI * 2)
  const center = [SIZE / 2, SIZE / 2]
  const meanRads = rand.range(Math.PI * 2)
  const meanDist = rand.range(settings.startRadius)
  drawers = (new Array(settings.drawersCount)).fill().map(() => {
    const rads = rand.gaussian(meanRads, settings.stdvRads)
    const dist = rand.gaussian(meanDist, settings.stdvDist)
    const position = [
      Math.cos(rads) * dist,
      Math.sin(rads) * dist
    ]
    vec2.add(position, position, center)
    return {position}
  })
  isFirstDraw = true
}

const sketch = () => {
  setup()
  return ({ context, width, height }) => {
    function getNoiseVal (x, y) {
      const rads = rand.noise2D(x, y, settings.freq / 1000, settings.amp / 1000) * Math.PI * 2 + radsOffset
      const speed = rand.noise2D(x + 100, y + 600, settings.freq / 1000, settings.amp / 1000) + 1
      return [
        Math.cos(rads) * speed * settings.speed,
        Math.sin(rads) * speed * settings.speed
      ]
    }

    function getRadius (x, y) {
      return (rand.noise2D(x, y, settings.freq / 1000) + 1) * settings.radius
    }

    if (isFirstDraw || settings.debugNoise) {
      context.fillStyle = 'white'
      context.fillRect(0, 0, width, height)
      isFirstDraw = false
    }
    drawers.forEach(d => {
      const velocity = getNoiseVal(d.position[0], d.position[1])
      vec2.add(d.position, d.position, velocity)
      const r = getRadius(d.position[0], d.position[1])
      context.beginPath()
      context.arc(d.position[0], d.position[1], r, 0, Math.PI * 2)
      context.fillStyle = `rgba(30, 30, 30, ${settings.opacity / 1000})`
      context.fill()
    })

    if (settings.debugNoise) {
      for (let x = 0; x < SIZE; x += 20) {
        for (let y = 0; y < SIZE; y += 20) {
          const velocity = getNoiseVal(x, y)
          vec2.scale(velocity, velocity, 5)
          const start = [x, y]
          const end = vec2.add(velocity, start, velocity)
          context.beginPath()
          context.moveTo(start[0], start[1])
          context.lineTo(end[0], end[1])
          context.strokeStyle = 'blue'
          context.stroke()
        }
      }
    }
  }
}

canvasSketch(sketch, {
  dimensions: [ SIZE, SIZE ],
  animate: true
})
