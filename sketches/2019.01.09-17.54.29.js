const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const loadImg = require('load-img')
const fit = require('objectfit/cover')
const { createSpring } = require('spring-animator')
const vec2 = require('gl-vec2')
// const createKDTree = require('static-kdtree')
const { kdTree: KDTree } = require('kd-tree-javascript')

const SIZE = 600

const sketch = ({ render }) => {
  const settings = {
    seed: 1,
    sampleSize: 3,
    opacity: 0.3,
    direction: 90,
    image: 'pasture'
  }
  
  const images = [
    'coffee', 'empire', 'flatiron', 'fruit', 'mosque', 'mountains',
    'palms', 'skyline', 'snowday', 'whitehouse', 'thinker', 'mary-arthur',
    'pasture', 'venice'
  ]
  
  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1)
  gui.add(settings, 'sampleSize', 0, 10).step(1).onChange(setup)
  gui.add(settings, 'opacity', 0, 1).step(0.01)
  gui.add(settings, 'direction', 0, 360).onChange(setup)
  gui.add(settings, 'image', images).onChange(setup)
  
  let rand, walkers, loadedImage
  
  function setup () {
    rand = random.createRandom(settings.seed)
  
    loadImg(`src/images/${settings.image}.jpg`, (err, image) => {
      if (err) throw err
      loadedImage = image
      const pixelPicker = makePixelPicker(image, [SIZE, SIZE])
      walkers = []
      for (let n = 0; n < SIZE; n++) {
        walkers.push({
          position: [n, 0],
          direction: settings.direction
        }, {
          position: [n, SIZE],
          direction: settings.direction
        }, {
          position: [0, n],
          direction: settings.direction
        }, {
          position: [SIZE, n],
          direction: settings.direction
        })
      }
      render()
    })
  }

  setup()
  return ({ context, width, height }) => {
    context.fillStyle = '#fff'
    context.fillRect(0, 0, width, height)

    if (!loadedImage) return
    drawImageToCanvas(context, loadedImage)
    // for (let p of pixels) {
    //   const t = p.spring.tick()
    //   const position = vec2.lerp([], p.startPosition, p.endPosition, t)
    //   const radius = settings.sampleSize * p.random * settings.circleSize
    //   context.beginPath()
    //   context.fillStyle = `rgba(${p.startColor.join(',')}, ${settings.opacity})`
    //   context.arc(position[0], position[1], radius, 0, Math.PI * 2)
    //   context.fill()
    // }
  }
}

canvasSketch(sketch, {
  dimensions: [ SIZE, SIZE ]
})

function generatePixelList (picker, size, sample) {
  const pixels = []
  let i = 0
  for (let x = 0; x < size; x++) {
    if (x % sample !== 0) continue
    for (let y = 0; y < size; y++) {
      if (y % sample !== 0) continue
      const { r, g, b } = picker(x, y)
      pixels.push({ x, y, r, g, b, i })
      i += 1
    }
  }
  return pixels
}

function drawImageToCanvas (context, img) {
  let imgWidth = img.naturalWidth || img.width
  let imgHeight = img.naturalHeight || img.height
  let bounds = fit(
    [0, 0, SIZE, SIZE],
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

function distance (a, b) {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  const dx = a.x - b.x
  const dy = a.y - b.y

  const dGrayscale = toGrayscale(a) - toGrayscale(b)

  return (
    dr * dr +
    dg * dg +
    db * db // +
    // Math.sqrt(dx * dx) +
    // Math.sqrt(dy * dy) +
    // Math.sqrt(dGrayscale * dGrayscale)
  )
}

function toGrayscale ({ r, g, b }) {
  return (r + g + b) / 3
}
