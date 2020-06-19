/* global requestAnimationFrame, Audio */

// const { createSpring } = require('spring-animator-1')
import includeFont from './common/include-font'
import addTitle from './common/add-title'
const { GUI } = require('dat-gui')
const fit = require('canvas-fit')
// const beats = require('beats')
const createAnalyser = require('web-audio-analyser')
const css = require('dom-css')

title('bilious-libra', '#555')

const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d')

window.addEventListener('resize', fit(canvas), false)
canvas.addEventListener('click', () => {
  if (audio.paused) {
    audio.play()
  } else {
    audio.pause()
  }
})
document.body.appendChild(canvas)

const center = [canvas.width / 2, canvas.height / 2]
const initialSize = Math.min(canvas.height, canvas.width) - 60

const settings = guiSettings({
  height: [100, 10, initialSize, 1],
  pow: [1.8, -1, 3, 0.1],
  freqWeightPow: [0.4, 0, 1.5, 0.1],
  uniqueDetectionBinSize: [5, 0, 20, 1],
  uniqueThreshold: [0.02, 0, 0.2, 0.01],
  // lo: [50, 0, 1024, 1, true],
  // hi: [512, 1, 1024, 1, true],
  // threshold: [0, 0, 256, 1, true],
  // beatFade: [0.95, 0.5, 1, 0.01],
  nextSong: [() => { selectRandomAudio().then(onLoad) }]
}, setup)

let analyser
// let detectBeats
// let beatVal = 0

const audioDir = 'resources/audio/'
const tracks = [
  '01-22(Over_Soon).mp3',
  '03-715-Creeks.mp3',
  '05-29Strafford Apts.mp3',
  '07-21Moon Water.mp3',
  '09-45.mp3',
  're-stacks.mp3',
  '04-33_GOD_.mp3',
  '06-666(upsidedowncross).mp3',
  '08-8(circle).mp3',
  '10-1000000Million.mp3',
  '02-10Death_Breast.mp3'
]

function selectRandomAudio () {
  let src
  while (!src || src === audio.src) {
    const track = tracks[Math.random() * tracks.length | 0]
    src = `${audioDir}/${track}`
    console.log(track)
  }
  audio.src = src
  return new Promise((resolve, reject) => {
    audio.addEventListener('canplay', function onLoad () {
      audio.removeEventListener('canplay', onLoad)
      resolve()
    })
  })
}

const audio = new Audio()
audio.crossOrigin = 'Anonymous'
window.audio = audio

const seeker = createSeeker(audio)
css(seeker.el, { position: 'absolute', top: 50, left: 50 })
document.body.appendChild(seeker.el)

selectRandomAudio().then(onLoad).then(() => {
  analyser = createAnalyser(audio, { audible: true, stereo: false })
})

function onLoad () {
  // audio.play()
  setup()
  requestAnimationFrame(loop)
}

function setup () {
  // detectBeats = createBeatDetector(canvas)
}

function draw (t) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const analyserBuffer = analyser.frequencies()

  const maxBin = 255 * Math.pow(0.2, settings.freqWeightPow) // Uint8 max
  const weightedValues = getWeightedValues(analyserBuffer)
  const pts = bufferToLine(weightedValues)
  drawLine(ctx, pts, 'rgba(30, 30, 30, 0.8)')
  // renderBeatDetector(analyserBuffer)
  renderUniqueElements(weightedValues)

  function getWeightedValues (buffer) {
    const weightedValues = new Float32Array(buffer.length)
    for (let j = 0; j < buffer.length; j++) {
      const freqWeight = Math.pow(j / buffer.length, settings.freqWeightPow)
      const freqBinVal = buffer[j] * freqWeight
      const t = Math.pow(freqBinVal / maxBin, settings.pow)
      weightedValues[j] = t
    }
    return weightedValues
  }

  function toPoint (binNum, t) {
    const binPixelSize = initialSize / analyserBuffer.length
    const firstBinXPosition = center[0] - (initialSize / 2)
    const x = firstBinXPosition + binPixelSize * binNum
    const y = (1 - t) * settings.height + center[1] - settings.height / 2
    return [x, y]
  }

  function bufferToLine (buffer) {
    const pts = []
    for (let j = 0; j < buffer.length; j++) {
      pts.push(toPoint(j, buffer[j]))
    }
    return pts
  }

  function renderUniqueElements (values) {
    for (let j = 0; j < values.length; j++) {
      const average = getAverageWithinDistance(values, j, settings.uniqueDetectionBinSize)
      const distanceFromAverage = Math.pow(values[j] - average, 2)
      if (distanceFromAverage > settings.uniqueThreshold) {
        drawCircle(ctx, toPoint(j, values[j]), 4, 'rgba(66, 134, 244, 0.8)')
      }
    }
  }

  function getAverageWithinDistance (values, index, distance) {
    let total = 0
    let count = 0
    if (!distance) return values[index]
    for (let j = 1; j <= distance; j++) {
      if (index - j >= 0) {
        count += 1
        total += values[index - j]
      }
      if (index + j < values.length) {
        count += 1
        total += values[index + j]
      }
    }
    return total / count
  }

  // function renderBeatDetector (buffer) {
  //   const beat = detectBeats(buffer)[0]
  //   beatVal = Math.max(beatVal, beat)
  //   beatVal *= settings.beatFade
  //   const loLine = [toPoint(settings.lo, 0), toPoint(settings.lo, 1)]
  //   const hiLine = [toPoint(settings.hi, 0), toPoint(settings.hi, 1)]
  //   const thresholdT = settings.threshold / maxBin
  //   const thresholdLine = [toPoint(settings.lo, thresholdT), toPoint(settings.hi, thresholdT)]
  //   drawLine(ctx, loLine, 'green')
  //   drawLine(ctx, hiLine, 'green')
  //   drawLine(ctx, thresholdLine, 'green')
  //   const beatIndicatorColor = `rgba(66, 134, 244, ${beatVal / maxBin})`
  //   drawRect(ctx, toPoint(settings.lo, 1), toPoint(settings.hi, 0), beatIndicatorColor)
  // }
}

