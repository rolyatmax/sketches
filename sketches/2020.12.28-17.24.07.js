const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')

const WIDTH = 3840
const HEIGHT = 2160

const BIN_SIZE = 100
const MAX_TRIES = 10000

const settings = {
  seed: 5635,
  circleCount: 100000,
  minCircleSize: 5,
  maxCircleSize: 160,
  sizePower: 4.5,
  noiseOffset: 67197,
  noiseFreq: 0.0003,
  lineWidth: 0.2,
  showCenters: false
}

const sketch = ({ render }) => {
  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(render)
  gui.add(settings, 'circleCount', 1000, 1000000).step(1).onChange(render)
  gui.add(settings, 'minCircleSize', 1, 100).onChange(render)
  gui.add(settings, 'maxCircleSize', 1, 200).onChange(render)
  gui.add(settings, 'sizePower', -0.001, 5).onChange(render)
  gui.add(settings, 'noiseOffset', 0, 99999).onChange(render)
  gui.add(settings, 'noiseFreq', 0.0001, 0.005).step(0.0001).onChange(render)
  gui.add(settings, 'lineWidth', 0, 2).step(0.01).onChange(render)
  gui.add(settings, 'showCenters').onChange(render)

  return ({ context, width, height }) => {
    context.clearRect(0, 0, width, height)
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    const rand = random.createRandom(settings.seed)

    // make a bunch of circles first and then insert the largest ones first
    const circles = new Array(settings.circleCount).fill().map(getRandomCircle)
    circles.sort((a, b) => b.r - a.r)

    const circleBins = new Array(Math.ceil(WIDTH / BIN_SIZE)).fill().map(
      () => new Array(Math.ceil(HEIGHT / BIN_SIZE)).fill([])
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

    context.beginPath()
    context.lineWidth = settings.lineWidth
    context.strokeStyle = settings.showCenters ? '#000' : '#666'
    for (const c of circles) {
      const r = settings.showCenters ? 1 : c.r
      context.moveTo(c.x + r, c.y)
      context.arc(c.x, c.y, r, 0, Math.PI * 2)
    }
    context.stroke()

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
