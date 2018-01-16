const Sketch = require('sketch-js')
const Alea = require('alea')
const { GUI } = require('dat-gui')
const { createSpring } = require('spring-animator')
import includeFont from './common/include-font'
import addTitle from './common/add-title'
const css = require('dom-css')

title('precipitate-shark', '#555')

const hiddenCtx = Sketch.create({ autoclear: false })
hiddenCtx.canvas.style.display = 'none'

const ctx = Sketch.create()
ctx.canvas.style.opacity = 0
ctx.canvas.style.transition = 'opacity 400ms ease'
setTimeout(() => {
  ctx.canvas.style.opacity = 1
}, 200)

const settings = guiSettings({
  seed: [Math.random() * 1000 | 0, 0, 1000, 1, true],
  particles: [1000, 500, 5000, 1, true],
  dampening: [0.2, 0, 1, 0.01, true],
  stiffness: [0.2, 0, 1, 0.01, true],
  speed: [140, 1, 400, 1],
  precision: [0.7, 0.01, 1, 0.01],
  lineOpacity: [0.05, 0, 0.5, 0.01],
  turnGranularity: [25, 1, 100, 1],
  startSpread: [180, 0, 800, 1, true],
  drawCircles: [true]
}, () => {
  ctx.setup()
})

let rand, points, keyCode

// document.addEventListener('keydown', (e) => {
//   if (keyCode) return
//   ctx.setup()
//   keyCode = e.which
//   const size = Math.min(hiddenCtx.width, hiddenCtx.height) * 0.8
//   printText(hiddenCtx, String.fromCharCode(keyCode), size)
// })

function printText (context, text, size) {
  context.font = `bold ${size}px Helvetica`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, context.canvas.width / 2, context.canvas.height / 2)
}

// document.addEventListener('keyup', (e) => {
//   if (keyCode !== e.which) return
//   keyCode = null
//   hiddenCtx.clear()
// })

ctx.setup = function setup () {
  rand = new Alea(settings.seed)
  printText(hiddenCtx, 'tb', Math.min(hiddenCtx.width, hiddenCtx.height) * 0.5)
  points = (new Array(settings.particles)).fill().map(() => {
    const rads = rand() * Math.PI * 2
    const mag = Math.pow(rand(), 0.5) * settings.startSpread
    return {
      x: Math.cos(rads) * mag + ctx.width / 2,
      y: Math.sin(rads) * mag + ctx.height / 2,
      angle: createSpring(settings.dampening, settings.stiffness, rand() * Math.PI * 2),
      speed: rand() * settings.speed / 40,
      size: createSpring(settings.dampening, settings.stiffness, 0),
      entropy: rand(),
      line: []
    }
  })
}

ctx.update = function update () {
  const pixelPicker = makePixelPicker(hiddenCtx.canvas)
  points.forEach((p) => {
    const color = pixelPicker(p.x, p.y)
    const isActive = !!color.a || p.line.length

    if (rand() < settings.precision) {
      if (isActive) {
        p.line.push([p.x, p.y])
      }
      updateNextAngle(p, pixelPicker)
    }

    const angle = p.angle.tick()
    const velX = Math.cos(angle) * p.speed
    const velY = Math.sin(angle) * p.speed
    p.x += velX
    p.y += velY
    p.isActive = isActive
  })
}

function updateNextAngle (p, pixelPicker) {
  const angle = p.angle.tick(1, false)
  for (let i = 0; i <= settings.turnGranularity; i += 1) {
    const t = i / settings.turnGranularity * Math.PI
    let velX = Math.cos(angle + t) * p.speed
    let velY = Math.sin(angle + t) * p.speed
    let pixel = pixelPicker(p.x + velX, p.y + velY)
    if (pixel.a) {
      p.angle.updateValue(angle + t)
      break
    }
    velX = Math.cos(angle - t) * p.speed
    velY = Math.sin(angle - t) * p.speed
    pixel = pixelPicker(p.x + velX, p.y + velY)
    if (pixel.a) {
      p.angle.updateValue(angle - t)
      break
    }
  }
}

ctx.draw = function draw () {
  if (settings.drawCircles) {
    points.forEach((p) => {
      const radius = p.line.length ? 2 : 0
      const opacity = 0.3 * (radius < 10 ? radius / 10 : 1)
      ctx.strokeStyle = `rgba(30, 30, 30, ${opacity})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
      ctx.stroke()
    })
  }

  ctx.beginPath()
  ctx.strokeStyle = `rgba(30, 30, 30, ${settings.lineOpacity / 2})`
  points.forEach((p) => {
    if (p.line.length) {
      ctx.moveTo(p.line[0][0], p.line[0][1])
      p.line.slice(1).forEach(pt => {
        ctx.lineTo(pt[0], pt[1])
      })
      // ctx.strokeStyle = `rgba(30, 30, 30, ${opacity * settings.lineOpacity})`
    }
  })
  ctx.stroke()
}

// ---------- HELPERS ----------------

function guiSettings (settings, onChange) {
  const settingsObj = {}
  const gui = new GUI()
  for (let key in settings) {
    settingsObj[key] = settings[key][0]
    const setting = gui
      .add(settingsObj, key, settings[key][1], settings[key][2])
    if (settings[key][3]) {
      setting.step(settings[key][3])
    }
    if (settings[key][4]) {
      setting.onChange(onChange)
    }
  }
  gui.add({ reset: onChange }, 'reset')
  return settingsObj
}

function title (name, color) {
  includeFont({
    fontFamily: '"Space Mono", sans-serif',
    url: 'https://fonts.googleapis.com/css?family=Space+Mono:700'
  })

  const title = addTitle(name)
  css(title, {
    opacity: 0,
    color: color,
    bottom: '5vh',
    right: '5vh',
    transition: 'opacity 800ms linear',
    zIndex: 10
  })

  document.body.appendChild(title)
  setTimeout(() => {
    css(title, 'opacity', 1)
  }, 200)
}

function makePixelPicker (canvas) {
  const imageData = canvas.getContext('2d').getImageData(
    0, 0, canvas.width, canvas.height
  )
  return (x, y) => {
    x = x | 0
    y = y | 0
    const i = 4 * (x + y * imageData.width)
    return {
      r: imageData.data[i],
      g: imageData.data[i + 1],
      b: imageData.data[i + 2],
      a: imageData.data[i + 3]
    }
  }
}
