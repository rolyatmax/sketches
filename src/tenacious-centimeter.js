const createREGL = require('regl')
const { GUI } = require('dat-gui')
const glslify = require('glslify')
const fit = require('canvas-fit')
const d3 = require('d3-random')
const mat4 = require('gl-mat4')
const createCamera = require('3d-view-controls')
import includeFont from './common/include-font'
import addTitle from './common/add-title'
const css = require('dom-css')

const canvas = document.body.appendChild(document.createElement('canvas'))
const camera = createCamera(canvas, {
  distanceLimits: [0.01, 950],
  mode: 'orbit'
})
const regl = createREGL({
  extensions: 'OES_texture_float',
  canvas: canvas
})

if (!regl.limits.extensions.includes('oes_texture_float')) {
  const warningDiv = document.body.appendChild(document.createElement('div'))
  warningDiv.innerText = 'This sketch requires the oes texture float WebGL extension and make not work on mobile browsers.'
  css(warningDiv, {
    width: 200,
    textAlign: 'center',
    margin: '200px auto',
    color: '#333'
  })
  throw new Error('OES Texture Float extension required for WebGL')
}

// title('tenacious-centimeter', '#ddd')
instructions('drag + scroll to pan & zoom, spacebar to pause', '#ddd')

window.addEventListener('resize', fit(canvas), false)

let animating = true
const toggleAnimation = () => { animating = !animating }

const settings = {
  particles: 800000,
  excitability: 40,
  pointWidth: 1,
  pullStrength: 2.5,
  decay: 2
}
const origSettings = Object.assign({}, settings)

const gui = new GUI()
gui.add(settings, 'particles', 4, 1500000).step(1).listen().onFinishChange(restart)
gui.add(settings, 'excitability', 10, 500).step(10).listen()
// gui.add(settings, 'pointWidth', 0.5, 6).listen()
gui.add(settings, 'pullStrength', 0, 3).step(0.1).listen()
gui.add(settings, 'decay', -10, 10).step(1).listen()
gui.add({ 'start / stop': toggleAnimation }, 'start / stop')
gui.add({ restart }, 'restart')
gui.add({ reset }, 'reset')

function reset () {
  Object.assign(settings, origSettings)
  restart()
}

let prevParticleState, currParticleState, nextParticleState
let updateParticles, drawParticles

function restart () {
  const sqrtNumParticles = Math.ceil(Math.sqrt(settings.particles))
  const numParticles = sqrtNumParticles * sqrtNumParticles

  console.log(`Using ${numParticles} particles`)

  const distributions = [
    d3.randomNormal(2 * Math.random() - 1, Math.random() * 0.5),
    d3.randomNormal(2 * Math.random() - 1, Math.random()),
    d3.randomNormal(2 * Math.random() - 1, Math.random() * 0.75)
  ]
  const percToDistrOne = Math.random() / 2
  const percToDistrTwo = Math.random() / 2 + percToDistrOne

  const initialParticleState = new Float32Array(numParticles * 4)
  for (let i = 0; i < numParticles; ++i) {
    const coinToss = Math.random()
    const rand = coinToss < percToDistrOne ? distributions[0] : coinToss < percToDistrTwo ? distributions[1] : distributions[2]
    initialParticleState[i * 4] = rand()
    initialParticleState[i * 4 + 1] = rand()
    initialParticleState[i * 4 + 2] = rand()
    initialParticleState[i * 4 + 3] = (2 * Math.random() - 1) * settings.excitability / 10000
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
      excitability: regl.prop('excitability'),
      pullStrength: regl.prop('pullStrength'),
      decay: regl.prop('decay')
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
      excitability: regl.prop('excitability')
    },

    count: numParticles,
    primitive: 'points'
  })
}

restart()

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
    updateParticles({
      excitability: settings.excitability / 100000,
      tick: ticks,
      pullStrength: 3 - settings.pullStrength,
      decay: settings.decay / 1000
    })
    cycleParticleStates()
    ticks += 1
  }
  drawParticles({
    pointWidth: settings.pointWidth,
    excitability: settings.excitability / 100000
  })
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

function instructions (text, color) {
  includeFont({
    fontFamily: '"Space Mono", sans-serif',
    url: 'https://fonts.googleapis.com/css?family=Space+Mono:700'
  })

  const title = addTitle(text)
  css(title, {
    opacity: 0,
    color: color,
    bottom: '5vh',
    left: '5vh',
    transition: 'opacity 800ms linear',
    zIndex: 10
  })

  document.body.appendChild(title)
  setTimeout(() => {
    css(title, 'opacity', 1)
  }, 200)
}
