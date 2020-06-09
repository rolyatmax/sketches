const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const vec2 = require('gl-vec2')

const WIDTH = 1024
const HEIGHT = 1024

const settings = {
  seed: 8778,
  cellSize: 31,
  outlineRatio: 0.9,
  elevationLimit: 0.31,
  freq: 0.35,
  timeRatio: 4.5,
  canvasSize: 270,
  lineWidth: 4.7,
  opacity: 0.5,
  fill: true
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'cellSize', 5, 400)
gui.add(settings, 'outlineRatio', 0, 3).step(0.01)
gui.add(settings, 'elevationLimit', 0, 1).step(0.01)
gui.add(settings, 'freq', 0, 0.6).step(0.001)
gui.add(settings, 'timeRatio', 0, 5).step(0.01)
gui.add(settings, 'canvasSize', 0, 1000)
gui.add(settings, 'lineWidth', 1, 50)
gui.add(settings, 'opacity', 0, 1).step(0.01)
gui.add(settings, 'fill')

let rand

function setup () {
  rand = random.createRandom(settings.seed)
}

function getHexCenter (x, y, size) {
  const dist = Math.sqrt(0.75) * size * 2
  return [
    (x + (y % 2 === 1 ? 0.5 : 0)) * dist,
    y * size * 1.5
  ]
}

function getHexPts (center, size) {
  const pts = []
  for (let i = 0; i < 6; i += 1) {
    const rads = Math.PI * 2 * (i + 0.5) / 6
    pts.push([
      Math.cos(rads) * size + center[0],
      Math.sin(rads) * size + center[1]
    ])
  }
  return pts
}

const sketch = () => {
  setup()
  return ({ context, width, height, time }) => {
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    for (let x = 0; x < width / settings.cellSize; x++) {
      for (let y = 0; y < height / settings.cellSize; y++) {
        const center = getHexCenter(x, y, settings.cellSize)

        const noise = rand.noise2D(x + 900, y + 900, settings.freq * 2) * 0.5 + 0.5
        if (noise < settings.elevationLimit) continue

        if (vec2.distance(center, [width / 2, height / 2]) > settings.canvasSize) {
          continue
        }

        const pts = getHexPts(center, settings.outlineRatio * settings.cellSize)
        pts.push(pts[0])
        const colorNoise = rand.noise3D(x + 300, y + 300, time * settings.timeRatio, settings.freq) * 0.5 + 0.5
        const hue = colorNoise * 50 + 200
        drawLine(context, pts, `hsla(${hue}, 40%, 40%, ${settings.opacity})`, settings.lineWidth, settings.fill)
      }
    }
  }
}

canvasSketch(sketch, {
  dimensions: [WIDTH, HEIGHT],
  animate: true
})

function drawLine (ctx, points, color, width = 1, fill = false) {
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (const pt of points.slice(1)) {
    ctx.lineTo(pt[0], pt[1])
  }
  if (fill) {
    ctx.fillStyle = color
    ctx.fill()
  } else {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.stroke()
  }
}
