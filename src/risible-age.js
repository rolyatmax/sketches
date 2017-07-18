import Alea from 'alea'
import { GUI } from 'dat-gui'
const createRegl = require('regl')
const glslify = require('glslify')
const fit = require('canvas-fit')
const mat4 = require('gl-mat4')
const newArray = require('new-array')
const createCamera = require('3d-view-controls')
const { createSpring } = require('spring-animator')

import includeFont from './common/include-font'
import addTitle from './common/add-title'
import css from 'dom-css'

title('risible-age', '#ddd')

const canvas = document.createElement('canvas')
const camera = createCamera(canvas)
const regl = createRegl(canvas)

camera.lookAt([0, 0, 400], [0, 0, 0], [0, 0, 10])

window.camera = camera
window.addEventListener('resize', fit(canvas), false)
document.body.appendChild(canvas)

const settings = guiSettings({
  granularity: [50, 3, 50, 1, true],
  circles: [10000, 0, 40000, 1, true],
  areaSize: [100, 1, 1000, 1, true]
}, setup)

const areaSizeSpring = createSpring(0.1, 0.9, settings.areaSize)

let rand, draw
setup()
function setup () {
  rand = new Alea(0)
  areaSizeSpring.updateValue(settings.areaSize)
  const drawCircle = createCircleRenderer()
  const circles = newArray(settings.circles).map(createCircle)
  draw = ({ areaSize }) => {
    circles.forEach(c => { c.areaSize = areaSize })
    drawCircle(circles)
  }
}

function createCircle () {
  const r = () => rand() * 2 - 1
  return {
    center: [r(), r()],
    radius: rand(),
    start: rand() * 60,
    duration: rand() * 5 + 1
  }
}

function createCircleRenderer () {
  const positions = [[0, 0]]
  let j = settings.granularity + 1
  while (j--) {
    const rads = (j / settings.granularity) * Math.PI * 2
    positions.push([Math.cos(rads), Math.sin(rads)])
  }

  return regl({
    vert: glslify.file('./shaders/risible-age.vert'),
    frag: glslify.file('./shaders/simple.frag'),

    attributes: {
      position: positions
    },

    count: positions.length,

    uniforms: {
      projection: ({ viewportWidth, viewportHeight }) => (
        mat4.perspective([],
          Math.PI / 4,
          viewportWidth / viewportHeight,
          0.01,
          1000)
      ),
      view: () => camera.matrix,
      color: [0.25, 0.43, 0.91, 0.7],
      time: ({ time }) => time % 60,
      center: regl.prop('center'),
      radius: regl.prop('radius'),
      start: regl.prop('start'),
      duration: regl.prop('duration'),
      areaSize: regl.prop('areaSize')
    },

    blend: {
      enable: true,
      func: {
        srcRGB: 'src alpha',
        srcAlpha: 1,
        dstRGB: 'one minus src alpha',
        dstAlpha: 1
      },
      equation: {
        rgb: 'add',
        alpha: 'add'
      }
    },

    primitive: 'triangle fan'
  })
}

camera.zoomSpeed = 4

regl.frame(({ time }) => {
  regl.clear({
    color: [0.18, 0.18, 0.18, 1],
    depth: 1
  })
  camera.tick()
  camera.up = [camera.up[0], camera.up[1], 999]
  draw({ areaSize: areaSizeSpring.tick() })
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
  // if (onChange) {
  //   const redraw = onChange
  //   gui.add({ redraw }, 'redraw')
  // }
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
