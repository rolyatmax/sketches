/* global requestAnimationFrame */

const fit = require('canvas-fit')
const vec2 = require('gl-vec2')

const canvas = document.body.appendChild(document.createElement('canvas'))
const ctx = canvas.getContext('2d')
window.addEventListener('resize', fit(canvas), false)

let clicked = false

const minSpeed = 1
const maxSpeed = 10
// let speed = maxSpeed
// let angle = 0
let camera = [600, 200]
let lastCamera = vec2.subtract([], camera, [10000, -100])
let mouseStart = []
let cameraStart = []
let destPos = [] // only for visualization
let dragging = false

document.addEventListener('mousedown', (e) => {
  clicked = true
  mouseStart[0] = e.clientX
  mouseStart[1] = e.clientY
  cameraStart[0] = camera[0]
  cameraStart[1] = camera[1]
  dragging = true
})

document.addEventListener('mousemove', (e) => {
  if (!dragging) return
  lastCamera = [...camera]
  vec2.subtract(camera, [e.clientX, e.clientY], mouseStart)
  vec2.add(camera, camera, cameraStart)
})

document.addEventListener('mouseup', () => {
  dragging = false
  // speed = 0
  // angle = getAngleFromPosition(camera)
})

function update () {
  if (!dragging) {
    // const center = [canvas.width / 2, canvas.height / 2]
    const velocity = vec2.subtract([], camera, lastCamera)
    lastCamera = [...camera]
    const nextPosition = vec2.add([], camera, velocity)
    const angle = getAngleFromPosition(nextPosition)
    destPos = getPositionForAngle(angle + 0.1)
    // const destDistance = vec2.distance(destPos, center)
    // const distanceDelta = destDistance - distance
    // const nextDistance = distanceDelta * 0.001 + distance
    const acceleration = vec2.subtract([], destPos, nextPosition)
    vec2.scale(acceleration, acceleration, 0.005)
    vec2.add(velocity, velocity, acceleration)
    const curSpeed = vec2.length(velocity)
    vec2.normalize(velocity, velocity)
    vec2.scale(velocity, velocity, Math.max(minSpeed, Math.min(curSpeed, maxSpeed)))
    camera = vec2.add([], camera, velocity)
    // camera = [
    //   Math.cos(angle) * 200,
    //   Math.sin(angle) * 80
    // ]
    // vec2.normalize(camera, camera)
    // vec2.scale(camera, camera, nextDistance)
    // vec2.add(camera, camera, center)
    // speed = Math.min(speed + 0.0001, maxSpeed)
    // angle = angle + speed
  }
}

function draw (ctx) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  drawOrbit(ctx)
  drawCircle(ctx, camera, 5, '#f00', true)
  // drawCircle(ctx, destPos, 5, '#00f', true)
}

function getPositionForAngle (angle) {
  return [
    Math.cos(angle) * 200 + canvas.width / 2,
    Math.sin(angle) * 80 + canvas.height / 2
  ]
}

function getAngleFromPosition (position) {
  return Math.atan2(
    (position[1] - canvas.height / 2) * 200,
    (position[0] - canvas.width / 2) * 80
  )
}

function drawOrbit (ctx) {
  ctx.beginPath()
  ctx.strokeStyle = '#333'
  const granularity = 100
  let i = granularity
  while (i--) {
    const t = i / (granularity - 1)
    const pt = getPositionForAngle(t * Math.PI * 2)
    if (t === 1) {
      ctx.moveTo(pt[0], pt[1])
    } else {
      ctx.lineTo(pt[0], pt[1])
    }
  }
  ctx.stroke()
}

function drawCircle (ctx, position, radius, color, shouldFill) {
  ctx.beginPath()
  ctx.arc(position[0], position[1], radius, 0, Math.PI * 2)
  if (shouldFill) {
    ctx.fillStyle = color
    ctx.fill()
  } else {
    ctx.strokeStyle = color
    ctx.stroke()
  }
}

requestAnimationFrame(function loop () {
  requestAnimationFrame(loop)
  update()
  draw(ctx)
})
