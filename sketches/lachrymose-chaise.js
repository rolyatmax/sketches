// import Alea from 'alea'
// import { GUI } from 'dat-gui'

import includeFont from './common/include-font'
import addTitle from './common/add-title'
import css from 'dom-css'
const createRegl = require('regl')
const glslify = require('glslify')
const fit = require('canvas-fit')
const mat4 = require('gl-mat4')
const createCamera = require('3d-view-controls')

title('lachrymose-chaise', '#ddd')

const canvas = document.createElement('canvas')
const camera = createCamera(canvas)
const regl = createRegl(canvas)

camera.lookAt([5, 5, 5], [0, 0, 0], [-10, -10, 10])

window.camera = camera
window.addEventListener('resize', fit(canvas), false)
document.body.appendChild(canvas)

// const settings = guiSettings({
//   seed: [442, 0, 1000, 1, true]
// }, setup)

let startTime, draw
// let rand
setup()
function setup () {
  // rand = new Alea(settings.seed)
  startTime = 0
  draw = createRenderer()
}
function createRenderer () {
  return regl({
    vert: glslify.file('./shaders/lachrymose-chaise.vert'),
    frag: glslify.file('./shaders/lachrymose-chaise.frag'),

    attributes: {
      position: [
        -1, -1,
        -1, 1,
        1, -1,
        1, 1
      ]
    },

    count: 4,

    uniforms: {
      projection: ({ viewportWidth, viewportHeight }) => (
        mat4.perspective([],
          Math.PI / 2,
          viewportWidth / viewportHeight,
          0.01,
          1000)
      ),
      view: () => camera.matrix,
      elapsed: ({ time }, { startTime }) => (time - startTime) * 1000
    },

    primitive: 'triangle strip'
  })
}

camera.zoomSpeed = 4

regl.frame(({ time }) => {
  startTime = startTime || time
  regl.clear({
    color: [0.18, 0.18, 0.18, 1],
    depth: 1
  })
  camera.tick()
  camera.up = [camera.up[0], camera.up[1], 999]
  draw({
    startTime: startTime
  })
})

// ------------- helpers -------------

// function guiSettings (settings, onChange) {
//   const settingsObj = {}
//   const gui = new GUI()
//   for (const key in settings) {
//     settingsObj[key] = settings[key][0]
//     const setting = gui
//       .add(settingsObj, key, settings[key][1], settings[key][2])
//     if (settings[key][3]) {
//       setting.step(settings[key][3])
//     }
//     if (settings[key][4]) {
//       setting.onChange(onChange)
//     }
//   }
//   if (onChange) {
//     const redraw = onChange
//     gui.add({ redraw }, 'redraw')
//   }
//   return settingsObj
// }

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
