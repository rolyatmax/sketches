/* global requestAnimationFrame cancelAnimationFrame */

// /////////// this has been moved to github.com/rolyatmax/boids.git

import Alea from 'alea'
import createResizableCanvas from './common/resizable-canvas'
import colorPalettes from './common/color-palettes.json'
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
  boidCount: 350,
  agility: 0.01,
  alignment: 80,
  cohesion: 20,
  separation: 20,
  size: 7,
  path: false
}

let colors = colorPalettes[rand() * colorPalettes.length | 0].slice(0, 3)
let boids = []
let boidsByColor = {}

let rAFToken = 0
function loop (t) {
  rAFToken = requestAnimationFrame(loop)
  update(t)
}

function update (t) {
  const speed = 2
  if (!settings.path) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  boids = boids.map(boid => align(boid, boidsByColor[boid.color]))
  boids = boids.map(boid => avoid(boid, boidsByColor[boid.color]))
  boids = boids.map(boid => cohere(boid, boidsByColor[boid.color]))

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
  window.boids = boids
}

function align (boid, boids) {
  let sum = [0, 0]
  let neighbors = 0
  boids.forEach(b => {
    const distance = dist(b.position, boid.position)
    if (distance > 0 && distance < settings.alignment) {
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

  const velocity = add(boid.velocity, steer)

  return {
    ...boid,
    velocity: velocity
  }
}

function cohere (boid, boids) {
  let sum = [0, 0]
  let neighbors = 0
  boids.forEach(b => {
    const distance = dist(b.position, boid.position)
    if (distance > 0 && distance < settings.cohesion) {
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
  if (!len) return vec
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
  const [x, y] = boid.position
  const [xVel, yVel] = normalize(boid.velocity)
  ctx.fillStyle = boid.color

  ctx.beginPath()
  ctx.moveTo(x + xVel * settings.size, y + yVel * settings.size)
  ctx.lineTo(x - yVel * settings.size / 3, y + xVel * settings.size / 3)
  ctx.lineTo(x + yVel * settings.size / 3, y - xVel * settings.size / 3)
  ctx.closePath()

  ctx.fill()
}

function main () {
  cancelAnimationFrame(rAFToken)

  while (settings.boidCount !== boids.length) {
    if (settings.boidCount > boids.length) {
      const angle = rand() * Math.PI * 2
      const boid = {
        position: [rand() * canvas.width, rand() * canvas.height],
        velocity: [Math.cos(angle), Math.sin(angle)],
        color: colors[rand() * colors.length | 0]
      }
      boids.push(boid)
    } else {
      boids.pop()
    }
  }
  cacheBoidsByColor()
  rAFToken = requestAnimationFrame(loop)
}

function cacheBoidsByColor () {
  // build a dictionary of boids by color
  boidsByColor = {}
  boids.forEach(boid => {
    boidsByColor[boid.color] = boidsByColor[boid.color] || []
    boidsByColor[boid.color].push(boid)
  })
}

function reset () {
  boids = []
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  main()
}

function changeColors () {
  colors = colorPalettes[rand() * colorPalettes.length | 0].slice(0, 3)
  boids.forEach(boid => {
    boid.color = colors[rand() * colors.length | 0]
  })
  cacheBoidsByColor()
}

reset()

const gui = new GUI({ closed: true })
gui.add(settings, 'boidCount', 1, 600).step(5).onFinishChange(main)
gui.add(settings, 'agility', 0.001, 0.1).step(0.001)
gui.add(settings, 'alignment', 0, 500).step(1)
gui.add(settings, 'cohesion', 0, 500).step(1)
gui.add(settings, 'separation', 0, 500).step(1)
gui.add(settings, 'size', 3, 100).step(1).onFinishChange(main)
gui.add(settings, 'path')
gui.add({ changeColors }, 'changeColors').onFinishChange(main)
gui.add({ reset }, 'reset')
