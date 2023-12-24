import * as canvasSketch from 'canvas-sketch'
import * as random from 'canvas-sketch-util/random'
import { GUI } from 'dat-gui'

const WIDTH = 2048
const HEIGHT = 2048

const settings = {
  seed: 1
}

type SketchArgs = { context: CanvasRenderingContext2D, viewportWidth: number, viewportHeight: number }

canvasSketch(({ render }) => {
  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(render)

  return (args: SketchArgs) => {
    const { context, viewportWidth, viewportHeight } = args
    const width = viewportWidth
    const height = viewportHeight

    const rand = random.createRandom(settings.seed)

    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)
  }
}, {
  dimensions: [WIDTH, HEIGHT],
  animate: true
})
