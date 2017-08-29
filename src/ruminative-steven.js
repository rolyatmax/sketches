import Alea from 'alea'
import SimplexNoise from 'simplex-noise'
import { GUI } from 'dat-gui'
const Delaunator = require('delaunator')
import getPlaneNormal from 'get-plane-normal'
const createRegl = require('regl')
const glslify = require('glslify')
const fit = require('canvas-fit')
const mat4 = require('gl-mat4')
const createCamera = require('3d-view-controls')
import array from 'new-array'
import includeFont from './common/include-font'
import addTitle from './common/add-title'
import css from 'dom-css'

title('ruminative-steven', '#ddd')

const canvas = document.createElement('canvas')
const camera = createCamera(canvas)
const regl = createRegl(canvas)

camera.zoomSpeed = 4
camera.lookAt(
  [2.5, 2.5, 2.5],
  [0, 0, 0],
  [0.52, -0.11, 50]
)

window.camera = camera
window.addEventListener('resize', fit(canvas), false)
document.body.appendChild(canvas)

const settings = guiSettings({
  seed: [442, 0, 1000, 1, true],
  size: [5, 1, 20, 1],
  points: [20000, 3, 100000, 1, true],
  noiseSize: [300, 1, 800, 1, true],
  noiseMag: [15, 1, 100, 1, true],
  speed: [24, 1, 50, 1],
  colorVariance: [4, 0, 20, 1],
  reflectionMult: [5, 0, 20, 0.1],
  dotProdMult: [4, -20, 20, 0.01]
}, setup)

let rand, simplex, drawTriangles
setup()
function setup () {
  rand = new Alea(settings.seed)
  simplex = new SimplexNoise(rand)
  const points = array(settings.points).map(() => {
    const x = rand() * 2 - 1
    const y = rand() * 2 - 1
    const z = (
      simplex.noise2D(x * settings.noiseSize / 100, y * settings.noiseSize / 100) *
      settings.noiseMag / 100 +
      simplex.noise2D(x * settings.noiseSize / 1000 + 1000, y * settings.noiseSize / 1000 + 1000) *
      settings.noiseMag / 40
    ) / 2
    return {
      position: [x, y, z],
      color: [rand(), rand(), rand()]
    }
  })
  const delaunay = new Delaunator(points.map(p => p.position))
  const positions = []
  const colors = []
  const normals = []
  for (let j = 0; j < delaunay.triangles.length; j += 3) {
    const p1 = points[delaunay.triangles[j]]
    const p2 = points[delaunay.triangles[j + 1]]
    const p3 = points[delaunay.triangles[j + 2]]

    const norm = getPlaneNormal([], p1.position, p2.position, p3.position)
    positions.push(p1.position, p2.position, p3.position)
    colors.push(p1.color, p2.color, p3.color)
    normals.push(norm, norm, norm)
  }
  window.delaunay = delaunay
  drawTriangles = regl({
    attributes: {
      position: positions,
      color: colors,
      normal: normals
    },
    count: positions.length
  })
}

const drawGlobal = regl({
  vert: glslify.file('./shaders/ruminative-steven.vert'),
  frag: glslify.file('./shaders/simple.frag'),

  uniforms: {
    projection: ({viewportWidth, viewportHeight}) => (
      mat4.perspective([],
        Math.PI / 2,
        viewportWidth / viewportHeight,
        0.01,
        1000)
    ),
    view: () => camera.matrix,
    tick: ({ tick }) => tick,
    lightSource: [0.3, -0.1, 0.5],
    speed: () => settings.speed,
    colorVariance: () => settings.colorVariance / 100,
    baseColor: [0.03, 0.13, 0.5],
    reflectionMult: () => settings.reflectionMult,
    size: () => settings.size,
    dotProdMult: () => settings.dotProdMult
  },

  primitive: 'triangles'
})

regl.frame(() => {
  regl.clear({
    color: [0.18, 0.18, 0.18, 1],
    depth: 1
  })
  camera.tick()
  drawGlobal(() => drawTriangles())
})

// ------------- helpers -------------

function guiSettings (settings, onChange) {
  const settingsObj = {}
  const gui = new GUI()
  for (let key in settings) {
    settingsObj[key] = settings[key][0]
    const setting = gui
      .add(settingsObj, key, settings[key][1], settings[key][2])
    if (settings[key][3]) {
      setting.step(settings[key][3])
    }
    if (settings[key][4]) {
      setting.onChange(onChange)
    }
  }
  if (onChange) {
    const redraw = onChange
    gui.add({ redraw }, 'redraw')
  }
  return settingsObj
}

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
