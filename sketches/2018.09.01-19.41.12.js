const canvasSketch = require('canvas-sketch')
const { GUI } = require('dat-gui')
const Alea = require('alea')
const vec2 = require('gl-vec2')

const WIDTH = 2048
const HEIGHT = 2048

const settings = {
  seed: 1,
  circlesCount: 500,
  maxRadius: 800,
  hueStart: 200,
  hueSpread: 50,
  opacity: 0.99,
  fill: true
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 1000).step(1).onChange(setup)
gui.add(settings, 'circlesCount', 1, 1000).step(1).onChange(setup)
gui.add(settings, 'maxRadius', 0, 1000).step(1).onChange(setup)
gui.add(settings, 'hueStart', 0, 360).onChange(setup)
gui.add(settings, 'hueSpread', 0, 360).onChange(setup)
gui.add(settings, 'opacity', 0, 1).step(0.01)
gui.add(settings, 'fill')

let circles = []

let q = 0

const neighborSideMap = {}

function setup () {
  const rand = new Alea(settings.seed)

  circles = []

  let n = settings.circlesCount
  while (n--) {
    if (circles.length === 0) {
      // create a random circle anywhere
      circles.push({
        id: q++,
        pos: [(rand() * 0.5 + 0.25) * WIDTH, (rand() * 0.5 + 0.25) * HEIGHT],
        r: rand() * settings.maxRadius,
        hue: rand() * settings.hueSpread + settings.hueStart,
        neighbors: []
      })
      continue
    }
    if (circles.length === 1 || rand() < 0.5) {
      // take the first circle and draw a second circle tangent to it
      const rads = rand() * Math.PI * 2
      const r = rand() * settings.maxRadius
      circles.push({
        id: q++,
        pos: [
          Math.cos(rads) * (r + circles[0].r) + circles[0].pos[0],
          Math.sin(rads) * (r + circles[0].r) + circles[0].pos[1]
        ],
        r: r,
        hue: rand() * settings.hueSpread + settings.hueStart,
        neighbors: [circles[0]]
      })
      circles[0].neighbors.push(circles[1])
      continue
    }
    // pick a random circle
    let circle1 = null
    while (circle1 === null || circle1.neighbors > 3) {
      circle1 = circles[circles.length * rand() | 0]
    }

    // then pick one of its neighbors
    let circle2 = circle1.neighbors[circle1.neighbors.length * rand() | 0]

    // order them deterministically so we can keep track of which side it has had neighbors added to
    if (circle2.id > circle1.id) {
      const tmp = circle1
      circle1 = circle2
      circle2 = tmp
    }

    const r = rand() * settings.maxRadius // * (circles.length / settings.circlesCount)

    const a = circle2.r + r
    const b = circle2.r + circle1.r
    const c = circle1.r + r

    // (b^2 + c^2 - a^2) / 2bc === cosA
    const angleA = Math.acos((Math.pow(b, 2) + Math.pow(c, 2) - Math.pow(a, 2)) / (2 * b * c))
    const c1Toc2Vec = vec2.subtract([], circle2.pos, circle1.pos)
    const c1Toc2Angle = Math.atan2(c1Toc2Vec[1], c1Toc2Vec[0])

    // pick a side to draw the circle on
    let side = rand() < 0.5 ? 1 : -1
    if (neighborSideMap[`${circle1.id}|${circle2.id}|${side}`]) {
      side *= -1
    }
    const rads = c1Toc2Angle + angleA * side

    // TODO:
    // does that side already have a circle drawn on it?
    // try the other side?
    // if so, pick a different neighbor
    // if no other neighbors, pick a different circle

    const circle3 = {
      id: q++,
      pos: [
        Math.cos(rads) * (r + circle1.r) + circle1.pos[0],
        Math.sin(rads) * (r + circle1.r) + circle1.pos[1]
      ],
      r: r,
      hue: rand() * settings.hueSpread + settings.hueStart,
      neighbors: [circle1, circle2]
    }

    circle1.neighbors.push(circle3)
    circle2.neighbors.push(circle3)

    neighborSideMap[`${circle1.id}|${circle2.id}|${side * -1}`] = true
    neighborSideMap[`${circle1.id}|${circle3.id}|${side * -1}`] = true
    neighborSideMap[`${circle2.id}|${circle3.id}|${side * -1}`] = true

    circles.push(circle3)
  }

  circles.sort((a, b) => b.r - a.r)
}

const sketch = () => {
  setup()
  return ({ context, width, height }) => {
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    context.lineWidth = 2

    for (const circle of circles) {
      drawCircle(context, circle.pos, circle.r, `hsla(${circle.hue}, 50%, 50%, ${settings.opacity})`, settings.fill)
    }
  }
}

canvasSketch(sketch, {
  dimensions: [WIDTH, HEIGHT],
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
