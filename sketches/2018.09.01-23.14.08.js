const canvasSketch = require('canvas-sketch')
const { GUI } = require('dat-gui')
const Alea = require('alea')
import Delaunator from 'delaunator'
const vec2 = require('gl-vec2')

const WIDTH = 2048
const HEIGHT = 2048

const settings = {
  seed: 1,
  circlesCount: 500,
  hueStart: 200,
  hueSpread: 50,
  opacity: 0.99,
  lineOpacity: 0.3,
  lineWidth: 2,
  fill: true
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 1000).step(1).onChange(setup)
gui.add(settings, 'circlesCount', 1, 10000).step(1).onChange(setup)
gui.add(settings, 'hueStart', 0, 360).onChange(setup)
gui.add(settings, 'hueSpread', 0, 360).onChange(setup)
gui.add(settings, 'opacity', 0, 1).step(0.01)
gui.add(settings, 'lineOpacity', 0, 1).step(0.01)
gui.add(settings, 'lineWidth', 0, 20)
gui.add(settings, 'fill')

let circles = []
let triangles
let q = 0

function setup () {
  const rand = new Alea(settings.seed)

  circles = []

  let n = settings.circlesCount
  while (n--) {
    const rads = rand() * Math.PI * 2
    const mag = Math.pow(rand(), 0.5) * WIDTH * 0.35
    const pos = [
      Math.cos(rads) * mag + WIDTH / 2,
      Math.sin(rads) * mag + HEIGHT / 2
    ]
    const hue = rand() * settings.hueSpread + settings.hueStart
    const sat = Math.pow(rand() * 0.5 + 0.2, 2) * 100 | 0
    const light = (rand() * 0.5 + 0.25) * 100 | 0
    const id = q++
    circles.push({ pos, hue, sat, light, id })
  }

  const delaunay = Delaunator.from(circles.map(c => c.pos))
  triangles = delaunay.triangles

  for (let i = 0; i < triangles.length; i += 3) {
    const circle1 = circles[triangles[i]]
    const circle2 = circles[triangles[i + 1]]
    const circle3 = circles[triangles[i + 2]]

    const a = vec2.distance(circle1.pos, circle2.pos)
    const b = vec2.distance(circle2.pos, circle3.pos)
    const c = vec2.distance(circle1.pos, circle3.pos)

    const x = (a - b + c) / 2
    const z = c - x
    const y = b - z

    circle1.radii = circle1.radii || []
    circle2.radii = circle2.radii || []
    circle3.radii = circle3.radii || []

    circle1.radii.push(x)
    circle2.radii.push(y)
    circle3.radii.push(z)
  }

  for (let circle of circles) {
    circle.r = circle.radii.reduce((tot, r) => tot + r, 0) / circle.radii.length
  }

  // circles.sort((a, b) => b.r - a.r)
}

const sketch = () => {
  setup()
  return ({ context, width, height, time }) => {
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    context.lineWidth = settings.lineWidth

    const hasDrawn = {}

    for (let circle of circles) {
      const color = `hsla(${circle.hue}, ${circle.sat}%, ${circle.light}%, ${settings.opacity})`
      drawCircle(context, circle.pos, 5, color, settings.fill)
      drawCircle(context, circle.pos, circle.r, color, settings.fill)
    }

    // draw lines * circles
    for (let i = 0; i < triangles.length; i += 3) {
      if (i > time * 1000) break
      const circle1 = circles[triangles[i]]
      const circle2 = circles[triangles[i + 1]]
      const circle3 = circles[triangles[i + 2]]
      drawLine(circle1, circle2)
      drawLine(circle2, circle3)
      drawLine(circle1, circle3)
    }

    function drawLine (circle1, circle2) {
      if (hasDrawn[`${circle1.id}|${circle2.id}`]) return
      hasDrawn[`${circle1.id}|${circle2.id}`] = true
      hasDrawn[`${circle2.id}|${circle1.id}`] = true

      const gradient = context.createLinearGradient(circle1.pos[0], circle1.pos[1], circle2.pos[0], circle2.pos[1])
      gradient.addColorStop(0, `hsla(${circle1.hue}, ${circle1.sat}%, ${circle1.light}%, ${settings.lineOpacity})`)
      gradient.addColorStop(1, `hsla(${circle2.hue}, ${circle2.sat}%, ${circle2.light}%, ${settings.lineOpacity})`)

      context.beginPath()
      context.moveTo(circle1.pos[0], circle1.pos[1])
      context.lineTo(circle2.pos[0], circle2.pos[1])
      context.strokeStyle = gradient
      context.stroke()
    }
  }
}

canvasSketch(sketch, {
  dimensions: [ WIDTH, HEIGHT ],
  animate: true
})

function drawCircle (ctx, pos, r, c = '#666666', fill = false) {
  ctx.beginPath()
  ctx.arc(pos[0], pos[1], r, 0, Math.PI * 2)
  if (fill) {
    ctx.fillStyle = c
    ctx.fill()
  } else {
    ctx.strokeStyle = c
    ctx.stroke()
  }
}
