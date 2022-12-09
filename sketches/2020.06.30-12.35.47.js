/**
 * Making heathered textures?
 */
const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const palettes = require('nice-color-palettes').map(p => p.map(hexToRgb))
const vec2 = require('gl-vec2')

const WIDTH = 1024
const HEIGHT = 1024

const settings = {
  seed: 6502,
  palette: 5,
  lineCount: 700000,
  lineLength: 50,
  lineLengthStdDev: 38,
  noiseFreq: 0.0002,
  opacity: 0.09
}

function onChange () {
  render()
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(onChange)
gui.add(settings, 'lineCount', 1000, WIDTH * HEIGHT).step(1).onChange(onChange)
gui.add(settings, 'palette', 0, palettes.length).step(1).onChange(onChange)
gui.add(settings, 'noiseFreq', 0.0001, 0.01).onChange(onChange)
gui.add(settings, 'lineLength', 1, 200).onChange(onChange)
gui.add(settings, 'lineLengthStdDev', 0, 50).onChange(onChange)
gui.add(settings, 'opacity', 0, 1).step(0.01).onChange(onChange)

let rand, lines, colors, render

const sketch = (opts) => {
  render = opts.render
  return ({ context, width, height }) => {
    rand = random.createRandom(settings.seed)

    const linesCount = settings.lineCount

    lines = new Float32Array(linesCount * 4)
    colors = []

    let i = 0
    while (i < lines.length) {
      const center = [rand.range(0, WIDTH), rand.range(0, HEIGHT)]
      const lineLength = rand.gaussian(settings.lineLength, settings.lineLengthStdDev)
      const angleMean = rand.noise2D(center[0], center[1], settings.noiseFreq * 0.09, Math.PI)
      const stddev = (rand.noise2D(center[0], center[1], settings.noiseFreq * 0.09, 0.5) + 0.5) * 0.2
      const angle = rand.gaussian(angleMean, stddev)
      const dir = [Math.cos(angle), Math.sin(angle)]
      vec2.scale(dir, dir, lineLength * 0.5)
      const start = vec2.add([], center, dir)
      const end = vec2.sub([], center, dir)
      lines[i++] = start[0]
      lines[i++] = start[1]
      lines[i++] = end[0]
      lines[i++] = end[1]

      const COLOR_STD_DEV = 1

      const startColorMean = (specialNoise2D(start[0], start[1], settings.noiseFreq) + 0.5) * 5
      const startColorIdx = clamp(rand.gaussian(startColorMean, COLOR_STD_DEV), 0, 4) | 0
      const startColor = palettes[settings.palette][startColorIdx]

      const endColorMean = (specialNoise2D(end[0], end[1], settings.noiseFreq) + 0.5) * 5
      const endColorIdx = clamp(rand.gaussian(endColorMean, COLOR_STD_DEV), 0, 4) | 0
      const endColor = palettes[settings.palette][endColorIdx]

      const gradient = context.createLinearGradient(start[0], start[1], end[0], end[1])
      gradient.addColorStop(0, `rgba(${startColor.join(',')}, ${settings.opacity})`)
      gradient.addColorStop(1, `rgba(${endColor.join(',')}, ${settings.opacity})`)
      colors.push(gradient)
    }

    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    for (let i = 0; i < linesCount; i++) {
      const startX = lines[i * 4]
      const startY = lines[i * 4 + 1]
      const endX = lines[i * 4 + 2]
      const endY = lines[i * 4 + 3]
      const gradient = colors[i]
      context.beginPath()
      context.moveTo(startX, startY)
      context.lineTo(endX, endY)
      context.strokeStyle = gradient
      context.stroke()
    }
  }
}

canvasSketch(sketch, {
  dimensions: [WIDTH, HEIGHT],
  animate: false
})

// function specialNoise2D (x, y, freq) {
//   const t1 = rand.noise2D(x, y, freq)
//   const t2 = rand.noise2D(x + 100, y + 100, freq * 0.66667)
//   const t3 = rand.noise2D(x + 300, y + 300, freq * 0.33333)
//   const t4 = rand.noise2D(x + 900, y + 900, freq * 0.016667)
//   return t1 * t2 * t3 * t4
// }

function specialNoise2D (x, y, freq) {
  const t1 = rand.noise2D(x, y, freq)
  const t2 = rand.noise2D(x + 100, y + 100, freq * t1)
  const t3 = rand.noise2D(x + 300, y + 300, freq * t2)
  const t4 = rand.noise2D(x + 900, y + 900, freq * t3)
  return t1 * t2 * t3 * t4
}

// function createPaletteSpring (stiffness, damping, initialPalette) {
//   const color1Spring = createSpring(stiffness, damping, initialPalette[0])
//   const color2Spring = createSpring(stiffness, damping, initialPalette[1])
//   const color3Spring = createSpring(stiffness, damping, initialPalette[2])
//   const color4Spring = createSpring(stiffness, damping, initialPalette[3])
//   const color5Spring = createSpring(stiffness, damping, initialPalette[4])

//   function setDestination (palette) {
//     color1Spring.setDestination(palette[0])
//     color2Spring.setDestination(palette[1])
//     color3Spring.setDestination(palette[2])
//     color4Spring.setDestination(palette[3])
//     color5Spring.setDestination(palette[4])
//   }

//   function tick (s, d) {
//     color1Spring.tick(s, d)
//     color2Spring.tick(s, d)
//     color3Spring.tick(s, d)
//     color4Spring.tick(s, d)
//     color5Spring.tick(s, d)
//   }

//   function getCurrentValue () {
//     return [
//       color1Spring.getCurrentValue(),
//       color2Spring.getCurrentValue(),
//       color3Spring.getCurrentValue(),
//       color4Spring.getCurrentValue(),
//       color5Spring.getCurrentValue()
//     ]
//   }

//   return { setDestination, tick, getCurrentValue }
// }

function hexToRgb (hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ]
}

function clamp (t, start, end) {
  if (t < start) return start
  if (t > end) return end
  return t
}
