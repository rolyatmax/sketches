import loadImg from 'load-img'
import fit from 'objectfit/cover'
const canvasSketch = require('canvas-sketch')
const { random } = require('canvas-sketch-util')
const { GUI } = require('dat-gui')

const SIZE = 800
const FPS = 30

const settings = {
  image: 'flatiron',
  resolution: 400,
  speed: 4,
  noiseZoom: 500,
  noiseSpeed: 8,
  withColor: true
}

function sketch ({ render }) {
  const gui = new GUI()
  gui.add(settings, 'image', [
    'coffee', 'empire', 'flatiron', 'fruit', 'mosque', 'mountains', 'palms', 'skyline', 'snowday', 'whitehouse'
  ]).onChange(setup)
  gui.add(settings, 'resolution', 10, 500).step(1).onChange(setup)
  gui.add(settings, 'speed', 1, 30)
  gui.add(settings, 'noiseZoom', 1, 800)
  gui.add(settings, 'noiseSpeed', 0.1, 10).step(0.1)
  gui.add(settings, 'withColor')

  const hiddenCanvas = document.createElement('canvas')
  hiddenCanvas.width = SIZE
  hiddenCanvas.height = SIZE
  hiddenCanvas.style.display = 'none'
  const hiddenCtx = hiddenCanvas.getContext('2d')

  let pixelPicker, isFirstRender

  setup()
  isFirstRender = true
  function setup () {
    loadImg(`src/images/${settings.image}.jpg`, (err, image) => {
      if (err) throw err
      drawImageToCanvas(hiddenCtx, image)
      pixelPicker = makePixelPicker(hiddenCanvas)
    })
  }

  function drawPixel (ctx, x, y, pxSize) {
    const pixel = pixelPicker(x, y)
    if (settings.withColor) {
      ctx.fillStyle = `rgb(${pixel.r}, ${pixel.g}, ${pixel.b})`
      ctx.fillRect(x, y, pxSize, pxSize)
      return
    }

    ctx.fillStyle = 'white'
    ctx.fillRect(x, y, pxSize, pxSize)
    ctx.fillStyle = `rgba(255, 0, 0, ${1 - pixel.r / 256})`
    ctx.fillRect(x, y + pxSize * (0 / 3), pxSize, pxSize / 3)
    ctx.fillStyle = `rgba(0, 255, 0, ${1 - pixel.g / 256})`
    ctx.fillRect(x, y + pxSize * (1 / 3), pxSize, pxSize / 3)
    ctx.fillStyle = `rgba(0, 0, 255, ${1 - pixel.b / 256})`
    ctx.fillRect(x, y + pxSize * (2 / 3), pxSize, pxSize / 3)
  }

  return ({ context, width, height, time }) => {
    if (!pixelPicker) return
    const resPixelSize = 1 / settings.resolution * SIZE | 0
    if (isFirstRender) {
      context.fillStyle = 'white'
      context.fillRect(0, 0, width, height)

      for (let x = 0; x <= settings.resolution; x++) {
        const xLoc = x / settings.resolution * SIZE | 0
        for (let y = 0; y <= settings.resolution; y++) {
          const yLoc = y / settings.resolution * SIZE | 0
          drawPixel(context, xLoc, yLoc, resPixelSize)
        }
      }
      isFirstRender = false
    }

    let n = settings.resolution * settings.resolution / settings.speed / FPS | 0
    n = Math.max(0, n)
    const noise = random.noise1D(time + n) / 2 + 0.5
    while (n--) {
      const noiseX = random.noise1D(time / 100 + n) / 2 + 0.5
      const noiseY = random.noise1D(time / 50 + n + 1234) / 2 + 0.5
      const x = random.gaussian(noiseX, 0.01) * settings.resolution
      const y = random.gaussian(noiseY, 0.01) * settings.resolution
      const xLoc = x / settings.resolution * SIZE | 0
      const yLoc = y / settings.resolution * SIZE | 0
      const pixelSizeNoise = random.noise3D(xLoc / settings.noiseZoom, yLoc / settings.noiseZoom, time / settings.noiseSpeed) / 2 + 0.5
      const pixelMult = Math.pow(pixelSizeNoise, 9) * 15
      drawPixel(context, xLoc, yLoc, resPixelSize * pixelMult)
    }
  }
}

canvasSketch(sketch, {
  dimensions: [SIZE, SIZE],
  animate: true,
  fps: FPS
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
