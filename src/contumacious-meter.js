import Alea from 'alea'
import SimplexNoise from 'simplex-noise'
import vec2 from 'gl-vec2'
import tinycolor from 'tinycolor2'
import colorPalettes from './common/color-palettes'
import createProject from './common/create-project'
import includeFont from './common/include-font'

includeFont({
  fontFamily: '"Cardo", sans-serif',
  url: 'https://fonts.googleapis.com/css?family=Cardo:700'
})

createProject({
  // aspectRatio: 9 / 7,

  settingsConfig: {
    seed: [0, 999]
  },

  defaultSettings: {
    seed: Math.random() * 1000 | 0
  },

  tiles: [],

  main: (canvas, settings, scale = 1) => {
    let { seed } = settings
    const ctx = window.ctx = canvas.getContext('2d')
    ctx.globalCompositeOperation = 'darker'
    const center = [canvas.width / 2 | 0, canvas.height / 2 | 0]
    const rand = new Alea(seed)
    const simplex = new SimplexNoise(rand)
    const palette = colorPalettes[rand() * colorPalettes.length | 0]
    const fontSize = 320
    const noiseStep = 1
    const wordCount = 1
    const alphabet = 'taylor' // 'abcdefghijklmnopqrstuvwxyz'
    const color = palette[rand() * palette.length | 0]
    let noise = rand() * 1000

    window.ctx = ctx

    ctx.textBaseline = 'hanging'
    ctx.textAlign = 'center'
    for (let i = 0; i < wordCount; i++) {
      const noiseFactor = simplex.noise2D(noise, 1)
      const fill = rand() > 0.7
      const style = fill ? 'fillStyle' : 'strokeStyle'
      const text = fill ? 'fillText' : 'strokeText'
      ctx[style] = tinycolor(color).setAlpha(rand() * 0.8).toRgbString()
      const angle = noiseFactor * Math.PI * 2
      const vector = [Math.cos(angle), Math.sin(angle)]
      vec2.normalize(vector, vector)
      const x = vector[0] // * canvas.width / 10
      const sizeFactor = (1 - Math.abs((x / (canvas.width * 2) - 0.5) * 2))
      const size = (fontSize + (rand() - 0.5 * 2) * fontSize * 0.9) * sizeFactor
      ctx.font = `${size}px Cardo`
      const y = size / 2
      ctx.save()
      ctx.translate(center[0], center[1])
      ctx.rotate(noiseFactor * Math.PI * 2)
      ctx[text](alphabet[rand() * alphabet.length | 0], x, y)
      ctx.restore()
      noise += noiseStep / 100
    }
  }
})
