const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const vec2 = require('gl-vec2')

const WIDTH = 1024
const HEIGHT = 1024

const settings = {
  seed: 1,
  cellSize: 25,
  outlineRatio: 2,
  freq: 0.045,
  timeRatio: 4.5,
  offsetSize: 35,
  canvasSize: 260,
  lineWidth: 4,
  opacity: 1,
  fill: true
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'cellSize', 5, 400)
gui.add(settings, 'outlineRatio', 0, 3).step(0.01)
gui.add(settings, 'freq', 0, 0.6).step(0.001)
gui.add(settings, 'timeRatio', 0, 5).step(0.01)
gui.add(settings, 'offsetSize', 0, 150)
gui.add(settings, 'canvasSize', 0, 1000)
gui.add(settings, 'lineWidth', 1, 50)
gui.add(settings, 'opacity', 0, 8).step(0.01)
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

        if (vec2.distance(center, [width / 2, height / 2]) > settings.canvasSize) {
          continue
        }

        const sizeNoise = rand.noise3D(x, y, time * settings.timeRatio, settings.freq) * 0.5 + 0.5
        const outlineSize = sizeNoise * settings.cellSize * settings.outlineRatio
        const opacityNoise = rand.noise3D(x + 100, y + 100, time * settings.timeRatio, settings.freq) * 0.5 + 0.5
        const offsetSizeNoise = rand.noise3D(x + 200, y + 200, time * settings.timeRatio, settings.freq) * 0.5 + 0.5
        const offsetDirNoise = rand.noise3D(x + 300, y + 300, time * settings.timeRatio, settings.freq) * 0.5 + 0.5
        const offset = [
          Math.cos(offsetDirNoise * Math.PI * 2) * offsetSizeNoise * settings.offsetSize,
          Math.sin(offsetDirNoise * Math.PI * 2) * offsetSizeNoise * settings.offsetSize
        ]
        vec2.add(center, center, offset)
        const pts = getHexPts(center, outlineSize)
        pts.push(pts[0])
        const colorNoise = rand.noise3D(x + 300, y + 300, time * settings.timeRatio, settings.freq) * 0.5 + 0.5
        const hue = colorNoise * 50 + 200
        drawLine(context, pts, `hsla(${hue}, 60%, 60%, ${opacityNoise * settings.opacity})`, settings.lineWidth, settings.fill)
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
