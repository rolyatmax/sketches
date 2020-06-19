/* global requestAnimationFrame */

// import tinycolor from 'tinycolor2'
// import colorPalettes from './common/color-palettes'
import includeFont from './common/include-font'
import addTitle from './common/add-title'
const Alea = require('alea')
const { GUI } = require('dat-gui')
const fit = require('canvas-fit')
const memoize = require('memoizee')
const { createSpring } = require('spring-animator-1')
const css = require('dom-css')

title('equanimous-hackwork', '#555')

const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d')

window.addEventListener('resize', fit(canvas), false)
document.body.appendChild(canvas)

const initialSize = Math.min(canvas.height, canvas.width) - 60

const settings = guiSettings(
  {
    seed: [(Math.random() * 1000) | 0, 0, 1000, 1, true],
    // palette: [Math.random() * colorPalettes.length | 0, 0, colorPalettes.length - 1, 1],
    size: [initialSize, 50, initialSize, 10, true],
    subdivisions: [200, 0, 500, 1, true],
    alpha: [0.3, 0, 1, 0.01],
    dampening: [0.1, 0.01, 1, 0.01, true],
    stiffness: [0.3, 0.01, 1, 0.01, true],
    animationDelay: [30, 0, 40, 1]
  },
  setup
)

let rand, lines, spaces
function setup () {
  rand = new Alea(settings.seed)
  // a list of open spaces that can be subdivided
  // each space is defined as an array of [top, right, bottom, left] line boundaries
  // a `null` value indicates the root container (prob a better way to do this?)
  spaces = [[null, null, null, null]]
  // a dictionary of line ids mapped to line objects which contain information
  // about their bounds, axis-of-subdivision, and offset along that axis
  lines = {}
  for (let j = 0; j < settings.subdivisions; j++) {
    const space = spaces[(rand() * spaces.length) | 0]
    const axisOfSubdivision = rand() < 0.5 ? 'x' : 'y'
    const lineID = `line${j}`
    const offset = rand() < 0.5 ? 0 : 1
    lines[lineID] = {
      bounds: space.slice(),
      axisOfSubdivision: axisOfSubdivision,
      offset: offset,
      computedOffsetValue: createSpring(
        settings.dampening,
        settings.stiffness,
        rand() * settings.size
      )
    }

    // split space up into two parts
    const newSpace1 = space.slice()
    const newSpace2 = space.slice()
    if (axisOfSubdivision === 'x') {
      newSpace1[2] = lineID
      newSpace2[0] = lineID
    } else {
      newSpace1[3] = lineID
      newSpace2[1] = lineID
    }
    const spaceIdx = spaces.indexOf(space)
    spaces.splice(spaceIdx, 1, newSpace1, newSpace2)
  }

  setNewLineOffsets()
}

function draw () {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const color = '#555'
  const center = [canvas.width, canvas.height].map(v => (v / 2) | 0)
  const [startX, startY] = center.map(v => v - settings.size / 2)
  drawRect(ctx, startX, startY, settings.size, settings.size, color)

  // some functions that we keep inside draw so that we clear the memoize cache
  // before each frame

  const getLinePoints = memoize((line, lines) => {
    const offsetVal = getOffsetValue(line, lines)
    const boundsValues = getBoundsValues(line.bounds, lines)
    const ptA = []
    const ptB = []
    if (line.axisOfSubdivision === 'x') {
      ptA[1] = ptB[1] = offsetVal
      ptA[0] = boundsValues[3]
      ptB[0] = boundsValues[1]
    } else {
      ptA[0] = ptB[0] = offsetVal
      ptA[1] = boundsValues[0]
      ptB[1] = boundsValues[2]
    }
    return [ptA, ptB]
  })

  const getBoundsValues = memoize((bounds, lines) => {
    return bounds.map((boundary, i) => {
      if (boundary === null) {
        return i === 1 || i === 2 ? settings.size : 0
      }
      return getOffsetValue(lines[boundary], lines)
    })
  })

  const getOffsetValue = memoize((line, lines) => {
    const boundsValues = getBoundsValues(line.bounds, lines)
    const min =
      line.axisOfSubdivision === 'x' ? boundsValues[0] : boundsValues[3]
    const max =
      line.axisOfSubdivision === 'x' ? boundsValues[2] : boundsValues[1]
    const delta = max - min
    const offsetValue = (line.offset * delta + min) | 0
    line.computedOffsetValue.updateValue(offsetValue)
    return line.computedOffsetValue.tick(1, false) // stupid API that gives you the next value without updating internally
  })

  spaces.forEach((bounds, i) => {
    const boundsValues = getBoundsValues(bounds, lines)
    const [sY, eX, eY, sX] = boundsValues
    const width = eX - sX
    const height = eY - sY
    // const palette = colorPalettes[settings.palette]
    // const colorHex = palette[i % palette.length]
    const r = (sX / settings.size * 205) | 0
    const g = (sY / settings.size * 205) | 0
    const b = (width / settings.size * 205) | 0
    const a = 1 - height * width / (settings.size * settings.size)
    const alpha = a * a * settings.alpha
    ctx.beginPath()
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
    // ctx.fillStyle = tinycolor(colorHex).setAlpha(alpha).toRgbString()
    ctx.fillRect(sX + startX, sY + startY, width, height)
  })

  // now actually draw the lines
  Object.keys(lines)
    .map(k => lines[k])
    .forEach(line => {
      const [ptA, ptB] = getLinePoints(line, lines)
      ptA[0] += startX
      ptA[1] += startY
      ptB[0] += startX
      ptB[1] += startY
      drawLine(ctx, ptA, ptB, color)
      line.computedOffsetValue.tick()
    })
}

function setNewLineOffsets () {
  Object.keys(lines).forEach((k, i) => {
    const line = lines[k]
    const newValue = rand() * 0.8 + 0.1
    setTimeout(() => {
      line.offset = newValue
    }, settings.animationDelay * i)
  })
}

canvas.addEventListener('click', setNewLineOffsets)

setup()
loop()

function loop () {
  requestAnimationFrame(loop)
  draw()
}

// ------------- helpers -------------

function drawRect (ctx, startX, startY, width, height, color) {
  ctx.beginPath()
  ctx.strokeStyle = color
  ctx.strokeRect(startX, startY, width, height)
}

function drawLine (ctx, ptA, ptB, color) {
  ctx.beginPath()
  ctx.strokeStyle = color
  ctx.moveTo(ptA[0], ptA[1])
  ctx.lineTo(ptB[0], ptB[1])
  ctx.stroke()
}

function guiSettings (settings, onChange) {
  const settingsObj = {}
  const gui = new GUI()
  for (const key in settings) {
    settingsObj[key] = settings[key][0]
    const setting = gui.add(
      settingsObj,
      key,
      settings[key][1],
      settings[key][2]
    )
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
