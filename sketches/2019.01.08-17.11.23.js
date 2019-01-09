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

const settings = {
  seed: 1,
  sampleSize: 3,
  opacity: 0.3,
  circleSize: 3.5,
  image1: 'pasture',
  image2: 'coffee'
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
gui.add(settings, 'circleSize', 1, 10)
gui.add(settings, 'image1', images).onChange(setup)
gui.add(settings, 'image2', images).onChange(setup)

let rand, pixels, shuffledPixels

function setup () {
  rand = random.createRandom(settings.seed)

  loadImg(`src/images/${settings.image1}.jpg`, (err1, image1) => {
    if (err1) throw err1
    const pixelPicker1 = makePixelPicker(image1, [SIZE, SIZE])
    loadImg(`src/images/${settings.image2}.jpg`, (err2, image2) => {
      if (err2) throw err2
      const pixelPicker2 = makePixelPicker(image2, [SIZE, SIZE])

      const pixels1 = rand.shuffle(generatePixelList(pixelPicker1, SIZE, settings.sampleSize))
      const pixels2Tree = window.tree = new KDTree([], distance, ['r', 'g', 'b'])
      const pixels2 = generatePixelList(pixelPicker2, SIZE, settings.sampleSize)
      pixels2.forEach(p => { pixels2Tree.insert(p) })

      shuffledPixels = []
      pixels = []
      for (let p of pixels1) {
        const nearest = pixels2Tree.nearest(p, 1)[0][0]
        pixels2Tree.remove(nearest)
        pixels[p.i] = {
          startColor: [p.r, p.g, p.b],
          endColor: [nearest.r, nearest.g, nearest.b],
          startPosition: [p.x, p.y],
          endPosition: [nearest.x, nearest.y],
          spring: createSpring(0.04, 0.1, 0),
          random: rand.value()
        }
        shuffledPixels.push(pixels[p.i])
      }
      setTimeout(() => {
        let n = 0
        const incr = 5000
        updateSomePixels()
        function updateSomePixels () {
          for (let i = n; i < n + incr && i < pixels.length; i++) {
            pixels[i].spring.updateValue(1)
          }
          n += incr
          if (n < pixels.length) requestAnimationFrame(updateSomePixels)
        }
      }, 6000)
    })
  })
}

const sketch = () => {
  setup()
  return ({ context, width, height }) => {
    context.fillStyle = '#fff'
    context.fillRect(0, 0, width, height)
    if (!shuffledPixels) return
    for (let p of shuffledPixels) {
      const t = p.spring.tick()
      const position = vec2.lerp([], p.startPosition, p.endPosition, t)
      const radius = settings.sampleSize * p.random * settings.circleSize
      context.beginPath()
      context.fillStyle = `rgba(${p.startColor.join(',')}, ${settings.opacity})`
      context.arc(position[0], position[1], radius, 0, Math.PI * 2)
      context.fill()
    }
  }
}

canvasSketch(sketch, {
  dimensions: [ SIZE, SIZE ],
  animate: true
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
