const canvasSketch = require('canvas-sketch')
const { GUI } = require('dat-gui')
const css = require('dom-css')
const createPlayer = require('web-audio-player')
const createAnalyser = require('web-audio-analyser')
const Meyda = require('meyda')

const config = {
  dimensions: [ 1024, 1024 ],
  animate: true
}

const settings = {
  intensityMult: 110,
  intensityPow: 8.5,
  margin: 0.1,
  layoutRadius: 0.15,
  bgOpacity: 0.7,
  colorOpacity: 0.8,
  maxLineWidth: 15,
  frameCountSmoothing: 240,
  circleOfFifthsOrdering: false,
  linearLayout: true
}

const FRAME_HISTORY_SIZE = 60 * 100

const gui = new GUI()
gui.add(settings, 'intensityMult', 1, 150)
gui.add(settings, 'intensityPow', 0.01, 20).step(0.01)
gui.add(settings, 'margin', 0, 0.4).step(0.01)
gui.add(settings, 'layoutRadius', 0.1, 0.5).step(0.01)
gui.add(settings, 'bgOpacity', 0, 1).step(0.01)
gui.add(settings, 'colorOpacity', 0, 1).step(0.01)
gui.add(settings, 'maxLineWidth', 0, 50)
gui.add(settings, 'frameCountSmoothing', 1, FRAME_HISTORY_SIZE).step(1)
gui.add(settings, 'circleOfFifthsOrdering')
gui.add(settings, 'linearLayout')

let analyser

const audio = createPlayer('src/audio/06-666(upsidedowncross).mp3')
document.body.appendChild(showPlayAudioButton(audio))
audio.on('load', function () {
  analyser = Meyda.createMeydaAnalyzer({
    audioContext: audio.context,
    source: audio.node,
    bufferSize: Math.pow(2, 13),
    hopSize: Math.pow(2, 10),
    featureExtractors: ['chroma', 'spectralFlatness', 'loudness']
  })

  createAnalyser(audio.node, audio.context, { audible: true, stereo: false })
  canvasSketch(sketch, config)
})

const analyserFrames = new Array(FRAME_HISTORY_SIZE).fill().map(() => new Array(12).fill(0))

const sketch = () => {
  return ({ context, width, height, frame }) => {
    context.fillStyle = `rgba(255, 255, 255, ${settings.bgOpacity})`
    context.fillRect(0, 0, width, height)

    const features = analyser.get(['chroma', 'spectralFlatness', 'loudness'])
    if (features && features.chroma) {
      const curFrameIdx = frame % analyserFrames.length
      const currentFrame = analyserFrames[curFrameIdx]
      currentFrame.forEach((_, i) => { currentFrame[i] = features.chroma[i] })

      const pitchIntensities = getPitchIntensities(analyserFrames, curFrameIdx, settings.frameCountSmoothing)

      const compositePosition = [
        width / 2,
        settings.linearLayout ? height * 0.3 : height * 0.35
      ]

      const totalWeight = pitchIntensities.reduce((tot, w) => tot + Math.pow(w, settings.intensityPow), 0)
      const weightedHues = []

      for (let i = 0; i < features.chroma.length; i++) {
        const pitchIntensity = pitchIntensities[i]
        const order = settings.circleOfFifthsOrdering ? i * 7 % 12 : i

        let x, y
        if (settings.linearLayout) {
          x = (order / (features.chroma.length - 1)) * width * (1 - settings.margin * 2) + settings.margin * width
          y = height / 2
        } else {
          const rads = order / features.chroma.length * Math.PI * 2 - Math.PI / 2
          x = Math.cos(rads) * settings.layoutRadius * Math.min(width, height) + compositePosition[0]
          y = Math.sin(rads) * settings.layoutRadius * Math.min(width, height) + compositePosition[1]
        }

        const weightedIntensity = Math.pow(pitchIntensity, settings.intensityPow) * (1 - features.spectralFlatness)
        const weight = weightedIntensity / totalWeight
        const hue = order / features.chroma.length * 360

        weightedHues.push([hue, weightedIntensity])

        context.beginPath()
        context.moveTo(x, y)
        context.lineTo(compositePosition[0], compositePosition[1])
        context.strokeStyle = `hsla(${hue}, 70%, 70%, ${settings.colorOpacity * weight})`
        context.lineWidth = weightedIntensity / totalWeight * settings.maxLineWidth
        context.stroke()

        const r = Math.max(0, weightedIntensity * settings.intensityMult)
        context.beginPath()
        context.arc(x, y, r, 0, Math.PI * 2)
        context.fillStyle = `hsla(${hue}, 70%, 70%, ${settings.colorOpacity})`
        context.fill()
      }

      // draw average color
      const averageHue = getCompositeHue(weightedHues)
      const opacity = settings.colorOpacity * (1 - features.spectralFlatness)
      const compositeColor = `hsla(${averageHue}, 70%, 70%, ${opacity})`
      context.beginPath()
      context.arc(compositePosition[0], compositePosition[1], settings.intensityMult * 0.4, 0, Math.PI * 2)
      context.fillStyle = compositeColor
      context.fill()

      // draw loudness
      const specificLoudness = features.loudness.specific // .slice(0, 18)
      for (let i = 0; i < specificLoudness.length; i++) {
        const intensity = specificLoudness[i]
        const x = (i / (specificLoudness.length - 1)) * width * (1 - settings.margin * 2) + settings.margin * width
        const y = height * 0.8
        const r = Math.pow(intensity / 2.5, 1.5) * settings.intensityMult
        context.beginPath()
        context.fillStyle = compositeColor
        context.fillRect(x, y - r / 2, 4, r)
      }
    }
  }
}

function getCompositeHue (weightedHues, opacity) {
  const total = [0, 0]
  for (let [hue, weight] of weightedHues) {
    total[0] += Math.cos(hue / 180 * Math.PI) * weight
    total[1] += Math.sin(hue / 180 * Math.PI) * weight
  }
  const leng = Math.sqrt(total[0] * total[0] + total[1] * total[1])
  const averageHue = Math.atan2(total[1] / leng, total[0] / leng) / Math.PI * 180 | 0
  return (averageHue + 360) % 360
}

function getPitchIntensities (frameHistory, curFrameIdx, frameCountSmoothing) {
  if (frameCountSmoothing === 0) {
    throw new Error(`Invalid frameCountSmoothing (must be greater than 0): ${frameCountSmoothing}`)
  }
  const totals = new Array(12).fill(0)
  let n = frameCountSmoothing
  while (n--) {
    const idx = (curFrameIdx - n + frameHistory.length) % frameHistory.length
    frameHistory[idx].forEach((v, i) => { totals[i] += v })
  }
  return totals.map((v) => v / frameCountSmoothing)
}

function showPlayAudioButton (audio) {
  const button = document.createElement('button')
  button.innerText = 'Play Audio'
  css(button, {
    padding: 20,
    width: 300,
    display: 'block',
    fontSize: 32,
    position: 'absolute',
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
