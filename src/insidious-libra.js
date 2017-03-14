import Alea from 'alea'
import Color from 'color'
import Sketch from 'sketch-js'
import createCamera from 'perspective-camera'
import { GUI } from 'dat-gui'
import icosphere from 'icosphere'
import sortBy from 'lodash/sortBy'
import getPlaneNormal from 'get-plane-normal'
import { normalize, dot, subtract, add, scale } from 'gl-vec3'
import includeFont from './common/include-font'
import addTitle from './common/add-title'
import colorPalettes from './common/color-palettes'

includeFont({
  fontFamily: '"Space Mono", sans-serif',
  url: 'https://fonts.googleapis.com/css?family=Space+Mono:700'
})

const container = document.createElement('div')
document.body.appendChild(container)

const ctx = Sketch.create({ container })
ctx.canvas.style.opacity = 0
ctx.canvas.style.transition = 'opacity 400ms ease'
setTimeout(() => {
  ctx.canvas.style.opacity = 1
}, 200)

const title = addTitle('insidious libra')
title.style.opacity = 0
title.style.bottom = '5vh'
title.style.right = '5vh'
title.style.transition = 'opacity 400ms ease'
title.style.zIndex = 10
container.appendChild(title)
setTimeout(() => {
  title.style.opacity = 1
}, 200)

const settings = {
  seed: 442,
  palette: 86,
  cameraX: -6,
  cameraY: -3,
  cameraZ: -4,
  subdivisions: 1,
  lightSpeed: 2
}

const gui = new GUI()
// gui.add(settings, 'seed', 0, 1000).onChange(reset)
// gui.add(settings, 'palette', 0, colorPalettes.length - 1).step(1).onChange(reset)
gui.add(settings, 'cameraX', -20, 20).onChange(reset)
gui.add(settings, 'cameraY', -20, 20).onChange(reset)
gui.add(settings, 'cameraZ', -20, 20).onChange(reset)
gui.add(settings, 'subdivisions', 0, 4).step(1).onChange(reset)
gui.add(settings, 'lightSpeed', 0, 10).step(1).onChange(reset)

function reset () {
  ctx.setup()
}

let rand = Math.random

ctx.setup = function () {
  rand = new Alea(settings.seed)
  this.camera = createCamera({
    viewport: [0, 0, ctx.canvas.width, ctx.canvas.height]
  })
  const { cameraX, cameraY, cameraZ } = settings
  this.camera.identity()
  this.camera.translate([cameraX, cameraY, cameraZ])
  this.camera.lookAt([0, 0, 0])
  this.camera.update()

  const colors = colorPalettes[settings.palette]
  const mesh = icosphere(settings.subdivisions)

  this.tris = mesh.cells.map(cell => ({
    positions: cell.map((i) => mesh.positions[i]),
    points: cell.map((i) => this.camera.project(mesh.positions[i])),
    color: colors[0] // [rand() * colors.length | 0]
  }))

  this.tris = sortBy(this.tris, ({ points }) => Math.min(...points.map(p => p[2])))
}

ctx.update = function () {
  const rads = this.millis / 3000 * settings.lightSpeed
  const dist = 10
  const lightSource = [
    0 * dist, Math.cos(rads) * dist, Math.sin(rads) * dist
  ]

  this.tris = this.tris.map((tri) => {
    const { color, positions } = tri
    const center = getCenterOfPlane(positions)
    const lightDirection = normalize([], subtract([], lightSource, center))
    const norm = getPlaneNormal([], ...positions)
    const dotProduct = dot(lightDirection, norm)
    const lightenPerc = Math.pow(Math.max(0, dotProduct), 0.75) * 0.5
    return {
      ...tri,
      litColor: Color(color).lighten(lightenPerc).toString()
    }
  })
}

ctx.draw = function () {
  this.tris.forEach(({ points, litColor }) => drawTriangle(points, litColor))
}

function getCenterOfPlane (pts) {
  let total = [0, 0, 0]
  pts.forEach(pt => add(total, total, pt))
  return scale(total, total, 1 / (pts.length))
}

function drawTriangle (points, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  ctx.lineTo(points[1][0], points[1][1])
  ctx.lineTo(points[2][0], points[2][1])
  ctx.lineTo(points[0][0], points[0][1])
  ctx.fill()
}
