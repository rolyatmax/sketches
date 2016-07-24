import Alea from 'alea'
import colorPalettes from './common/color-palettes'
import createProject from './common/create-project'

createProject({
  settingsConfig: {
    seed: ['int', 4],
    radiusStep: ['int', 2],
    radiusStart: ['int', 3],
    maxSteps: ['int', 4],
    angleStep: ['int', 3],
    radiusVariance: ['int', 3],
    angleVariance: ['int', 2],
    fill: ['int', 1],
    circleSize: ['int', 3]
  },

  defaultSettings: {
    seed: Math.random() * 1000 | 0, // 4 digits
    radiusStep: 16, // 2 digits
    radiusStart: 20, // 3 digits
    maxSteps: 200, // 4 digits
    angleStep: 8, // 3 digits
    radiusVariance: 15, // 3 digits
    angleVariance: 12, // 2 digits
    fill: 1, // 1 digit
    circleSize: 4 // 3 digits
  },

  tiles: [
    'bea00011B000a0k000k0f7',
    'bea00011B000a0k000k06A',
    'bea01010a001C001s010fI',
    'bea0a0c0a101C1s0901032',
    'bea080c04103e0k0g0f04H'
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
