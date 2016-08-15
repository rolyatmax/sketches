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

const canvas = createResizableCanvas(container, main, {
  margin: 20
})
const ctx = window.ctx = canvas.getContext('2d')
ctx.globalCompositeOperation = 'darker'

const settings = {
  boidCount: 100
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
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  boids = boids.map(boid => align(boid, boids))

  boids = boids.map(boid => {
    let [x, y] = boid.position
    const [xVel, yVel] = boid.velocity
    x += xVel
    y += yVel
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
  const neighborThreshold = 50
  const steerLimit = 0.05
  let sum = [0, 0]
  let neighbors = 0
  boids.forEach(b => {
    const distance = dist(b.position, boid.position)
    if (distance > 0 && distance < neighborThreshold) {
      sum[0] += b.velocity[0]
      sum[1] += b.velocity[1]
      neighbors += 1
    }
  })
  if (!neighbors) return boid

  sum[0] /= neighbors
  sum[1] /= neighbors

  sum = normalize(sum)

  let steer = [sum[0] - boid.velocity[0], sum[1] - boid.velocity[1]]
  steer = normalize(steer)

  return {
    ...boid,
    velocity: [boid.velocity[0] + steer[0] * steerLimit, boid.velocity[1] + steer[1] * steerLimit]
  }
}

function avoid (boid, boids) {
  const neighborThreshold = 50
  const steerLimit = 0.05
  let sum = [0, 0]
  let neighbors = 0
  boids.forEach(b => {
    const distance = dist(b.position, boid.position)
    if (distance > 0 && distance < neighborThreshold) {
      sum[0] += b.velocity[0]
      sum[1] += b.velocity[1]
      neighbors += 1
    }
  })
  if (!neighbors) return boid

  sum[0] /= neighbors
  sum[1] /= neighbors

  sum = normalize(sum)

  let steer = [sum[0] - boid.velocity[0], sum[1] - boid.velocity[1]]
  steer = normalize(steer)

  return {
    ...boid,
    velocity: [boid.velocity[0] + steer[0] * steerLimit, boid.velocity[1] + steer[1] * steerLimit]
  }
}

function normalize (vec) {
  const len = dist([0, 0], vec)
  return [vec[0] / len, vec[1] / len]
}

function dist (vecA, vecB) {
  const xDiff = vecA[0] - vecB[0]
  const yDiff = vecA[1] - vecB[1]
  return Math.sqrt(xDiff * xDiff + yDiff * yDiff)
}

function drawBoid (boid) {
  const size = 8
  const [x, y] = boid.position
  const [xVel, yVel] = boid.velocity
  ctx.fillStyle = 'rgb(20,20,20)'

  ctx.beginPath()
  ctx.moveTo(x + xVel * size, y + yVel * size)
  ctx.lineTo(x - yVel * size / 3, y + xVel * size / 3)
  ctx.lineTo(x + yVel * size / 3, y - xVel * size / 3)
  ctx.closePath()

  ctx.fill()
  // ctx.fillRect(x, y, size, size)
}

function main () {
  cancelAnimationFrame(rAFToken)
  rAFToken = requestAnimationFrame(loop)
}

main()
