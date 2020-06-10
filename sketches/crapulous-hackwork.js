import canvasFit from 'canvas-fit'
import fit from 'objectfit/cover'
import loadImg from 'load-img'
import includeFont from './common/include-font'
import addTitle from './common/add-title'
const { GUI } = require('dat-gui')
const css = require('dom-css')

title('crapulous-hackwork', '#555')

const canvas = document.body.appendChild(document.createElement('canvas'))
const ctx = canvas.getContext('2d')
canvas.style.opacity = 0
canvas.style.transition = 'opacity 400ms ease'
setTimeout(() => {
  canvas.style.opacity = 1
}, 200)

const resizeCanvas = canvasFit(canvas)
window.addEventListener('resize', () => {
  resizeCanvas()
  setup()
}, true)

const imgSrc = 'resources/images/hong-kong2-height-map.png' // 'resources/images/vail-height-map.png'

const settings = guiSettings({
  lines: [1200, 10, 5000, 10, true],
  lineGranularity: [100, 3, 100, 1, true],
  maxHeight: [85, 1, 1000, 1, true],
  opacity: [0.78, 0.01, 1, 0.01, true]
}, setup)

let lines, pixelPicker

preSetup(setup)

function preSetup (callback) {
  loadImg(imgSrc, (err, image) => {
    if (err) throw err
    pixelPicker = getSource(document.body, image)
    callback()
  })
}

function setup () {
  const squareSize = getSquareSize()
  const topRight = [
    (ctx.canvas.width - squareSize) / 2,
    (ctx.canvas.height - squareSize) / 2
  ]

  lines = window.lines = (new Array(settings.lines + 1)).fill().map((_, i) => {
    const x = i / settings.lines * squareSize + topRight[0]
    return (new Array(settings.lineGranularity)).fill().map((_, j) => {
      const y = j / settings.lineGranularity * squareSize + topRight[1]
      return [x, y, getAveragePixelVal(pixelPicker(x, y)) / 256]
    })
  })

  draw()
}

function draw () {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (const points of lines) {
    for (let i = 0; i < points.length - 1; i += 1) {
      const pt1 = points[i]
      const pt2 = points[i + 1]
      const averageHeight = (pt1[2] + pt2[2]) / 2
      ctx.beginPath()
      ctx.moveTo(...transformPt(pt1))
      ctx.lineTo(...transformPt(pt2))
      ctx.strokeStyle = `rgba(50, 50, 50, ${settings.opacity * averageHeight})`
      ctx.stroke()
    }
  }
}

function transformPt (pt) {
  const squareSize = getSquareSize()
  const [x, y] = projectIsometric(pt[0], pt[1])
  return [
    x + squareSize / 2,
    y - pt[2] * settings.maxHeight - 140
  ]
}

function getSquareSize () {
  return Math.min(ctx.canvas.width, ctx.canvas.height)
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

function getSource (container, img) {
  const hiddenCanvas = container.appendChild(document.createElement('canvas'))
  const hiddenCtx = hiddenCanvas.getContext('2d')
  canvasFit(hiddenCanvas)
  hiddenCanvas.style.display = 'none'
  hiddenCtx.fillStyle = 'rgb(255, 255, 255)'
  hiddenCtx.fillRect(0, 0, hiddenCanvas.width, hiddenCanvas.height)
  drawImageToCanvas(hiddenCtx, img)
  const picker = makePixelPicker(hiddenCanvas)
  hiddenCanvas.parentElement.removeChild(hiddenCanvas)
  return picker
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

function getAveragePixelVal (pixel) {
  return (pixel.r + pixel.g + pixel.b) / 3
}

function projectIsometric (x, y) {
  return [(x - y) / 2, (x + y) / 2]
}
