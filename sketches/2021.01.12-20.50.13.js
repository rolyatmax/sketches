const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const loadImg = require('load-img')
const fit = require('objectfit/cover')

const WIDTH = 3840
const HEIGHT = 2160

const BIN_SIZE = 30
const MAX_TRIES = 10000

const images = [
  'coffee', 'empire', 'flatiron', 'fruit', 'mosque', 'mountains',
  'palms', 'skyline', 'snowday', 'whitehouse', 'thinker', 'mary-arthur',
  'pasture', 'venice'
]

const settings = {
  seed: 6827,
  circleCount: 30000,
  minCircleSize: 5,
  maxCircleSize: 55,
  sizePower: 2,
  size: 1,
  lineWidth: 0.2,
  alpha: 0.57,
  image: 'coffee'
}

const pixelPickers = {}
const promises = images.map(img => new Promise((resolve, reject) => {
  loadImg(`resources/images/${img}.jpg`, (err, image) => {
    if (err) reject(err)
    pixelPickers[img] = makePixelPicker(image, [WIDTH, HEIGHT])
    resolve()
  })
}))

Promise.all(promises).then(() => {
  const sketch = ({ render }) => {
    const regenerateCircles = () => {
      createCircles()
      render()
    }

    const gui = new GUI()
    gui.add(settings, 'seed', 0, 9999).step(1).onChange(regenerateCircles)
    gui.add(settings, 'circleCount', 2, 300000).step(1).onChange(regenerateCircles)
    gui.add(settings, 'minCircleSize', 1, 300).onChange(regenerateCircles)
    gui.add(settings, 'maxCircleSize', 1, 600).onChange(regenerateCircles)
    gui.add(settings, 'sizePower', -0.001, 7).onChange(regenerateCircles)
    gui.add(settings, 'size', 0, 4).step(0.01).onChange(render)
    gui.add(settings, 'lineWidth', 0.01, 5).step(0.01).onChange(render)
    gui.add(settings, 'alpha', 0, 1).step(0.01).onChange(render)
    gui.add(settings, 'image', images).onChange(regenerateCircles)

    let circles = []

    createCircles()
    function createCircles () {
      const rand = random.createRandom(settings.seed)

      const startTime = window.performance.now()

      circles = []

      // make a bunch of circles first and then insert the largest ones first
      const initialCircles = new Array(settings.circleCount).fill().map(getRandomCircle)
      initialCircles.sort((a, b) => b.r - a.r)

      const circleBins = new Array(Math.ceil(WIDTH / BIN_SIZE)).fill().map(
        () => new Array(Math.ceil(HEIGHT / BIN_SIZE)).fill().map(() => [])
      )

      function insertCircle (c) {
        circleBins[c.x / BIN_SIZE | 0][c.y / BIN_SIZE | 0].push(c)
      }

      let count = 0

      for (const c of initialCircles) {
        if (!collides(c.x, c.y, c.r, circleBins, settings.maxCircleSize)) {
          insertCircle(c)
          count += 1
        }
      }

      let tries = 0
      while (tries < MAX_TRIES && count < settings.circleCount) {
        const c = getRandomCircle()
        if (collides(c.x, c.y, c.r, circleBins, settings.maxCircleSize)) {
          tries += 1
        } else {
          insertCircle(c)
          count += 1
          tries = 0
        }
      }

      circles.length = 0
      for (const col of circleBins) {
        for (const cell of col) {
          for (const c of cell) {
            // const t = Math.floor(c.t * 5)
            // if (t === 2 || t === 4 || t === 6 || t === 8) {
            //   continue
            // }
            circles.push(c)
          }
        }
      }

      const time = window.performance.now() - startTime
      console.log('created', circles.length, 'circles in', time, 'ms')

      function getRandomCircle () {
        const circleSizeRange = settings.maxCircleSize - settings.minCircleSize
        const x = rand.range(WIDTH)
        const y = rand.range(HEIGHT)
        // const t1 = (rand.noise2D(x + settings.noiseOffset, y, settings.noiseFreq, 0.5) + 0.5)
        // const t2 = (rand.noise2D(x, y, settings.noiseFreq * 0.8, 0.5) + 0.5)
        const pick = pixelPickers[settings.image]
        const color = pick(x, y)
        const t = (color.r + color.g + color.b) / 3 / 256 // Math.min(t1, t2)
        const r = Math.pow(t, settings.sizePower) * circleSizeRange + settings.minCircleSize
        const c = [color.r, color.g, color.b]
        return { x, y, r, t, c }
      }
    }

    return ({ context, width, height }) => {
      context.clearRect(0, 0, width, height)
      context.fillStyle = 'white'
      context.fillRect(0, 0, width, height)

      const rand = random.createRandom(settings.seed)
      // const colors = palettes[settings.palette].map(hexToRgb)

      const startTime = window.performance.now()
      for (const c of circles) {
        context.beginPath()
        context.lineWidth = settings.lineWidth
        context.strokeStyle = rand.boolean() ? '#666' : '#ddd'
        context.arc(c.x, c.y, c.r * settings.size, 0, Math.PI * 2, false)
        context.fillStyle = `rgba(${c.c.join(',')}, ${settings.alpha})`
        context.fill()
        context.stroke()
      }
      const time = window.performance.now() - startTime
      console.log('rendered', circles.length, 'circles in', time, 'ms')
    }
  }

  canvasSketch(sketch, {
    dimensions: [WIDTH, HEIGHT]
  })
})

function collides (x, y, r, circleBins, maxCircleSize) {
  const maxDist = maxCircleSize + r
  const bins = Math.ceil(maxDist / BIN_SIZE) + 1
  const i = x / BIN_SIZE | 0
  const j = y / BIN_SIZE | 0
  for (let di = -bins; di <= bins; di++) {
    for (let dj = -bins; dj <= bins; dj++) {
      if (
        i + di < circleBins.length && j + dj < circleBins[0].length &&
        i + di >= 0 && j + dj >= 0
      ) {
        for (const c of circleBins[i + di][j + dj]) {
          if (circleIntersect(x, y, r, c.x, c.y, c.r)) {
            return true
          }
        }
      }
    }
  }
  return false
}

function circleIntersect (x1, y1, r1, x2, y2, r2) {
  const d = r1 + r2
  const dSquared = d * d
  const dx = x2 - x1
  const dy = y2 - y1
  return (dx * dx + dy * dy) < dSquared
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

function makePixelPicker (img, dim) {
  const hiddenCanvas = document.createElement('canvas')
  hiddenCanvas.width = dim[0]
  hiddenCanvas.height = dim[1]
  hiddenCanvas.style.display = 'none'
  const hiddenCtx = hiddenCanvas.getContext('2d')
  drawImageToCanvas(hiddenCtx, img)
  const imageData = hiddenCtx.getImageData(
    0, 0, hiddenCanvas.width, hiddenCanvas.height
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