const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const vec2 = require('gl-vec2')
const palettes = require('nice-color-palettes')
const { createSpring } = require('spring-animator')
const Delaunator = require('delaunator')

const WIDTH = 1024
const HEIGHT = 576

const BIN_SIZE = 100
const MAX_TRIES = 10000

const settings = {
  seed: 6827,
  palette: 32,
  agents: 1000,
  circleCount: 400000,
  minCircleSize: 3,
  maxCircleSize: 260,
  sizePower: 4.4,
  noiseOffset: 32515,
  noiseFreq: 0.0011,
  triScale: 0.6,
  lineWidth: 1,
  alpha: 1,
  colorChance: 5,
  dirAccel: 0.195,
  speed: 20,
  animationNoise: 0.01
}

const sketch = () => {
  let startFrame = 0
  let currentFrame = null

  const regenerateCircles = () => {
    createCircles()
    startFrame = currentFrame + 5
  }

  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(regenerateCircles)
  gui.add(settings, 'palette', 0, 99).step(1)
  gui.add(settings, 'agents', 0, 1000).step(1).onChange(regenerateCircles)
  gui.add(settings, 'circleCount', 1000, 1000000).step(1).onChange(regenerateCircles)
  gui.add(settings, 'minCircleSize', 1, 100).onChange(regenerateCircles)
  gui.add(settings, 'maxCircleSize', 1, 400).onChange(regenerateCircles)
  gui.add(settings, 'sizePower', -0.001, 7).onChange(regenerateCircles)
  gui.add(settings, 'noiseOffset', 0, 99999).onChange(regenerateCircles)
  gui.add(settings, 'noiseFreq', 0.0001, 0.005).step(0.0001).onChange(regenerateCircles)
  gui.add(settings, 'triScale', 0, 5).step(0.01)
  gui.add(settings, 'lineWidth', 0, 10).step(0.01)
  gui.add(settings, 'alpha', 0, 1).step(0.01)
  gui.add(settings, 'colorChance', 0, 5).step(0.01)
  gui.add(settings, 'dirAccel', 0, 0.2).step(0.0001).onChange(regenerateCircles)
  gui.add(settings, 'speed', 1, 600).step(1).onChange(regenerateCircles)
  gui.add(settings, 'animationNoise', 0.0001, 0.03).step(0.0001).onChange(regenerateCircles)
  gui.add({ restart: regenerateCircles }, 'restart')

  let triangles = []

  createCircles()
  function createCircles () {
    const rand = random.createRandom(settings.seed)

    // make a bunch of circles first and then insert the largest ones first
    const circles = []
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

    const pts = circles.map(c => [c.x, c.y])
    triangles = []

    const triangulatedPositions = Delaunator.from(pts).triangles
    for (let i = 0; i < triangulatedPositions.length; i += 3) {
      const pos1 = pts[triangulatedPositions[i]]
      const pos2 = pts[triangulatedPositions[i + 1]]
      const pos3 = pts[triangulatedPositions[i + 2]]
      triangles.push({
        triScale: createSpring(0.05, 0.1, 0),
        positions: [pos1, pos2, pos3]
      })
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

  return ({ context, width, height, frame }) => {
    currentFrame = frame
    context.clearRect(0, 0, width, height)
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    const rand = random.createRandom(settings.seed)
    const colors = palettes[settings.palette].map(hexToRgb)

    for (const t of triangles) {
      const center = t.positions.reduce((memo, p) => [memo[0] + p[0] / 3, memo[1] + p[1] / 3], [0, 0])
      const pts = t.positions.map(p => {
        const cp = vec2.sub([], p, center)
        return vec2.scaleAndAdd([], center, cp, t.triScale.getCurrentValue())
      })

      const f = frame - startFrame
      if (f > settings.speed * (rand.noise2D(center[0], center[1], settings.animationNoise) * 0.5 + 0.5)) {
        t.triScale.setDestination(settings.triScale)
      } else {
        t.triScale.setDestination(0)
      }
      t.triScale.tick()

      context.beginPath()
      context.lineWidth = settings.lineWidth
      context.moveTo(pts[0][0], pts[0][1])
      context.lineTo(pts[1][0], pts[1][1])
      context.lineTo(pts[2][0], pts[2][1])
      context.closePath()

      const val1 = rand.noise2D(center[0], center[1], 0.0003)
      const val2 = rand.noise2D(center[0] + 100000, center[1], 0.0004)
      const chance1 = Math.abs(rand.noise2D(center[0] + 900, center[1] + 900, 0.0005))
      if (rand.chance(chance1 * settings.colorChance)) {
        const idx1 = 4 * (val1 * 0.5 + 0.5) | 0
        const idx2 = 4 * (val2 * 0.5 + 0.5) | 0

        const a1 = Math.abs(rand.noise2D(center[0] + 500, center[1], 0.0003))
        const a2 = Math.abs(rand.noise2D(center[0] + 500000000, center[1], 0.0005))
        const chance2 = rand.chance(rand.noise2D(center[0] + 999999, center[1], 0.0002) * 0.5 + 0.5) ? a1 : a2

        const color = rand.chance(chance2) ? colors[idx1] : colors[idx2]
        const alpha = rand.noise2D(center[0], center[1] - 9876, 0.0007) * settings.alpha + settings.alpha
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
  dimensions: [WIDTH, HEIGHT],
  animate: true
})

function hexToRgb (hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ]
}
