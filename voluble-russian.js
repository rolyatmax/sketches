import Alea from 'alea'
import tinycolor from 'tinycolor2'
import colorPalettes from './common/color-palettes'
import createProject from './common/create-project'

createProject({
  settingsConfig: {
    seed: [0, 999],
    trianglesCount: [0, 1000],
    circleRadius: [0, 800],
    colorAlpha: [0, 100],
    circleMargin: [0, 500]
  },

  defaultSettings: {
    seed: Math.random() * 1000 | 0,
    trianglesCount: 3,
    circleRadius: 12,
    colorAlpha: 50,
    circleMargin: 25
  },

  tiles: [
    '64ofc8WiC',
    '64odJi9ya',
    '64ocZTJQt',
    '64YxuJLNo',
    '643IHkUr',
    '643GyreO',
    '64oCBkata',
    '64jDhfI',
    '64OnTYS',
    '64YwkLMen'
  ],

  main: (canvas, settings, scale = 1) => {
    const { trianglesCount, circleRadius, circleMargin, seed, colorAlpha } = settings
    const ctx = window.ctx = canvas.getContext('2d')

    ctx.globalCompositeOperation = 'darker'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const rand = new Alea(seed)
    // const simplex = window.simplex = new SimplexNoise(rand)
    const palette = colorPalettes[rand() * colorPalettes.length | 0]

    const boxSize = (circleMargin + circleRadius) * 2
    const canvasSquareSize = Math.min(canvas.height, canvas.width)
    const boxCount = canvasSquareSize / boxSize | 0
    const canvasMargin = [
      (canvas.width - (boxSize * boxCount)) / 2 | 0,
      (canvas.height - (boxSize * boxCount)) / 2 | 0
    ]

    for (let j = 0; j < boxCount; j++) {
      for (let k = 0; k < boxCount; k++) {
        const boxCenter = [
          canvasMargin[0] + circleMargin + circleRadius + j * boxSize,
          canvasMargin[1] + circleMargin + circleRadius + k * boxSize
        ]
        drawCircle(boxCenter)
      }
    }

    function drawCircle (cent) {
      for (let i = 0; i < trianglesCount; i++) {
        const points = [
          randomPointOnCircle(cent, circleRadius),
          randomPointOnCircle(cent, circleRadius),
          randomPointOnCircle(cent, circleRadius)
        ]
        const color = tinycolor(palette[rand() * palette.length | 0])
        ctx.fillStyle = color.setAlpha(colorAlpha / 100).toRgbString()
        ctx.beginPath()
        ctx.moveTo(points[0][0], points[0][1])
        ctx.lineTo(points[1][0], points[1][1])
        ctx.lineTo(points[2][0], points[2][1])
        ctx.fill()
      }
    }

    function randomPointOnCircle (center, radius) {
      const angle = Math.random() * Math.PI * 2
      return [
        center[0] + Math.cos(angle) * radius | 0,
        center[1] + Math.sin(angle) * radius | 0
      ]
    }
  }
})

// [{"circleMargin":10,"circleRadius":20,"colorAlpha":50,"seed":757,"trianglesCount":10},{"circleMargin":10,"circleRadius":10,"colorAlpha":50,"seed":490,"trianglesCount":10},{"circleMargin":10,"circleRadius":5,"colorAlpha":50,"seed":817,"trianglesCount":1},{"circleMargin":25,"circleRadius":20,"colorAlpha":40,"seed":569,"trianglesCount":10},{"circleMargin":0,"circleRadius":25,"colorAlpha":50,"seed":990,"trianglesCount":3},{"circleMargin":0,"circleRadius":25,"colorAlpha":20,"seed":779,"trianglesCount":50},{"circleMargin":10,"circleRadius":180,"colorAlpha":20,"seed":523,"trianglesCount":40},{"circleMargin":0,"circleRadius":2,"colorAlpha":20,"seed":688,"trianglesCount":10},{"circleMargin":0,"circleRadius":5,"colorAlpha":70,"seed":24,"trianglesCount":2},{"circleMargin":25,"circleRadius":12,"colorAlpha":50,"seed":411,"trianglesCount":3}]
