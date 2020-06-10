const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')

const SIZE = 800

const settings = {
  seed: 1,
  speedLimit: 25,
  accel: 0.001,
  friction: 0.03
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'speedLimit', 0.01, 500)
gui.add(settings, 'accel', 0.001, 0.1).step(0.001)
gui.add(settings, 'friction', 0.001, 0.1).step(0.001)

let rand, dot, lastPositions

function setup () {
  rand = random.createRandom(settings.seed)
  const p = rand.insideCircle(100).map(v => v + SIZE / 2)
  dot = createAnimator(p, settings.accel, settings.friction, settings.speedLimit)
  lastPositions = []
}

const sketch = ({ canvas }) => {
  canvas.addEventListener('click', e => {
    const { width, height } = canvas.getBoundingClientRect()
    const px = [
      e.offsetX / width * canvas.width,
      e.offsetY / height * canvas.height
    ]
    console.log(px)
    dot.moveTo(px)
  })

  setup()
  return ({ context, width, height }) => {
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    const pos = dot.tick(settings.accel, settings.friction, settings.speedLimit)

    lastPositions.forEach(p => drawCircle(context, p))
    drawCircle(context, pos, true)

    lastPositions.push(pos)
  }
}

function drawCircle (context, pos, fill = false) {
  context.beginPath()
  context.arc(pos[0], pos[1], 25, 0, Math.PI * 2)
  context.fillStyle = 'hsl(200, 30%, 50%)'
  context.strokeStyle = 'hsl(200, 30%, 50%)'
  if (fill) context.fill()
  context.stroke()
}

function createAnimator (initVal, accel, friction, speedLimit) {
  const add = (first, second) => first.map((v, i) => v + second[i])
  const subtract = (first, second) => first.map((v, i) => v - second[i])
  const scale = (vec, mult) => vec.map(v => v * mult)
  const length = vec => Math.sqrt(vec.reduce((total, v) => total + v * v, 0))

  const initialValue = Array.isArray(initVal) ? initVal : [initVal]
  let curVal = initialValue
  let lastVal = initialValue
  let destVal = initialValue
  return {
    moveTo (val) {
      destVal = Array.isArray(val) ? val : [val]
    },
    tick (tickAccel, tickFriction, tickSpeedLimit) {
      const a = tickAccel || accel
      const f = tickFriction || friction
      const l = tickSpeedLimit || speedLimit
      const delta = subtract(destVal, curVal)
      const curVelocity = subtract(curVal, lastVal)
      let velocity = add(scale(delta, a), curVelocity)
      velocity = add(velocity, scale(curVelocity, -1 * f))
      const speed = length(velocity)
      if (l && speed > l) {
        velocity = scale(velocity, l / speed)
      }
      const nextVal = add(velocity, curVal)
      lastVal = curVal
      curVal = nextVal
      return curVal
    },
    getCurrentVal () {
      return Array.isArray(initVal) ? curVal : curVal[0]
    }
  }
}

canvasSketch(sketch, {
  dimensions: [SIZE, SIZE],
  animate: true
})
