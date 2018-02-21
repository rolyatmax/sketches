const Alea = require('alea')
const { GUI } = require('dat-gui')
const fit = require('canvas-fit')
const css = require('dom-css')
import includeFont from './common/include-font'
import addTitle from './common/add-title'

title('nefarious-cartload', '#555')

const canvas = document.body.appendChild(document.createElement('canvas'))
const ctx = canvas.getContext('2d')

const resize = fit(canvas)
window.addEventListener('resize', () => { resize(); setup() }, false)

canvas.style.opacity = 0
canvas.style.transition = 'opacity 400ms ease'
setTimeout(() => { canvas.style.opacity = 1 }, 200)

let rand, cells
const settings = guiSettings({
  seed: [Math.random() * 1000 | 0, 0, 1000, 1, true],
  cellSize: [50, 5, 200, 1, true],
  padding: [10, 0, 200, 1, true],
  margin: [100, 0, 100, 1, true],
  refractions: [5, 0, 50, 1],
  opacity: [0.5, 0, 1, 0.01],
  showCircles: [true]
}, setup)

setup()

requestAnimationFrame(function loop (t) {
  requestAnimationFrame(loop)
  draw(t)
})

function setup () {
  rand = new Alea(settings.seed)
  cells = []
  const maxSize = Math.min(canvas.width, canvas.height) - settings.margin * 2
  const rows = ((maxSize + settings.padding) / (settings.cellSize + settings.padding)) | 0
  const size = rows * settings.cellSize + (rows - 1) * settings.padding
  const startOffset = [
    (canvas.width - size) / 2,
    (canvas.height - size) / 2
  ]

  for (let x = 0; x < rows; x++) {
    for (let y = 0; y < rows; y++) {
      const offset = [
        x * (settings.cellSize + settings.padding) + startOffset[0],
        y * (settings.cellSize + settings.padding) + startOffset[1]
      ]
      const center = [settings.cellSize / 2 + offset[0], settings.cellSize / 2 + offset[1]]
      const mag = rand() * settings.cellSize / 2
      const rads = rand() * Math.PI * 2
      const position = [
        Math.cos(rads) * mag + center[0],
        Math.sin(rads) * mag + center[1]
      ]
      cells.push({
        offset: offset,
        direction: rand() * Math.PI * 2,
        size: settings.cellSize,
        position: position,
        center: center,
        xT: x / (rows - 1),
        yT: y / (rows - 1),
        points: []
      })
    }
  }
}

function draw (time) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (settings.showCircles) {
    ctx.beginPath()
    ctx.strokeStyle = '#ccc'
    cells.forEach(cell => drawCircle(ctx, cell.center, cell.size / 2))
    ctx.stroke()
  }

  ctx.beginPath()
  ctx.strokeStyle = `rgba(50, 50, 50, ${settings.opacity})`
  cells.forEach(cell => drawCell(cell, time))
  ctx.stroke()
}

function drawCell (cell, time) {
  const points = cell.points
  points.length = 0
  points.push(cell.position)
  let directionAngle = time * (cell.xT + 0.01) * (cell.yT + 0.01) / 200 + cell.direction

  let n = settings.refractions + 1
  while (n--) {
    const directionVector = [
      Math.cos(directionAngle) * cell.size + points[0][0],
      Math.sin(directionAngle) * cell.size + points[0][1]
    ]
    const position = points[points.length - 1]
    const intersections = findCircleLineIntersections(
      cell.size / 2,
      cell.center[0],
      cell.center[1],
      position[0], position[1],
      directionVector[0], directionVector[1]
    )
    if (!intersections[0]) break
    points.push(intersections[0])
    const angle = Math.atan2(position[1] - intersections[0][1], position[0] - intersections[0][0])
    const angle2 = Math.atan2(intersections[0][1] - cell.center[1], intersections[0][0] - cell.center[0])
    directionAngle = angle2 - angle + angle2
  }
  drawLine(ctx, points)
}

function drawLine (ctx, points) {
  ctx.moveTo(points[0][0], points[0][1])
  points.slice(1).forEach(pt => ctx.lineTo(pt[0], pt[1]))
}

function drawCircle (ctx, center, radius) {
  ctx.moveTo(center[0] + radius, center[1])
  ctx.arc(center[0], center[1], radius, 0, Math.PI * 2)
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

function findCircleLineIntersections (r, h, k, sX, sY, eX, eY) {
  // circle: (x - h)^2 + (y - k)^2 = r^2
  // line: y = m * x + n
  // r: circle radius
  // h: x value of circle centre
  // k: y value of circle centre
  // m: slope
  // n: y-intercept

  const m = (eY - sY) / (eX - sX)
  const n = eY - m * eX

  // get a, b, c values
  const a = 1 + m * m
  const b = -h * 2 + (m * (n - k)) * 2
  const c = h * h + (n - k) * (n - k) - r * r

  // insert into quadratic formula
  let intersections = [
    getPt((-b + Math.sqrt(Math.pow(b, 2) - 4 * a * c)) / (2 * a)),
    getPt((-b - Math.sqrt(Math.pow(b, 2) - 4 * a * c)) / (2 * a))
  ]

  if (eX > sX) {
    intersections = intersections.filter((pt) => pt[0] > sX || isEqual(pt[0], sX))
  }
  if (eX < sX) {
    intersections = intersections.filter((pt) => pt[0] < sX || isEqual(pt[0], sX))
  }
  if (eY > sY) {
    intersections = intersections.filter((pt) => pt[1] >= sY || isEqual(pt[1], sY))
  }
  if (eY < sY) {
    intersections = intersections.filter((pt) => pt[1] <= sY || isEqual(pt[1], sY))
  }

  if (intersections.length === 1) {
    return intersections
  }

  intersections = intersections.filter((pt) => !isEqual(pt[0], sX) || !isEqual(pt[1], sY))

  return intersections

  function getPt (x) {
    return [x, m * x + n]
  }
}

function isEqual (a, b) {
  return Math.abs(a - b) < 0.00001
}
