import * as canvasSketch from 'canvas-sketch'
import * as random from 'canvas-sketch-util/random'
import { GUI } from 'dat-gui'
import { vec2 } from 'gl-matrix'

const WIDTH = 2048
const HEIGHT = 2048

const settings = {
  seed: 1,
  lines: 15,
  lineHeight: 50,
  lineLength: 1200,
  lineDivisions: 35,
  maxControlPtPerturb: 15,
  perturbNoiseFreq: 0.5,
  perturbNoiseMag: 13,
  perturbDivisionSize: 2,
}

type SketchArgs = { context: CanvasRenderingContext2D, viewportWidth: number, viewportHeight: number }
type Vec2 = [number, number]
type Line = Vec2[]

canvasSketch(({ render }) => {
  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(render)
  gui.add(settings, 'lines', 1, 30).step(1).onChange(render)
  gui.add(settings, 'lineHeight', 10, 200).step(1).onChange(render)
  gui.add(settings, 'lineLength', 100, 2000).step(1).onChange(render)
  gui.add(settings, 'lineDivisions', 1, 100).step(1).onChange(render)
  gui.add(settings, 'maxControlPtPerturb', 1, 100).step(1).onChange(render)
  gui.add(settings, 'perturbNoiseFreq', 0, 4).onChange(render)
  gui.add(settings, 'perturbNoiseMag', 0, 20).step(0.01).onChange(render)
  gui.add(settings, 'perturbDivisionSize', 1, 20).step(1).onChange(render)

  return (args: SketchArgs) => {
    const { context, viewportWidth, viewportHeight } = args
    const width = viewportWidth
    const height = viewportHeight

    const rand = random.createRandom(settings.seed)

    const lineSectionStart = [
      (width - settings.lineLength) / 2,
      (height - (settings.lineHeight * settings.lines)) / 2
    ]

    const lines: Line[] = Array.from({ length: settings.lines }, (_, i) => {
      const y = lineSectionStart[1] + (i * settings.lineHeight) + settings.lineHeight / 2
      const startX = lineSectionStart[0]
      const start: Vec2 = [lineSectionStart[0], y]
      const pts = [start]

      for (let j = 0; j < settings.lineDivisions; j++) {
        const t = (j + 1) / settings.lineDivisions
        const x = startX + t * settings.lineLength
        const pt: Vec2 = [x, y]
        const dir = rand.insideCircle(settings.maxControlPtPerturb, vec2.create())
        vec2.add(pt, pt, dir)
        pts.push(pt)
      }

      return perturbLine(pts)
    })

    function perturbLine (line: Line): Line {
      const outLine: Line = []
      for (let j = 0; j < line.length - 1; j++) {
        const start = line[j]
        const end = line[j + 1]
        const dir = vec2.sub(vec2.create(), end, start)
        vec2.normalize(dir, dir)
        const norm = vec2.fromValues(dir[1], -dir[0])
        const tStart = rand.range(1000000)

        outLine.push(start)
        const divisions = Math.max(1, Math.floor(vec2.distance(start, end) / settings.perturbDivisionSize))
        // skipping first and last pt because we don't want to perturb the control points
        for (let i = 1; i < divisions; i++) {
          const t = i / divisions
          const noiseMagT = Math.sin(t * Math.PI)
          const pt = vec2.lerp(vec2.create(), start, end, t) as Vec2
          const mag = rand.noise1D(t + tStart, settings.perturbNoiseFreq, settings.perturbNoiseMag * noiseMagT)
          vec2.add(pt, pt, vec2.scale(vec2.create(), norm, mag))
          outLine.push(pt)
        }
      }
      // don't forget to push very last control pt
      outLine.push(line[line.length - 1])

      return outLine
    }

    // Render

    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    for (const pts of lines) {
      const firstPt = pts[0]
      context.beginPath()
      context.moveTo(firstPt[0], firstPt[1])
      for (const pt of pts.slice(1)) {
        context.lineTo(pt[0], pt[1])
      }
      context.strokeStyle = 'black'
      context.lineWidth = 3
      context.stroke()
    }
  }
}, {
  dimensions: [WIDTH, HEIGHT],
  animate: true
})
