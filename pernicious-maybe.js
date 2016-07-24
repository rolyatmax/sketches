import Alea from 'alea'
import SimplexNoise from 'simplex-noise'
import vec2 from 'gl-vec2'
import tinycolor from 'tinycolor2'
import colorPalettes from './common/color-palettes'
import createProject from './common/create-project'

createProject({
  // aspectRatio: 3 / 2,

  settingsConfig: {
    seed: ['int', 4],
    step: ['int', 3],
    noiseStep: ['int', 2],
    lineLength: ['int', 3],
    alpha: ['int', 2],
    multicolor: ['int', 1]
  },

  defaultSettings: {
    seed: Math.random() * 1000 | 0, // 4 digits
    step: 5, // 3 digits
    noiseStep: 50, // 2 digits
    lineLength: 100, // 3 digits
    alpha: 5, // 2 digits
    multicolor: 1 // 0 or 1
  },

  tiles: [
    '1bb0k3e00505U05',
    '1bb0O0a1050fZ05',
    '1bb0O0a10101X05',
    '1bb0O0a0010bM05',
    '1bb0O1C00108N1C',
    '1bb0O1C10108q1C',
    '1bb0O1C10103b0O',
    '1bb0O4Q10100E0a',
    '1bb1s0510107a0a',
    '1bb053e00101n05',
    '1bb023e0010ed02',
    '1bb023e0010eG02',
    '1bb023e10a0fN02',
    '1bb051C10O0fi05'
  ],

  main: (canvas, settings, scale = 1) => {
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
    let xNoise = xNoiseStart
    let yNoise = rand() * 100 | 0
    for (let y = margin; y <= canvas.height - margin; y += step) {
      yNoise += noiseStep / 1000
      xNoise = xNoiseStart
      for (let x = margin; x <= canvas.width - margin; x += step) {
        xNoise += noiseStep / 1000
        drawPoint(x, y, simplex.noise2D(xNoise, yNoise))
      }
    }

    function drawPoint (x, y, noiseFactor) {
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