function loop (t) {
  requestAnimationFrame(loop)
  seeker.tick()
  draw(t)
}

// ------------- helpers -------------

function drawCircle (ctx, position, radius, color) {
  ctx.beginPath()
  ctx.fillStyle = color
  ctx.arc(position[0], position[1], radius, 0, Math.PI * 2)
  ctx.fill()
}

// function drawRect (ctx, position1, position2, color) {
//   ctx.fillStyle = color
//   const dimensions = [
//     position2[0] - position1[0],
//     position2[1] - position1[1]
//   ]
//   ctx.fillRect(position1[0], position1[1], dimensions[0], dimensions[1])
// }

function drawLine (ctx, pts, color) {
  ctx.beginPath()
  ctx.strokeStyle = color
  ctx.moveTo(pts[0][0], pts[0][1])
  pts.slice(1).forEach((pt) => ctx.lineTo(pt[0], pt[1]))
  ctx.stroke()
}

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

function createSeeker (audioEl) {
  const seekerEl = document.createElement('div')
  const progressEl = seekerEl.appendChild(document.createElement('div'))
  const timeEl = seekerEl.appendChild(document.createElement('div'))
  const height = 15
  const width = 200
  css(seekerEl, { height, width, backgroundColor: 'rgba(30, 30, 30, 0.3)', cursor: 'pointer' })
  css(progressEl, { height: '100%', position: 'absolute', top: 0, left: 0, backgroundColor: 'rgba(30, 30, 30, 0.6)' })
  css(timeEl, { position: 'absolute', right: -50, fontWeight: 800, fontFamily: 'monospace', fontSize: 16, color: '#777' })

  function tick () {
    const t = audioEl.currentTime / audioEl.duration
    css(progressEl, 'width', `${t * 100}%`)
    timeEl.innerText = formatSeconds(audioEl.currentTime)
  }

  seekerEl.addEventListener('click', e => {
    const { left } = seekerEl.getBoundingClientRect()
    const t = (e.clientX - left) / width
    audioEl.currentTime = t * audioEl.duration
  })

  return {
    el: seekerEl,
    tick: tick
  }
}

function formatSeconds (seconds) {
  const minutes = seconds / 60 | 0
  seconds = '' + (seconds % 60 | 0)
  if (seconds.length === 1) {
    seconds = `0${seconds}`
  }
  return `${minutes}:${seconds}`
}

// function createBeatDetector (canvas) {
//   // canvas.addEventListener('mousedown', e => {
//   //
//   // })
//   // window.addEventListener('mouseup', e => {
//   //
//   // })

//   return beats([{
//     // the minimum index to sample in the frequencies array.
//     lo: settings.lo,
//     // The maximum index to sample in the frequencies array.
//     hi: settings.hi,
//     // The minimum volume at which to trigger a beat for this bin.
//     threshold: settings.threshold,
//     // the amount by which to decay the threshold for this bin for
//     // each sampled frame.
//     decay: 0
//   }])
// }
