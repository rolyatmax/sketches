const canvasSketch = require('canvas-sketch')
const colors = require('nice-color-palettes')
const { GUI } = require('dat-gui')
const Alea = require('alea')
const { randomNormal } = require('d3-random')
const { createSpring } = require('spring-animator')

const WIDTH = 800
const HEIGHT = 800

const settings = {
  dimensions: [WIDTH, HEIGHT],
  animate: true,
  fps: 24
}

const sketch = ({ render }) => {
  const params = {
    seed: 0,
    palette: 82,
    shapes: 100,
    maxDistFromCenter: 1.8,
    maxRadius: 89,
    lineWidth: 10,
    strokeWidth: 1,
    pageMargin: 0,
    maxRotation: 0.02,
    lineAngle: 0.68,
    crossLines: 3,
    crossLineWidth: 4,
    mu: 0.5,
    sigma: 0.5,
    dampening: 0.1,
    stiffness: 0.3,
    showCrossLines: false,
    fillShapes: false
  }

  const gui = new GUI()
  gui.add(params, 'seed', 0, 999).step(1).onChange(setup)
  gui.add(params, 'palette', 0, colors.length - 1).step(1).onChange(setup)
  gui.add(params, 'shapes', 0, 1000).step(1).onChange(setup)
  gui.add(params, 'maxDistFromCenter', 0, 2).step(0.01).onChange(setup)
  gui.add(params, 'maxRadius', 0, 200).onChange(setup)
  gui.add(params, 'lineWidth', 0, 200).onChange(setup)
  gui.add(params, 'strokeWidth', 0, 200).onChange(setup)
  gui.add(params, 'pageMargin', 0, 0.5).step(0.01).onChange(setup)
  gui.add(params, 'maxRotation', 0, 1).step(0.01).onChange(setup)
  gui.add(params, 'lineAngle', 0, 1).onChange(setup)
  gui.add(params, 'crossLines', 0, 100).step(1).onChange(setup)
  gui.add(params, 'crossLineWidth', 0, 50).onChange(setup)
  gui.add(params, 'mu', 0, 2).step(0.01).onChange(setup)
  gui.add(params, 'sigma', 0, 1).step(0.01).onChange(setup)
  gui.add(params, 'dampening', 0, 1).step(0.01).onChange(setup)
  gui.add(params, 'stiffness', 0, 1).step(0.01).onChange(setup)
  gui.add(params, 'showCrossLines').onChange(setup)
  gui.add(params, 'fillShapes').onChange(setup)

  let startTime, rand, seededNormal, palette, bg, colorbars, stripes, shapes

  document.addEventListener('click', () => { params.seed = Math.random() })

  setup()

  function setup () {
    startTime = Date.now()
    rand = new Alea(params.seed)
    seededNormal = randomNormal.source(rand)
    const normal = seededNormal(params.mu, params.sigma)

    palette = colors[params.palette]

    const w = WIDTH * (1 - params.pageMargin * 2)
    const h = HEIGHT * (1 - params.pageMargin * 2)
    bg = {
      fill: palette[0],
      x: WIDTH * params.pageMargin,
      y: HEIGHT * params.pageMargin,
      w: w,
      h: h,
      t: createSpring(params.dampening, params.stiffness, 0)
    }
    const remaining = palette.slice(1)
    colorbars = remaining.map((color, i) => {
      const offsetX = WIDTH * params.pageMargin
      const offsetY = HEIGHT * params.pageMargin
      const offset = (i + 1) / (remaining.length + 1) * w + offsetX
      return {
        stroke: color,
        width: params.lineWidth,
        start: [offset, offsetY],
        end: [offset, h + offsetY],
        t: createSpring(params.dampening, params.stiffness, 0)
      }
    })

    stripes = []
    let p = params.crossLines
    while (p--) {
      const x = normal() * WIDTH
      stripes.push({
        rotation: params.lineAngle * Math.PI,
        width: params.crossLineWidth * rand(),
        stroke: params.showCrossLines ? 'blue' : 'white',
        start: [x, -2 * HEIGHT],
        end: [x, 2 * HEIGHT],
        t: createSpring(params.dampening, params.stiffness, 0)
      })
    }

    shapes = []
    let n = params.shapes
    while (n--) {
      const mag = rand() * w * 0.5 * params.maxDistFromCenter
      const rads = rand() * Math.PI * 2
      const x = Math.cos(rads) * mag + WIDTH / 2
      const y = Math.sin(rads) * mag + HEIGHT / 2
      const r = rand() * params.maxRadius

      shapes.push({
        rotation: params.maxRotation * Math.PI * 2 * (rand() - 0.5),
        stroke: remaining[x / WIDTH * remaining.length | 0],
        width: params.strokeWidth,
        x: x,
        y: y,
        r: r,
        t: createSpring(params.dampening, params.stiffness, 0)
      })
    }
  }

  return ({ context, width, height }) => {
    const now = Date.now()
    context.clearRect(0, 0, width, height)
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    // update background square
    // bg.t += (1 - bg.t) * 0.1
    bg.t.updateValue(1)
    const bgT = bg.t.tick()

    // render background square
    context.fillStyle = bg.fill
    const w = bgT * bg.w
    const h = bgT * bg.h
    context.fillRect(bg.x, bg.y, w, h)

    // render colorbars
    const colorbarDelay = 400
    colorbars.forEach((colorbar, i) => {
      // update
      if (startTime + colorbarDelay + i * 100 < now) {
        // colorbar.t += (1 - colorbar.t) * 0.1
        colorbar.t.updateValue(1)
      }
      const t = colorbar.t.tick()

      // render
      context.beginPath()
      context.strokeStyle = colorbar.stroke
      context.lineWidth = colorbar.width
      context.moveTo(colorbar.start[0], colorbar.start[1])
      const y = (colorbar.end[1] - colorbar.start[1]) * t + colorbar.start[1]
      context.lineTo(colorbar.end[0], y)
      context.stroke()
    })

    // render stripes
    const stripeDelay = 300
    stripes.forEach((stripe) => {
      // update
      if (startTime + stripeDelay + stripe.start[0] < now) {
        // stripe.t += (1 - stripe.t) * 0.03
        stripe.t.updateValue(1)
      }
      const t = stripe.t.tick()

      // render
      context.save()
      context.beginPath()
      context.rotate(stripe.rotation)
      context.lineWidth = stripe.width
      context.strokeStyle = stripe.stroke
      context.moveTo(stripe.start[0], stripe.start[1])
      const y = (stripe.end[1] - stripe.start[1]) * t + stripe.start[1]
      context.lineTo(stripe.end[0], y)
      context.stroke()
      context.restore()
    })

    // render shapes
    const shapesDelay = 400
    shapes.forEach((shape) => {
      // update
      if (startTime + shapesDelay + shape.y < now) {
        // shape.t += (1 - shape.t) * 0.03
        shape.t.updateValue(1)
      }

      const t = shape.t.tick()

      // render
      context.save()
      context.beginPath()
      context.rotate(shape.rotation)
      context.strokeStyle = shape.stroke
      context.fillStyle = bg.color
      context.lineWidth = shape.width
      // context.arc(shape.x, shape.y, shape.r * shape.t, 0, Math.PI * 2)
      // context.stroke()
      const r = shape.r * t
      if (params.fillShapes) {
        context.fillRect(shape.x - r, shape.y - r, r * 2, r * 2)
      }
      context.strokeRect(shape.x - r, shape.y - r, r * 2, r * 2)
      context.restore()
    })
  }
}

canvasSketch(sketch, settings)
