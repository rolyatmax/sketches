const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
import loadImg from 'load-img'
import fit from 'objectfit/cover'

const SIZE = 2048
const HALF_SIZE = SIZE / 2

const sketch = ({ render }) => {
  const settings = {
    seed: 1,
    triangleCount: 80000,
    triangleSize: 10,
    polySides: 5,
    spread: 0.3,
    noiseFreq: 0.0001,
    noiseAmp: 0.5,
    margin: 400,
    opacity: 0.95,
    colorChance: 0.5,
    image: 'snowday'
  }

  function onChange () {
    setup()
    render()
  }

  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(onChange)
  gui.add(settings, 'triangleCount', 1000, 200000).step(1).onChange(onChange)
  gui.add(settings, 'triangleSize', 0, 100).onChange(onChange)
  gui.add(settings, 'polySides', 3, 10).step(1).onChange(onChange)
  gui.add(settings, 'spread', 0, 1).step(0.01).onChange(onChange)
  gui.add(settings, 'noiseFreq', 0, 0.01).step(0.00001).onChange(onChange)
  gui.add(settings, 'noiseAmp', 0, 5).onChange(onChange)
  gui.add(settings, 'margin', 0, 500).onChange(onChange)
  gui.add(settings, 'opacity', 0, 1).step(0.01).onChange(onChange)
  gui.add(settings, 'colorChance', 0, 1).step(0.01).onChange(onChange)
  gui.add(settings, 'image', [
    'coffee', 'empire', 'flatiron', 'fruit', 'mosque', 'mountains', 'palms', 'skyline', 'snowday', 'whitehouse'
  ]).onChange(setup)

  const hiddenCanvas = document.createElement('canvas')
  hiddenCanvas.width = SIZE
  hiddenCanvas.height = SIZE
  hiddenCanvas.style.display = 'none'
  const hiddenCtx = hiddenCanvas.getContext('2d')

  let pixelPicker, rand, tris

  function setup () {
    rand = random.createRandom(settings.seed)
    tris = []

    loadImg(`src/images/${settings.image}.jpg`, (err, image) => {
      if (err) throw err
      drawImageToCanvas(hiddenCtx, image)
      pixelPicker = makePixelPicker(hiddenCanvas)
      render()
    })

    while (tris.length < settings.triangleCount) {
      const rads = random.range(Math.PI * 2)
      const dist = random.gaussian(0, settings.spread * (HALF_SIZE - settings.margin))
      const position = [
        Math.cos(rads) * dist + HALF_SIZE,
        Math.sin(rads) * dist + HALF_SIZE
      ]
      tris.push({
        position: position,
        angle: (rand.noise2D(position[0], position[1], settings.noiseFreq, settings.noiseAmp) + 1) * Math.PI,
        opacity: (rand.noise2D(position[0], position[1], settings.noiseFreq, settings.noiseAmp + 1) + 1) * 0.5
      })
    }

    console.log('tris count:', tris.length)
  }

  setup()
  return ({ context, width, height }) => {
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    if (!pixelPicker) return

    for (let tri of tris) {
      const pixel = pixelPicker(tri.position[0], tri.position[1])
      const { r, g, b } = pixel
      let color
      if (rand.value() < settings.colorChance) {
        color = [r, g, b]
      } else {
        const val = (r + g + b) / 3
        color = [val, val, val]
      }

      const rotationDelta = Math.PI * 2 / settings.polySides
      const pts = []
      for (let i = 0; i < settings.polySides; i++) {
        const angle = i * rotationDelta + tri.angle
        const x = Math.cos(angle) * settings.triangleSize + tri.position[0]
        const y = Math.sin(angle) * settings.triangleSize + tri.position[1]
        pts.push([x, y])
      }

      context.beginPath()
      context.moveTo(pts[0][0], pts[0][1])
      for (let pt of pts.slice(1)) {
        context.lineTo(pt[0], pt[1])
      }
      context.fillStyle = `rgba(${color.join(',')}, ${settings.opacity})`
      context.fill()
    }
  }
}

canvasSketch(sketch, {
  dimensions: [ SIZE, SIZE ]
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
