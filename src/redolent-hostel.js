/* global requestAnimationFrame */

const Alea = require('alea')
const fit = require('canvas-fit')
const { GUI } = require('dat-gui')
import includeFont from './common/include-font'
import addTitle from './common/add-title'
const css = require('dom-css')

title('redolent-hostel', '#555')

const canvas = document.body.appendChild(document.createElement('canvas'))
window.addEventListener('resize', fit(canvas), false)
const ctx = canvas.getContext('2d')

const settings = guiSettings({
  seed: [Math.random() * 1000 | 0, 0, 1000, 1, true],
  particles: [100, 1, 1000, 1, true],
  angleDivision: [6, 1, 26, 1],
  speed: [4, 1, 50, 1],
  wander: [1, 0, 100, 1]
}, setup)

let points, rand

setup()
loop()

function loop () {
  requestAnimationFrame(loop)
  update()
  draw()
}

function setup () {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  rand = new Alea(settings.seed)
  points = (new Array(settings.particles)).fill().map(() => ({
    x: rand() * canvas.width,
    y: rand() * canvas.height,
    angle: (rand() * settings.angleDivision | 0) * Math.PI * 2 / settings.angleDivision
  }))
}

function update () {
  points.forEach((p) => {
    p.lastX = p.x
    p.lastY = p.y
    p.x += Math.cos(p.angle) * settings.speed / 10
    p.y += Math.sin(p.angle) * settings.speed / 10
    if (rand() < settings.wander / 1000) {
      p.angle = (rand() * settings.angleDivision | 0) * Math.PI * 2 / settings.angleDivision
    }
  })
}

function draw () {
  ctx.beginPath()
  points.forEach((p) => {
    ctx.moveTo(p.lastX || p.x, p.lastY || p.y)
    ctx.lineTo(p.x, p.y)
  })
  ctx.strokeStyle = 'rgba(30, 30, 30, 0.5)'
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
