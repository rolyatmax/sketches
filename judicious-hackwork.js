import Alea from 'alea'
import colorPalettes from './common/color-palettes'
import createProject from './common/create-project'

createProject({
  settingsConfig: {
    seed: [0, 999],
    radiusStep: [0, 255],
    radiusStart: [0, 255],
    maxSteps: [0, 511],
    angleStep: [0, 255],
    radiusVariance: [0, 255],
    angleVariance: [0, 63],
    fill: [0, 1],
    circleSize: [0, 255]
  },

  defaultSettings: {
    seed: Math.random() * 1000 | 0,
    radiusStep: 16,
    radiusStart: 20,
    maxSteps: 200,
    angleStep: 8,
    radiusVariance: 15,
    angleVariance: 12,
    fill: 1,
    circleSize: 4
  },

  tiles: [
    '21sBrKOaKUh',
    '21sBrKOaKLK',
    '21wlrhQu1ZEi',
    '215g0QWpLMs68',
    '214e0nsfX4z9V'
  ],

  main: (canvas, settings) => {
    const ctx = window.ctx = canvas.getContext('2d')
    ctx.globalCompositeOperation = 'darker'
    const rand = new Alea(settings.seed)
    const maxDist = Math.min(canvas.height, canvas.width) / 2 | 0

    const colors = colorPalettes[rand() * colorPalettes.length | 0]
    const centerX = canvas.width / 2 | 0
    const centerY = canvas.height / 2 | 0
    const angleStep = settings.angleStep / 100
    const radiusStep = settings.radiusStep / 10
    let angle = 0
    let radius = settings.radiusStart
    let steps = 0

    while (steps < settings.maxSteps) {
      const r = radius + (rand() - 0.5) * settings.radiusVariance
      const a = angle + (rand() - 0.5) * settings.angleVariance / 10
      const x = centerX + Math.cos(a) * r
      const y = centerY + Math.sin(a) * r

      ctx.strokeStyle = colors[rand() * colors.length | 0]
      ctx.fillStyle = colors[rand() * colors.length | 0]
      ctx.beginPath()
      const circleRadius = (maxDist - radius) * rand() * settings.circleSize / 100
      ctx.arc(x, y, Math.max(circleRadius, 0), 0, 2 * Math.PI)
      if (settings.fill) ctx.fill()
      else ctx.stroke()

      angle += angleStep
      radius += radiusStep
      steps += 1
    }
  }
})

// [{"angleStep":0,"angleVariance":1,"circleSize":99,"fill":0,"maxSteps":10,"radiusStart":20,"radiusStep":0,"radiusVariance":20,"seed":937},{"angleStep":0,"angleVariance":1,"circleSize":99,"fill":0,"maxSteps":10,"radiusStart":20,"radiusStep":0,"radiusVariance":20,"seed":408},{"angleStep":1,"angleVariance":1,"circleSize":10,"fill":0,"maxSteps":100,"radiusStart":0,"radiusStep":90,"radiusVariance":1,"seed":974},{"angleStep":10,"angleVariance":12,"circleSize":10,"fill":1,"maxSteps":100,"radiusStart":90,"radiusStep":9,"radiusVariance":1,"seed":188},{"angleStep":8,"angleVariance":12,"circleSize":4,"fill":1,"maxSteps":200,"radiusStart":20,"radiusStep":16,"radiusVariance":15,"seed":291}]
