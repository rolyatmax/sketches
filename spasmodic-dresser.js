/* global requestAnimationFrame cancelAnimationFrame */

import Alea from 'alea'
import createResizableCanvas from './common/resizable-canvas'
import includeFont from './common/include-font'
import addTitle from './common/add-title'

const seed = Math.random()
const rand = new Alea(seed)

const container = document.createElement('div')
document.body.appendChild(container)

includeFont({
  fontFamily: '"Space Mono", sans-serif',
  url: 'https://fonts.googleapis.com/css?family=Space+Mono:700'
})

const title = addTitle('the boids')
title.style.opacity = 0
title.style.transition = 'opacity 400ms ease'
container.appendChild(title)
setTimeout(() => {
  title.style.opacity = 1
}, 200)

const canvas = createResizableCanvas(container, main, { margin: 0 })
const ctx = window.ctx = canvas.getContext('2d')
ctx.globalCompositeOperation = 'darker'

const settings = {
  boidCount: 300,
  steerLimit: 0.006,
  neighborThreshold: 80,
  separationFactor: 40
}

let rAFToken = 0

let boids = []
let i = settings.boidCount
while (i--) {
  const angle = rand() * Math.PI * 2
  boids.push({
    position: [rand() * canvas.width, rand() * canvas.height],
    velocity: [Math.cos(angle), Math.sin(angle)]
  })
}

function loop (t) {
  rAFToken = requestAnimationFrame(loop)
  update(t)
}

function update (t) {
  const speed = 2

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  boids = boids.map(boid => align(boid, boids))
  boids = boids.map(boid => avoid(boid, boids))
  boids = boids.map(boid => cohere(boid, boids))

  boids = boids.map(boid => {
    let [x, y] = add(boid.position, multiply(boid.velocity, speed))
    x = x < 0 ? canvas.width + x : x % canvas.width
    y = y < 0 ? canvas.height + y : y % canvas.height
    return {
      ...boid,
      position: [x, y]
    }
  })
  boids.forEach(drawBoid)
}

function align (boid, boids) {
  let sum = [0, 0]
  let neighbors = 0
  boids.forEach(b => {
    const distance = dist(b.position, boid.position)
    if (distance > 0 && distance < settings.neighborThreshold) {
      sum = add(sum, b.velocity)
      neighbors += 1
    }
  })
  if (!neighbors) return boid

  sum = divide(sum, neighbors)
  sum = normalize(sum)
  let steer = subtract(sum, boid.velocity)
  steer = normalize(steer)
  steer = multiply(steer, settings.steerLimit)

  return {
    ...boid,
    velocity: add(boid.velocity, steer)
  }
}

function cohere (boid, boids) {
  let sum = [0, 0]
  let neighbors = 0
  boids.forEach(b => {
    const distance = dist(b.position, boid.position)
    if (distance > 0 && distance < settings.neighborThreshold) {
      sum = add(sum, b.position)
      neighbors += 1
    }
  })
  if (!neighbors) return boid

  sum = divide(sum, neighbors)
  let desired = subtract(sum, boid.position)
  desired = normalize(desired)
  let steer = subtract(desired, boid.velocity)
  steer = normalize(steer)
  steer = multiply(steer, settings.steerLimit)

  return {
    ...boid,
    velocity: add(boid.velocity, steer)
  }
}

function avoid (boid, boids) {
  let sum = [0, 0]
  let neighbors = 0
  boids.forEach(b => {
    const distance = dist(b.position, boid.position)
    if (distance > 0 && distance < settings.separationFactor) {
      let diff = subtract(boid.position, b.position)
      diff = normalize(diff)
      diff = divide(diff, distance)
      sum = add(sum, diff)
      neighbors += 1
    }
  })
  if (!neighbors) return boid

  sum = divide(sum, neighbors)
  sum = normalize(sum)
  let steer = subtract(sum, boid.velocity)
  steer = normalize(steer)
  steer = multiply(steer, settings.steerLimit)

  return {
    ...boid,
    velocity: add(boid.velocity, steer)
  }
}

function normalize (vec) {
  const len = dist([0, 0], vec)
  return divide(vec, len)
}

function dist (vecA, vecB) {
  const xDiff = vecA[0] - vecB[0]
  const yDiff = vecA[1] - vecB[1]
  return Math.sqrt(xDiff * xDiff + yDiff * yDiff)
}

function subtract (vecA, vecB) {
  return [
    vecA[0] - vecB[0],
    vecA[1] - vecB[1]
  ]
}

function add (vecA, vecB) {
  return [
    vecA[0] + vecB[0],
    vecA[1] + vecB[1]
  ]
}

function multiply (vecA, val) {
  return [
    vecA[0] * val,
    vecA[1] * val
  ]
}

function divide (vecA, val) {
  return [
    vecA[0] / val,
    vecA[1] / val
  ]
}

function drawBoid (boid) {
  const size = 8
  const [x, y] = boid.position
  const [xVel, yVel] = normalize(boid.velocity)
  ctx.fillStyle = 'rgb(20,20,20)'

  ctx.beginPath()
  ctx.moveTo(x + xVel * size, y + yVel * size)
  ctx.lineTo(x - yVel * size / 3, y + xVel * size / 3)
  ctx.lineTo(x + yVel * size / 3, y - xVel * size / 3)
  ctx.closePath()

  ctx.fill()
}

function main () {
  cancelAnimationFrame(rAFToken)
  rAFToken = requestAnimationFrame(loop)
}

main()
