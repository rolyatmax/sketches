import includeFont from './common/include-font'
import addTitle from './common/add-title'
const Alea = require('alea')
const { GUI } = require('dat-gui')
const fit = require('canvas-fit')
const css = require('dom-css')
const d3 = require('d3-scale-chromatic')

window.d3 = d3

title('loquacious-infancy', '#555')

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
  // rays: [1, 1, 10, 1, true],
  cellSize: [25, 10, 200, 1, true],
  reflections: [1, 0, 8, 1],
  speed: [80, 0, 150, 1],
  lineOpacity: [0.8, 0, 1, 0.01],
  colorSpread: [0.2, 0.01, 2, 0.01],
  pixelCount: [3, 2, 30, 1],
  hueOffset: [0.43, 0, 1, 0.01],
  hueRange: [0.35, 0, 1, 0.01],
  saturationOffset: [0.35, 0, 1, 0.01],
  saturationRange: [0.35, 0, 1, 0.01],
  luminosityOffset: [0.3, 0, 1, 0.01],
  luminosityRange: [0.25, 0, 1, 0.01]
}, setup)

setup()

window.requestAnimationFrame(function loop (t) {
  window.requestAnimationFrame(loop)
  draw(t)
})

function setup () {
  rand = new Alea(settings.seed)
  cells = []
  const margin = 100
  const padding = 10
  const maxSize = Math.min(canvas.width, canvas.height) - margin * 2
  const rows = ((maxSize + padding) / (settings.cellSize + padding)) | 0
  const size = rows * settings.cellSize + (rows - 1) * padding
  const startOffset = [
    (canvas.width - size) / 2,
    (canvas.height - size) / 2
  ]

  for (let x = 0; x < rows; x++) {
    for (let y = 0; y < rows; y++) {
      const xT = x / (rows - 1)
      const yT = y / (rows - 1)
      const offset = [
        x * (settings.cellSize + padding) + startOffset[0],
        y * (settings.cellSize + padding) + startOffset[1]
      ]
      cells.push({
        t: Math.pow(xT * yT, 0.5),
        offset: offset,
        size: settings.cellSize,
        rays: (new Array(1)).fill().map(() => ({
          position: [rand(), rand()],
          direction: rand() * Math.PI * 2
        }))
      })
    }
  }
}

function draw () {
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // ctx.beginPath()
  // ctx.strokeStyle = '#555'
  // ctx.strokeRect(offset[0], offset[1], size, size)
  cells.forEach(cell => {
    // debugger;
    cell.rays.forEach((ray) => drawRay(ray, cell.size, cell.offset, cell.t))
  })
}

function drawRay (ray, size, offset, t) {
  ray.points = ray.points || []
  ray.points.length = 0
  const origin = [
    ray.position[0] * size + offset[0],
    ray.position[1] * size + offset[1]
  ]
  ray.points.push(origin)
  ray.direction = (ray.direction + settings.speed / 2000 * t + 0.001) % (Math.PI * 2)
  const directionAngle = [
    Math.cos(ray.direction),
    Math.sin(ray.direction)
  ]

  let n = settings.reflections + 1
  while (n--) {
    const position = ray.points[ray.points.length - 1]
    const reflectionSurface = getNearestIntersectingLine(position, directionAngle, offset, [size, size])
    const currentRay = [position, [
      directionAngle[0] + position[0],
      directionAngle[1] + position[1]
    ]]
    const reflectionPoint = getIntersection(currentRay, reflectionSurface)
    ray.points.push(reflectionPoint)

    if (reflectionSurface[0][0] === reflectionSurface[1][0]) {
      // vertical surface
      directionAngle[0] *= -1
    } else {
      // horizontal surface
      directionAngle[1] *= -1
    }
  }

  // draw some gradient
  const normalizedPoints = ray.points.map(pt => ([
    (pt[0] - offset[0]) / size,
    (pt[1] - offset[1]) / size
  ]))
  const padding = -1
  const pixelCount = settings.pixelCount
  const pixelSize = (size / pixelCount) - padding
  for (let x = 0; x < pixelCount; x++) {
    for (let y = 0; y < pixelCount; y++) {
      const xT = x / pixelCount
      const yT = y / pixelCount
      const start = [
        xT * size + offset[0],
        yT * size + offset[1]
      ]
      const coord = getCoordFromLine(normalizedPoints, Math.pow(xT * yT, settings.colorSpread))
      const color = getColorFromCoord(coord)
      ctx.beginPath()
      ctx.fillStyle = `hsl(${color[0]}, ${color[1]}%, ${color[2]}%)`
      ctx.fillRect(start[0], start[1], pixelSize, pixelSize)
    }
  }

  for (let i = 1; i < ray.points.length; i++) {
    ctx.beginPath()
    ctx.strokeStyle = `rgba(210, 210, 210, ${settings.lineOpacity})`
    drawLine(ctx, [ray.points[i - 1], ray.points[i]])
    ctx.stroke()
  }

  function getColorFromCoord (coord) {
    return [
      (coord[0] * settings.hueRange + settings.hueOffset * t) * 360, // H
      (coord[1] * coord[0] * settings.saturationRange + settings.saturationOffset) * 100, // S
      (coord[1] * settings.luminosityRange + settings.luminosityOffset) * 100 // L
    ]
  }
}

