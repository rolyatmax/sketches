import Alea from 'alea'
// import Color from 'color'
import fit from 'canvas-fit'
import { GUI } from 'dat-gui'
import vec2 from 'gl-vec2'
import newArray from 'new-array'
import watercolor from 'watercolor-canvas'
import includeFont from './common/include-font'
import addTitle from './common/add-title'
import { randomNormal } from 'd3-random'
// import colorPalettes from './common/color-palettes'

includeFont({
  fontFamily: '"Space Mono", sans-serif',
  url: 'https://fonts.googleapis.com/css?family=Space+Mono:700'
})

const canvas = document.body.appendChild(document.createElement('canvas'))
const resize = fit(canvas)
window.addEventListener('resize', () => { resize(); render() }, false)
const ctx = canvas.getContext('2d')

canvas.style.opacity = 0
canvas.style.transition = 'opacity 400ms ease'
canvas.style.position = 'absolute'
canvas.style.top = 0
canvas.style.left = 0
setTimeout(() => {
  canvas.style.opacity = 1
}, 200)

const title = addTitle('irksome-stepmother')
title.style.opacity = 0
title.style.bottom = '5vh'
title.style.right = '5vh'
title.style.transition = 'opacity 400ms ease'
title.style.zIndex = 10
document.body.appendChild(title)
setTimeout(() => {
  title.style.opacity = 1
}, 200)

const BATCH_SIZE = 10000
const settings = {
  seed: 76,
  colors: 2,
  colorSpread: 800,
  colorSigma: 1.2,
  dotCount: 65000,
  dotSize: 0.1,
  dotOpacity: 0.01,
  opacitySigma: 0.2,
  mu: 970,
  sigma: 15,
  pow: 0.2,
  steps: 7
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 1000).step(1).onChange(render)
gui.add(settings, 'colors', 1, 5).step(1).onChange(render)
gui.add(settings, 'colorSpread', 100, 1000).step(1).onChange(render)
gui.add(settings, 'colorSigma', 0.1, 3).step(0.1).onChange(render)
gui.add(settings, 'dotCount', 1000, 100000).step(100).onChange(render)
gui.add(settings, 'dotSize', 0.1, 10).onChange(render)
gui.add(settings, 'dotOpacity', 0.01, 1).step(0.01).onChange(render)
gui.add(settings, 'opacitySigma', 0.1, 2).step(0.1).onChange(render)
gui.add(settings, 'mu', 1, 1000).onChange(render)
gui.add(settings, 'sigma', 0.1, 100).step(0.1).onChange(render)
gui.add(settings, 'pow', -1, 5).step(0.1).onChange(render)
gui.add(settings, 'steps', 1, 50).step(1).onChange(render)

let callbackTokens = []

render()

function render () {
  callbackTokens.forEach(cancelIdleCallback)
  callbackTokens = []
  const { width, height } = canvas
  const rand = new Alea(settings.seed)
  // const normalMag = randomNormal.source(rand)(settings.mu, settings.sigma)
  const normalMag = () => Math.pow(rand(), settings.pow) * settings.mu
  const normalOpacity = randomNormal.source(rand)(settings.dotOpacity, settings.opacitySigma)

  // background
  ctx.clearRect(0, 0, width, height)
  // ctx.fillStyle = '#20333d'
  // ctx.fillRect(0, 0, width, height)

  const canvasCenter = [width / 2, height / 2]

  const dots = []
  let k = settings.dotCount
  while (k--) {
    dots.push(createDot())
  }

  // paint background
  const colors = newArray(settings.colors)
    .map(() => {
      const color = [20 + rand() * 115 | 0, 20 + rand() * 115 | 0, 20 + rand() * 125 | 0]
      const rads = rand() * Math.PI * 2
      const dist = Math.pow(rand(), 0.5) * settings.colorSpread
      const position = [
        Math.cos(rads) * dist + canvasCenter[0],
        Math.sin(rads) * dist + canvasCenter[1]
      ]
      return { color, position }
    })

  const params = {
    sigma: settings.colorSigma,
    randomFn: rand,
    context: ctx,
    colors: colors
  }
  const draw = watercolor(params)
  draw()

  drawStep()

  // draw
  let step = 0
  function drawStep () {
    const startTs = performance.now()
    let j = 0
    while (j < dots.length) {
      const k = j
      const token = requestIdleCallback(() => {
        console.log(k)
        const batchSize = Math.min(BATCH_SIZE, dots.length - k)
        renderBatch(k, batchSize)
        if (k + batchSize >= dots.length) {
          console.log('Done rendering!', performance.now() - startTs)
          step += 1
          if (step < settings.steps) {
            updateDots()
            drawStep()
          }
        }
      })
      callbackTokens.push(token)
      j += BATCH_SIZE
    }
  }
  const attractorPosition = [width * rand(), height * rand()]
  function updateDots () {
    dots.forEach(d => {
      // go through forces, adding to velocity
      const wind = [-0.02, -0.01]
      const dist = vec2.distance(d.position, attractorPosition)
      const vecTowardsAttractor = vec2.subtract([], attractorPosition, d.position)
      const pull = vec2.scale(vecTowardsAttractor, vecTowardsAttractor, Math.pow(dist, 2) / 50000000)
      vec2.add(d.velocity, d.velocity, pull)
      vec2.add(d.velocity, d.velocity, wind) // wind
      vec2.scale(d.velocity, d.velocity, 0.40 + 0.6 * rand())
      vec2.add(d.position, d.position, d.velocity)
      const wander = [
        Math.cos(d.wander * Math.PI * 2) * 0.5,
        Math.sin(d.wander * Math.PI * 2) * 0.5
      ]
      vec2.add(d.position, d.position, wander)
      const speed = vec2.length(d.velocity)
      d.opacity = speed / 20
    })
  }

  function createDot () {
    const rads = rand() * Math.PI * 2
    const mag = normalMag()
    const position = [
      Math.cos(rads) * mag + canvasCenter[0],
      Math.sin(rads) * mag + canvasCenter[1]
    ]
    const velocity = [0, 0]
    const opacity = normalOpacity()
    const distFromCenter = vec2.distance(canvasCenter, position)
    const wander = Math.pow(rand(), distFromCenter / settings.mu)
    return { position, velocity, opacity, wander }
  }

  function renderBatch (startIdx, batchSize) {
    for (let i = startIdx; i < startIdx + batchSize; i++) {
      const d = dots[i]
      drawCircle(ctx, d.position, settings.dotSize, `rgba(218, 218, 225, ${d.opacity})`)
    }
  }
}

function drawCircle (ctx, position, size, color) {
  ctx.beginPath()
  ctx.fillStyle = color
  ctx.arc(position[0], position[1], size, 0, Math.PI * 2)
  ctx.fill()
}
