const createRegl = require('regl')
const glslify = require('glslify')
const catRomSpline = require('cat-rom-spline')
const fit = require('canvas-fit')
const mat4 = require('gl-mat4')
const createCamera = require('canvas-orbit-camera')
const array = require('new-array')

const pointsVertGL = glslify.file('./shaders/wheedling-tummy.vert')
const pointsFragGL = glslify.file('./shaders/simple.frag')

const canvas = document.createElement('canvas')
const camera = createCamera(canvas)
const regl = createRegl(canvas)

const lineCount = 200
const controlsLimit = [15, 15]

const lines = array(lineCount).map(() => createLineData())

console.log('points', lines[0].length * lineCount)
window.camera = camera

function createLineData () {
  const controls = array(Math.random() * (controlsLimit[1] - controlsLimit[0]) + controlsLimit[0] | 0).map(() => {
    const rads = Math.random() * Math.PI * 2
    const phi = Math.acos(Math.random() * 2 - 1)
    const mag = Math.pow(Math.random(), -0.1)
    return [
      Math.cos(rads) * Math.sin(phi) * mag,
      Math.sin(rads) * Math.sin(phi) * mag,
      Math.cos(phi) * mag
    ]
  })
  controls.unshift(controls[0].map(v => v + 1))
  controls.push(controls[controls.length - 1].map(v => v + 1))
  const multiplier = 20 * Math.random() + 50
  const randSeed = Math.random()
  return catRomSpline(controls, { samples: Math.min(controls.length * 10, 100) }).map((position, i, points) => {
    position = [...position.map(v => v * multiplier)]
    return {
      position: position,
      randSeed: randSeed,
      size: Math.random() + 1,
      color: [
        (position[0] / 2 + 0.5) / multiplier + 0.45,
        (position[1] / 2 + 0.5) / multiplier + 0.35,
        (position[2] / 2 + 0.5) / points.length + 0.45,
        Math.random() / 2 + 0.5
      ]
    }
  })
}

const globalStateDraw = regl({
  vert: pointsVertGL,
  frag: pointsFragGL,

  uniforms: {
    projection: ({ viewportWidth, viewportHeight }) => (
      mat4.perspective([],
        Math.PI / 2,
        viewportWidth / viewportHeight,
        0.01,
        1000)
    ),
    model: mat4.identity([]),
    view: () => camera.view(),
    aspect: ({ viewportWidth, viewportHeight }) => (
      viewportWidth / viewportHeight
    ),
    // pointSize: regl.prop('pointSize'),
    tick: regl.context('tick')
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
    },
    color: [0, 0, 0, 0]
  },

  primitive: 'point'
})

const drawLineCache = {}
function getDrawLine (i) {
  if (drawLineCache[i]) {
    return drawLineCache[i]
  }

  drawLineCache[i] = regl({
    attributes: {
      position: lines[i].map(p => p.position),
      color: lines[i].map(p => p.color),
      randSeed: lines[i].map(p => p.randSeed),
      pointSize: lines[i].map(p => p.size)
    },

    count: lines[i].length
  })

  return drawLineCache[i]
}

function cacheDrawPoints () {
  for (let i = 0; i < lines.length; i++) {
    drawLineCache[i] = getDrawLine(i)
  }
}

cacheDrawPoints()
camera.lookAt(
  [0, 0, 200],
  [0, 0, 0],
  [0, 0, 1]
)

let cancel
function start () {
  const result = regl.frame(({ time }) => {
    regl.clear({
      color: [1, 1, 1, 1],
      depth: 1
    })

    camera.tick()

    globalStateDraw(() => {
      for (let i = 0; i < lines.length; i += 1) {
        getDrawLine(i)()
      }
    })
  })
  cancel = result.cancel
}

window.addEventListener('resize', fit(canvas), false)
document.body.appendChild(canvas)

start()

document.body.addEventListener('keyup', (e) => {
  if (e.which !== 32) return
  if (cancel) {
    cancel()
    cancel = null
  } else {
    start()
  }
})
