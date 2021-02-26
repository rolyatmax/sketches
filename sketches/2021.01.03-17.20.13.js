const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const vec2 = require('gl-vec2')
const palettes = require('nice-color-palettes')

const WIDTH = 3840
const HEIGHT = 2160

const BIN_SIZE = 100
const MAX_TRIES = 10000

const settings = {
  seed: 2167,
  palette: 17,
  circleCount: 5000,
  minCircleSize: 3,
  maxCircleSize: 170,
  sizePower: 2.5,
  noiseOffset: 32515,
  noiseFreq: 0.00039,
  circleNoiseFreq: 0.017,
  circleNoiseMag: 0.9,
  circleGranularity: 24,
  lineWidth: 0.2,
  showCenters: false
}

const sketch = ({ render }) => {
  const regenerateCircles = () => {
    createCircles()
    render()
  }

  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(regenerateCircles)
  gui.add(settings, 'palette', 0, 99).step(1).onChange(render)
  gui.add(settings, 'circleCount', 1000, 1000000).step(1).onChange(regenerateCircles)
  gui.add(settings, 'minCircleSize', 1, 100).onChange(regenerateCircles)
  gui.add(settings, 'maxCircleSize', 1, 400).onChange(regenerateCircles)
  gui.add(settings, 'sizePower', -0.001, 7).onChange(regenerateCircles)
  gui.add(settings, 'noiseOffset', 0, 99999).onChange(regenerateCircles)
  gui.add(settings, 'noiseFreq', 0.0001, 0.005).step(0.0001).onChange(regenerateCircles)
  gui.add(settings, 'circleNoiseFreq', 0.0001, 0.1).step(0.0001).onChange(render)
  gui.add(settings, 'circleNoiseMag', 0, 1).step(0.01).onChange(render)
  gui.add(settings, 'circleGranularity', 3, 100).step(1).onChange(render)
  gui.add(settings, 'lineWidth', 0, 2).step(0.01).onChange(render)
  gui.add(settings, 'showCenters').onChange(render)

  let circles = []

  createCircles()
  function createCircles () {
    const rand = random.createRandom(settings.seed)

    // make a bunch of circles first and then insert the largest ones first
    circles = new Array(settings.circleCount).fill().map(getRandomCircle)
    circles.sort((a, b) => b.r - a.r)

    const circleBins = new Array(Math.ceil(WIDTH / BIN_SIZE)).fill().map(
      () => new Array(Math.ceil(HEIGHT / BIN_SIZE)).fill().map(() => [])
    )

    function insertCircle (c) {
      circleBins[c.x / BIN_SIZE | 0][c.y / BIN_SIZE | 0].push(c)
    }

    let count = 0

    for (const c of circles) {
      if (!collides(c.x, c.y, c.r, circleBins, settings.maxCircleSize)) {
        insertCircle(c)
        count += 1
      }
    }

    let tries = 0
    while (tries < MAX_TRIES && count < settings.circleCount) {
      const { x, y, r } = getRandomCircle()
      if (collides(x, y, r, circleBins, settings.maxCircleSize)) {
        tries += 1
      } else {
        insertCircle({ x, y, r })
        count += 1
        tries = 0
      }
    }

    // one last filter
    circles.length = 0
    for (const col of circleBins) {
      for (const cell of col) {
        for (const c of cell) {
          // const t = Math.floor(c.t * 100)
          // if (t === 20 || t === 40 || t === 60 || t === 80) {
          //   continue
          // }
          circles.push(c)
        }
      }
    }

    function getRandomCircle () {
      const circleSizeRange = settings.maxCircleSize - settings.minCircleSize
      const x = rand.range(WIDTH)
      const y = rand.range(HEIGHT)
      const t1 = (rand.noise2D(x + settings.noiseOffset, y, settings.noiseFreq, 0.5) + 0.5)
      const t2 = (rand.noise2D(x, y, settings.noiseFreq * 0.8, 0.5) + 0.5)
      const t = Math.min(t1, t2)
      const r = Math.pow(t, settings.sizePower) * circleSizeRange + settings.minCircleSize
      return { x, y, r, t }
    }
  }

  return ({ context, width, height }) => {
    context.clearRect(0, 0, width, height)
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    const rand = random.createRandom(settings.seed)
    const colors = palettes[settings.palette]

    for (const c of circles) {
      context.beginPath()
      if (settings.showCenters) {
        context.lineWidth = settings.lineWidth
        context.strokeStyle = '#000'
        context.moveTo(c.x + 1, c.y)
        context.arc(c.x, c.y, 1, 0, Math.PI * 2)
      } else {
        const val1 = rand.noise2D(c.x, c.y, 0.0001)
        const val2 = rand.noise2D(c.x + 100, c.y, 0.0002)
        const val = Math.min(val1, val2)
        if (rand.chance(Math.abs(val) * 0.25)) {
          context.lineWidth = c.r * 0.5
          const t = Math.max(val1, val2) * 0.5 + 0.5
          const idx = rand.rangeFloor(0, t * 4)
          context.strokeStyle = colors[idx]
        } else {
          context.lineWidth = 1
          context.strokeStyle = rand.boolean() ? '#666' : '#ddd'
        }
        const center = [c.x, c.y]
        for (let i = 0; i <= settings.circleGranularity; i += 1) {
          const t = i / settings.circleGranularity
          const rads = t * Math.PI * 2
          const dir = [Math.cos(rads), Math.sin(rads)]
          const pt = getPt(dir, 1, 1, c.r, center)
          if (i === 0) {
            context.moveTo(pt[0], pt[1])
          } else {
            context.lineTo(pt[0], pt[1])
          }
        }
      }
      context.closePath()
      context.stroke()
    }

    function getPt (dir, xPerc, yPerc, radius, center) {
      const mag = rand.noise2D(dir[0] * 10 + center[0], dir[1] * 10 + center[1], settings.circleNoiseFreq, settings.circleNoiseMag)
      const newDir = [
        dir[0] * (1 + mag * xPerc),
        dir[1] * (1 + mag * yPerc)
      ]
      return vec2.scaleAndAdd([], center, newDir, radius)
    }
  }
}

function collides (x, y, r, circleBins, maxCircleSize) {
  const maxDist = maxCircleSize + r
  const bins = Math.ceil(maxDist / BIN_SIZE)
  const i = x / BIN_SIZE | 0
  const j = y / BIN_SIZE | 0
  for (let di = 0; di <= bins; di++) {
    for (let dj = 0; dj <= bins; dj++) {
      if (i - di >= 0 && j - dj >= 0) {
        for (const c of circleBins[i - di][j - dj]) {
          if (circleIntersect(x, y, r, c.x, c.y, c.r)) {
            return true
          }
        }
      }

      if (di === 0 && dj === 0) continue

      if (i + di < circleBins.length && j + dj < circleBins[0].length) {
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

canvasSketch(sketch, {
  dimensions: [WIDTH, HEIGHT]
})
