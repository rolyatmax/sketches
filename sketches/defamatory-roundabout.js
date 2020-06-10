import bspline from 'b-spline'
import Sketch from 'sketch-js'
import array from 'new-array'
import { random, add, subtract, length, normalize, scale } from 'gl-vec2'

const stiffness = 0.06
const dampening = 0.1
const degree = 3
const pointsCount = 12
const splinesCount = 20
let splines

const ctx = Sketch.create({})

ctx.setup = function () {
  const drawArea = Math.min(ctx.height, ctx.width)
  const center = [ctx.width / 2, ctx.height / 2]
  splines = array(splinesCount).map(() => array(pointsCount)
    .map(() => random([], Math.random() * (drawArea / 2)))
    .map(pt => ({
      position: add(pt, pt, center),
      velocity: random([], Math.random() * 10),
      anchor: add([], random([], Math.random() * (drawArea / 4)), center)
    })))
}

ctx.update = function () {
  splines.forEach((controls) => {
    controls.forEach(control => {
      const spring = getSpringForceVec2(
        control.position, control.velocity, control.anchor, stiffness, dampening
      )
      const gravity = getGravity()
      const acceleration = add([], spring, gravity)
      add(control.velocity, control.velocity, acceleration)
      add(control.position, control.position, control.velocity)
    })
  })
}

ctx.draw = function () {
  splines.forEach(controls => {
    const controlPositions = controls.map(ct => ct.position)
    const points = calculatePoints(controlPositions)
    ctx.beginPath()
    ctx.moveTo(...points[0])
    points.slice(1).forEach(pt => ctx.lineTo(...pt))
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.lineWidth = 2
    ctx.stroke()
  })
}

ctx.touchstart = function () {
  const drawArea = Math.min(ctx.height, ctx.width)
  const center = [ctx.width / 2, ctx.height / 2]
  const dist = drawArea * (Math.random() * 0.5 + 0.15)
  splines.forEach((controls) => {
    controls.forEach(control => {
      control.anchor = add([], random([], Math.random() * dist), center)
      control.position = add(control.position, control.position, [
        (Math.random() - 0.5) * 0.1 * center[0],
        (Math.random() - 0.8) * 0.5 * center[1]
      ])
      control.velocity = add(control.velocity, control.velocity, [
        (Math.random() - 0.5) * 100,
        (Math.random() - 0.8) * 100
      ])
    })
  })
}

function calculatePoints (controls) {
  const points = []
  let progress = 0
  while (progress < 1) {
    points.push(bspline(progress, degree, controls))
    progress += 0.01
  }
  return points
}

function getSpringForceVec2 (position, velocity, anchor, stiffness, dampening) {
  const dir = subtract([], position, anchor)
  let spring = [0, 0]
  const x = length(dir)
  if (x) {
    spring = normalize([], dir)
    spring = scale(spring, spring, x * -stiffness)
  }
  const damper = scale([], velocity, -dampening)
  return add([], damper, spring)
}

function getGravity () {
  return [0, 5]
}
