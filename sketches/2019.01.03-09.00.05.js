import loadImg from 'load-img'
import fit from 'objectfit/cover'
const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const vec2 = require('gl-vec2')
const { GUI } = require('dat-gui')

const SIZE = 2048
const HALF_SIZE = SIZE / 2

const sketch = ({ render }) => {
  const settings = {
    seed: 1,
    pointCount: 140000,
    lineWidth: 10,
    lineLength: 40,
    noiseFreq: 0.0001,
    noiseAmp: 0.5,
    margin: 200,
    opacity: 0.9,
    image: 'empire',
    filter: 'all'
  }

  function onChange () {
    setup()
    render()
  }

  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(onChange)
  gui.add(settings, 'pointCount', 0, 1000000).step(1).onChange(onChange)
  gui.add(settings, 'lineWidth', 0, 10).onChange(onChange)
  gui.add(settings, 'lineLength', 1, 200).onChange(onChange)
  gui.add(settings, 'noiseFreq', 0, 0.01).step(0.00001).onChange(onChange)
  gui.add(settings, 'noiseAmp', 0, 5).onChange(onChange)
  gui.add(settings, 'margin', 0, 500).onChange(onChange)
  gui.add(settings, 'opacity', 0, 1).step(0.01).onChange(onChange)
  gui.add(settings, 'image', [
    'coffee', 'empire', 'flatiron', 'fruit', 'mosque', 'mountains', 'palms', 'skyline', 'snowday', 'whitehouse'
  ]).onChange(setup)
  gui.add(settings, 'filter', ['r', 'g', 'b', 'all']).onChange(setup)

  const hiddenCanvas = document.createElement('canvas')
  hiddenCanvas.width = SIZE
  hiddenCanvas.height = SIZE
  hiddenCanvas.style.display = 'none'
  const hiddenCtx = hiddenCanvas.getContext('2d')

  let pixelPicker, rand, points

  function setup () {
    rand = random.createRandom(settings.seed)
    points = []

    loadImg(`resources/images/${settings.image}.jpg`, (err, image) => {
      if (err) throw err
      drawImageToCanvas(hiddenCtx, image)
      pixelPicker = makePixelPicker(hiddenCanvas)
      render()
    })

    while (points.length < settings.pointCount) {
      const position = vec2.add([], rand.insideCircle(HALF_SIZE - settings.margin), [HALF_SIZE, HALF_SIZE])
      points.push({
        position: position,
        angle: (rand.noise2D(position[0], position[1], settings.noiseFreq, settings.noiseAmp) + 1) * Math.PI,
        opacity: (rand.noise2D(position[0], position[1], settings.noiseFreq, settings.noiseAmp + 1) + 1) * 0.5
      })
    }

    console.log('points count:', points.length)
  }

  setup()
  return ({ context, width, height }) => {
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    if (!pixelPicker) return

    for (const pt of points) {
      const pixel = pixelPicker(pt.position[0], pt.position[1])
      let color
      if (settings.filter === 'all') {
        color = (pixel.r + pixel.g + pixel.b) / 3
      } else {
        color = pixel[settings.filter]
      }
      const lineLength = settings.lineLength * (Math.pow(color / 255, 8) + 0.5)
      const vec = vec2.scale([], [Math.cos(pt.angle), Math.sin(pt.angle)], lineLength)
      const pt1 = vec2.add([], pt.position, vec)
      const pt2 = vec2.subtract([], pt.position, vec)
      context.beginPath()
      context.moveTo(pt1[0], pt1[1])
      context.lineTo(pt2[0], pt2[1])
      context.strokeStyle = `rgba(${color}, ${color}, ${color}, ${settings.opacity})`
      context.lineWidth = settings.lineWidth
      context.stroke()
    }
  }
}

canvasSketch(sketch, {
  dimensions: [SIZE, SIZE]
})

function drawImageToCanvas (context, img) {
  const imgWidth = img.naturalWidth || img.width
  const imgHeight = img.naturalHeight || img.height
  const bounds = fit(
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
