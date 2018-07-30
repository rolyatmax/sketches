const canvasSketch = require('canvas-sketch')
const { GUI } = require('dat-gui')
const css = require('dom-css')
const Alea = require('alea')
const vec2 = require('gl-vec2')

const WIDTH = 600
const HEIGHT = 600

const settings = {
  seed: 0,
  ballSize: 15,
  gravity: 1.3,
  friction: 0.02,
  holeCount: 50,
  holeSize: 20,
  platformSize: 0.8
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 1000).step(1).onChange(setup)
gui.add(settings, 'ballSize', 1, 100).onChange(setup)
gui.add(settings, 'gravity', 0, 1.5).step(0.01)
gui.add(settings, 'friction', 0, 0.5).step(0.01)
gui.add(settings, 'holeCount', 0, 200).step(1).onChange(setup)
gui.add(settings, 'holeSize', 1, 100)
gui.add({ restart: setup }, 'restart')

let rand, ball, platform, holes, cSketchCtx

function setup () {
  rand = new Alea(settings.seed)

  const platformMargin = (1 - settings.platformSize) * 0.5

  platform = {
    positionLeft: [WIDTH * platformMargin, HEIGHT * 0.95],
    positionRight: [WIDTH * (1 - platformMargin), HEIGHT * 0.95],
    color: 'rgb(85, 85, 85)'
  }

  const platformMiddle = vec2.lerp([], platform.positionLeft, platform.positionRight, 0.5)
  const ballPosition = vec2.add(platformMiddle, platformMiddle, [0, -1.5 * settings.ballSize])
  ball = {
    position: ballPosition,
    lastPosition: ballPosition,
    color: 'rgb(66, 134, 244)'
  }

  holes = new Array(settings.holeCount).fill().map(() => {
    // TODO: make sure holes have enough space between them so as to create a solvable puzzle
    return {
      position: [rand() * WIDTH, rand() * HEIGHT * 0.85],
      color: 'rgb(200, 200, 200)',
      touched: false
    }
  })
}

// message for when you win/lose
const messageDiv = document.body.appendChild(document.createElement('div'))
css(messageDiv, {
  fontSize: 40,
  color: '#333',
  fontFamily: 'sans-serif',
  textAlign: 'center',
  position: 'absolute',
  width: '100vw',
  top: '45%',
  left: 0,
  background: 'white',
  padding: '40px 0',
  boxShadow: '0 0 10px rgba(0, 0, 0, 0.1)',
  display: 'none'
})

// setup controls
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyI') {
    platform.positionRight[1] -= 5
  } else if (e.code === 'KeyK') {
    platform.positionRight[1] += 5
  } else if (e.code === 'KeyE') {
    platform.positionLeft[1] -= 5
  } else if (e.code === 'KeyD') {
    platform.positionLeft[1] += 5
  } else if (e.code === 'KeyR') {
    css(messageDiv, { display: 'none' })
    messageDiv.innerText = ''
    setup()
    cSketchCtx.play()
  }
})

const sketch = (cSketchCtx) => {
  console.log(cSketchCtx)
  setup()

  function update () {
    // calculate the ball position
    const ballAcceleration = [0, settings.gravity]
    const velocity = vec2.subtract([], ball.position, ball.lastPosition)
    vec2.scale(velocity, velocity, 1 - settings.friction)
    vec2.add(velocity, velocity, ballAcceleration)

    ball.lastPosition = ball.position.slice()
    vec2.add(ball.position, ball.position, velocity)

    // calculate ball/platform collision
    const ballOnPlatform = doesCircleLineCollide(platform.positionLeft, platform.positionRight, ball.position, settings.ballSize)
    if (ballOnPlatform) {
      const closest = getClosestPt(platform.positionLeft, platform.positionRight, ball.position)
      if (closest !== null) {
        const distToClosest = vec2.subtract([], ball.position, closest)
        vec2.normalize(distToClosest, distToClosest)
        const newPosition = vec2.scale(distToClosest, distToClosest, settings.ballSize)
        vec2.add(newPosition, newPosition, closest)
        ball.position = newPosition
      }
    }

    // calculate ball/hole collision
    holes.forEach((hole) => {
      if (vec2.distance(hole.position, ball.position) <= settings.ballSize + settings.holeSize) {
        hole.color = 'red'
        hole.touched = true
      }
    })

    if (ball.position[0] < 0 || ball.position[0] > WIDTH || ball.position[1] > HEIGHT) {
      setup()
    } else if (ball.position[1] <= 0) {
      cSketchCtx.pause()
      window.cSketchCtx = cSketchCtx
      css(messageDiv, { display: 'block' })
      if (holes.some(h => h.touched)) {
        messageDiv.innerText = 'Nope, you lost. (Press "R" to try again)'
      } else {
        messageDiv.innerText = 'OMG, you won! Wait - are you a computer? (Press "R" to try again)'
      }
    }
  }

  return ({ context, width, height }) => {
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    update()

    // draw holes
    holes.forEach((hole) => {
      context.beginPath()
      context.arc(hole.position[0], hole.position[1], settings.holeSize, 0, Math.PI * 2)
      context.fillStyle = hole.color
      context.fill()
    })

    // draw ball
    context.beginPath()
    context.arc(ball.position[0], ball.position[1], settings.ballSize, 0, Math.PI * 2)
    context.fillStyle = ball.color
    context.fill()

    // draw platform
    context.beginPath()
    context.moveTo(platform.positionLeft[0], platform.positionLeft[1])
    context.lineTo(platform.positionRight[0], platform.positionRight[1])
    context.lineTo(platform.positionRight[0], platform.positionRight[1] + 4)
    context.lineTo(platform.positionLeft[0], platform.positionLeft[1] + 4)
    context.fillStyle = platform.color
    context.fill()
  }
}

canvasSketch(sketch, {
  fps: 24,
  animate: true,
  dimensions: [WIDTH, HEIGHT]
}).then((args) => { cSketchCtx = args.props })

// geometry helpers

function doesCircleLineCollide (lineStart, lineEnd, circleCenter, circleRadius) {
  if (isPointInCircle(lineStart, circleCenter, circleRadius) || isPointInCircle(lineEnd, circleCenter, circleRadius)) return true
  const closest = getClosestPt(lineStart, lineEnd, circleCenter)
  if (closest === null) return false
  return isPointInCircle(closest, circleCenter, circleRadius)
}

function getClosestPt (lineStart, lineEnd, pt) {
  const len = vec2.distance(lineStart, lineEnd)
  const dot = (((pt[0] - lineStart[0]) * (lineEnd[0] - lineStart[0])) + ((pt[1] - lineStart[1]) * (lineEnd[1] - lineStart[1]))) / (len * len)
  const closest = vec2.subtract([], lineEnd, lineStart)
  vec2.scale(closest, closest, dot)
  vec2.add(closest, closest, lineStart)
  if (!isPointOnLine(closest, lineStart, lineEnd)) return null
  return closest
}

function isPointInCircle (pt, circleCenter, circleRadius) {
  return vec2.squaredDistance(pt, circleCenter) <= circleRadius * circleRadius
}

function isPointOnLine (pt, lineStart, lineEnd) {
  const buffer = 0.01
  const dist1 = vec2.distance(pt, lineStart)
  const dist2 = vec2.distance(pt, lineEnd)
  const lineLen = vec2.distance(lineStart, lineEnd)
  return Math.abs((dist1 + dist2) - lineLen) <= buffer
}
