import Alea from 'alea'
import SimplexNoise from 'simplex-noise'
import tinycolor from 'tinycolor2'
import colorPalettes from './common/color-palettes'
import createProject from './common/create-project'
import { rIC, cIC } from './common/request-idle-callback'

createProject({
  settingsConfig: {
    seed: [0, 999],
    dotCount: [1, 99999],
    radius: [2, 500],
    loopCount: [1, 9999],
    alpha: [1, 100],
    noiseZoom: [1, 99999],
    spread: [1, 9999]
  },

  defaultSettings: {
    seed: Math.random() * 1000 | 0,
    dotCount: 100,
    radius: 200,
    loopCount: 400,
    alpha: 10,
    noiseZoom: 500,
    spread: 30
  },

  tiles: [
    '0aiiUA9A6dI2RMcF',
    '0a8Ag1A603HHGbp',
    '0a2DvNG9A6dIX1sY3',
    '0a2DvNG9A7cdteLlb'
  ],

  main: (canvas, settings) => {
    canvas.callbackTokens = canvas.callbackTokens || []
    while (canvas.callbackTokens.length) {
      cIC(canvas.callbackTokens.pop())
    }

    const ctx = window.ctx = canvas.getContext('2d')
    ctx.globalCompositeOperation = 'darker'
    const rand = new Alea(settings.seed)
    const simplex = new SimplexNoise(rand)
    const colors = colorPalettes[rand() * colorPalettes.length | 0]
    const color = colors[rand() * colors.length | 0]
    ctx.fillStyle = tinycolor(color).setAlpha(settings.alpha / 100).toRgbString()

    function drawCircle (j) {
      const token = rIC(() => {
        for (let i = 0; i < settings.dotCount; i++) {
          const angle = (i / settings.dotCount) * Math.PI * 2 + j / Math.PI
          const noiseZoom = settings.noiseZoom / 100
          const noise = simplex.noise2D(angle / noiseZoom, j / noiseZoom)
          const spread = settings.spread / 100
          const radius = settings.radius + noise * j * spread
          const x = Math.cos(angle) * radius + canvas.width / 2
          const y = Math.sin(angle) * radius + canvas.height / 2
          ctx.fillRect(x, y, 1, 1)
        }
      })
      canvas.callbackTokens.push(token)
    }

    for (let j = 0; j < settings.loopCount; j++) {
      drawCircle(j)
    }
  }
})
