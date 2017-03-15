import Alea from 'alea'
import Color from 'color'
import Sketch from 'sketch-js'
import createCamera from 'perspective-camera'
import { GUI } from 'dat-gui'
import sortBy from 'lodash/sortBy'
import getPlaneNormal from 'get-plane-normal'
import newArray from 'new-array'
import SimplexNoise from 'simplex-noise'
import { triangulate } from 'delaunay'
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

const title = addTitle('didactic protest')
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
  seed: Math.random() * 1000,
  points: 200,
  palette: 110,
  lightSpeed: 1,
  cameraSpeed: 2,
  dist: 3,
  multicolor: false,
  showEdges: true,
  opacity: 80
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 1000).onChange(reset)
gui.add(settings, 'points', 0, 500).step(1).onChange(reset)
gui.add(settings, 'palette', 0, colorPalettes.length - 1).step(1).onChange(reset)
gui.add(settings, 'opacity', 0, 100).step(1)
gui.add(settings, 'lightSpeed', 0, 10).step(1)
gui.add(settings, 'cameraSpeed', 0, 10).step(1)
gui.add(settings, 'dist', 0, 8).onChange(reset)
gui.add(settings, 'multicolor').onChange(reset)
gui.add(settings, 'showEdges')

function reset () {
  ctx.setup()
}

let rand = Math.random

ctx.setup = function () {
  rand = new Alea(settings.seed)
  const simplex = new SimplexNoise(rand)
  this.camera = createCamera({
    viewport: [0, 0, ctx.canvas.width, ctx.canvas.height]
  })
  this.camera.identity()

  this.colors = colorPalettes[settings.palette]

  const positions = newArray(settings.points).map(() => {
    const rads = rand() * Math.PI * 2
    const mag = Math.pow(rand(), 0.5)
    return [
      Math.cos(rads) * mag,
      Math.sin(rads) * mag
    ]
  })

  const triIndices = triangulate(positions)
  const cells = []
  for (let i = 0; i < triIndices.length; i += 3) {
    cells.push([
      triIndices[i],
      triIndices[i + 1],
      triIndices[i + 2]
    ])
  }

  // add random z
  positions.forEach(p => {
    p[2] = simplex.noise2D(p[0] / 2.5, p[1] / 2.5) * 2
  })

  const mesh = { cells, positions }

  this.tris = mesh.cells.map(cell => ({
    positions: cell.map((i) => mesh.positions[i]),
    color: this.colors[settings.multicolor ? rand() * this.colors.length | 0 : 0]
  }))
}

ctx.update = function () {
  const lightSrcRads = this.millis / 10000 * settings.lightSpeed
  const lightSource = [
    0 * settings.dist, Math.cos(lightSrcRads) * settings.dist, Math.sin(lightSrcRads) * settings.dist
  ]

  const cameraRads = this.millis / 10000 * settings.cameraSpeed
  const cameraPosition = [
    Math.cos(cameraRads) * settings.dist, Math.sin(cameraRads) * settings.dist / 2, Math.sin(cameraRads) * settings.dist
  ]

  this.camera.identity()
  this.camera.translate(cameraPosition)
  this.camera.lookAt([0, 0, 0])
  this.camera.update()

  this.tris = this.tris.map((tri) => ({
    ...tri,
    points: tri.positions.map((positions) => this.camera.project(positions))
  }))

  this.tris = sortBy(this.tris, ({ points }) => Math.min(...points.map(p => p[2])))

  this.tris = this.tris.map((tri) => {
    const { color, positions } = tri
    const center = getCenterOfPlane(positions)
    const lightDirection = normalize([], subtract([], lightSource, center))
    const norm = getPlaneNormal([], ...positions)
    const dotProduct = Math.abs(dot(lightDirection, norm))
    const lightenPerc = Math.pow(Math.max(0, dotProduct), 0.75) * 0.5
    return {
      ...tri,
      litColor: Color(color).lighten(lightenPerc).alpha(settings.opacity / 100).toString()
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
  ctx.strokeStyle = 'rgba(230, 230, 230, 0.4)'
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  ctx.lineTo(points[1][0], points[1][1])
  ctx.lineTo(points[2][0], points[2][1])
  ctx.lineTo(points[0][0], points[0][1])
  ctx.fill()
  if (settings.showEdges) ctx.stroke()
}
