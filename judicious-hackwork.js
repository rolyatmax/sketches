import Alea from 'alea'
import createEncoder from 'encode-object'
import createResizableCanvas from './common/resizable-canvas'
import colorPalettes from './common/color-palettes'
import includeFont from './common/include-font'
import addTitle from './common/add-title'
import addTray from './common/add-tray'

const { encodeObject, decodeObject } = createEncoder({
  seed: ['int', 4],
  radiusStep: ['int', 2],
  radiusStart: ['int', 3],
  maxSteps: ['int', 4],
  angleStep: ['int', 3],
  radiusVariance: ['int', 3],
  angleVariance: ['int', 2],
  fill: ['int', 1],
  circleSize: ['int', 3]
})

let config = {
  seed: Math.random() * 1000 | 0, // 4 digits
  radiusStep: 16, // 2 digits
  radiusStart: 20, // 3 digits
  maxSteps: 200, // 4 digits
  angleStep: 8, // 3 digits
  radiusVariance: 15, // 3 digits
  angleVariance: 12, // 2 digits
  fill: 1, // 1 digit
  circleSize: 4 // 3 digits
}

const curHash = window.location.hash.slice(1)
if (curHash) {
  config = decodeObject(curHash)
}

let hash = encodeObject(config)
let title

const container = document.createElement('div')
document.body.appendChild(container)

includeFont({
  fontFamily: '"Space Mono", sans-serif',
  url: 'https://fonts.googleapis.com/css?family=Space+Mono:700'
})

const tiles = [
  'bea00011B000a0k000k0f7',
  'bea00011B000a0k000k06A',
  'bea01010a001C001s010fI',
  'bea0a0c0a101C1s0901032',
  'bea080c04103e0k0g0f04H'
].map((tileHash) => {
  const cfg = decodeObject(tileHash)
  return {
    config: cfg,
    hash: tileHash,
    main: main,
    onClick: () => {
      hash = tileHash
      config = cfg
      main(canvas, config)
    }
  }
})
addTray(tiles, container)

const canvas = createResizableCanvas(container, () => main(canvas, config), { margin: 80 })
canvas.style.opacity = 0
setTimeout(() => {
  canvas.style.opacity = 1
  canvas.style.transition = 'opacity 400ms ease'
}, 200)

main(canvas, config)

function main (cvs, cfg) {
  if (title) title.remove()
  title = addTitle(hash)
  title.style.opacity = 0
  container.appendChild(title)
  setTimeout(() => {
    title.style.opacity = 1
    title.style.transition = 'opacity 400ms ease'
  }, 400)

  const ctx = window.ctx = cvs.getContext('2d')
  ctx.globalCompositeOperation = 'darker'
  ctx.clearRect(0, 0, cvs.width, cvs.height)
  const rand = new Alea(cfg.seed)
  const maxDist = Math.min(cvs.height, cvs.width) / 2 | 0

  const colors = colorPalettes[rand() * colorPalettes.length | 0]
  const centerX = cvs.width / 2 | 0
  const centerY = cvs.height / 2 | 0
  const angleStep = cfg.angleStep / 100
  const radiusStep = cfg.radiusStep / 10
  let angle = 0
  let radius = cfg.radiusStart
  let steps = 0

  while (steps < cfg.maxSteps) {
    const r = radius + (rand() - 0.5) * cfg.radiusVariance
    const a = angle + (rand() - 0.5) * cfg.angleVariance / 10
    const x = centerX + Math.cos(a) * r
    const y = centerY + Math.sin(a) * r

    ctx.strokeStyle = colors[rand() * colors.length | 0]
    ctx.fillStyle = colors[rand() * colors.length | 0]
    ctx.beginPath()
    const circleRadius = (maxDist - radius) * rand() * cfg.circleSize / 100
    ctx.arc(x, y, Math.max(circleRadius, 0), 0, 2 * Math.PI)
    if (cfg.fill) ctx.fill()
    else ctx.stroke()

    angle += angleStep
    radius += radiusStep
    steps += 1
  }
}
