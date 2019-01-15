const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const vec2 = require('gl-vec2')

const SIZE = 1024

const settings = {
  seed: 0,
  lineCount: 800,
  gridSize: 9,
  startSize: 0.9,
  cellRenderChance: 0.3,
  noiseFreq: 1,
  noiseAmp: 200,
  stepSize: 18,
  opacity: 40
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).onChange(setup)
gui.add(settings, 'lineCount', 1, 10000).step(1).onChange(setup)
gui.add(settings, 'gridSize', 1, 10).step(1).onChange(setup)
gui.add(settings, 'startSize', 0, 1).onChange(setup)
gui.add(settings, 'cellRenderChance', 0, 1).onChange(setup)
gui.add(settings, 'noiseFreq', 0, 20).onChange(setup)
gui.add(settings, 'noiseAmp', 0, 1000).onChange(setup)
gui.add(settings, 'stepSize', 0, 100).onChange(setup)
gui.add(settings, 'opacity', 0, 100)

let rand, cells, lines

function setup () {
  rand = random.createRandom(settings.seed)

  lines = (new Array(settings.lineCount)).fill().map(() => {
    const center = [SIZE / 2, SIZE / 2]
    const points = [vec2.add(center, center, rand.insideCircle(settings.startSize * SIZE * 0.5))]
    return {points}
  })

  cells = (new Array(settings.gridSize * settings.gridSize)).fill().map((_, i) => ({
    position: [i % settings.gridSize, i / settings.gridSize | 0],
    lines: lines.filter(() => rand.chance(settings.cellRenderChance))
  }))
}

const sketch = () => {
  setup()
  return ({ context, width, height, time }) => {
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    const cellDimensions = [
      width / settings.gridSize,
      height / settings.gridSize
    ]

    lines.forEach(line => {
      const curPosition = line.points[line.points.length - 1]
      const cell = [
        Math.max(0, Math.min(curPosition[0], SIZE)) / cellDimensions[0] | 0,
        Math.max(0, Math.min(curPosition[1], SIZE)) / cellDimensions[1] | 0
      ]
      const cellIdx = cell[0] * settings.gridSize + cell[1]
      console.log(cellIdx)
      const isOnInCell = cells[cellIdx].lines.includes(line)
      const angle = (rand.noise2D(
        curPosition[0], curPosition[1],
        settings.noiseFreq / 10000000 * Math.pow(cellIdx, 2), settings.noiseAmp / 100
      ) + 1) * Math.PI
      const magnitude = rand.noise2D(
        curPosition[0] + 10000, curPosition[1] + 10000,
        settings.noiseFreq / 10000, settings.noiseAmp / 100
      ) * 0.5 + 0.8
      const velocity = [
        Math.cos(angle) * magnitude * settings.stepSize,
        Math.sin(angle) * magnitude * settings.stepSize
      ]

      line.points.push([
        curPosition[0] + (isOnInCell && cellIdx % 2 === 0 ? velocity[0] : -1 * velocity[1]),
        curPosition[1] + (isOnInCell && cellIdx % 2 === 0 ? velocity[1] : velocity[0])
      ])
    })

    cells.forEach((cell, i) => {
      const clippingArea = [
        cell.position[0] / settings.gridSize * width,
        cell.position[1] / settings.gridSize * height
      ]
      context.save()
      context.beginPath()
      context.rect(
        clippingArea[0], clippingArea[1],
        cellDimensions[0], cellDimensions[1]
      )
      context.clip()
      cell.lines.forEach(l => drawLine(context, l.points))
      context.restore()
    })
  }
}

canvasSketch(sketch, {
  dimensions: [ SIZE, SIZE ],
  animate: true
})

function drawLine (ctx, points) {
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (let pt of points.slice(1)) {
    ctx.lineTo(pt[0], pt[1])
  }
  ctx.strokeStyle = `rgba(40, 40, 40, ${settings.opacity / 100})`
  ctx.stroke()
}
