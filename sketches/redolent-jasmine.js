/* global requestAnimationFrame, Audio */

import includeFont from './common/include-font'
import addTitle from './common/add-title'
const css = require('dom-css')
const fit = require('canvas-fit')
const { GUI } = require('dat-gui')
const array = require('new-array')
const shuffle = require('shuffle-array')
const Alea = require('alea')
const { createSpring } = require('spring-animator-1')
const Delaunator = require('delaunator')
const createAnalyser = require('web-audio-analyser')
const createAudioControls = require('./common/audio-controls')
const createAudioTrackSelector = require('./common/audio-track-selector')

title('redolent-jasmine', '#555')

const canvas = document.body.appendChild(document.createElement('canvas'))
window.addEventListener('resize', fit(canvas), false)
const ctx = canvas.getContext('2d')

let analyser, points
const tracks = [
  'resources/audio/01-22(Over_Soon).mp3',
  'resources/audio/03-715-Creeks.mp3',
  'resources/audio/05-29Strafford Apts.mp3',
  'resources/audio/07-21Moon Water.mp3',
  'resources/audio/09-45.mp3',
  'resources/audio/re-stacks.mp3',
  'resources/audio/04-33_GOD_.mp3',
  'resources/audio/06-666(upsidedowncross).mp3',
  'resources/audio/08-8(circle).mp3',
  'resources/audio/10-1000000Million.mp3',
  'resources/audio/02-10Death_Breast.mp3'
]
setupAudio(tracks).then((audioAnalyser) => {
  analyser = audioAnalyser
  setup()
  requestAnimationFrame(loop)
})

const settings = guiSettings({
  seed: [0, 0, 9999, 1, true],
  padding: [100, 0, 500, 1],
  points: [3000, 600, 6000, 1, true],
  dampening: [0.25, 0.01, 1, 0.01, true],
  stiffness: [0.55, 0.01, 1, 0.01, true],
  freqPow: [1.5, 0.01, 3, 0.01],
  connectedNeighbors: [2, 0, 10, 1, true],
  neighborWeight: [0.9, 0, 1, 0.01],
  connectedBinsStride: [1, 1, 50, 1, true], // make this a numFrequencyNodes setting or something
  circleSize: [10, 3, 50, 1]
}, setup)

function setup () {
  const rand = new Alea(settings.seed)
  points = []

  // fill up the points list with the freqency-tracking nodes
  const frequenciesCount = analyser.frequencies().length // 1024
  for (let q = 0; q < frequenciesCount; q += settings.connectedBinsStride) {
    const mag = Math.pow(1 - q / frequenciesCount, -0.9) * 0.2
    const rads = rand() * Math.PI * 2
    const position = [
      (Math.cos(rads) * mag + 1) / 2,
      (Math.sin(rads) * mag + 1) / 2
    ]
    const id = points.length
    const point = createPoint(id, position)
    point.frequencyBin = q
    points.push(point)
  }

  array(settings.points - points.length).forEach((_, i) => {
    const id = points.length
    points.push(createPoint(id, [rand(), rand()]))
  })

  function createPoint (id, position) {
    return {
      position: position,
      id: id,
      neighbors: new Set(), // gonna fill this up with the results of delaunay
      spring: createSpring(settings.dampening, settings.stiffness, 0)
    }
  }

  const delaunay = new Delaunator(points.map((pt) => pt.position))
  for (let j = 0; j < delaunay.triangles.length; j += 3) {
    const pt1 = delaunay.triangles[j]
    const pt2 = delaunay.triangles[j + 1]
    const pt3 = delaunay.triangles[j + 2]

    points[pt1].neighbors.add(pt2)
    points[pt1].neighbors.add(pt3)
    points[pt2].neighbors.add(pt1)
    points[pt2].neighbors.add(pt3)
    points[pt3].neighbors.add(pt1)
    points[pt3].neighbors.add(pt2)
  }

  points.forEach(pt => {
    pt.neighbors = shuffle(Array.from(pt.neighbors)).slice(0, settings.connectedNeighbors)
  })
}

function update () {
  const frequencies = analyser.frequencies()
  points.forEach(pt => {
    let value = 0
    if (pt.frequencyBin || pt.frequencyBin === 0) {
      value = Math.pow(frequencies[pt.frequencyBin] / 255, settings.freqPow) // max bin value
    }
    const neighbors = pt.neighbors
    const neighborSum = neighbors.reduce((total, ptID) => {
      return total + points[ptID].spring.tick(1, false)
    }, 0)
    const neighborAverage = neighbors.length ? neighborSum / neighbors.length : 0
    value = Math.max(value, neighborAverage * settings.neighborWeight)

    pt.spring.updateValue(value)
  })
}

function draw () {
  const center = [canvas.width / 2, canvas.height / 2]
  const size = Math.min(canvas.width, canvas.height) - settings.padding
  points.forEach(pt => {
    const position = [
      pt.position[0] * size + center[0] - size / 2,
      pt.position[1] * size + center[1] - size / 2
    ]
    const t = Math.max(0, pt.spring.tick())
    const radius = t * settings.circleSize
    const opacity = t < 1 ? t : 2 - t // start to fade back out after t > 1
    drawCircle(ctx, position, radius, `rgba(66, 134, 244, ${opacity})`)
  })
}

function loop () {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  requestAnimationFrame(loop)
  update()
  draw()
}

// ///// helpers (to abstract down the line?) //////

function setupAudio (tracks) {
  const audio = new Audio()
  audio.crossOrigin = 'Anonymous'
  const audioControls = createAudioControls(audio)
  const trackSelector = createAudioTrackSelector(audio, tracks)

  css(trackSelector.el, { position: 'relative', zIndex: 10 })

  document.body.appendChild(audioControls.el)
  document.body.appendChild(trackSelector.el)

  requestAnimationFrame(loop)
  function loop () {
    requestAnimationFrame(loop)
    audioControls.tick()
  }

  return new Promise((resolve, reject) => {
    audio.addEventListener('canplay', function onLoad () {
      audio.removeEventListener('canplay', onLoad)
      const analyser = createAnalyser(audio, { audible: true, stereo: false })
      resolve(analyser)
    })
  })
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

function drawCircle (ctx, position, radius, color) {
  ctx.beginPath()
  ctx.lineWidth = 1
  ctx.strokeStyle = color
  ctx.arc(position[0], position[1], radius, 0, Math.PI * 2)
  ctx.stroke()
}
