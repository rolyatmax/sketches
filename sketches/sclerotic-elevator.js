// generating a normal distribution curve
const fit = require('canvas-fit')
const array = require('new-array')
const { GUI } = require('dat-gui')

const canvas = document.body.appendChild(document.createElement('canvas'))
fit(canvas)
const ctx = canvas.getContext('2d')

const padding = 250
const width = canvas.width - padding * 2
const height = 200
const points = 500
const settings = {
  mu: 0.5,
  sigma: 0.01,
  scale: 0.8,
  invert: false
}

const gui = new GUI()
gui.add(settings, 'mu', 0, 1).step(0.01).onChange(start)
gui.add(settings, 'sigma', 0, 2).step(0.01).onChange(start)
gui.add(settings, 'scale', 0, 1).step(0.01).onChange(start)
gui.add(settings, 'invert').onChange(start)

start()

function start () {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const { mu, sigma, scale, invert } = settings
  const values = array(points).map((_, i) => {
    const x = i / (points - 1)
    const y = (invert ? 1 - getYPosition(x) : getYPosition(x)) * scale
    return [x, y]
  })

  const yValues = values.map(([x, y]) => y)
  console.log('-------------------------')
  console.log('max', Math.max.apply(Math, yValues))
  console.log('min', Math.min.apply(Math, yValues))

  const line = values.map(([x, y]) => {
    return [
      x * width + padding,
      y * -height + height + padding
    ]
  })

  drawLine(ctx, line, '#555')

  function getYPosition (x) {
    // p(x) = (1 / Math.sqrt(2 * Math.PI * Math.pow(sigma, 2))) * Math.exp(-1 * Math.pow(x - mu, 2) / (2 * Math.pow(sigma, 2))
    const sigmaSquared = Math.pow(sigma, 2)
    return (1 / Math.sqrt(2 * Math.PI * sigmaSquared)) * Math.exp(-1 * Math.pow(x - mu, 2) / (2 * sigmaSquared))
  }
}

function drawLine (ctx, pts, color) {
  ctx.beginPath()
  ctx.strokeStyle = color
  ctx.moveTo(pts[0][0], pts[0][1])
  pts.slice(1).forEach(pt => ctx.lineTo(pt[0], pt[1]))
  ctx.stroke()
}
