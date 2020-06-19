import fit from 'objectfit/cover'
import loadImg from 'load-img'
import includeFont from './common/include-font'
import addTitle from './common/add-title'
const Sketch = require('sketch-js')
const Alea = require('alea')
const { GUI } = require('dat-gui')
const { createSpring } = require('spring-animator-1')
const css = require('dom-css')

title('precipitate-shark', '#555')

const hiddenCtx = Sketch.create({ autoclear: false, autostart: false })
hiddenCtx.canvas.style.display = 'none'

const ctx = Sketch.create()
ctx.canvas.style.opacity = 0
ctx.canvas.style.transition = 'opacity 400ms ease'
setTimeout(() => {
  ctx.canvas.style.opacity = 1
}, 200)

function preSetup () {
  if (settings.image === 'text') {
    hiddenCtx.fillStyle = 'rgb(255, 255, 255)'
    hiddenCtx.fillRect(0, 0, hiddenCtx.width, hiddenCtx.height)
    printText(hiddenCtx, 'audiofabric', Math.min(hiddenCtx.width, hiddenCtx.height) * 0.1)
    ctx.setup()
  } else {
    loadImg(`resources/images/${settings.image}.jpg`, (err, image) => {
      if (err) throw err
      drawImageToCanvas(hiddenCtx, image)
      ctx.setup()
    })
  }
}

const settings = guiSettings({
  seed: [Math.random() * 1000 | 0, 0, 1000, 1, true],
  particles: [2500, 500, 5000, 1, true],
  dampening: [0.4, 0, 1, 0.01, true],
  stiffness: [0.9, 0, 1, 0.01, true],
  speed: [340, 1, 400, 1],
  precision: [0.98, 0.01, 1, 0.01],
  lineOpacity: [0.05, 0, 0.5, 0.01],
  turnGranularity: [55, 1, 100, 1],
  startSpread: [300, 0, 800, 1, true],
  particleDieRate: [0.1, 0, 0.3, 0.01],
  colorThreshold: [200, 0, 255, 1, true],
  showParticles: [false],
  negative: [false, null, null, null, true],
  image: ['fruit', [
    'text', 'coffee', 'empire', 'flatiron', 'fruit', 'mosque', 'mountains', 'palms', 'skyline', 'snowday', 'whitehouse'
  ], null, null, true]
}, preSetup)

let rand, points
// let keyCode

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
  context.fillStyle = 'rgb(0, 0, 0)'
  context.fillText(text, context.canvas.width / 2, context.canvas.height / 2)
}

function drawImageToCanvas (context, img) {
  const imgWidth = img.naturalWidth || img.width
  const imgHeight = img.naturalHeight || img.height
  const bounds = fit(
    [0, 0, context.canvas.width, context.canvas.height],
    [0, 0, imgWidth, imgHeight]
  )
  context.drawImage.apply(context, [img].concat(bounds))
}

// document.addEventListener('keyup', (e) => {
//   if (keyCode !== e.which) return
//   keyCode = null
//   hiddenCtx.clear()
// })

ctx.setup = function setup () {
  rand = new Alea(settings.seed)
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
      isActive: true,
      line: []
    }
  })
}

ctx.update = function update () {
  const pixelPicker = makePixelPicker(hiddenCtx.canvas)
  points.forEach((p) => {
    if (!p.isActive) return
    const color = pixelPicker(p.x, p.y)
    const averageVal = getAveragePixelVal(color)
    const isOnActivePixel = p.line.length || (
      settings.negative ? averageVal > settings.colorThreshold : averageVal < settings.colorThreshold
    )

    if (rand() < settings.precision) {
      if (isOnActivePixel) {
        p.line.push([p.x, p.y])
      }
      updateNextAngle(p, pixelPicker)
    }

    const angle = p.angle.tick()
    const velX = Math.cos(angle) * p.speed
    const velY = Math.sin(angle) * p.speed
    p.x += velX
    p.y += velY
    p.isOnActivePixel = isOnActivePixel

    if (rand() < settings.particleDieRate / 10) {
      p.isActive = false
    }
  })

  let i = 0
  while (i < points.length) {
    const p = points[i]
    if (!p.line.length && (p.x < 0 || p.y < 0 || p.x > ctx.width || p.y > ctx.height)) {
      points.splice(i, 1)
    } else {
      i += 1
    }
  }
}

function updateNextAngle (p, pixelPicker) {
  const angle = p.angle.tick(1, false)
  const currentPixelVal = getAveragePixelVal(pixelPicker(p.x, p.y))
  for (let i = 0; i <= settings.turnGranularity; i += 1) {
    const t = i / settings.turnGranularity * Math.PI
    let velX = Math.cos(angle + t) * p.speed
    let velY = Math.sin(angle + t) * p.speed
    let pixel = pixelPicker(p.x + velX, p.y + velY)
    let averageVal = getAveragePixelVal(pixel)
    let exertsPull = settings.negative ? averageVal > currentPixelVal : averageVal < currentPixelVal
    if (exertsPull) {
      p.angle.updateValue(angle + t)
      break
    }
    velX = Math.cos(angle - t) * p.speed
    velY = Math.sin(angle - t) * p.speed
    pixel = pixelPicker(p.x + velX, p.y + velY)
    averageVal = getAveragePixelVal(pixel)
    exertsPull = settings.negative ? averageVal > currentPixelVal : averageVal < currentPixelVal
    if (exertsPull) {
      p.angle.updateValue(angle - t)
      break
    }
  }
}

function getAveragePixelVal (pixel) {
  return (pixel.r + pixel.g + pixel.b) / 3
}

ctx.draw = function draw () {
  if (settings.showParticles) {
    points.forEach((p) => {
      if (!p.isActive) return
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

preSetup()

// ---------- HELPERS ----------------

function guiSettings (settings, onChange) {
  const settingsObj = {}
  const gui = new GUI()
  for (const key in settings) {
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
