const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')

const WIDTH = 1024
const HEIGHT = 1024

const settings = {
  seed: 1,
  gridSize: 10,
  threshold: 0.7,
  noiseFreq: 0.008,
  isolines: 35,
  opacity: 0.8,
  lineWidth: 1
}

const sketch = ({ render }) => {
  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(render)
  gui.add(settings, 'gridSize', 2, 50).step(1).onChange(render)
  gui.add(settings, 'threshold', -1, 1).onChange(render)
  gui.add(settings, 'noiseFreq', 0, 0.1).onChange(render)
  gui.add(settings, 'isolines', 1, 100).step(1).onChange(render)
  gui.add(settings, 'opacity', 0, 1).step(0.01).onChange(render)
  gui.add(settings, 'lineWidth', 0.1, 5).onChange(render)

  const rand = random.createRandom(settings.seed)

  function noise (x, y, z) {
    const t1 = rand.noise3D(x, y, z, settings.noiseFreq)
    const t2 = rand.noise3D(x + 100, y + 200, z, settings.noiseFreq * 1.2)
    return Math.min(t1, t2)
  }

  return ({ context, width, height }) => {
    const isolines = new Array(settings.isolines).fill().map((_, i) => {
      const threshold = i / (settings.isolines - 1) * 2 - 1 + settings.threshold
      return { threshold }
    })

    const lineGroups = isolines.map(() => [])
    const xOffset = (WIDTH - Math.floor(WIDTH / settings.gridSize) * settings.gridSize) / 2
    const yOffset = (HEIGHT - Math.floor(HEIGHT / settings.gridSize) * settings.gridSize) / 2
    for (let x = xOffset; x < WIDTH; x += settings.gridSize) {
      for (let y = yOffset; y < HEIGHT; y += settings.gridSize) {
        for (let i = 0; i < isolines.length; i++) {
          const { threshold } = isolines[i]
          lineGroups[i].push(...getLinesForSquare(x, y, 0, settings.gridSize, threshold, noise))
        }
      }
    }
    context.clearRect(0, 0, width, height)
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    context.beginPath()
    context.lineWidth = settings.lineWidth
    context.strokeStyle = `rgba(0, 0, 0, ${settings.opacity})` // isolines[i].stroke
    for (let i = 0; i < isolines.length; i++) {
      for (const line of lineGroups[i]) {
        context.moveTo(line[0][0], line[0][1])
        context.lineTo(line[1][0], line[1][1])
      }
    }
    context.stroke()
  }
}

canvasSketch(sketch, {
  dimensions: [WIDTH, HEIGHT]
})

function getLinesForSquare (x, y, z, gridSize, threshold, getValue) {
  const x1 = x - gridSize / 2
  const x2 = x + gridSize / 2
  const y1 = y - gridSize / 2
  const y2 = y + gridSize / 2

  const p1 = Number(getValue(x1, y1, z) < threshold)
  const p2 = Number(getValue(x2, y1, z) < threshold)
  const p3 = Number(getValue(x2, y2, z) < threshold)
  const p4 = Number(getValue(x1, y2, z) < threshold)

  const permutation = p1 * 8 + p2 * 4 + p3 * 2 + p4 * 1

  const a = [x, y1]
  const b = [x2, y]
  const c = [x, y2]
  const d = [x1, y]

  switch (permutation) {
    case 1:
      return [[c, d]]
    case 2:
      return [[b, c]]
    case 3:
      return [[b, d]]
    case 4:
      return [[a, b]]
    case 5:
      return [[a, d], [b, c]]
    case 6:
      return [[a, c]]
    case 7:
      return [[a, d]]
    case 8:
      return [[a, d]]
    case 9:
      return [[a, c]]
    case 10:
      return [[a, b], [c, d]]
    case 11:
      return [[a, b]]
    case 12:
      return [[b, d]]
    case 13:
      return [[b, c]]
    case 14:
      return [[c, d]]
    default:
      return []
  }
}
