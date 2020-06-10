const canvasSketch = require('canvas-sketch')
const { GUI } = require('dat-gui')
const Alea = require('alea')
const { polygonHull, polygonCentroid } = require('d3-polygon')
const catRomSpline = require('cat-rom-spline')
const vec2 = require('gl-vec2')

const WIDTH = 2048
const HEIGHT = 2048

const settings = {
  seed: 0,
  margin: 0.2,
  numBlobs: 5,
  blobSize: 300,
  blobSpread: 0.15,
  numDots: 200,
  spread: 600,
  spreadPow: 0.5,
  hueStart: 100,
  hueSpread: 50,
  lSpread: 10,
  alpha: 0.8,
  showPoints: true
}

const sketch = ({ render }) => {
  const gui = new GUI()
  gui.add(settings, 'seed', 0, 1000).step(1).onChange(render)
  gui.add(settings, 'margin', 0, 0.45).step(0.01).onChange(render)
  gui.add(settings, 'numBlobs', 2, 10).step(1).onChange(render)
  gui.add(settings, 'blobSize', 1, 1000).step(1).onChange(render)
  gui.add(settings, 'blobSpread', 0, 0.5).step(0.01).onChange(render)
  gui.add(settings, 'numDots', 3, 150).step(1).onChange(render)
  gui.add(settings, 'spread', 10, 2000).step(10).onChange(render)
  gui.add(settings, 'spreadPow', -0.1, 3).step(0.01).onChange(render)
  gui.add(settings, 'hueStart', 0, 360).step(1).onChange(render)
  gui.add(settings, 'hueSpread', 0, 360).step(1).onChange(render)
  gui.add(settings, 'lSpread', 0, 50).onChange(render)
  gui.add(settings, 'alpha', 0, 1).step(0.01).onChange(render)
  gui.add(settings, 'showPoints').onChange(render)

  return ({ context, width, height }) => {
    const rand = new Alea(settings.seed)

    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    const globalPoints = new Array(settings.numDots).fill().map(() => ([rand() * WIDTH, rand() * HEIGHT]))

    const blobCanvasWidth = 0.5 - (settings.numBlobs - 1) * settings.blobSpread / 2
    const blobPositions = new Array(settings.numBlobs).fill().map((_, i) => ([(blobCanvasWidth + i * settings.blobSpread) * WIDTH, 0.5 * HEIGHT]))

    blobPositions.forEach((pos, i) => {
      const prevHue = Math.max(0, (i - 1) / (blobPositions.length - 1)) * settings.hueSpread + settings.hueStart
      const thisHue = i / (blobPositions.length - 1) * settings.hueSpread + settings.hueStart
      const nextHue = Math.min(1, (i + 1) / (blobPositions.length - 1)) * settings.hueSpread + settings.hueStart
      const thisHueStart = (prevHue + thisHue) / 2
      const thisHueEnd = (nextHue + thisHue) / 2

      const pts = filterPointsByDist(globalPoints, pos, settings.blobSize)
      if (pts.length < 3) return
      const blobOutline = makeBlobFromPoints(pts, 1)
      fillBlob(context, rand, blobOutline, thisHueStart, thisHueEnd)
    })
  }
}

canvasSketch(sketch, {
  dimensions: [WIDTH, HEIGHT]
})

function fillBlob (context, rand, outline, hueStart, hueEnd) {
  const center = polygonCentroid(outline)
  const rads = rand() * Math.PI * 2
  const startPt = [
    Math.cos(rads) * settings.blobSize + center[0],
    Math.sin(rads) * settings.blobSize + center[1]
  ]
  const endPt = [
    Math.cos(rads + Math.PI) * settings.blobSize + center[0],
    Math.sin(rads + Math.PI) * settings.blobSize + center[1]
  ]

  const gradient = context.createLinearGradient(startPt[0], startPt[1], endPt[0], endPt[1])
  let w = 50
  const lStart = 50
  const lEnd = (rand() * 2 - 1) * settings.lSpread + lStart
  while (w--) {
    const t = w / 49
    const h = (hueEnd - hueStart) * t + hueStart
    const l = (lEnd - lStart) * t + lStart
    gradient.addColorStop(t, `hsla(${h}, 50%, ${l}%, ${settings.alpha})`)
  }

  context.beginPath()
  context.moveTo(outline[0][0], outline[0][1])
  for (const pt of outline.slice(1)) {
    context.lineTo(pt[0], pt[1])
  }
  context.lineTo(outline[0][0], outline[0][1])
  context.fillStyle = gradient
  context.fill()
}

// function getHueStops (linePoints, startHue, endHue, lineHueOffset = 0) {
//   const distances = linePoints.map((_, i) => {
//     return vec2.distance(linePoints[i], linePoints[(i + 1) % linePoints.length])
//   })
//   const totalLen = distances.reduce((t, d) => t + d, 0)

//   const hueDiff = endHue - startHue

//   let offset = lineHueOffset
//   const hues = new Array(linePoints.length).fill().map((_, i) => {
//     const hue = (offset % totalLen) / totalLen * hueDiff + startHue
//     offset += distances[i]
//     return hue
//   })

//   return hues
// }

function filterPointsByDist (points, origin, radius) {
  return points.filter((pt) => vec2.distance(origin, pt) <= radius)
}

// function makePoints (rand, size, position) {
//   return new Array(settings.numDots).fill().map(() => {
//     const rad = rand() * Math.PI * 2
//     const mag = Math.pow(rand(), settings.spreadPow) * size
//     const x = Math.cos(rad) * mag + position[0]
//     const y = Math.sin(rad) * mag + position[1]
//     return [x, y]
//   })
// }

function makeBlobFromPoints (points, curviness) {
  const hull = polygonHull(points)
  const anchors = hull.slice()
  anchors.push(anchors[0], anchors[1], anchors[2])
  const spline = catRomSpline(anchors, { samples: 15, knot: curviness })
  return spline
}
