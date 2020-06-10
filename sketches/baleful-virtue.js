import Alea from 'alea'
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

const title = addTitle('baleful virtue')
title.style.opacity = 0
title.style.transition = 'opacity 400ms ease'
container.appendChild(title)
setTimeout(() => {
  title.style.opacity = 1
}, 200)

const canvas = createResizableCanvas(container, main, {
  margin: () => Math.min(win.innerHeight * 0.3, win.innerWidth * 0.3, 250)
})
const ctx = window.ctx = canvas.getContext('2d')
ctx.globalCompositeOperation = 'darker'

main()

function main () {
  const colors = colorPalettes[rand() * colorPalettes.length | 0]
  const squareSize = 50
  const step = 5

  let squareStartY = 0
  while (squareStartY < canvas.height - squareSize) {
    let squareStartX = 0
    while (squareStartX < canvas.width - squareSize) {
      const squareEndX = squareStartX + squareSize
      const squareEndY = squareStartY + squareSize
      createGrid([squareStartX, squareStartY], [squareEndX, squareEndY], step)
      squareStartX += squareSize + 10
    }
    squareStartY += squareSize + 10
  }

  function createGrid (start, end, step) {
    const [startX, startY] = start
    const [endX, endY] = end

    let y = startY + step

    while (y < endY - step) {
      drawHorizontalLine(y)
      y += step + Math.pow(rand() * y / 150, 10)
    }

    function drawHorizontalLine (y) {
      ctx.beginPath()
      let x = startX
      ctx.moveTo(x, y)
      while (x < endX) {
        const randomY = Math.sin(y) * rand() + Math.sin(x) * Math.sqrt(y * x) / 20 * rand() + y
        ctx.lineTo(x, randomY)
        x += step
      }
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
      ctx.lineWidth = 1
      if (rand() < 0.03) {
        ctx.strokeStyle = colors[rand() * colors.length | 0]
        ctx.lineWidth = 2
      }
      ctx.stroke()
    }
  }
}
