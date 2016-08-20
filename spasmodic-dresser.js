/* global requestAnimationFrame cancelAnimationFrame */

import Alea from 'alea'
import createResizableCanvas from './common/resizable-canvas'
import includeFont from './common/include-font'
import addTitle from './common/add-title'
import {GUI} from 'dat-gui'

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
title.style.position = 'absolute'
title.style.bottom = title.style.right = '40px'
container.appendChild(title)
setTimeout(() => {
  title.style.opacity = 1
}, 200)

const canvas = createResizableCanvas(container, main, { margin: 0 })
const ctx = window.ctx = canvas.getContext('2d')
ctx.globalCompositeOperation = 'darker'

const settings = {
  boidCount: 100,
  agility: 0.01,
  neighborRadius: 100,
  separation: 30,
  path: 0
}

let rAFToken = 0

let boids = []

function loop (t) {
  rAFToken = requestAnimationFrame(loop)
  update(t)
}

function update (t) {
  const speed = 2
  if (settings.path) {
    const alpha = 1 - (settings.path / 100)
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

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
    if (distance > 0 && distance < settings.neighborRadius) {
      sum = add(sum, b.velocity)
      neighbors += 1
    }
  })
  if (!neighbors) return boid

  sum = divide(sum, neighbors)
  sum = normalize(sum)
  let steer = subtract(sum, boid.velocity)
  steer = normalize(steer)
  steer = multiply(steer, settings.agility)

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
    if (distance > 0 && distance < settings.neighborRadius) {
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
  steer = multiply(steer, settings.agility)

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
    if (distance > 0 && distance < settings.separation) {
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
  steer = multiply(steer, settings.agility)

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

  while (settings.boidCount !== boids.length) {
    if (settings.boidCount > boids.length) {
      const angle = rand() * Math.PI * 2
      boids.push({
        position: [rand() * canvas.width, rand() * canvas.height],
        velocity: [Math.cos(angle), Math.sin(angle)]
      })
    } else {
      boids.pop()
    }
  }

  rAFToken = requestAnimationFrame(loop)
}

function reset () {
  boids = []
  main()
}

reset()

const gui = new GUI()
gui.add(settings, 'boidCount', 1, 500).step(1).onFinishChange(main)
gui.add(settings, 'agility', 0.001, 0.1).step(0.001)
gui.add(settings, 'neighborRadius', 0, 500).step(1)
gui.add(settings, 'separation', -100, 500).step(1)
gui.add(settings, 'path', 0, 100).step(1)
gui.add({ reset }, 'reset')
