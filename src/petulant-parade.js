import { triangulate } from 'delaunay'
import includeFont from './common/include-font'
import addTitle from './common/add-title'
const { GUI } = require('dat-gui')
const css = require('dom-css')
const glsl = require('glslify')
const createContext = require('pex-context')

title('petulant-parade', '#555')

const ctx = createContext()
ctx.set({
  pixelRatio: 2,
  width: window.innerWidth,
  height: window.innerHeight
})
window.addEventListener('resize', () => {
  ctx.set({
    pixelRatio: 2,
    width: window.innerWidth,
    height: window.innerHeight
  })
  setup()
}, false)

const canvas = ctx.gl.canvas

canvas.style.opacity = 0
canvas.style.transition = 'opacity 400ms ease'
setTimeout(() => { canvas.style.opacity = 1 }, 200)

let midiEvents, drawLinesCmd, drawNotesCmd
const settings = guiSettings({
  noteOpacity: [0.3, 0.01, 2, 0.01],
  lineOpacity: [0.3, 0.01, 2, 0.01],
  radius: [5, 1, 100, 1],
  height: [0.6, 0.01, 1, 0.01, true],
  topMargin: [0.1, 0, 0.5, 0.01],
  distThreshold: [0.1, 0, 0.2, 0.01],
  velocityPow: [3, -0.1, 5, 0.1]
}, setup)

window.fetch('src/audio/rach-etude.mid.json').then(r => r.json()).then(midi => {
  midiEvents = midi.tracks[0]
  setup()
  ctx.frame(draw)
})

