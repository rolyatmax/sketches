const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const palettes = require('nice-color-palettes')

const WIDTH = 3840
const HEIGHT = 2160

const BIN_SIZE = 100
const MAX_TRIES = 10000

const settings = {
  seed: 6827,
  palette: 73,
  agents: 10,
  circleCount: 400000,
  minCircleSize: 35,
  maxCircleSize: 360,
  sizePower: 1.4,
  noiseOffset: 32515,
  noiseFreq: 0.0011,
  size: 1,
  lineWidth: 5.5,
  alpha: 1,
  colorChance: 2.6,
  dirAccel: 0.01
}

const sketch = ({ render }) => {
  const regenerateCircles = () => {
    createCircles()
    render()
  }

  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(regenerateCircles)
  gui.add(settings, 'palette', 0, 99).step(1).onChange(render)
  gui.add(settings, 'agents', 0, 1000).step(1).onChange(regenerateCircles)
  gui.add(settings, 'circleCount', 1000, 1000000).step(1).onChange(regenerateCircles)
  gui.add(settings, 'minCircleSize', 1, 100).onChange(regenerateCircles)
  gui.add(settings, 'maxCircleSize', 1, 400).onChange(regenerateCircles)
  gui.add(settings, 'sizePower', -0.001, 7).onChange(regenerateCircles)
  gui.add(settings, 'noiseOffset', 0, 99999).onChange(regenerateCircles)
  gui.add(settings, 'noiseFreq', 0.0001, 0.005).step(0.0001).onChange(regenerateCircles)
  gui.add(settings, 'size', 0, 5).step(0.01).onChange(render)
  gui.add(settings, 'lineWidth', 0, 10).step(0.01).onChange(render)
  gui.add(settings, 'alpha', 0, 1).step(0.01).onChange(render)
  gui.add(settings, 'colorChance', 0, 5).step(0.01).onChange(render)
  gui.add(settings, 'dirAccel', 0, 0.2).step(0.0001).onChange(regenerateCircles)

  let circles = []

  createCircles()
  function createCircles () {
    const rand = random.createRandom(settings.seed)

    // make a bunch of circles first and then insert the largest ones first
    circles = []
    const circleBins = new Array(Math.ceil(WIDTH / BIN_SIZE) + 1).fill().map(
      () => new Array(Math.ceil(HEIGHT / BIN_SIZE) + 1).fill().map(() => [])
    )

    function insertCircle (c) {
      circleBins[c.x / BIN_SIZE | 0][c.y / BIN_SIZE | 0].push(c)
    }

    const circleSizeRange = settings.maxCircleSize - settings.minCircleSize
    let n = settings.agents
    while (n--) {
      const pos = [rand.range(WIDTH), rand.range(HEIGHT)]
      let dir = rand.range(-1, 1) * Math.PI * 2
      const dirAccel = rand.range(-1, 1) * Math.PI * settings.dirAccel
      const r = rand.range(circleSizeRange) * 0.3 + settings.minCircleSize
      while (
        pos[0] >= -r && pos[1] >= -r &&
        pos[0] <= WIDTH + r && pos[1] <= HEIGHT + r
      ) {
        if (!collides(pos[0], pos[1], r, circleBins, settings.maxCircleSize)) {
          insertCircle({ x: pos[0], y: pos[1], r })
        }
        dir += dirAccel
        pos[0] += Math.cos(dir) * r * 2 + 1
        pos[1] += Math.sin(dir) * r * 2 + 1
      }
    }

    circles.sort((a, b) => b.r - a.r)

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
    const colors = palettes[settings.palette].map(hexToRgb)

    for (const c of circles) {
      context.beginPath()
      context.lineWidth = settings.lineWidth
      context.strokeStyle = rand.boolean() ? '#666' : '#ddd'
      context.arc(c.x, c.y, c.r * settings.size, 0, Math.PI * 2, false)

      const val1 = rand.noise2D(c.x, c.y, 0.0003)
      const val2 = rand.noise2D(c.x + 100000, c.y, 0.0004)
      const chance1 = Math.abs(rand.noise2D(c.x + 900, c.y + 900, 0.0005))
      if (rand.chance(chance1 * settings.colorChance)) {
        const idx1 = 4 * (val1 * 0.5 + 0.5) | 0
        const idx2 = 4 * (val2 * 0.5 + 0.5) | 0

        const a1 = Math.abs(rand.noise2D(c.x + 500, c.y, 0.0003))
        const a2 = Math.abs(rand.noise2D(c.x + 500000000, c.y, 0.0005))
        const chance2 = rand.chance(rand.noise2D(c.x + 999999, c.y, 0.0002) * 0.5 + 0.5) ? a1 : a2

        const color = rand.chance(chance2) ? colors[idx1] : colors[idx2]
        const alpha = rand.noise2D(c.x, c.y - 9876, 0.0007) * settings.alpha + settings.alpha
        context.strokeStyle = `rgba(${color.join(',')}, ${alpha})`
      } else {
        context.strokeStyle = rand.boolean() ? '#666' : '#ddd'
      }
      context.stroke()
    }
  }
}

function collides (x, y, r, circleBins, maxCircleSize) {
  const maxDist = maxCircleSize + r
  const bins = Math.ceil(maxDist / BIN_SIZE) + 1
  const i = x / BIN_SIZE | 0
  const j = y / BIN_SIZE | 0
  for (let di = -bins; di <= bins; di++) {
    for (let dj = -bins; dj <= bins; dj++) {
      if (
        i + di < circleBins.length && j + dj < circleBins[0].length &&
        i + di >= 0 && j + dj >= 0
      ) {
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

function hexToRgb (hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ]
}
