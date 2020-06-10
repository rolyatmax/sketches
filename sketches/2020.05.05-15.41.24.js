/**
 * Making grids using ideas from Oskar Stalberg - https://twitter.com/OskSta/status/1246729301434798080/photo/1
 */
const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const palettes = require('nice-color-palettes')
const Delaunator = require('delaunator')
const vec2 = require('gl-vec2')

const WIDTH = 2048
const HEIGHT = 2048
const CENTER = [WIDTH / 2, HEIGHT / 2]

const settings = {
  seed: 1,
  margin: 200,
  pointCount: 1000,
  palette: 10,
  permutationIterations: 100,
  stepSize: 0.1,
  cellSize: 30,
  fromCircle: true,
  colorCells: true,
  drawLines: true
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'margin', 0, 400).onChange(setup)
gui.add(settings, 'palette', 0, palettes.length).step(1)
gui.add(settings, 'pointCount', 0, 10000).step(1).onChange(setup)
gui.add(settings, 'permutationIterations', 0, 1000).step(1).onChange(setup)
gui.add(settings, 'stepSize', 0.01, 1).step(0.01).onChange(setup)
gui.add(settings, 'cellSize', 1, 50).onChange(setup)
gui.add(settings, 'fromCircle').onChange(setup)
gui.add(settings, 'colorCells')
gui.add(settings, 'drawLines')

let rand, positions, quads

function setup () {
  rand = random.createRandom(settings.seed)

  positions = []
  quads = []
  const triangles = []
  const edgeToTriangle = {}

  let n = settings.pointCount
  while (n--) {
    if (settings.fromCircle) {
      const radius = Math.min(...CENTER.map(v => v - settings.margin))
      const angle = rand.range(0, Math.PI * 2)
      const mag = Math.pow(rand.value(), 0.5) * radius
      positions.push([
        Math.cos(angle) * mag + CENTER[0],
        Math.sin(angle) * mag + CENTER[1]
      ])
    } else {
      positions.push([rand.rangeFloor(settings.margin, WIDTH - settings.margin), rand.rangeFloor(settings.margin, HEIGHT - settings.margin)])
    }
  }

  const triangulatedPositions = Delaunator.from(positions).triangles
  for (let i = 0; i < triangulatedPositions.length; i += 3) {
    const pos1 = triangulatedPositions[i]
    const pos2 = triangulatedPositions[i + 1]
    const pos3 = triangulatedPositions[i + 2]

    const triangleId = triangles.length
    triangles.push([pos1, pos2, pos3])

    const edges = [[pos1, pos2], [pos2, pos3], [pos3, pos1]]
    for (const edge of edges) {
      const id = getEdgeId(edge)
      edgeToTriangle[id] = edgeToTriangle[id] || []
      edgeToTriangle[id].push(triangleId)
    }
  }

  for (let curTriIdx = 0; curTriIdx < triangles.length; curTriIdx++) {
    const tri1 = triangles[curTriIdx]
    if (tri1 === null) continue
    const [p1, p2, p3] = tri1
    // go through each edge and find a connected triangle
    let connectedTri = null
    const edges = [[p1, p2], [p2, p3], [p3, p1]]
    for (const edge of edges) {
      const triIdx = edgeToTriangle[getEdgeId(edge)].filter(idx => idx !== curTriIdx)[0]
      if (triIdx !== undefined && triangles[triIdx] !== null) {
        connectedTri = triIdx
        break
      }
    }

    if (connectedTri !== null) {
      const tri2 = triangles[connectedTri]
      const commonVertices = tri1.filter(v => tri2.includes(v))
      const exclusiveVertices = [
        tri1.filter(v => !commonVertices.includes(v))[0],
        tri2.filter(v => !commonVertices.includes(v))[0]
      ]

      quads.push([
        commonVertices[0],
        exclusiveVertices[0],
        commonVertices[1],
        exclusiveVertices[1]
      ])

      triangles[connectedTri] = null
    }
    triangles[curTriIdx] = null
  }

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
    for (let n = 0; n < adjustments.length; n++) {
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
