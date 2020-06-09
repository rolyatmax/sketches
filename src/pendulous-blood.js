import includeFont from './common/include-font'
import addTitle from './common/add-title'
const Alea = require('alea')
const fit = require('canvas-fit')
const { GUI } = require('dat-gui')
const css = require('dom-css')
const glsl = require('glslify')
const mat4 = require('gl-mat4')
const createContext = require('pex-context')
const icosphere = require('icosphere')
const createCamera = require('3d-view-controls')

title('pendulous-blood', '#555')

const canvas = document.body.appendChild(document.createElement('canvas'))
const resize = fit(canvas)

const ctx = createContext({ canvas: canvas })
ctx.set({
  pixelRatio: 2,
  width: window.innerWidth,
  height: window.innerHeight
})
window.addEventListener('resize', () => {
  resize()
  ctx.set({
    pixelRatio: 2,
    width: canvas.width,
    height: canvas.height
  })
  setup()
}, false)

const camera = createCamera(canvas, {
  zoomSpeed: 4,
  distanceLimits: [0.05, 500]
})
const getProjection = () => mat4.perspective(
  [],
  Math.PI / 4,
  window.innerWidth / window.innerHeight,
  0.01,
  1000
)

canvas.style.opacity = 0
canvas.style.transition = 'opacity 400ms ease'
setTimeout(() => { canvas.style.opacity = 1 }, 200)

const settings = guiSettings({
  seed: [1, 0, 99999, 1, true],
  icoSubdivisions: [3, 1, 5, 1, true],
  sphereCount: [300, 1, 5000, 1, true],
  sphereSpread: [20, 1, 20, 0.1, true]
}, setup)

let rand, drawCmd, modelPositions

setup()
ctx.frame(draw)

function setup () {
  rand = new Alea(settings.seed)
  modelPositions = []
  const r = () => rand() * 2 - 1
  let n = settings.sphereCount
  while (n--) {
    const d = r() * settings.sphereSpread
    modelPositions.push([r() * d, r() * d, r() * d])
  }
  const sphere = icosphere(settings.icoSubdivisions)

  console.log(sphere)

  drawCmd = {
    pipeline: ctx.pipeline({
      vert: glsl`
        attribute vec3 aPosition;
        varying vec3 vNormal;
        varying float vCamDist;
        uniform mat4 uProjection;
        uniform mat4 uView;
        uniform vec3 uModelPosition;
        void main () {
          vNormal = aPosition;
          gl_PointSize = 5.5;
          gl_Position = uProjection * uView * vec4(aPosition + uModelPosition, 1);
          vCamDist = gl_Position.z; // / gl_Position.w;
        }
      `,
      frag: glsl`
        precision mediump float;
        varying vec3 vNormal;
        varying float vCamDist;
        uniform vec3 uColor;
        void main () {
          vec3 normalizedNormal = vNormal / 2.0 + vec3(0.5);
          float averaged = (normalizedNormal.x + normalizedNormal.y + normalizedNormal.z) / 3.0;
          float normalizedCamDist = 1.0 - pow((vCamDist / 2.0 + 0.5), -0.9);
          float darkness = ((1.0 - averaged / 2.5) + (normalizedCamDist)) / 2.0;
          // gl_FragColor = vec4(normalizedCamDist, normalizedCamDist, normalizedCamDist, 1);
          gl_FragColor = vec4(mix(uColor, vec3(averaged * 0.2), 1.0 - darkness), 1);
        }
      `,
      primitive: ctx.Primitive.Triangles,
      depthTest: true
    }),
    attributes: {
      aPosition: ctx.vertexBuffer({ data: sphere.positions })
    },
    indices: ctx.indexBuffer({ data: sphere.cells }),
    uniforms: {
      uColor: [0.5, 1, 0.75]
    }
  }
}

const clearCmd = {
  pass: ctx.pass({
    clearColor: [0.2, 0.2, 0.2, 1],
    clearDepth: 1
  })
}

function draw () {
  camera.tick()
  ctx.submit(clearCmd)

  const globalUniforms = {
    uProjection: getProjection(),
    uView: camera.matrix
  }

  ctx.submit(drawCmd, modelPositions.map(mP => ({
    uniforms: Object.assign({
      uModelPosition: mP
    }, globalUniforms)
  })))
}

// ---------- HELPERS ----------------

function guiSettings (settings, onChange) {
  const settingsObj = {}
  const gui = new GUI()
  for (const key in settings) {
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
  gui.add({ reset: onChange }, 'reset')
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

function dist (a, b) {
  const w = a[0] - b[0]
  const h = a[1] - b[1]
  return Math.sqrt(w * w + h * h)
}
