const canvasSketch = require('canvas-sketch')
const { GUI } = require('dat-gui')
const Alea = require('alea')
const vec2 = require('gl-vec2')
const p5 = require('p5')

window.p5 = p5

const WIDTH = 1024
const HEIGHT = 1024

const settings = {
  seed: 0,
  ballSize: 15,
  gravity: 1.2,
  holeCount: 50,
  holeSize: 25,
  platformSize: 0.8
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 1000).step(1).onChange(setup)
gui.add(settings, 'ballSize', 1, 100).onChange(setup)
gui.add(settings, 'gravity', 0, 1.5).step(0.01)
gui.add(settings, 'holeCount', 0, 200).step(1).onChange(setup)
gui.add({ restart: setup }, 'restart')

let rand, ball, platform, holes

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
      color: 'rgb(200, 200, 200)'
    }
  })
}

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
  }
})

const sketch = () => {
  setup()

  function update () {
    // calculate the ball position
    const ballAcceleration = [0, settings.gravity]
    const velocity = vec2.subtract([], ball.position, ball.lastPosition)
    vec2.add(velocity, velocity, ballAcceleration)

    ball.lastPosition = ball.position.slice()
    vec2.add(ball.position, ball.position, velocity)

    // calculate ball/platform collision
    if (doesCircleLineCollide(platform.positionLeft, platform.positionRight, ball.position, settings.ballSize)) {
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
      }
    })
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
  animate: true,
  dimensions: [WIDTH, HEIGHT]
})

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
