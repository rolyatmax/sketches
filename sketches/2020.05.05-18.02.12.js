/**
 * Making grids using ideas from Oskar Stalberg - https://twitter.com/OskSta/status/1246729301434798080/photo/1
 */
const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const palettes = require('nice-color-palettes')
const vec2 = require('gl-vec2')

const WIDTH = 2048
const HEIGHT = 2048

const settings = {
  seed: 1,
  margin: 200,
  palette: 10,
  gridSize: 50,
  permutationIterations: 10,
  stepSize: 0.1,
  cellSize: 1,
  noiseFreq: 0.001,
  noiseSize: 100,
  colorCells: true,
  drawLines: true
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'margin', 0, 400).onChange(setup)
gui.add(settings, 'palette', 0, palettes.length).step(1)
gui.add(settings, 'gridSize', 1, 100).onChange(setup)
gui.add(settings, 'permutationIterations', 0, 200).step(1).onChange(setup)
gui.add(settings, 'stepSize', 0.01, 1).step(0.01).onChange(setup)
gui.add(settings, 'cellSize', 1, 50).onChange(setup)
gui.add(settings, 'noiseFreq', 0.0001, 0.01).onChange(setup)
gui.add(settings, 'noiseSize', 0.01, 300).onChange(setup)
gui.add(settings, 'colorCells')
gui.add(settings, 'drawLines')

let rand, positions, quads

function setup () {
  rand = random.createRandom(settings.seed)

  positions = []
  quads = []

  const columns = (WIDTH - settings.margin * 2) / settings.gridSize | 0
  const rows = (HEIGHT - settings.margin * 2) / settings.gridSize | 0
  const offset = [
    (WIDTH - columns * settings.gridSize) / 2,
    (HEIGHT - rows * settings.gridSize) / 2
  ]
  const positionsMap = {}
  for (let x = 0; x < columns; x++) {
    for (let y = 0; y < rows; y++) {
      const pIdx = positions.length
      positions.push(vec2.scaleAndAdd([], offset, [x, y], settings.gridSize))
      positionsMap[`${x}|${y}`] = pIdx
      if (x !== 0 && y !== 0) {
        quads.push([
          positionsMap[`${x - 1}|${y - 1}`],
          positionsMap[`${x}|${y - 1}`],
          positionsMap[`${x}|${y}`],
          positionsMap[`${x - 1}|${y}`]
        ])
      }
    }
  }

  for (const p of positions) {
    const t = rand.noise2D(p[0], p[1], settings.noiseFreq)
    const w = rand.noise2D(p[0] + 1000, p[1] + 1000, settings.noiseFreq)
    const angle = (t + 1) * Math.PI
    const mag = (w * 0.5 + 0.5) * settings.noiseSize
    const delta = [
      Math.cos(angle) * mag,
      Math.sin(angle) * mag
    ]

    vec2.add(p, p, delta)
  }

  adjustQuads(positions, quads)
}

function adjustQuads (positions, quads) {
  let k = settings.permutationIterations
  while (k--) {
    const adjustments = []
    for (const quad of quads) {
      const quadPositions = quad.map(idx => positions[idx])
      const center = quadPositions.reduce((center, p) => vec2.scaleAndAdd(center, center, p, 0.25), [0, 0])
      const diffs = quadPositions.map(p => vec2.subtract([], p, center))
      const rotatedDiffs = diffs.map((diff, i) => vec2.normalize([], vec2.rotate([], diff, i / 2 * Math.PI)))
      const average = rotatedDiffs.reduce((average, p) => vec2.scaleAndAdd(average, average, p, 0.25), [0, 0])
      const destinations = [
        average,
        vec2.rotate([], average, -0.5 * Math.PI),
        vec2.rotate([], average, -1 * Math.PI),
        vec2.rotate([], average, -1.5 * Math.PI)
      ].map(p => vec2.scaleAndAdd(p, center, p, settings.cellSize))
      for (let n = 0; n < quad.length; n++) {
        const pIdx = quad[n]
        adjustments[pIdx] = adjustments[pIdx] || [0, 0]
        const delta = vec2.subtract([], destinations[n], positions[pIdx])
        vec2.scaleAndAdd(adjustments[pIdx], adjustments[pIdx], delta, settings.stepSize)
      }
    }
    for (let n = 0; n < positions.length; n++) {
      if (!adjustments[n]) continue
      vec2.add(positions[n], positions[n], adjustments[n])
    }
  }
}

const sketch = () => {
  setup()
  return ({ context, width, height }) => {
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    let j = 0
    for (const q of quads) {
      j++
      const [p1, p2, p3, p4] = q.map(idx => positions[idx])
      context.beginPath()
      context.moveTo(p1[0], p1[1])
      context.lineTo(p2[0], p2[1])
      context.lineTo(p3[0], p3[1])
      context.lineTo(p4[0], p4[1])
      context.lineTo(p1[0], p1[1])
      if (settings.colorCells) {
        const selectedPalette = palettes[settings.palette]
        context.fillStyle = selectedPalette[j % selectedPalette.length]
        context.fill()
      }
      if (settings.drawLines) {
        context.lineWidth = 2
        context.strokeStyle = '#333'
        context.stroke()
      }
    }
  }
}

canvasSketch(sketch, {
  dimensions: [WIDTH, HEIGHT],
  animate: true
})

function createPaletteSpring (stiffness, damping, initialPalette) {
  const color1Spring = createSpring(stiffness, damping, initialPalette[0])
  const color2Spring = createSpring(stiffness, damping, initialPalette[1])
  const color3Spring = createSpring(stiffness, damping, initialPalette[2])
  const color4Spring = createSpring(stiffness, damping, initialPalette[3])
  const color5Spring = createSpring(stiffness, damping, initialPalette[4])

  function setDestination (palette) {
    color1Spring.setDestination(palette[0])
    color2Spring.setDestination(palette[1])
    color3Spring.setDestination(palette[2])
    color4Spring.setDestination(palette[3])
    color5Spring.setDestination(palette[4])
  }

  function tick (s, d) {
    color1Spring.tick(s, d)
    color2Spring.tick(s, d)
    color3Spring.tick(s, d)
    color4Spring.tick(s, d)
    color5Spring.tick(s, d)
  }

  function getCurrentValue () {
    return [
      color1Spring.getCurrentValue(),
      color2Spring.getCurrentValue(),
      color3Spring.getCurrentValue(),
      color4Spring.getCurrentValue(),
      color5Spring.getCurrentValue()
    ]
  }

  return { setDestination, tick, getCurrentValue }
}

function hexToRgb (hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255
  ]
}

function getEdgeId (edgePositions) {
  edgePositions = edgePositions.slice()
  edgePositions.sort((a, b) => a - b)
  return edgePositions.join('|')
}