function setup () {
  console.log(midiEvents)

  let curTime = 0
  const subTypes = new Set()
  const noteRange = [Infinity, -Infinity]
  const timeRange = [Infinity, -Infinity]
  midiEvents.map(e => {
    curTime += e.deltaTime
    if (e.noteNumber) {
      noteRange[0] = Math.min(noteRange[0], e.noteNumber)
      noteRange[1] = Math.max(noteRange[1], e.noteNumber)
      timeRange[0] = Math.min(timeRange[0], curTime)
      timeRange[1] = Math.max(timeRange[1], curTime)
    }
    e.time = curTime
    return e
  }).filter(e => {
    subTypes.add(e.subtype)
    return e.subtype === 'noteOn'
  })

  console.log(subTypes, noteRange, timeRange)

  const notes = midiEvents.map(e => {
    return Object.assign({}, e, {
      position: [
        e.time / timeRange[1] * 0.8 + 0.1,
        e.noteNumber / noteRange[1] * settings.height + (1 - settings.height) / 2
      ]
    })
  })

  const positions = []
  const velocities = []
  notes.forEach(e => {
    e.position.forEach(v => { positions.push(v * 2 - 1) })
    velocities.push(e.velocity)
  })

  const tris = triangulate(notes.map(e => e.position))
  const lines = []
  const oppositeLines = []
  const lineVelocities = []
  for (let i = 0; i < tris.length; i += 3) {
    const pt1 = notes[tris[i + 0]]
    const pt2 = notes[tris[i + 1]]
    const pt3 = notes[tris[i + 2]]

    const segments = [[pt1, pt2], [pt2, pt3], [pt3, pt1]]
    segments.forEach(seg => {
      const pt1 = seg[0].position.map(v => v * 2 - 1)
      const pt2 = seg[1].position.map(v => v * 2 - 1)
      lines.push(pt1[0], pt1[1], pt2[0], pt2[1])
      oppositeLines.push(pt2[0], pt2[1], pt1[0], pt1[1])
      lineVelocities.push(seg[0].velocity, seg[1].velocity)
    })
  }

  drawLinesCmd = {
    pipeline: ctx.pipeline({
      vert: glsl`
        attribute vec2 aPosition;
        attribute vec2 aOppositePosition;
        attribute float aVelocity;
        varying float vVelocity;
        uniform float uThreshold;
        uniform float uTopMargin;
        void main () {
          vVelocity = aVelocity;
          float dist = distance(aPosition, aOppositePosition);
          if (dist > uThreshold) {
            gl_Position = vec4(0);
            return;
          }
          gl_Position = vec4(aPosition, 0, 1);
          gl_Position.y -= uTopMargin;
        }
      `,
      frag: glsl`
        precision mediump float;
        varying float vVelocity;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uVelocityPow;
        void main () {
          float velocity = pow(vVelocity / 255.0, uVelocityPow) * 40.0;
          gl_FragColor = vec4(uColor, uOpacity * velocity);
        }
      `,
      primitive: ctx.Primitive.Lines,
      blend: true,
      blendSrcRGBFactor: ctx.BlendFactor.SrcAlpha,
      blendSrcAlphaFactor: ctx.BlendFactor.SrcAlpha,
      blendDstRGBFactor: ctx.BlendFactor.DstAlpha,
      blendDstAlphaFactor: ctx.BlendFactor.DstAlpha
    }),
    count: lines.length / 2,
    attributes: {
      aPosition: ctx.vertexBuffer(lines),
      aOppositePosition: ctx.vertexBuffer(oppositeLines),
      aVelocity: ctx.vertexBuffer(lineVelocities)
    },
    uniforms: {
      uColor: [84, 119, 216].map(v => v / 255),
      uThreshold: 1,
      uTopMargin: 0,
      uVelocityPow: 1
    }
  }

  drawNotesCmd = {
    pipeline: ctx.pipeline({
      vert: glsl`
        attribute vec2 aPosition;
        attribute float aVelocity;
        varying float vVelocity;
        uniform float uPointSize;
        uniform float uTopMargin;
        void main () {
          vVelocity = aVelocity;
          gl_PointSize = uPointSize;
          gl_Position = vec4(aPosition, 0, 1);
          gl_Position.y -= uTopMargin;
        }
      `,
      frag: glsl`
        precision mediump float;
        varying float vVelocity;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uVelocityPow;
        void main () {
          float opacity = 1.0 - length(gl_PointCoord * 2.0 - vec2(1));
          float velocity = pow(vVelocity / 255.0, uVelocityPow) * 40.0;
          gl_FragColor = vec4(uColor, uOpacity * opacity * velocity);
        }
      `,
      primitive: ctx.Primitive.Points,
      blend: true,
      blendSrcRGBFactor: ctx.BlendFactor.SrcAlpha,
      blendSrcAlphaFactor: ctx.BlendFactor.SrcAlpha,
      blendDstRGBFactor: ctx.BlendFactor.DstAlpha,
      blendDstAlphaFactor: ctx.BlendFactor.DstAlpha
    }),
    count: positions.length / 2,
    attributes: {
      aPosition: ctx.vertexBuffer(positions),
      aVelocity: ctx.vertexBuffer(velocities)
    },
    uniforms: {
      uColor: [84, 119, 216].map(v => v / 255),
      uPointSize: 1,
      uTopMargin: 0,
      uVelocityPow: 1
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
  ctx.submit(clearCmd)
  ctx.submit(drawLinesCmd, {
    uniforms: {
      uOpacity: settings.lineOpacity,
      uThreshold: settings.distThreshold,
      uTopMargin: settings.topMargin,
      uVelocityPow: settings.velocityPow
    }
  })
  ctx.submit(drawNotesCmd, {
    uniforms: {
      uOpacity: settings.noteOpacity,
      uPointSize: settings.radius,
      uTopMargin: settings.topMargin,
      uVelocityPow: settings.velocityPow
    }
  })

  // ctx.beginPath()
  // ctx.fillStyle = '#333'
  // ctx.fillRect(0, 0, canvas.width, canvas.height)

  // lines.forEach((line) => {
  //   ctx.beginPath()
  //   const linePts = line.map(pt => ([pt[0] * canvas.width, pt[1] * canvas.height]))
  //   drawLine(ctx, linePts)
  //   ctx.strokeStyle = `rgba(84, 119, 216, ${settings.lineOpacity})`
  //   ctx.lineWidth = 1
  //   ctx.stroke()
  // })
  // notes.forEach((e) => {
  //   const [x, y] = e.position
  //   const center = [x * canvas.width, y * canvas.height]
  //   ctx.beginPath()
  //   drawCircle(ctx, center, settings.radius)
  //   ctx.fillStyle = `rgba(84, 119, 216, ${settings.noteOpacity * Math.pow(e.velocity / 255, 3)})`
  //   ctx.fill()
  // })
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
