/* global requestAnimationFrame */

import includeFont from './common/include-font'
import addTitle from './common/add-title'
const css = require('dom-css')
const fit = require('canvas-fit')
const { GUI } = require('dat-gui')
const createPlayer = require('web-audio-player')
const createAnalyser = require('web-audio-analyser')

title('turgid-latte', '#999')

// const noop = () => {}

const canvas = document.body.appendChild(document.createElement('canvas'))
const ctx = canvas.getContext('2d')
window.addEventListener('resize', fit(canvas), false)

let analyser

const audio = createPlayer('src/audio/02-10Death_Breast.mp3')
document.body.appendChild(showPlayAudioButton(audio))
audio.on('load', function () {
  analyser = createAnalyser(audio.node, audio.context, { audible: true, stereo: false })
  analyser.analyser.fftSize = 32768
  analyser.analyser.minDecibels = -75
  analyser.analyser.maxDecibels = -30
  analyser.analyser.smoothingTimeConstant = 0.5
  startLoop()
})

const settings = guiSettings({
  bins: [240, 2, 400, 1, true],
  pixelSize: [2, 1, 20, 1, true],
  opacity: [10, 0.01, 16, 0.01, true],
  freqSamplingPow: [4, 1, 8, 0.1, true],
  fade: [0.8, 0.0, 0.8, 0.001]
}, () => { ctx.clearRect(0, 0, canvas.width, canvas.height) })

// function update () {
//
// }

function draw (ctx) {
  if (settings.fade) {
    drawRect(ctx, [0, 0], [canvas.width, canvas.height], `rgba(255, 255, 255, ${settings.fade})`)
  }
  const drawStart = window.performance.now()
  const vizSize = settings.bins * settings.pixelSize
  const offset = [
    (ctx.canvas.width - vizSize) / 2,
    (ctx.canvas.height - vizSize) / 2
  ]

  const maxDecibels = 255
  const frequencies = analyser.frequencies()
  for (let i = 0; i < settings.bins; i += 1) {
    const indexI = Math.pow(i / settings.bins, settings.freqSamplingPow) * frequencies.length | 0
    const firstFreq = frequencies[indexI] / maxDecibels
    for (let j = 0; j < settings.bins; j += 1) {
      const indexJ = Math.pow(j / settings.bins, settings.freqSamplingPow) * frequencies.length | 0
      const secondFreq = frequencies[indexJ] / maxDecibels
      const cooccurence = Math.pow(firstFreq * secondFreq, 2)
      drawRect(ctx,
        [i * settings.pixelSize + offset[0], j * settings.pixelSize + offset[1]],
        [settings.pixelSize, settings.pixelSize],
        `rgba(55, 162, 212, ${settings.opacity * cooccurence})`
      )
    }
  }
  console.log(window.performance.now() - drawStart)
}

function startLoop () {
  requestAnimationFrame(function loop () {
    requestAnimationFrame(loop)
    // update()
    draw(ctx)
  })
}

function drawRect (ctx, position, size, color) {
  ctx.beginPath()
  ctx.fillStyle = color
  ctx.fillRect(position[0], position[1], size[0], size[1])
}

// ---------------- helpers ///

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

function showPlayAudioButton (audio) {
  const button = document.createElement('button')
  button.innerText = 'Play Audio'
  css(button, {
    padding: 20,
    width: 300,
    display: 'block',
    fontSize: 32,
    position: 'relative',
    top: '48vh',
    margin: 'auto',
    zIndex: 10
  })
  button.addEventListener('click', () => {
    audio.play()
    button.parentElement.removeChild(button)
  })
  return button
}

function guiSettings (settings, onChange) {
  const settingsObj = {}
  const gui = new GUI()
  css(gui.domElement.parentElement, { zIndex: 11 })
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
