const canvasSketch = require('canvas-sketch')
const Alea = require('alea')
const vec2 = require('gl-vec2')
const { GUI } = require('dat-gui')

const WIDTH = 1024
const HEIGHT = 1024

const settings = {
  seed: 0,
  dotCount: 500,
  maxSize: 10,
  maxSpeed: 0.01,
  friction: 0.05,
  spread: 300,
  clear: 1,
  colorOffset: 0
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 1000).step(1).onChange(setup)
gui.add(settings, 'dotCount', 0, 30000).step(1)
gui.add(settings, 'maxSize', 0, 100)
gui.add(settings, 'maxSpeed', 0, 10)
gui.add(settings, 'friction', 0, 1)
gui.add(settings, 'spread', 0, 1000)
gui.add(settings, 'clear', 0, 1).step(0.01)
gui.add(settings, 'colorOffset', 0, 360)

let dots, rand

setup()
function setup () {
  rand = new Alea(settings.seed)
  dots = []
  let n = settings.dotCount
  while (n--) {
    dots.push(createDot())
  }
}

function createDot () {
  const position = [rand() * WIDTH, rand() * HEIGHT]
  return {
    position: position,
    lastPosition: vec2.add([], position, [rand() * 2 - 1, rand() * 2 - 1]),
    size: rand(),
    stroke: rand() < 0.5,
    color: rand()
  }
}

function update (time) {
  if (settings.dotCount < dots.length) {
    dots.length = settings.dotCount
  } else {
    while (dots.length < settings.dotCount) {
      dots.push(createDot())
    }
  }

  for (let dot of dots) {
    const v = vec2.subtract([], dot.position, dot.lastPosition)

    const angle = dot.color * Math.PI * 2 + time
    const gravitationalCenter = [
      Math.cos(angle) * dot.size * settings.spread + WIDTH / 2,
      Math.sin(angle) * dot.size * settings.spread + HEIGHT / 2
    ]

    const pull = vec2.subtract([], gravitationalCenter, dot.position)
    const dist = vec2.length(pull)
    vec2.normalize(pull, pull)
    vec2.scale(pull, pull, Math.min(dist, 0.5))
    vec2.add(v, v, pull)
    vec2.scale(v, v, 1 - settings.friction)

    dot.lastPosition = dot.position
    dot.position = vec2.add([], dot.position, v)
  }
}

function render (context, time) {
  for (let dot of dots) {
    const { position, size, stroke, color } = dot
    const colorOffset = position[0] > WIDTH / 2 ? settings.colorOffset : 0
    const c = `hsla(${color * 50 + time + colorOffset}, 50%, 50%, 0.5)`
    context.beginPath()
    context.arc(position[0], position[1], size * settings.maxSize, 0, Math.PI * 2)
    if (stroke) {
      context.strokeStyle = c
      context.stroke()
    } else {
      context.fillStyle = c
      context.fill()
    }
  }
}

const sketch = () => {
  return ({ context, canvas, time }) => {
    context.fillStyle = `rgba(255, 255, 255, ${settings.clear})`
    context.fillRect(0, 0, canvas.width, canvas.height)
    update(time)
    render(context, time)
  }
}

canvasSketch(sketch, {
  animate: true,
  dimensions: [WIDTH, HEIGHT],
  fps: 24
})
