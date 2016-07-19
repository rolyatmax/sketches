import Alea from 'alea'
import createResizableCanvas from './common/resizable-canvas'
import colorPalettes from './common/color-palettes'
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

addTitle('judicious hackwork', container)

const canvas = createResizableCanvas(container, main, { margin: 80 })
const ctx = window.ctx = canvas.getContext('2d')
ctx.globalCompositeOperation = 'darker'

main()

function main () {
  const maxDist = Math.min(canvas.height, canvas.width) / 2 | 0

  const colors = colorPalettes[rand() * colorPalettes.length | 0]
  const centerX = canvas.width / 2 | 0
  const centerY = canvas.height / 2 | 0
  const angleStep = Math.PI * 0.7293
  const radiusStep = 0.7
  let angle = 0
  let radius = 20
  let steps = 0

  while (steps < 300) {
    const r = radius + (rand() - 0.5) * 20
    const a = angle + (rand() - 0.5)
    const x = centerX + Math.cos(a) * r
    const y = centerY + Math.sin(a) * r

    ctx.fillStyle = colors[rand() * colors.length | 0]
    ctx.beginPath()
    ctx.arc(x, y, (maxDist - radius) * rand() * 0.08, 0, 2 * Math.PI)
    ctx.fill()

    angle += angleStep
    radius += radiusStep
    steps += 1
  }
}
