import { GUI } from 'dat-gui'
const createRegl = require('regl')
const glslify = require('glslify')
const fit = require('canvas-fit')
const mat4 = require('gl-mat4')
const intersect = require('ray-plane-intersection')
const newArray = require('new-array')
const getNormal = require('get-plane-normal')
const pickRay = require('camera-picking-ray')
const createCamera = require('3d-view-controls')
import includeFont from './common/include-font'
import addTitle from './common/add-title'
import css from 'dom-css'

title('loquacious-protest', '#ddd')

const canvas = document.createElement('canvas')
const camera = createCamera(canvas)
const regl = createRegl(canvas)

window.addEventListener('resize', fit(canvas), false)
window.addEventListener('click', onClick)
canvas.addEventListener('mousemove', onMouseMove)
document.body.appendChild(canvas)
window.camera = camera

const settings = {
  gridSize: 4,
  cellSize: 0.1
}
const gui = new GUI()
gui.add(settings, 'gridSize', 0.5, 10).step(0.1).onChange(setup)
gui.add(settings, 'cellSize', 0.01, 2).step(0.01).onChange(setup)

let renderGrid, projection, gridLines, renderCircle
let mousePosition = [100, 100]

setup()
function setup () {
  const halfSize = settings.gridSize / 2
  gridLines = []
  for (let i = -halfSize; i <= halfSize; i += settings.cellSize) {
    gridLines.push(
      [i, halfSize, 0], [i, -halfSize, 0],
      [halfSize, i, 0], [-halfSize, i, 0]
    )
  }
  gridLines.push(
    [halfSize, halfSize, 0], [halfSize, -halfSize, 0],
    [halfSize, halfSize, 0], [-halfSize, halfSize, 0]
  )

  renderGrid = regl({
    vert: glslify.file('./shaders/simple.vert'),
    frag: glslify.file('./shaders/simple.frag'),
    attributes: {
      position: gridLines,
      color: gridLines.map(() => [0.4, 0.4, 0.4, 1.0])
    },
    count: gridLines.length,
    primitive: 'lines'
  })

  renderCircle = regl({
    vert: glslify.file('./shaders/loquacious-protest-circle.vert'),
    frag: glslify.file('./shaders/simple.frag'),
    attributes: {
      angle: newArray(51).map((_, i) => i / 50)
    },
    uniforms: {
      center: regl.prop('center')
    },
    count: 51,
    primitive: 'line loop'
  })
}

function onMouseMove (e) {
  const { clientX, clientY } = e
  mousePosition = [clientX, clientY]
}

function onClick (e) {
  const { clientX, clientY } = e
  console.log(getIntersection([clientX, clientY]))
}

function getIntersection ([mouseX, mouseY]) {
  const mouse = [mouseX, mouseY]
  const viewport = [0, 0, canvas.width, canvas.height]
  const projView = mat4.multiply([], projection, camera.matrix)
  const invProjView = mat4.invert([], projView)

  const rayOrigin = []
  const rayDir = []
  pickRay(rayOrigin, rayDir, mouse, viewport, invProjView)
  const normal = getNormal([], gridLines[0], gridLines[1], gridLines[2])
  const distance = 0
  return intersect([], rayOrigin, rayDir, normal, distance)
}

const globalState = regl({
  uniforms: {
    projection: regl.prop('projection'),
    view: () => camera.matrix
  }
})

regl.frame(({viewportWidth, viewportHeight}) => {
  projection = mat4.perspective([],
    Math.PI / 2,
    viewportWidth / viewportHeight,
    0.01,
    1000)

  regl.clear({
    color: [0.18, 0.18, 0.18, 1],
    depth: 1
  })
  camera.tick()
  globalState({ projection }, () => {
    renderGrid()
    renderCircle({ center: getIntersection(mousePosition) || [0, 0, 0] })
  })
})

// -------------- helpers

function title (name, color) {
  includeFont({
    fontFamily: '"Space Mono", sans-serif',
    url: 'https://fonts.googleapis.com/css?family=Space+Mono:700'
  })

  const title = addTitle(name)
  css(title, {
    opacity: 0,
    color: color,
    bottom: '5vh',
    right: '5vh',
    transition: 'opacity 800ms linear',
    zIndex: 10
  })

  document.body.appendChild(title)
  setTimeout(() => {
    css(title, 'opacity', 1)
  }, 200)
}
