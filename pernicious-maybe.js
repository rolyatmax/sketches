import Alea from 'alea'
import SimplexNoise from 'simplex-noise'
import vec2 from 'gl-vec2'
import tinycolor from 'tinycolor2'
import colorPalettes from './common/color-palettes'
import createProject from './common/create-project'
import { rIC, cIC } from './common/request-idle-callback'

createProject({
  // aspectRatio: 9 / 7,

  settingsConfig: {
    seed: [0, 999],
    step: [0, 999],
    noiseStep: [0, 99],
    lineLength: [0, 999],
    alpha: [0, 99],
    multicolor: [0, 1]
  },

  defaultSettings: {
    seed: Math.random() * 1000 | 0, // 4 digits
    step: 20, // 3 digits
    noiseStep: 10, // 2 digits
    lineLength: 30, // 3 digits
    alpha: 60, // 2 digits
    multicolor: 0 // 0 or 1
  },

  tiles: [
    'ce1zJrcPpX',
    'ce3U19WVZX',
    'ce3U19BB6R',
    'ce3U10z3b7',
    'ce3UrnxL8M',
    'ce3UrwCPaY',
    'ce3UrwBqAq',
    'ce3Vo7UjGy',
    'ce71zlOJGa',
    'cep8OgKCV',
    'ceaCGB7jk',
    'ceaCGBf2i',
    'ceaCQkiCC',
    'ceoFIeqyN'
  ],

  main: (canvas, settings, scale = 1) => {
    canvas.callbackTokens = canvas.callbackTokens || []
    while (canvas.callbackTokens.length) {
      cIC(canvas.callbackTokens.pop())
    }
    let { step, lineLength, seed, noiseStep, multicolor, alpha } = settings
    step *= scale
    lineLength *= scale
    const ctx = window.ctx = canvas.getContext('2d')
    ctx.globalCompositeOperation = 'darker'
    const rand = new Alea(seed)
    const simplex = new SimplexNoise(rand)
    const palette = colorPalettes[rand() * colorPalettes.length | 0]
    const margin = lineLength

    let colorIndex

    let xNoiseStart = rand() * 100 | 0
    let yNoise = rand() * 100 | 0
    for (let y = margin; y <= canvas.height - margin; y += step) {
      yNoise += noiseStep / 1000
      const noise = [xNoiseStart, yNoise]
      drawRow(y, noise[0], noise[1])
    }

    function drawRow (y, xNoise, yNoise) {
      const token = rIC(() => {
        for (let x = margin; x <= canvas.width - margin; x += step) {
          xNoise += noiseStep / 1000
          drawPoint(x, y, xNoise, yNoise)
        }
      })
      canvas.callbackTokens.push(token)
    }

    function drawPoint (x, y, xNoise, yNoise) {
      const noiseFactor = simplex.noise2D(xNoise, yNoise)
      const angle = noiseFactor * Math.PI * 2
      colorIndex = multicolor || colorIndex === undefined ? palette.length * rand() | 0 : colorIndex
      const color = tinycolor(palette[colorIndex])
      let end = [Math.cos(angle), Math.sin(angle)]
      vec2.normalize(end, end)
      end = end.map(coord => coord * lineLength)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(end[0] + x, end[1] + y)
      ctx.strokeStyle = color.setAlpha(alpha / 100).toRgbString()
      ctx.stroke()
    }
  }
})

// [{"alpha":20,"lineLength":200,"multicolor":0,"noiseStep":5,"seed":366,"step":5},{"alpha":50,"lineLength":10,"multicolor":1,"noiseStep":5,"seed":991,"step":5},{"alpha":50,"lineLength":10,"multicolor":1,"noiseStep":1,"seed":121,"step":5},{"alpha":50,"lineLength":10,"multicolor":0,"noiseStep":1,"seed":730,"step":5},{"alpha":50,"lineLength":100,"multicolor":0,"noiseStep":1,"seed":545,"step":100},{"alpha":50,"lineLength":100,"multicolor":1,"noiseStep":1,"seed":522,"step":100},{"alpha":50,"lineLength":100,"multicolor":1,"noiseStep":1,"seed":197,"step":50},{"alpha":50,"lineLength":300,"multicolor":1,"noiseStep":1,"seed":40,"step":10},{"alpha":90,"lineLength":5,"multicolor":1,"noiseStep":1,"seed":444,"step":10},{"alpha":5,"lineLength":200,"multicolor":0,"noiseStep":1,"seed":85,"step":5},{"alpha":2,"lineLength":200,"multicolor":0,"noiseStep":1,"seed":881,"step":2},{"alpha":2,"lineLength":200,"multicolor":0,"noiseStep":1,"seed":910,"step":2},{"alpha":2,"lineLength":200,"multicolor":1,"noiseStep":10,"seed":979,"step":2},{"alpha":5,"lineLength":100,"multicolor":1,"noiseStep":50,"seed":948,"step":5}]
