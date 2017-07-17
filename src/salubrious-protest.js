import Alea from 'alea'
import Color from 'color'
import { GUI } from 'dat-gui'
const createRegl = require('regl')
const glslify = require('glslify')
const fit = require('canvas-fit')
const mat4 = require('gl-mat4')
const createCamera = require('canvas-orbit-camera')
import array from 'new-array'
import includeFont from './common/include-font'
import addTitle from './common/add-title'
import css from 'dom-css'

title('salburious-protest', '#ddd')

const canvas = document.createElement('canvas')
const camera = createCamera(canvas)
const regl = createRegl(canvas)

camera.lookAt([5, 5, 5], [0, 0, 0], [-10, -10, 99])

window.camera = camera
window.addEventListener('resize', fit(canvas), false)
document.body.appendChild(canvas)

const settings = guiSettings({
  seed: [442, 0, 1000, 1, true],
  points: [190000, 1, 900000, 1, true],
  pointSize: [1.2, 0.5, 10, 0.1],
  duration: [15000, 100, 30000, 100],
  circleSize: [9, 1, 50, 1, true],
  arcHeight: [4, 0, 25, 1],
  spacing: [0.01, 0.01, 100, 0.05, true],
  distribution: [0.5, -1, 2, 0.1, true]
}, setup)

let rand, startTime, points, drawPoints
setup()
function setup () {
  rand = new Alea(settings.seed)
  startTime = 0
  points = array(settings.points).map((_, i) => {
    const rads = rand() * Math.PI * 2
    const mag = Math.pow(rand(), settings.distribution) * settings.circleSize
    const color = Color({ h: rads / Math.PI / 2 * 360, s: rand() * 100, l: rand() * 100 })
    const rgb = color.rgb().array().map(v => v / 255)
    return {
      startPosition: [0, 0, 0],
      endPosition: [
        Math.cos(rads) * mag,
        Math.sin(rads) * mag,
        0
      ],
      color: [...rgb, 1],
      startTime: i * settings.spacing
    }
  })
  drawPoints = regl({
    attributes: {
      startPosition: points.map(p => p.startPosition),
      endPosition: points.map(p => p.endPosition),
      color: points.map(p => p.color),
      startTime: points.map(p => p.startTime)
    },

    count: points.length
  })
}

const drawGlobal = regl({
  vert: glslify.file('./shaders/salubrious-protest.vert'),
  frag: glslify.file('./shaders/simple.frag'),

  uniforms: {
    projection: ({viewportWidth, viewportHeight}) => (
      mat4.perspective([],
        Math.PI / 2,
        viewportWidth / viewportHeight,
        0.01,
        1000)
    ),
    view: () => camera.view(),
    pointSize: regl.prop('pointSize'),
    duration: regl.prop('duration'),
    arcHeight: regl.prop('arcHeight'),
    circleSize: regl.prop('circleSize'),
    elapsed: ({ time }, { startTime }) => (time - startTime) * 1000
  },

  primitive: 'point'
})

regl.frame(({ time }) => {
  startTime = startTime || time
  regl.clear({
    color: [0.18, 0.18, 0.18, 1],
    depth: 1
  })
  camera.tick()
  drawGlobal({
    pointSize: settings.pointSize,
    duration: settings.duration,
    arcHeight: settings.arcHeight,
    circleSize: settings.circleSize,
    startTime: startTime
  }, () => drawPoints())
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
