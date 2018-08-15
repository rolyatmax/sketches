const canvasSketch = require('canvas-sketch')
const { GUI } = require('dat-gui')
const Alea = require('alea')
const { polygonHull } = require('d3-polygon')
const catRomSpline = require('cat-rom-spline')
const vec2 = require('gl-vec2')

const settings = {
  seed: 0,
  numBlobs: 5,
  blobSize: 300,
  numDots: 20,
  spread: 600,
  spreadPow: 0.5,
  hueStart: 100,
  hueSpread: 50,
  alpha: 0.8,
  lineWidth: 4
}

const sketch = ({ render }) => {
  const gui = new GUI()
  gui.add(settings, 'seed', 0, 1000).step(1).onChange(render)
  gui.add(settings, 'numBlobs', 1, 100).step(1).onChange(render)
  gui.add(settings, 'blobSize', 1, 1000).step(1).onChange(render)
  gui.add(settings, 'numDots', 3, 150).step(1).onChange(render)
  gui.add(settings, 'spread', 10, 2000).step(10).onChange(render)
  gui.add(settings, 'spreadPow', -0.1, 3).step(0.01).onChange(render)
  gui.add(settings, 'hueStart', 0, 360).step(1).onChange(render)
  gui.add(settings, 'hueSpread', 0, 360).step(1).onChange(render)
  gui.add(settings, 'alpha', 0, 1).step(0.01).onChange(render)
  gui.add(settings, 'lineWidth', 1, 20).onChange(render)

  return ({ context, width, height }) => {
    const rand = new Alea(settings.seed)

    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    const center = [width / 2, height / 2]

    let n = settings.numBlobs
    while (n--) {
      const rads = rand() * Math.PI * 2
      const mag = Math.pow(rand(), 0.5) * settings.spread
      const position = [
        Math.cos(rads) * mag + center[0],
        Math.sin(rads) * mag + center[1]
      ]

      const size = rand() * settings.blobSize
      const blobOutline = makeBlob(rand, position, size, 1)
      const colors = getGradients(context, rand, blobOutline)
      drawLine(context, blobOutline, colors, settings.lineWidth)
    }
  }
}

canvasSketch(sketch, {
  dimensions: [ 2048, 2048 ]
})

function getGradients (context, rand, line) {
  const hues = getHueStops(line, settings.hueStart, settings.hueStart + settings.hueSpread, rand() * 1000)
  const colorStops = hues.map((h) => `hsla(${h}, 50%, 50%, ${settings.alpha})`)
  const colors = []
  for (let k = 0; k < colorStops.length; k += 1) {
    const pt1 = line[k]
    const pt2 = line[(k + 1) % line.length]
    const color1 = colorStops[k]
    const color2 = colorStops[(k + 1) % colorStops.length]
    const gradient = context.createLinearGradient(pt1[0], pt1[1], pt2[0], pt2[1])
    gradient.addColorStop(0, color1)
    gradient.addColorStop(1, color2)
    colors.push(gradient)
  }
  return colors
}

function getHueStops (linePoints, startHue, endHue, lineHueOffset = 0) {
  const distances = linePoints.map((_, i) => {
    return vec2.distance(linePoints[i], linePoints[(i + 1) % linePoints.length])
  })
  const totalLen = distances.reduce((t, d) => t + d, 0)

  const hueDiff = endHue - startHue

  let offset = lineHueOffset
  const hues = new Array(linePoints.length).fill().map((_, i) => {
    const hue = (offset % totalLen) / totalLen * hueDiff + startHue
    offset += distances[i]
    return hue
  })

  return hues
}

function drawLine (context, points, colors, lineWidth = 1) {
  if (!Array.isArray(colors)) {
    colors = new Array(points.length).fill(colors)
  }

  if (colors.length !== points.length) {
    throw new Error('colors must either be a string or an array with a length equal to the points array')
  }

  for (let i = 0; i < points.length; i += 1) {
    const pt1 = points[i]
    const pt2 = points[(i + 1) % points.length]
    context.beginPath()
    context.moveTo(pt1[0], pt1[1])
    context.lineTo(pt2[0], pt2[1])
    context.strokeStyle = colors[i]
    context.lineWidth = lineWidth
    context.stroke()
  }
}

function makeBlob (rand, position, size, curviness) {
  const points = new Array(settings.numDots).fill().map(() => {
    const rad = rand() * Math.PI * 2
    const mag = Math.pow(rand(), settings.spreadPow) * size
    const x = Math.cos(rad) * mag + position[0]
    const y = Math.sin(rad) * mag + position[1]
    return [x, y]
  })

  const hull = polygonHull(points)
  const anchors = hull.slice()
  anchors.push(anchors[0], anchors[1], anchors[2])
  const spline = catRomSpline(anchors, { samples: 15, knot: curviness })
  return spline //.slice(0, spline.length - 45)
}