// point coords must be normalized to 0 -> 1 range
// t must be in the range of 0 -> 1
// returns HSL
function getCoordFromLine (points, t) {
  let length = 0
  for (let i = 1; i < points.length; i++) {
    length += dist(points[i - 1], points[i])
  }
  let colorAtLength = length * t
  let currentSegment = 0
  while (colorAtLength >= 0) {
    const lengthOfCurrentSegment = dist(points[currentSegment], points[currentSegment + 1])
    if (lengthOfCurrentSegment < colorAtLength) {
      currentSegment += 1
      colorAtLength -= lengthOfCurrentSegment
      continue
    }
    const cutAtT = colorAtLength / lengthOfCurrentSegment
    const pointA = points[currentSegment]
    const pointB = points[currentSegment + 1]
    const segment = [pointB[0] - pointA[0], pointB[1] - pointA[1]]
    return [
      segment[0] * cutAtT + pointA[0],
      segment[1] * cutAtT + pointA[1]
    ]
  }
  return [0, 0]
}

function getIntersection (lineA, lineB) {
  const [aStart, aEnd] = lineA
  const aSlope = (aStart[1] - aEnd[1]) / (aStart[0] - aEnd[0])
  const aYIntercept = aStart[1] - aSlope * aStart[0]

  const [bStart, bEnd] = lineB
  const bSlope = (bStart[1] - bEnd[1]) / (bStart[0] - bEnd[0])
  const bYIntercept = bStart[1] - bSlope * bStart[0]

  // if slopes are equal, lines are parallel, no intersection
  if (aSlope === bSlope) return null

  if (!Number.isFinite(aSlope)) {
    return [aStart[0], bSlope * aStart[0] + bYIntercept]
  }

  if (!Number.isFinite(bSlope)) {
    return [bStart[0], aSlope * bStart[0] + aYIntercept]
  }

  const xIntersection = (bYIntercept - aYIntercept) / (aSlope - bSlope)
  return [
    xIntersection,
    aSlope * xIntersection + aYIntercept
  ]
}

function getNearestIntersectingLine (pos, dirVect, cellStart, cellDimensions) {
  const slope = dirVect[1] / dirVect[0]
  const yIntercept = pos[1] - slope * pos[0]

  // find the two sides of cell to check for intersection
  // TODO: refactor to use `getIntersection()`
  const xValue = dirVect[0] < 0 ? cellStart[0] : cellStart[0] + cellDimensions[0]
  const verticalIntersection = [xValue, slope * xValue + yIntercept]
  const distToVertical = Math.pow(pos[0] - verticalIntersection[0], 2) + Math.pow(pos[1] - verticalIntersection[1], 2)

  const yValue = dirVect[1] < 0 ? cellStart[1] : cellStart[1] + cellDimensions[1]
  const horizontalIntersection = [(yValue - yIntercept) / slope, yValue]
  const distToHorizontal = Math.pow(pos[0] - horizontalIntersection[0], 2) + Math.pow(pos[1] - horizontalIntersection[1], 2)

  return distToVertical < distToHorizontal ? [
    [xValue, cellStart[1]], [xValue, cellStart[1] + cellDimensions[1]]
  ] : [
    [cellStart[0], yValue], [cellStart[0] + cellDimensions[0], yValue]
  ]
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
