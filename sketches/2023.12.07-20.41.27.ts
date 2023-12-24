// subdivision study (newspaper layout)

import * as canvasSketch from 'canvas-sketch'
import * as random from 'canvas-sketch-util/random'
import { GUI } from 'dat-gui'

const HEIGHT = 2048
const WIDTH = HEIGHT * 2 / 3

const settings = {
  seed: 1,
  boxes: 20,
  minMargin: 170, // minimum margin around the canvas
  minHeight: 5, // each box must be at least this tall (in lineHeight units)
  minWidth: 300, // each box must be at least this wide
  lineHeight: 15, // each box height must be divisible by this number
  boxMargin: 1, // margin between boxes (in lineHeight units)
}

type Box = {
  x: number,
  y: number,
  width: number,
  height: number,
}

type SketchArgs = { context: CanvasRenderingContext2D, viewportWidth: number, viewportHeight: number }

canvasSketch(({ render }) => {
  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(render)
  gui.add(settings, 'boxes', 1, 40).step(1).onChange(render)
  gui.add(settings, 'minMargin', 1, 300).step(1).onChange(render)
  gui.add(settings, 'minHeight', 1, 20).step(1).onChange(render)
  gui.add(settings, 'minWidth', 10, 1000).step(1).onChange(render)
  gui.add(settings, 'lineHeight', 10, 200).step(1).onChange(render)
  gui.add(settings, 'boxMargin', 0.5, 4).step(0.5).onChange(render)

  return (args: SketchArgs) => {
    const { context, viewportWidth, viewportHeight } = args
    const width = viewportWidth
    const height = viewportHeight

    const rand = random.createRandom(settings.seed)

    // height needs to be divisible by lineHeight
    const h = Math.floor((height - settings.minMargin * 2) / settings.lineHeight) * settings.lineHeight
    const actualMargin = (height - h) / 2
    const w = width - actualMargin * 2

    const boxes: Box[] = [{
      x: actualMargin,
      y: actualMargin,
      width: w,
      height: h,
    }]

    let iterations = 0
    while (boxes.length < settings.boxes) {
      if (iterations > 10000) break
      iterations += 1
      const idx = rand.rangeFloor(boxes.length)
      const box = boxes.splice(idx, 1)[0]
      divideBox(box).filter(Boolean).forEach(b => boxes.push(b))
    }

    const boxMargin = settings.boxMargin * settings.lineHeight
    for (const box of boxes) {
      box.x += boxMargin
      box.y += boxMargin
      box.width -= boxMargin * 2
      box.height -= boxMargin * 2
    }

    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    for (const box of boxes) {
      context.strokeStyle = 'black'
      context.lineWidth = 2
      context.strokeRect(box.x, box.y, box.width, box.height)
    }

    function divideBox(box: Box): [Box, Box] | [Box] {
      const { x, y, width, height } = box

      // divide horizontally
      if (rand.chance(0.5)) {
        const minX = x + settings.minWidth
        const maxX = x + width - settings.minWidth
        if (maxX < minX) return [box]
        const divX = rand.rangeFloor(minX, maxX)
        const box1: Box = {
          x,
          y,
          width: divX - x,
          height,
        }
        const box2: Box = {
          x: divX,
          y,
          width: width - box1.width,
          height,
        }
        return [box1, box2]
      }

      // otherwise divide vertically
      // boxMargin
      // boxes must have a minimum vertical height
      const minH = settings.minHeight * settings.lineHeight
      const minY = y + minH
      const maxY = y + height - minH
      if (maxY < minY) return [box]
      const span = maxY - minY
      const divY = rand.rangeFloor(0, span / settings.lineHeight) * settings.lineHeight + minY
      const box1: Box = {
        x,
        y,
        width,
        height: divY - y,
      }
      const box2: Box = {
        x,
        y: divY,
        width,
        height: height - box1.height,
      }
      return [box1, box2]
    }
  }
}, {
  dimensions: [WIDTH, HEIGHT],
  animate: true
})
