import Alea from 'alea'
import Color from 'color'
import Sketch from 'sketch-js'
import { GUI } from 'dat-gui'
import newArray from 'new-array'
import watercolor from 'watercolor-canvas'
import includeFont from './common/include-font'
import addTitle from './common/add-title'
import colorPalettes from './common/color-palettes'

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
  container: container
})
ctx.canvas.style.opacity = 0
ctx.canvas.style.transition = 'opacity 400ms ease'
ctx.canvas.style.position = 'absolute'
ctx.canvas.style.top = 0
ctx.canvas.style.left = 0
setTimeout(() => {
  ctx.canvas.style.opacity = 1
}, 200)

const title = addTitle('jocular-replace')
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
  seed: 442,
  palette: 145,
  colors: 5,
  spread: 737,
  sigma: 1.2,
  blend: 'lighten',
  cells: 2800,
  cellSize: 30,
  gridSize: 400,
  speed: 200,
  showWatercolor: true
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 1000).step(1).onChange(() => ctx.setup())
gui.add(settings, 'palette', 0, colorPalettes.length - 1).step(1).onChange(() => ctx.setup())
gui.add(settings, 'colors', 1, 6).step(1).onChange(() => ctx.setup())
gui.add(settings, 'spread', 1, 1000).onChange(() => ctx.setup())
gui.add(settings, 'sigma', 0.5, 3).onChange(() => ctx.setup())
gui.add(settings, 'blend', ['lighten', 'darken']).onChange(() => ctx.setup())
gui.add(settings, 'cells', 0, 5000).step(1).onChange(() => ctx.setup())
gui.add(settings, 'cellSize', 1, 100).onChange(() => ctx.setup())
gui.add(settings, 'gridSize', 20, 800).onChange(() => ctx.setup())
gui.add(settings, 'speed', 1, 1000).step(1)
gui.add(settings, 'showWatercolor').onChange(() => ctx.setup())

let rand

ctx.setup = ctx.resize = function () {
  watercolorCtx.canvas.style.visibility = settings.showWatercolor ? 'visible' : 'hidden'

  rand = new Alea(settings.seed)
  ctx.clearRect(0, 0, ctx.width, ctx.height)
  watercolorCtx.clearRect(0, 0, watercolorCtx.width, watercolorCtx.height)
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
    context: watercolorCtx,
    colors: colors
  })
  const draw = watercolor(params)
  draw()

  this.pixelPicker = makePixelPicker(watercolorCtx)
  const verticalPoints = ctx.height / settings.cellSize | 0
  const horizontalPoints = ctx.width / settings.cellSize | 0
  this.cells = newArray(settings.cells).map(() => {
    const points = pickPoints()
    const centroid = getCentroid(points)
    return { points, centroid }
  })

  function pickPoints () {
    const maxDistFromCenter = settings.gridSize
    while (true) {
      const point1 = [
        (rand() * horizontalPoints | 0) * settings.cellSize,
        (rand() * verticalPoints | 0) * settings.cellSize
      ]
      const point2 = [
        point1[0] + settings.cellSize * (rand() < 0.5 ? -1 : 1) / 2,
        point1[1] + settings.cellSize * (rand() < 0.5 ? -1 : 1) / 2
      ]
      const points = [
        point1,
        point2,
        [point2[0] + settings.cellSize, point2[1]],
        [point1[0] + settings.cellSize, point1[1]]
      ]
      if (points.some(p => squaredDistance(p, canvasCenter) < maxDistFromCenter * maxDistFromCenter)) {
        return points
      }
    }
  }
}

ctx.update = function () {
  const t = this.millis * settings.speed / 10000
  this.cells.forEach((cell, i) => {
    const pixel = [
      i / 10 + cell.centroid[0] + (i % 2 === 0 ? Math.sin(t) : 0) | 0,
      cell.centroid[1] + (i % 2 === 0 ? Math.cos(t) : 0) | 0
    ]
    const { r, g, b, a } = this.pixelPicker(pixel)
    cell.color = a < 0.05 ? 'white' : `rgb(${[r, g, b].join(',')})`
  })
}

ctx.draw = function draw () {
  this.cells.forEach(cell => drawPolygon(ctx, cell.points, cell.color))
}

function makePixelPicker (ctx) {
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height)
  return ([x, y]) => {
    const i = 4 * (x + y * imageData.width)
    return {
      r: imageData.data[i],
      g: imageData.data[i + 1],
      b: imageData.data[i + 2],
      a: imageData.data[i + 3]
    }
  }
}

function getCentroid (pts) {
  let total = [0, 0]
  pts.forEach(pt => {
    total[0] += pt[0]
    total[1] += pt[1]
  })
  return total.map(num => num / pts.length | 0)
}

function drawPolygon (ctx, points, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  points.slice(1).forEach(p => ctx.lineTo(p[0], p[1]))
  ctx.lineTo(points[0][0], points[0][1])
  ctx.fill()
  if (settings.showEdges) ctx.fill()
}

function squaredDistance (pt1, pt2) {
  const dx = pt1[0] - pt2[0]
  const dy = pt1[1] - pt2[1]
  return dy * dy + dx * dx
}
