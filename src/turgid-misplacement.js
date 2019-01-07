/* global requestAnimationFrame */

const fit = require('canvas-fit')
const Alea = require('alea')
const SimplexNoise = require('simplex-noise')
const { randomNormal } = require('d3-random')
const { GUI } = require('dat-gui')

const canvas = document.body.appendChild(document.createElement('canvas'))

window.addEventListener('resize', fit(canvas))

const ctx = canvas.getContext('2d')
ctx.globalCompositeOperation = 'darker'

const settings = {
  seed: 9,
  points: 5,
  cellMargin: 0.6,
  pageMargin: 0.6,
  gridSize: 9,
  circleSize: 10,
  speed: 10,
  noiseSpeed: 1,
  noiseZoom: 1000
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'points', 0, 200).step(1).onChange(setup)
gui.add(settings, 'cellMargin', 0, 3).step(0.01)
gui.add(settings, 'pageMargin', 0, 1).step(0.01)
gui.add(settings, 'gridSize', 0, 50).step(1).onChange(setup)
gui.add(settings, 'circleSize', 0, 50).step(1).onChange(setup)
gui.add(settings, 'speed', 0, 100).step(1).onChange(setup)
gui.add(settings, 'noiseSpeed', 0, 30).step(1).onChange(setup)
gui.add(settings, 'noiseZoom', 0, 10000).step(10).onChange(setup)

let rand, simplex, cells, randNormal

function setup () {
  rand = new Alea(settings.seed)
  simplex = new SimplexNoise(rand)
  randNormal = randomNormal.source(rand)
  cells = []

  for (let x = 0; x < settings.gridSize; x++) {
    for (let y = 0; y < settings.gridSize; y++) {
      cells.push({
        x: x,
        y: y,
        points: new Array(settings.points).fill(null).map(() => {
          const n = simplex.noise2D(x * settings.noiseZoom, y * settings.noiseZoom)
          const normal = randNormal(n)
          return {
            x: normal() * canvas.width,
            y: normal() * canvas.height
          }
        })
      })
    }
  }
}

function render (t) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const size = Math.min(canvas.width, canvas.height) * settings.pageMargin
  const offset = [(canvas.width - size) / 2, (canvas.height - size) / 2]

  const w = t * settings.noiseSpeed / 10000

  for (let cell of cells) {
    const s = size / settings.gridSize
    const o = [
      offset[0] + s * cell.x,
      offset[1] + s * cell.y
    ]
    renderCell(cell.points, s, o, simplex.noise2D(cell.x * settings.noiseZoom + w, cell.y * settings.noiseZoom + w))
  }

  function renderCell (points, size, offset, entropy) {
    function position (v) {
      const n = Math.sin(v + t * settings.speed / 10000 + entropy) * 0.5 + 0.5
      return (n * settings.cellMargin + (1 - settings.cellMargin) / 2) * size * (entropy * 0.5 + 0.9)
    }

    const w = 1000 // t / 1000 | 0 + 1

    ctx.beginPath()
    for (let n = 0; n < points.length; n++) {
      const prev = points[n - w < 0 ? points.length - 1 : n - w]
      const cur = points[n]
      const next = points[n + w >= points.length ? 0 : n + w]
      ctx.bezierCurveTo(
        position(prev.x) + offset[0],
        position(prev.y) + offset[1],
        position(next.x) + offset[0],
        position(next.y) + offset[1],
        position(cur.x) + offset[0],
        position(cur.y) + offset[1]
      )
    }
    ctx.strokeStyle = `hsla(${entropy * 90 + t / 20}, 70%, 50%, ${entropy * 0.3 + 0.7})`
    ctx.stroke()

    for (let p of points) {
      ctx.beginPath()
      ctx.arc(position(p.x) + offset[0], position(p.y) + offset[1], settings.circleSize / settings.gridSize, 0, Math.PI * 2)
      ctx.fillStyle = 'hsla(150, 50%, 50%, 0.4)'
      ctx.fill()
    }
  }
}

setup()
requestAnimationFrame(function loop (t) {
  requestAnimationFrame(loop)
  render(t)
})

function getWeightedRandom (rand) {
  return function weightedRandom (choices) {
    let r = rand()
    for (let choice of choices) {
      if (choice.weight < r) {
        return choice.value
      }
      r -= choice.weight
    }
    return choices[choices.length - 1].value
  }
}
