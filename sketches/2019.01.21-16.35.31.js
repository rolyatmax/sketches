const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const vec2 = require('gl-vec2')

const SIZE = 800

const settings = {
  seed: 4652,
  branchesCount: 2,
  branchingFactor: 1,
  branchDepthLimit: 10,
  branchingAngle: 3,
  startRadius: 10,
  radius: 12,
  bloomRadius: 45,
  stdvRads: 0.05,
  stdvDist: 50,
  bloomPoint: 0.5,
  bloomMax: 150,
  gravityStrength: 5,
  startHue: 200,
  hueRange: 100,
  radsDivisor: 3,
  radiusDecay: 994,
  speed: 0.6,
  opacity: 28,
  freq: 2.5,
  amp: 440,
  debugNoise: false
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'branchesCount', 1, 50).step(1).onChange(setup)
gui.add(settings, 'branchingFactor', 0, 10)
// gui.add(settings, 'branchingAngle', 0, Math.PI * 2)
gui.add(settings, 'branchDepthLimit', 0, 100).step(1)
gui.add(settings, 'startRadius', 0, 1000).onChange(setup)
gui.add(settings, 'bloomRadius', 10, 500)
gui.add(settings, 'stdvRads', 0, 4)
gui.add(settings, 'stdvDist', 0, 500)
gui.add(settings, 'radius', 1, 100)
gui.add(settings, 'bloomPoint', 0, 50)
gui.add(settings, 'bloomMax', 0, 500)
gui.add(settings, 'gravityStrength', 0, 500)
gui.add(settings, 'startHue', 0, 360)
gui.add(settings, 'hueRange', 0, 360)
gui.add(settings, 'radsDivisor', 1, 6).step(1)
gui.add(settings, 'radiusDecay', 991, 999)
gui.add(settings, 'opacity', 0, 100)
gui.add(settings, 'freq', 0, 8)
gui.add(settings, 'amp', 0, 10000)
gui.add(settings, 'speed', 0, 10)
gui.add(settings, 'debugNoise').onChange(setup)

let rand, branches, isFirstDraw, radsOffset

function setup () {
  rand = random.createRandom(settings.seed)
  rand.setSeed(settings.seed)
  radsOffset = rand.range(Math.PI * 2)
  const center = [SIZE / 2, SIZE / 2]
  branches = (new Array(settings.branchesCount)).fill().map(() => {
    const radius = settings.radius
    const position = rand.insideCircle(settings.startRadius)
    vec2.add(position, position, center)
    const offset = rand.value() * Math.PI * 2
    const branchDepth = 0
    const blooms = 0
    const blur = rand.range(15, 25)
    return {position, radius, offset, branchDepth, blooms, blur}
  })
  isFirstDraw = true
}

const sketch = () => {
  setup()
  return ({ context, width, height }) => {
    function setBlur (b) {
      if (b.blur < 0.8) b.blur = 0
      context.filter = b.blur ? `blur(${b.blur}px)` : ''
      b.blur *= 0.98
    }

    function getNoiseVal (x, y, offset) {
      let rads = rand.noise2D(x + radsOffset * 100, y + radsOffset * 100, settings.freq / 1000, settings.amp / 1000) * Math.PI * 2 + offset
      // const div = (Math.PI * 2) / settings.radsDivisor
      // rads = ((rads / div) | 0) * div
      return [
        Math.cos(rads) * settings.speed,
        Math.sin(rads) * settings.speed
      ]
    }

    if (isFirstDraw || settings.debugNoise) {
      context.fillStyle = '#fff9fe'
      context.fillRect(0, 0, width, height)
      context.globalCompositeOperation = 'darker'
      isFirstDraw = false
    }

    const newBranches = []

    branches.forEach(b => {
      context.save()
      setBlur(b)

      if (b.radius > settings.bloomPoint) {
        if (rand.chance(settings.branchingFactor / 100) && b.branchDepth < settings.branchDepthLimit) {
          const branch = {
            position: b.position.slice(),
            offset: b.offset + rand.range(-settings.branchingAngle, settings.branchingAngle),
            radius: b.radius,
            branchDepth: b.branchDepth + 1,
            blooms: 0,
            blur: b.blur
          }
          newBranches.push(branch)
        }

        const velocity = getNoiseVal(b.position[0], b.position[1], b.offset)
        vec2.add(b.position, b.position, velocity)
        b.radius *= settings.radiusDecay / 1000

        context.beginPath()
        context.arc(b.position[0], b.position[1], b.radius, 0, Math.PI * 2)
        context.fillStyle = `rgba(30, 30, 30, ${settings.opacity / 100})`
        context.fill()
      } else {
        if (rand.chance(0.2) && settings.bloomMax > b.blooms) {
          if (!b.blooms) b.blur = rand.range(15, 30)
          if (rand.chance(0.05)) b.blur = rand.range(15, 30)
          setBlur(b)
          b.meanRads = b.meanRads || rand.range(Math.PI * 2)
          b.meanDist = b.meanDist || rand.range(settings.bloomRadius)
          b.lightness = b.lightness || 25
          b.lightness *= 1.03
          b.saturation = b.saturation || 40
          b.saturation *= 1.03
          const rads = rand.gaussian(b.meanRads, settings.stdvRads)
          const dist = rand.gaussian(b.meanDist, settings.stdvDist)
          const gravity = rand.gaussian(settings.gravityStrength, settings.stdvDist)
          const offset = [
            Math.cos(rads) * dist,
            Math.sin(rads) * dist + gravity
          ]
          const r = rand.range(1, 4)
          const hue = rand.range(settings.startHue, settings.startHue + settings.hueRange)
          context.beginPath()
          context.arc(b.position[0] + offset[0], b.position[1] + offset[1], r, 0, Math.PI * 2)
          context.fillStyle = `hsla(${hue}, ${b.saturation}%, ${b.lightness}%, ${settings.opacity / 100})`
          context.fill()
          b.blooms += 1
        }
      }
      context.restore()
    })

    branches.push(...newBranches)

    if (settings.debugNoise) {
      for (let x = 0; x < SIZE; x += 20) {
        for (let y = 0; y < SIZE; y += 20) {
          const velocity = getNoiseVal(x, y, 0)
          vec2.scale(velocity, velocity, 30)
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
