const fit = require('canvas-fit')
const { GUI } = require('dat-gui')
const newArray = require('new-array')
const Alea = require('alea')
const SimplexNoise = require('simplex-noise')
const project = require('camera-project')
const mat4 = require('gl-mat4')
const vec2 = require('gl-vec2')

const canvas = document.body.appendChild(document.createElement('canvas'))
const ctx = canvas.getContext('2d')
const resize = fit(canvas)

window.addEventListener('resize', () => { resize(); setup() }, false)

const settings = {
  seed: 0,
  gridGranularity: 10,
  opacity: 0.8,
  fillOpacity: 0,
  lineWidth: 1,
  drawers: 5,
  drawerSteps: 30,
  noiseGranularity: 55,
  noiseMagnitude: 3,
  lineNoiseSampling: 3,
  panels: 5,
  t: 0
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'gridGranularity', 1, 40).step(1).onChange(setup)
gui.add(settings, 'opacity', 0, 1).step(0.01)
gui.add(settings, 'fillOpacity', 0, 1).step(0.01)
gui.add(settings, 'lineWidth', 0.1, 5).step(0.1)
gui.add(settings, 'drawers', 1, 100).step(1).onChange(setup)
gui.add(settings, 'drawerSteps', 1, 500).step(1).onChange(setup)
gui.add(settings, 'noiseGranularity', 1, 100).onChange(setup)
gui.add(settings, 'noiseMagnitude', 0, 10).step(0.1).onChange(setup)
gui.add(settings, 'lineNoiseSampling', 1, 50).step(1).onChange(setup)
gui.add(settings, 't', 0, Math.PI * 100).onChange(setup)

let lines, rand, simplex
// let panels
// const t = 0

ctx.globalCompositeOperation = 'darken'

setup()
// requestAnimationFrame(function loop () {
//   t += 1
//   requestAnimationFrame(loop)
//   render(t)
// })

function setup () {
  rand = new Alea(settings.seed)
  simplex = new SimplexNoise(rand)

  lines = newArray(settings.drawers).map(() => {
    const line = [[
      rand() * (settings.gridGranularity + 1) | 0,
      rand() * (settings.gridGranularity + 1) | 0,
      rand() * (settings.gridGranularity + 1) | 0
    ]]
    let n = settings.drawerSteps
    while (n--) {
      const nextPt = line[line.length - 1].slice()
      const coord = rand() * 3 | 0
      nextPt[coord] += rand() > 0.5 ? 1 : -1
      // TODO: make sure drawers stay within grid?
      // TODO: make sure drawers don't draw back on their own paths?
      nextPt[coord] = Math.min(Math.max(nextPt[coord], 0), settings.gridGranularity)
      line.push(nextPt)
    }
    return line.map(pt => pt.map(coord => coord / settings.gridGranularity))
  })

  // panels = newArray(settings.panels).map(() => {
  //   const origin = [
  //     rand() * (settings.gridGranularity + 1) | 0,
  //     rand() * (settings.gridGranularity + 1) | 0,
  //     rand() * (settings.gridGranularity + 1) | 0
  //   ]
  // two out of the three dimensions needs to translate by 1. Pick one dimension at random to _not_ translate
  // const skipDim = rand() * 3 | 0
  // const square = [origin]
  // const oppositePt = origin.map((v, i) => i === skipDim ? v : v + 1)
  // })

  console.log(lines)
  // grid
  // for (let x = 0; x <= settings.gridGranularity; x++) {
  //   for (let z = 0; z <= settings.gridGranularity; z++) {
  //     lines.push([
  //       [x / settings.gridGranularity, 0, z / settings.gridGranularity],
  //       [x / settings.gridGranularity, 1, z / settings.gridGranularity]
  //     ], [
  //       [0, x / settings.gridGranularity, z / settings.gridGranularity],
  //       [1, x / settings.gridGranularity, z / settings.gridGranularity]
  //     ])
  //   }
  // }
  render(settings.t)
}

function render (t) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const viewport = [0, 0, canvas.width, canvas.height]

  const proj = mat4.create()
  const view = mat4.create()

  const position = [Math.sin(t / 100) * 2, Math.sin(t / 100) * 3, Math.cos(t / 100) * 6]
  const up = [0, 1, 0]

  mat4.ortho(proj, -1.5, 1.5, -1.5, 1.5, -1.5, 1.5)
  const center = [0.5, 0.5, 0.5]
  mat4.lookAt(view, position, center, up)

  const combined = mat4.multiply([], proj, view)

  lines.forEach(line => {
    const pts = line.map(pt => {
      return project([], pt, viewport, combined)
      // return [
      //   x * canvasSize + offset[0],
      //   y * canvasSize + offset[1]
      // ]
    })
    let noisifiedPts = []
    for (let n = 1; n < pts.length; n += 1) {
      const newPts = noisifyLine(pts[n - 1], pts[n], n * 99)
      noisifiedPts = noisifiedPts.concat(newPts)
    }

    ctx.beginPath()
    ctx.moveTo(noisifiedPts[0][0], noisifiedPts[0][1])
    for (const pt of noisifiedPts.slice(1)) {
      ctx.lineTo(pt[0], pt[1])
    }
    ctx.strokeStyle = `rgba(30, 30, 30, ${settings.opacity})`
    ctx.fillStyle = `rgba(30, 30, 30, ${settings.fillOpacity})`
    ctx.lineWidth = settings.lineWidth
    ctx.stroke()
    ctx.fill()
  })
}

function noisifyLine (pt1, pt2, noiseOffset) {
  const noisifiedLine = [pt1]
  const segmentVector = vec2.subtract([], pt2, pt1)
  const direction = vec2.normalize([], segmentVector)
  const perpDirection = [-1 * direction[1], direction[0]]
  const lineLength = vec2.length(segmentVector)
  const n = settings.lineNoiseSampling
  for (let a = n; a < lineLength; a += n) {
    const t = a / lineLength
    const pt = vec2.lerp([], pt1, pt2, t)
    // TODO: try this with 2D noise
    // const noiseVal = simplex.noise2D(0, noiseOffset + a / settings.noiseGranularity)
    const noiseVec = vec2.scale([], pt, 1 / settings.noiseGranularity)
    const noiseVal = simplex.noise2D(noiseVec[0], noiseVec[1])
    const newPt = vec2.add(pt, pt, vec2.scale([], perpDirection, noiseVal * settings.noiseMagnitude))
    noisifiedLine.push(newPt)
  }
  noisifiedLine.push(pt2)
  return noisifiedLine
}
