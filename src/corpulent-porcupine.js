import Sketch from 'sketch-js'
import array from 'new-array'
import { random, add, subtract, scale } from 'gl-vec2'

const drawersCount = 100
const lineLength = 30
const turnDegrees = 60
const drawSpeed = 0.55
const lineColor = 'rgba(0, 0, 0, 0.01)'

let drawers
// let pathsTaken = {}

const ctx = Sketch.create({
  autoclear: false
})

ctx.setup = function () {
  const center = [ctx.width / 2, ctx.height / 2]
  drawers = array(drawersCount).map(() => ({
    position: add([], random([]), center),
    progress: 0
  }))
}

ctx.update = function () {
  drawers.forEach((drawer) => {
    if (!drawer.nextPosition || drawer.progress === 1) {
      drawer.position = drawer.nextPosition || drawer.position
      drawer.nextPosition = getNextPoint(drawer.position)
      drawer.progress = 0
    }
    drawer.progress += (1 - drawer.progress) * drawSpeed
    drawer.progress = (drawer.progress > 0.99) ? 1 : drawer.progress
  })
}

ctx.draw = function () {
  drawers.forEach((drawer) => {
    const direction = subtract([], drawer.nextPosition, drawer.position)
    const drawTo = add([], scale(direction, direction, drawer.progress), drawer.position)
    ctx.beginPath()
    ctx.moveTo(...drawer.position)
    ctx.lineTo(...drawTo)
    ctx.strokeStyle = lineColor
    ctx.lineWidth = 1
    ctx.stroke()
  })
}

function getNextPoint (curPosition) {
  const turnCount = 360 / turnDegrees
  const degs = ((Math.random() * turnCount) | 0) * turnDegrees
  const rads = degs / 360 * Math.PI * 2
  const vec = scale([], [Math.cos(rads), Math.sin(rads)], lineLength)
  const next = add(vec, vec, curPosition)
  return next
}

// function key (position) {
//   return `${position[0]}-${position[1]}`
// }
