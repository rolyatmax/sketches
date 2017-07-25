// loosely based on https://bl.ocks.org/pbeshai/dbed2fdac94b44d3b4573624a37fa9db
const createREGL = require('regl')
const { GUI } = require('dat-gui')
const glslify = require('glslify')
const fit = require('canvas-fit')
const mat4 = require('gl-mat4')
const createCamera = require('3d-view-controls')
import includeFont from './common/include-font'
import addTitle from './common/add-title'
const css = require('dom-css')

title('tenacious-centimeter', '#ddd')

const canvas = document.body.appendChild(document.createElement('canvas'))
const camera = createCamera(canvas)
window.addEventListener('resize', fit(canvas), false)
const regl = createREGL({
  extensions: 'OES_texture_float',
  canvas: canvas
})

let animating = true
const toggleAnimation = () => { animating = !animating }

const settings = {
  particles: 1000000,
  speed: 20,
  pointWidth: 3,
  pullStrength: 1.5
}

const gui = new GUI()
gui.add(settings, 'particles', 4, 1500000).step(1).onFinishChange(reset)
gui.add(settings, 'speed', 1, 1000)
gui.add(settings, 'pointWidth', 0.5, 6)
gui.add(settings, 'pullStrength', -1, 6).step(0.1)
gui.add({ toggleAnimation }, 'toggleAnimation')

let prevParticleState, currParticleState, nextParticleState
let updateParticles, drawParticles

function reset () {
  const sqrtNumParticles = Math.ceil(Math.sqrt(settings.particles))
  const numParticles = sqrtNumParticles * sqrtNumParticles

  console.log(`Using ${numParticles} particles`)

  const initialParticleState = new Float32Array(numParticles * 4)
  for (let i = 0; i < numParticles; ++i) {
    initialParticleState[i * 4] = 2 * Math.random() - 1
    initialParticleState[i * 4 + 1] = 2 * Math.random() - 1
    initialParticleState[i * 4 + 2] = 2 * Math.random() - 1
  }

  function createInitialParticleBuffer (initialParticleState) {
    const initialTexture = regl.texture({
      data: initialParticleState,
      shape: [sqrtNumParticles, sqrtNumParticles, 4],
      type: 'float'
    })

    return regl.framebuffer({
      color: initialTexture,
      depth: false,
      stencil: false
    })
  }

  prevParticleState = createInitialParticleBuffer(initialParticleState)
  currParticleState = createInitialParticleBuffer(initialParticleState)
  nextParticleState = createInitialParticleBuffer(initialParticleState)

  const particleTextureIndex = []
  for (let i = 0; i < sqrtNumParticles; i++) {
    for (let j = 0; j < sqrtNumParticles; j++) {
      particleTextureIndex.push(i / sqrtNumParticles, j / sqrtNumParticles)
    }
  }

  updateParticles = regl({
    framebuffer: () => nextParticleState,

    vert: glslify.file('./shaders/tenacious-centimeter-physics.vert'),
    frag: glslify.file('./shaders/tenacious-centimeter-physics.frag'),

    attributes: {
      position: [
        -1, -1,
        1, -1,
        -1, 1,
        1, 1
      ]
    },

    uniforms: {
      currParticleState: () => currParticleState,
      prevParticleState: () => prevParticleState,
      tick: regl.prop('tick'),
      speed: regl.prop('speed'),
      pullStrength: regl.prop('pullStrength')
    },

    count: 4,
    primitive: 'triangle strip'
  })

  drawParticles = regl({
    vert: glslify.file('./shaders/tenacious-centimeter-particles.vert'),
    frag: glslify.file('./shaders/tenacious-centimeter-particles.frag'),

    attributes: {
      particleTextureIndex: particleTextureIndex
    },

    uniforms: {
      particleState: () => currParticleState,
      prevState: () => prevParticleState,
      pointWidth: regl.prop('pointWidth'),
      projection: ({viewportWidth, viewportHeight}) => (
        mat4.perspective([],
          Math.PI / 4,
          viewportWidth / viewportHeight,
          0.01,
          1000)
      ),
      view: () => camera.matrix,
      speed: regl.prop('speed')
    },

    count: numParticles,
    primitive: 'points'
  })
}

reset()

camera.zoomSpeed = 4
camera.lookAt(
  [2.5, 2.5, 2.5],
  [0, 0, 0],
  [0.52, -0.11, -99]
)

document.body.addEventListener('keyup', (e) => {
  if (e.which !== 32) return
  toggleAnimation()
})

let ticks = 0
regl.frame(({ tick }) => {
  regl.clear({
    color: [0.15, 0.15, 0.15, 1],
    depth: 1
  })

  camera.tick()

  if (animating) {
    updateParticles({ speed: settings.speed / 100000, tick: ticks, pullStrength: settings.pullStrength })
    cycleParticleStates()
    ticks += 1
  }
  drawParticles({ pointWidth: settings.pointWidth, speed: settings.speed / 100000 })
})

function cycleParticleStates () {
  const tmp = prevParticleState
  prevParticleState = currParticleState
  currParticleState = nextParticleState
  nextParticleState = tmp
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
