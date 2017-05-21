import Alea from 'alea'
import Color from 'color'
import Sketch from 'sketch-js'
import { GUI } from 'dat-gui'
import newArray from 'new-array'
import SimplexNoise from 'simplex-noise'
import watercolor from 'watercolor-canvas'
import includeFont from './common/include-font'
import addTitle from './common/add-title'
import colorPalettes from './common/color-palettes'
import { randomNormal } from 'd3-random'

includeFont({
  fontFamily: '"Space Mono", sans-serif',
  url: 'https://fonts.googleapis.com/css?family=Space+Mono:700'
})

const container = document.body.appendChild(document.createElement('div'))

const watercolorCtx = Sketch.create({
  container: container,
  autostart: false,
  autoclear: false
})
const ctx = Sketch.create({
  container: container,
  autostart: false,
  autoclear: false
})
ctx.canvas.style.opacity = 0
ctx.canvas.style.transition = 'opacity 400ms ease'
ctx.canvas.style.position = 'absolute'
ctx.canvas.style.top = 0
ctx.canvas.style.left = 0
// ctx.canvas.style.zIndex = 1
setTimeout(() => {
  ctx.canvas.style.opacity = 1
}, 200)

const title = addTitle('rhadamanthine-cartload')
title.style.opacity = 0
title.style.color = 'white'
title.style.bottom = '5vh'
title.style.right = '5vh'
title.style.transition = 'opacity 400ms ease'
title.style.zIndex = 10
container.appendChild(title)
setTimeout(() => {
  title.style.opacity = 1
}, 200)

const settings = {
  seed: 293,
  palette: 104,
  colors: 4,
  spread: 412,
  sigma: 1.8,
  blend: 'lighten',
  backgroundColor: [30, 30, 30],
  boxCount: 1300,
  boxSize: 5,
  noiseSize: 18,
  sizeDistributionSigma: 15,
  positionDistributionSigma: 60,
  boxConcentration: 98
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 1000).step(1).onChange(() => ctx.setup())
gui.add(settings, 'palette', 0, colorPalettes.length - 1).step(1).onChange(() => ctx.setup())
gui.add(settings, 'colors', 1, 6).step(1).onChange(() => ctx.setup())
// gui.add(settings, 'spread', 1, 1000).onChange(() => ctx.setup())
gui.add(settings, 'sigma', 0.5, 3).onChange(() => ctx.setup())
// gui.add(settings, 'blend', ['lighten', 'darken']).onChange(() => ctx.setup())
gui.add(settings, 'boxCount', 0, 10000).step(10).onChange(() => ctx.setup())
gui.add(settings, 'boxSize', 1, 500).step(1).onChange(() => ctx.setup())
gui.add(settings, 'noiseSize', 1, 200).step(1).onChange(() => ctx.setup())
gui.add(settings, 'sizeDistributionSigma', 1, 100).step(1).onChange(() => ctx.setup())
gui.add(settings, 'positionDistributionSigma', 1, 500).step(1).onChange(() => ctx.setup())
gui.add(settings, 'boxConcentration', 1, 1000).step(1).onChange(() => ctx.setup())

let rand
let simplex
let randNormal

ctx.setup = ctx.resize = function () {
  rand = new Alea(settings.seed)
  simplex = new SimplexNoise(rand)
  randNormal = randomNormal.source(rand)
  clear(ctx, `rgba(${settings.backgroundColor.join(',')}, 0)`)
  clear(watercolorCtx, `rgb(${settings.backgroundColor.join(',')})`)
  setupBackground(watercolorCtx)

  // add boxes and stuff
  createBoxes(settings.boxCount).forEach((box) => {
    ctx.save()
    ctx.translate(box.center[0], box.center[1])
    ctx.rotate(box.rotation)
    drawRect(ctx, [0, 0], box.width, box.height, 'rgba(250, 250, 250, 0.6)')
    ctx.restore()
  })

  // addVignette(ctx)
  addVignette(watercolorCtx)
}

function createBoxes (count) {
  const center = [ctx.width / 2, ctx.height / 2]
  const randX = randNormal(center[0], settings.positionDistributionSigma)
  const randY = randNormal(center[1], settings.positionDistributionSigma)
  const normalSize = randNormal(settings.boxSize, settings.sizeDistributionSigma)
  return newArray(count).map(() => {
    const rads = rand() * Math.PI * 2
    const mag = Math.pow(rand(), rand() * 2 - 1) * settings.boxConcentration
    const boxCenter = [
      Math.cos(rads) * mag + randX(),
      Math.sin(rads) * mag + randY()
    ]
    const noiseSize = (sizeOffset = 0) => (settings.noiseSize + sizeOffset) / 100000
    const noise1 = simplex.noise2D(boxCenter[0] * noiseSize(10), boxCenter[1] * noiseSize(10))
    const noise2 = simplex.noise2D(boxCenter[0] * noiseSize() + 1000, boxCenter[1] * noiseSize() + 1000)
    const rotation = (noise1 + noise2) * Math.PI

    const size = normalSize()

    return {
      center: boxCenter,
      width: size * 2,
      height: size * 0.2,
      rotation: rotation
    }
  })
}

function setupBackground (ctx) {
  const initialGlobaleCompositeOperation = ctx.globalCompositeOperation
  const canvasCenter = [ctx.width / 2, ctx.height / 2]
  const colors = colorPalettes[settings.palette]
    .slice(0, settings.colors)
    .map((hex) => {
      const color = Color(hex).rgb().array()
      const rads = rand() * Math.PI * 2
      const dist = Math.pow(rand(), 0.5) * settings.spread
      const position = [
        Math.cos(rads) * dist + canvasCenter[0],
        Math.sin(rads) * dist + canvasCenter[1]
      ]
      return { color, position }
    })
  const params = Object.assign({}, settings, {
    randomFn: rand,
    context: ctx,
    colors: colors
  })
  const draw = watercolor(params)
  draw()
  ctx.globalCompositeOperation = initialGlobaleCompositeOperation
}

function drawRect (ctx, position, width, height, color) {
  ctx.beginPath()
  ctx.rect(position[0], position[1], width, height)
  ctx.strokeStyle = color
  ctx.clearRect(position[0], position[1], width, height)
  ctx.stroke()
}

function addVignette (ctx) {
  const initialGlobaleCompositeOperation = ctx.globalCompositeOperation
  const center = [ctx.width / 2, ctx.height / 2]
  const vignetteRadius = 0 // Math.min(center[0], center[1]) - 350
  const grd = ctx.createRadialGradient(center[0], center[1], vignetteRadius, center[0], center[1], Math.max(center[0], center[1]) - 50)
  ctx.globalCompositeOperation = 'darken'
  grd.addColorStop(0, `rgba(${settings.backgroundColor.join(',')}, 0.4)`)
  grd.addColorStop(1, `rgba(${settings.backgroundColor.join(',')}, 0.9)`)
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, ctx.width, ctx.height)
  ctx.globalCompositeOperation = initialGlobaleCompositeOperation
}

function clear (ctx, color) {
  ctx.clearRect(0, 0, ctx.width, ctx.height)
  ctx.beginPath()
  ctx.rect(0, 0, ctx.width, ctx.height)
  ctx.fillStyle = color
  ctx.fill()
}
