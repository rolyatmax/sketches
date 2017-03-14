// baleful-virtue, but 3D

import Alea from 'alea'
import createCamera from 'perspective-camera'
import createResizableCanvas from './common/resizable-canvas'
import colorPalettes from './common/color-palettes'
import includeFont from './common/include-font'
import addTitle from './common/add-title'

const win = window
const seed = Math.random()
const rand = new Alea(seed)

const container = document.createElement('div')
document.body.appendChild(container)

includeFont({
  fontFamily: '"Space Mono", sans-serif',
  url: 'https://fonts.googleapis.com/css?family=Space+Mono:700'
})

const title = addTitle('ubiquitous virtue')
title.style.opacity = 0
title.style.transition = 'opacity 800ms linear'
container.appendChild(title)
setTimeout(() => {
  title.style.opacity = 1
}, 500)

const canvas = createResizableCanvas(container, main, {
  margin: () => Math.min(win.innerHeight * 0.3, win.innerWidth * 0.3, 250)
})
const ctx = window.ctx = canvas.getContext('2d')
ctx.globalCompositeOperation = 'darker'

main()

function main () {
  const camera = createCamera({
    viewport: [0, 0, canvas.width, canvas.height]
  })

  const center = [canvas.width / 2, canvas.height / 2]

  camera.identity()
  camera.translate([center[0], center[1] + 300, 100])
  camera.lookAt([center[0], center[1], 0])
  camera.update()

  const colors = colorPalettes[rand() * colorPalettes.length | 0]
  const squareSize = 50
  const step = 5

  let squareStartY = 0
  let squareEndY = canvas.height - squareSize
  while (squareStartY < squareEndY) {
    let squareStartX = 0
    while (squareStartX < canvas.width - squareSize) {
      const squareEndX = squareStartX + squareSize
      const squareEndY = squareStartY + squareSize

      createGrid([squareStartX, squareStartY], [squareEndX, squareEndY], step, camera)
      squareStartX += squareSize + 10
    }
    squareStartY += squareSize + 10
  }

  function createGrid (start, end, step, camera) {
    const [ startX, startY ] = start
    const [ endX, endY ] = end

    let y = startY + step

    while (y < endY - step) {
      drawHorizontalLine(y)
      y += step + Math.pow(rand() * y / 150, 10)
    }

    function drawHorizontalLine (y) {
      ctx.beginPath()
      let x = startX
      ctx.moveTo(...camera.project([x, y, 0]).map(v => v | 0))
      while (x < endX) {
        let randomY = Math.sin(y) * rand() + Math.sin(x) * Math.sqrt(y * x) / 50 * rand() + y
        let randomZ = Math.sin(y) * rand() + Math.sin(x) * Math.sqrt(y * x) / 20 * rand()
        ctx.lineTo(...camera.project([x, randomY, randomZ]).map(v => v | 0))
        x += step
      }
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
      ctx.lineWidth = 1
      if (rand() < 0.05) {
        ctx.strokeStyle = colors[rand() * colors.length | 0]
        ctx.lineWidth = 1
      }
      ctx.stroke()
    }
  }
}
