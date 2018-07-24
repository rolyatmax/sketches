const canvasSketch = require('canvas-sketch')
const Alea = require('alea')
const { GUI } = require('dat-gui')
const memoize = require('memoizee')
const { createSpring } = require('spring-animator')

const HEIGHT = 500
const WIDTH = 500

const config = {
  dimensions: [ WIDTH, HEIGHT ],
  animate: true,
  fps: 30
}

const sketch = () => {
  const settings = {
    seed: 1,
    pageMargin: 0.2,
    subdivisions: 200,
    alpha: 0.13,
    dampening: 0.1,
    stiffness: 0.3,
    animationDelay: 24
  }

  const gui = new GUI()
  gui.add(settings, 'seed', 0, 1000).step(1).onChange(setup)
  gui.add(settings, 'pageMargin', 0, 0.45).step(0.01).onChange(setup)
  gui.add(settings, 'subdivisions', 1, 500).step(1).onChange(setup)
  gui.add(settings, 'alpha', 0, 1).step(0.01)
  gui.add(settings, 'dampening', 0.01, 1).step(0.01).onChange(setup)
  gui.add(settings, 'stiffness', 0.01, 1).step(0.01).onChange(setup)
  gui.add(settings, 'animationDelay', 0, 40).step(1)

  let rand, lines, spaces, size
  setup()
  function setup () {
    rand = new Alea(settings.seed)
    size = (1 - settings.pageMargin * 2) * Math.min(WIDTH, HEIGHT)
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
          rand() * size
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

  function setNewLineOffsets () {
    Object.keys(lines).forEach((k, i) => {
      const line = lines[k]
      const newValue = rand() * 0.8 + 0.1
      setTimeout(() => {
        line.offset = newValue
      }, settings.animationDelay * i)
    })
  }

  document.addEventListener('click', setNewLineOffsets)

  return ({ context, width, height }) => {
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    const color = '#555'
    const center = [width, height].map(v => (v / 2) | 0)
    const [startX, startY] = center.map(v => v - size / 2)
    drawRect(context, startX, startY, size, size, color)

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
          return i === 1 || i === 2 ? size : 0
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
      const r = (sX / size * 205) | 0
      const g = (sY / size * 205) | 0
      const b = (width / size * 205) | 0
      const a = 1 - height * width / (size * size)
      const alpha = a * a * settings.alpha
      context.beginPath()
      context.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
      // context.fillStyle = tinycolor(colorHex).setAlpha(alpha).toRgbString()
      context.fillRect(sX + startX, sY + startY, width, height)
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
        drawLine(context, ptA, ptB, color)
        line.computedOffsetValue.tick()
      })
  }
}

canvasSketch(sketch, config)

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
