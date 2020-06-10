const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const vec2 = require('gl-vec2')

const SIZE = 2048

const settings = {
  seed: 4652,
  drawersCount: 50,
  startRadius: 800,
  radius: 1.5,
  wanderLimit: 0.2,
  startHue: 200,
  hueRange: 100,
  lightnessDecay: 1.01,
  speed: 2,
  opacity: 28,
  freq: 2.5,
  noiseScale: 1,
  octaves: 14,
  debugNoise: true
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'drawersCount', 1, 5000).step(1).onChange(setup)
gui.add(settings, 'startRadius', 0, 1000).onChange(setup)
gui.add(settings, 'radius', 1, 10)
gui.add(settings, 'wanderLimit', 0, Math.PI)
gui.add(settings, 'startHue', 0, 360)
gui.add(settings, 'hueRange', 0, 360)
gui.add(settings, 'lightnessDecay', 1, 1.05)
gui.add(settings, 'opacity', 0, 100)
gui.add(settings, 'freq', 0, 8)
gui.add(settings, 'noiseScale', 1, 10)
gui.add(settings, 'octaves', 1, 20).step(1)
gui.add(settings, 'speed', 0, 10)
gui.add(settings, 'debugNoise').onChange(setup)

let rand, drawers, isFirstDraw, noiseOffset

function setup () {
  rand = random.createRandom(settings.seed)
  rand.setSeed(settings.seed)
  noiseOffset = rand.range(SIZE * 100)
  const center = [SIZE / 2, SIZE / 2]
  drawers = (new Array(settings.drawersCount)).fill().map(() => {
    const position = rand.insideCircle(settings.startRadius)
    vec2.add(position, position, center)
    const angle = rand.range(Math.PI * 2)
    const lightness = 50
    return { position, angle, lightness }
  })
  isFirstDraw = true
}

function turbulance (x, y) {
  let value = 0
  let freq = 1
  let amp = 0.5
  let i = settings.octaves
  while (i--) {
    value += amp * rand.noise2D(x - 1, y - 1) * freq
    freq *= 1.9
    amp *= 0.6
  }
  return value
}

function convolution (x, y, time) {
  const aX = Math.sin(time * 0.005) * 6
  const aY = Math.sin(time * 0.01) * 6
  const aScale = 3
  const a = turbulance(x * aScale + aX, y * aScale + aY)

  const bX = Math.sin(time * 0.01) * 1
  const bY = Math.sin(time * 0.01) * 1
  const bScale = 0.6
  const b = turbulance((x + a) * bScale + bX, (y + a) * bScale + bY)

  const cX = Math.sin(-time * 0.001) * 2 - 0.6
  const cY = Math.sin(time * 0.01) * 2 - 0.5
  const cScale = 0.6
  const c = turbulance((x + b) * cScale + cX, (y + b) * cScale + cY)

  return c
}

const sketch = () => {
  setup()
  return ({ context, width, height, time }) => {
    function getNoiseVal (x, y) {
      return convolution(
        (x + noiseOffset) * 0.00001 * settings.noiseScale,
        (y + noiseOffset) * 0.00001 * settings.noiseScale,
        time * 0.01
      ) * settings.freq / 1000
    }

    function getNextAngle (x, y, angle) {
      const currentVal = getNoiseVal(x, y)
      let closestDiffSquared = Infinity
      let closestAngle = null
      const steps = 50
      for (let j = -steps; j < steps; j++) {
        const rads = j / steps * settings.wanderLimit + angle
        const neighbor = [
          Math.cos(rads) * settings.speed + x,
          Math.sin(rads) * settings.speed + y
        ]
        const val = getNoiseVal(neighbor[0], neighbor[1])
        const diffSquared = Math.pow(currentVal - val, 2)
        if (!closestAngle || closestDiffSquared > diffSquared) {
          closestDiffSquared = diffSquared
          closestAngle = rads
        }
      }
      return closestAngle
    }

    if (isFirstDraw || settings.debugNoise) {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      context.globalCompositeOperation = 'darker'
      isFirstDraw = false
    }

    drawers.forEach((b, i) => {
      b.angle = getNextAngle(b.position[0], b.position[1], b.angle)
      let angle = b.angle
      if (i % 2 === 0) angle = b.angle + Math.PI / 2
      const v = [
        Math.cos(angle) * settings.speed,
        Math.sin(angle) * settings.speed
      ]
      vec2.add(b.position, b.position, v)

      b.lightness *= settings.lightnessDecay
      b.lightness = Math.min(b.lightness, 100) | 0

      const val = getNoiseVal(b.position[0], b.position[1]) * 0.5 + 0.5
      const hue = (settings.startHue + settings.hueRange * val) | 0

      const r = getNoiseVal(b.position[1] / 100, b.position[0] / 100) * 0.5 + 0.5

      context.beginPath()
      context.arc(b.position[0], b.position[1], r * settings.radius, 0, Math.PI * 2)
      context.fillStyle = `hsla(${hue}, 50%, ${b.lightness}%, ${settings.opacity / 100})`
      context.fill()
      context.restore()
    })

    if (settings.debugNoise) {
      for (let x = 0; x < SIZE; x += 20) {
        for (let y = 0; y < SIZE; y += 20) {
          const val = getNoiseVal(x, y)
          const r = 20
          context.beginPath()
          context.arc(x, y, r, 0, Math.PI * 2)
          context.fillStyle = `hsla(${val * 360}, 50%, 50%, 0.5)`
          context.fill()

          // const rads = val * Math.PI
          // const velocity = [
          //   Math.cos(rads) * settings.speed,
          //   Math.sin(rads) * settings.speed
          // ]
          // vec2.scale(velocity, velocity, 30)
          // const start = [x, y]
          // const end = vec2.add(velocity, start, velocity)
          // context.beginPath()
          // context.moveTo(start[0], start[1])
          // context.lineTo(end[0], end[1])
          // context.strokeStyle = 'blue'
          // context.stroke()
        }
      }
    }
  }
}

canvasSketch(sketch, {
  dimensions: [SIZE, SIZE],
  animate: true
})
