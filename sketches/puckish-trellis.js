// Trying to make a bunch of circles that all touch each other - work in progress

// import Alea from 'alea'
import createResizableCanvas from './common/resizable-canvas'
// import colorPalettes from './common/color-palettes'
import includeFont from './common/include-font'
import addTitle from './common/add-title'

const win = window
// const seed = Math.random()
// const rand = new Alea(seed)

const container = document.createElement('div')
document.body.appendChild(container)

includeFont({
  fontFamily: '"Space Mono", sans-serif',
  url: 'https://fonts.googleapis.com/css?family=Space+Mono:700'
})

const title = addTitle('puckish trellis')
title.style.opacity = 0
title.style.transition = 'opacity 400ms ease'
container.appendChild(title)
setTimeout(() => {
  title.style.opacity = 1
}, 200)

const canvas = createResizableCanvas(container, main, {
  margin: () => Math.min(win.innerHeight * 0.1, win.innerWidth * 0.1, 150)
})
const ctx = window.ctx = canvas.getContext('2d')

const padding = 50
const minRadius = 20
const maxRadius = 50

const circles = []

function main () {
  const { width, height } = ctx.canvas
  const x = Math.random() * (width - padding) + padding
  const y = Math.random() * (height - padding) + padding
  const r = Math.random() * (maxRadius - minRadius) + minRadius
  circles.push([x, y, r])

  // find a second circle
  const r2 = Math.random() * (maxRadius - minRadius) + minRadius
  const rads = Math.random() * Math.PI * 2
  const x2 = Math.cos(rads) * (r2 + r) + x
  const y2 = Math.sin(rads) * (r2 + r) + y
  circles.push([x2, y2, r2])

  // find a third circle that touches the first two
  // const r3 = Math.random() * (maxRadius - minRadius) + minRadius

  // GOT STUCK - TAKING A BREAK HERE

  circles.forEach(([x, y, r]) => drawCircle([x, y], r))
}

main()

function drawCircle (pt, radius) {
  ctx.strokeStyle = '#333'
  ctx.beginPath()
  ctx.arc(pt[0], pt[1], radius, 0, Math.PI * 2)
  ctx.stroke()
}

// function distance (p1, p2) {
//   const xDiff = p1[0] - p2[0]
//   const yDiff = p1[1] - p2[1]
//   return Math.sqrt(xDiff * xDiff + yDiff * yDiff)
// }
