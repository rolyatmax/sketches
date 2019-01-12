const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const loadImg = require('load-img')
const fit = require('objectfit/cover')
const { createSpring } = require('spring-animator')
const vec2 = require('gl-vec2')

const SIZE = 1024

const sketch = ({ context }) => {
  const settings = {
    seed: 1,
    size: 6,
    opacity: 1,
    opacityDecay: 0.99,
    startOffset: 0,
    direction: 180,
    chance: 0.1,
    speed: 0.8,
    dampening: 0.1,
    stiffness: 0.1,
    wander: 90,
    image: 'skyline'
  }

  const images = [
    'coffee', 'empire', 'flatiron', 'fruit', 'mosque', 'mountains',
    'palms', 'skyline', 'snowday', 'whitehouse', 'thinker', 'mary-arthur',
    'pasture', 'venice', 'dude', 'vase', 'woman', 'royal'
  ]

  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
  gui.add(settings, 'size', 0, 10)
  gui.add(settings, 'opacity', 0, 1).step(0.01)
  gui.add(settings, 'opacityDecay', 0.9, 1).step(0.001)
  gui.add(settings, 'startOffset', 0, 1).step(0.01).onChange(setup)
  gui.add(settings, 'direction', 0, 360).onChange(setup)
  gui.add(settings, 'chance', 0, 1).step(0.01)
  gui.add(settings, 'speed', 0.5, 5)
  gui.add(settings, 'dampening', 0, 20).step(0.01).onChange(setup)
  gui.add(settings, 'stiffness', 0, 1).step(0.01).onChange(setup)
  gui.add(settings, 'wander', 0, 360)
  gui.add(settings, 'image', images).onChange(setup)

  let rand, walkers, loadedImage, pixelPicker

  function setup () {
    rand = random.createRandom(settings.seed)

    loadImg(`src/images/${settings.image}.jpg`, (err, image) => {
      if (err) throw err
      loadedImage = image
      pixelPicker = makePixelPicker(image, [SIZE, SIZE])
      walkers = []
      for (let n = 0; n < SIZE; n++) {
        walkers.push({
          position: [n, 0],
          direction: createSpring(settings.dampening, settings.stiffness, settings.direction),
          opacity: settings.opacity,
          size: settings.size
        }, {
          position: [n, SIZE],
          direction: createSpring(settings.dampening, settings.stiffness, settings.direction),
          opacity: settings.opacity,
          size: settings.size
        }, {
          position: [0, n],
          direction: createSpring(settings.dampening, settings.stiffness, settings.direction),
          opacity: settings.opacity,
          size: settings.size
        }, {
          position: [SIZE, n],
          direction: createSpring(settings.dampening, settings.stiffness, settings.direction),
          opacity: settings.opacity,
          size: settings.size
        // }, {
        //   position: [SIZE / 2, n],
        //   direction: createSpring(settings.dampening, settings.stiffness, settings.direction),
        //   opacity: settings.opacity,
        //   size: settings.size
        // }, {
        //   position: [n, SIZE / 2],
        //   direction: createSpring(settings.dampening, settings.stiffness, settings.direction),
        //   opacity: settings.opacity,
        //   size: settings.size
        // }, {
        //   position: [SIZE / 2, n],
        //   direction: createSpring(settings.dampening, settings.stiffness, settings.direction + 180),
        //   opacity: settings.opacity,
        //   size: settings.size
        // }, {
        //   position: [n, SIZE / 2],
        //   direction: createSpring(settings.dampening, settings.stiffness, settings.direction + 180),
        //   opacity: settings.opacity,
        //   size: settings.size
        })
      }

      // start them off by some random amount
      walkers.forEach(w => {
        const rads = (w.direction.tick()) / 180 * Math.PI
        const headStart = rand.value() * SIZE * settings.startOffset
        const dir = [Math.cos(rads) * headStart, Math.sin(rads) * headStart]
        vec2.add(w.position, w.position, dir)
      })
      window.followMe = null
      drawImageToCanvas(context, loadedImage)
    })
  }

  setup()
  return ({ width, height }) => {
    if (!loadedImage) return
    walkers.forEach(w => {
      const directionVal = w.direction.tick()
      const rads = directionVal / 180 * Math.PI
      const dir = [Math.cos(rads) * settings.speed, Math.sin(rads) * settings.speed]
      const curPixel = pixelPicker(w.position[0], w.position[1])
      if (rand.chance(settings.chance / 100) && !w.color) {
        w.color = curPixel
        w.opacity = settings.opacity
        w.size = settings.size
      } else if (w.color && toGrayscale(w.color) < toGrayscale(curPixel)) {
        w.color = curPixel
        w.opacity = settings.opacity
        w.size = settings.size
      }
      if (rand.chance(settings.chance / 1000) && w.color && !w.changedCourse) {
        const delta = rand.range(settings.wander) * rand.sign()
        const newVal = delta + directionVal
        w.direction.updateValue(newVal)
        w.changedCourse = true
      }
      w.opacity *= settings.opacityDecay
      w.size *= settings.opacityDecay
      vec2.add(w.position, w.position, dir)
      if (w.color) {
        const {r, g, b} = w.color
        const radius = w.size
        context.beginPath()
        context.fillStyle = `rgba(${[r, g, b].join(',')}, ${w.opacity})`
        context.arc(w.position[0], w.position[1], radius, 0, Math.PI * 2)
        context.fill()
      }
    })

    walkers = walkers.filter(w => {
      return w.position[0] >= 0 && w.position[1] >= 0 && w.position[0] <= SIZE && w.position[1] <= SIZE
    })
  }
}

canvasSketch(sketch, {
  dimensions: [ SIZE, SIZE ],
  animate: true
})

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

function toGrayscale ({ r, g, b }) {
  return (r + g + b) / 3
}
