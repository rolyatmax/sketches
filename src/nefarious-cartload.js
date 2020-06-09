import includeFont from './common/include-font'
import addTitle from './common/add-title'
const Alea = require('alea')
const { GUI } = require('dat-gui')
const fit = require('canvas-fit')
const css = require('dom-css')
const d3 = require('d3-scale-chromatic')

window.d3 = d3

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
  reflections: [5, 0, 50, 1],
  opacity: [0.1, 0, 1, 0.01],
  originSpread: [2.3, 0, 4, 0.01, true],
  minSpeed: [0.2, 0, 5, 0.01],
  speedRange: [1, 0, 10, 0.01],
  showCircles: [true],
  fillCircles: [true],
  showOrigin: [true]
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
      const xT = x / (rows - 1)
      const yT = y / (rows - 1)
      const offset = [
        x * (settings.cellSize + settings.padding) + startOffset[0],
        y * (settings.cellSize + settings.padding) + startOffset[1]
      ]
      const center = [settings.cellSize / 2 + offset[0], settings.cellSize / 2 + offset[1]]
      const multiplier = (1 - Math.pow(1 - xT, settings.originSpread)) * (1 - Math.pow(1 - yT, settings.originSpread))
      const mag = rand() * settings.cellSize / 2 * (multiplier * 0.9 + 0.1)
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
        xT: xT,
        yT: yT,
        points: []
      })
    }
  }
}

function draw () {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  cells.forEach(cell => drawCell(cell))
}

function drawCell (cell) {
  const points = cell.points
  points.length = 0
  points.push(cell.position)
  cell.direction += settings.speedRange * 16 / 500 * cell.xT * cell.yT + settings.minSpeed * 16 / 500
  let directionAngle = cell.direction

  if (settings.showOrigin) {
    ctx.beginPath()
    ctx.strokeStyle = 'rgb(55, 162, 212)'
    drawCircle(ctx, cell.position, 2)
    ctx.stroke()
  }

  const iterations = settings.reflections + 1
  let n = iterations
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

  if (settings.showCircles) {
    ctx.beginPath()
    ctx.strokeStyle = '#ccc'
    drawCircle(ctx, cell.center, cell.size / 2)
    if (settings.fillCircles) {
      const spreadValue = getSpreadValue(points.slice(1)) / cell.size
      let color = d3.interpolateBuPu(Math.pow(spreadValue, 4) * 4)
      const opacity = 0.8
      color = color.replace('rgb(', 'rgba(').replace(')', `, ${opacity})`)
      ctx.fillStyle = color
      ctx.fill()
    }
    ctx.stroke()
  }

  for (let i = 1; i < points.length; i++) {
    ctx.beginPath()
    ctx.strokeStyle = `rgba(50, 50, 50, ${settings.opacity * (points.length - i) * 0.5})`
    drawLine(ctx, [points[i - 1], points[i]])
    ctx.stroke()
  }
}

function getSpreadValue (pts) {
  let total = 0
  let denom = 0
  for (const ptA of pts) {
    for (const ptB of pts) {
      total += dist(ptA, ptB)
      denom += 1
    }
  }
  if (denom) return total / denom
  return 0
}

function dist (ptA, ptB) {
  const dX = ptA[0] - ptB[0]
  const dY = ptA[1] - ptB[1]
  return Math.sqrt(dX * dX + dY * dY)
}

function drawLine (ctx, points, color) {
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

  intersections = intersections.filter((pt) => !isEqual(pt[0], sX) || !isEqual(pt[1], sY))

  if (intersections.length === 1) {
    return intersections
  }

  if (eX > sX) {
    intersections = intersections.filter((pt) => pt[0] > sX || isEqual(pt[0], sX))
  }
  if (eX < sX) {
    intersections = intersections.filter((pt) => pt[0] < sX || isEqual(pt[0], sX))
  }
  if (eY > sY) {
    intersections = intersections.filter((pt) => pt[1] > sY || isEqual(pt[1], sY))
  }
  if (eY < sY) {
    intersections = intersections.filter((pt) => pt[1] < sY || isEqual(pt[1], sY))
  }

  return intersections

  function getPt (x) {
    return [x, m * x + n]
  }
}

function isEqual (a, b) {
  return Math.abs(a - b) < 0.1
}
