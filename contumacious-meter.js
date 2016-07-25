import Alea from 'alea'
import SimplexNoise from 'simplex-noise'
import vec2 from 'gl-vec2'
import tinycolor from 'tinycolor2'
import colorPalettes from './common/color-palettes'
import createProject from './common/create-project'

createProject({
  // aspectRatio: 9 / 7,

  settingsConfig: {
    seed: ['int', 4]
  },

  defaultSettings: {
    seed: Math.random() * 1000 | 0 // 4 digits
  },

  tiles: [],

  main: (canvas, settings, scale = 1) => {
    let { seed } = settings
    const ctx = window.ctx = canvas.getContext('2d')
    ctx.globalCompositeOperation = 'subtract'
    const center = [canvas.width / 2 | 0, canvas.height / 2 | 0]
    const rand = new Alea(seed)
    const simplex = new SimplexNoise(rand)
    const palette = colorPalettes[rand() * colorPalettes.length | 0]
    const fontSize = 420
    const noiseStep = 1
    const wordCount = 50
    const alphabet = 'tbaldwin' // 'abcdefghijklmnopqrstuvwxyz'
    const color = palette[rand() * palette.length | 0]
    let noise = rand() * 1000

    window.ctx = ctx

    ctx.textBaseline = 'hanging'
    ctx.textAlign = 'center'
    for (let i = 0; i < wordCount; i++) {
      const noiseFactor = simplex.noise2D(noise, 1)
      const fill = rand() > 1
      const style = fill ? 'fillStyle' : 'strokeStyle'
      const text = fill ? 'fillText' : 'strokeText'
      ctx[style] = tinycolor(color).setAlpha(rand() * 0.4).toRgbString()
      const angle = noiseFactor * Math.PI * 2
      const vector = [Math.cos(angle), Math.sin(angle)]
      vec2.normalize(vector, vector)
      const x = center[0] + vector[0] * canvas.width / 2

      const sizeFactor = (1 - Math.abs((x / (canvas.width * 2) - 0.5) * 2))
      const size = (fontSize + (rand() - 0.5 * 2) * fontSize * 0.9) * sizeFactor
      ctx.font = `${size}px serif`
      const y = center[1] - size / 2
      ctx[text](alphabet[rand() * alphabet.length | 0], x, y)
      noise += noiseStep / 100
    }
  }
})
