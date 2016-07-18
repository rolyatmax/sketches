import Alea from 'alea'
import createCanvas from './common/create-canvas'

const seed = Math.random()
const rand = new Alea(seed)

const canvas = createCanvas(null, 30)
const ctx = window.ctx = canvas.getContext('2d')

ctx.globalCompositeOperation = 'darker'

const squareSize = 50
const step = 4

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
  const [ startX, startY ] = start
  const [ endX, endY ] = end

  let y = startY + step

  while (y < endY - step) {
    drawHorizontalLine(y)
    y += step + Math.pow(rand() * y / 250, 5)
  }

  function drawHorizontalLine (y) {
    ctx.beginPath()
    let x = startX
    ctx.moveTo(x, y)
    while (x < endX) {
      let randomY = Math.sin(y) * rand() + Math.sin(x) * Math.sqrt(y * x) / 100 * rand() + y
      ctx.lineTo(x, randomY)
      x += step
    }
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.lineWidth = 1
    if (rand() < 0.01) {
      const [r, g, b] = [255, 255, 255].map(c => c * rand() | 0)
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.5)`
      ctx.lineWidth = 2
    }
    ctx.stroke()
  }
}
