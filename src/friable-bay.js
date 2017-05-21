import Alea from 'alea'
import Sketch from 'sketch-js'
import { GUI } from 'dat-gui'
import includeFont from './common/include-font'
import addTitle from './common/add-title'

includeFont({
  fontFamily: '"Space Mono", sans-serif',
  url: 'https://fonts.googleapis.com/css?family=Space+Mono:700'
})

const container = document.createElement('div')
document.body.appendChild(container)

const ctx = window.ctx = Sketch.create({
  container,
  autostart: false,
  autoclear: false
})
ctx.resize = draw
ctx.setup = draw // sketch-js: setup must exist in order for resize to actually fire :-(
ctx.canvas.style.opacity = 0
ctx.canvas.style.transition = 'opacity 400ms ease'
setTimeout(() => {
  ctx.canvas.style.opacity = 1
}, 200)

const title = addTitle('friable bay')
title.style.opacity = 0
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
  palette: 110,
  canvasPadding: 100,
  cellPadding: 20,
  cellWidth: 50,
  cellHeight: 50,
  startPow: 0.05,
  powIncrement: 0.15,
  backgroundColor: '#2e2e42',
  lineColor: 'rgba(250, 250, 250, 0.04)'
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 1000).onChange(draw)
gui.add(settings, 'canvasPadding', 0, 500).onChange(draw)
gui.add(settings, 'cellPadding', 0, 100).onChange(draw)
gui.add(settings, 'cellWidth', 1, 200).onChange(draw)
gui.add(settings, 'cellHeight', 1, 200).onChange(draw)
gui.add(settings, 'startPow', -2, 2).step(0.05).onChange(draw)
gui.add(settings, 'powIncrement', -1, 1).step(0.05).onChange(draw)

let rand

draw()

function draw () {
  ctx.globalCompositeOperation = 'lighten'
  clear()
  rand = new Alea(settings.seed)
  let { canvasPadding, cellPadding, cellWidth, cellHeight } = settings
  let width = ctx.width - canvasPadding * 2 - cellWidth
  let height = ctx.height - canvasPadding * 2 - cellHeight
  const cellTotalWidth = cellWidth + cellPadding
  const cellTotalHeight = cellHeight + cellPadding
  width = (width / cellTotalWidth | 0) * cellTotalWidth + cellWidth
  height = (height / cellTotalHeight | 0) * cellTotalHeight + cellHeight
  const canvasPaddingWidth = (ctx.width - width) / 2
  const canvasPaddingHeight = (ctx.height - height) / 2

  let pow = settings.startPow
  let y = canvasPaddingHeight
  while (y < ctx.height - canvasPaddingHeight) {
    let x = canvasPaddingWidth
    while (x < ctx.width - canvasPaddingWidth) {
      drawMiniCanvas(x, y, cellWidth, cellHeight, pow)
      x += cellTotalWidth
      pow += settings.powIncrement
    }
    y += cellTotalHeight
  }


  function drawMiniCanvas (x, y, width, height, pow) {
    const lines = []
    let i = 100
    while (i--) {
      lines.push([
        [Math.pow(rand(), pow) * width + x, Math.pow(rand(), pow) * height + y],
        [Math.pow(rand(), pow) * width + x, Math.pow(rand(), pow) * height + y],
        [Math.pow(rand(), pow) * width + x, Math.pow(rand(), pow) * height + y]
      ])
    }

    lines.forEach(line => drawLine(ctx, line, settings.lineColor))
  }

  function clear () {
    ctx.clearRect(0, 0, ctx.width, ctx.height)
    ctx.beginPath()
    ctx.rect(0, 0, ctx.width, ctx.height)
    ctx.fillStyle = settings.backgroundColor
    ctx.fill()
  }
}

function drawLine (ctx, line, color) {
  ctx.beginPath()
  ctx.strokeStyle = color
  ctx.moveTo(line[0][0], line[0][1])
  for (let pt of line.slice(1)) {
    ctx.lineTo(pt[0], pt[1])
  }
  ctx.stroke()
}
