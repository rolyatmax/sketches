const canvasSketch = require('canvas-sketch')
const { mapRange } = require('canvas-sketch-util/math')
const { createRandom } = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const { createSpring } = require('spring-animator')
const vec2 = require('gl-vec2')

const WIDTH = 1024
const HEIGHT = 1024
const FPS = 24

const settings = {
  seed: 0,
  stemLineCreationRate: 0.1,
  maxLineCapSize: 20,
  maxStemMag: 0.3,
  stemAngle: 1,
  branchConnectorWidth: 4 * FPS,
  branchRate: 0.001,
  branchDeathRate: 0.01,
  timeWindow: 15 * FPS,
  stiffness: 0.09,
  dampening: 0.2,
  threshold: 0.01,
  opacity: 0.15
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 1000).step(1).onChange(setup)
gui.add(settings, 'stemLineCreationRate', 0, 1).step(0.01)
gui.add(settings, 'maxLineCapSize', 0, 100)
gui.add(settings, 'maxStemMag', 0, 0.8).step(0.01)
gui.add(settings, 'stemAngle', 0, 1).step(0.01)
gui.add(settings, 'branchConnectorWidth', 0, 15 * FPS)
gui.add(settings, 'branchRate', 0, 0.05).step(0.001)
gui.add(settings, 'branchDeathRate', 0, 0.9).step(0.01)
gui.add(settings, 'timeWindow', FPS, FPS * 45)
gui.add(settings, 'stiffness', 0, 1).step(0.01)
gui.add(settings, 'dampening', 0, 1).step(0.01)
gui.add(settings, 'threshold', 0.0001, 0.2).step(0.0001)
gui.add(settings, 'opacity', 0, 1).step(0.01)

let rand, rootLine
let objects = 0

const positiveNoise1D = (val) => rand.noise1D(val) / 2 + 0.5

function getXForTime (curTime, time) {
  const windowTimeStart = Math.max(0, curTime - settings.timeWindow)
  const windowTimeEnd = windowTimeStart + settings.timeWindow
  return mapRange(time, windowTimeStart, windowTimeEnd, 0, 1)
}

class BaseLine {
  constructor (parent, startTime, offset, delay = 0, scaleFactor = 1, branchConnectorWidth = null) {
    this.startTime = startTime
    this.stopTime = null
    this.delay = delay
    this.scaleFactor = scaleFactor
    this.branchConnectorWidth = branchConnectorWidth
    this.parent = parent
    this.offset = offset
    this.lineWidth = 2
    this.strokeStyle = `hsla(0, 100%, 0%, ${settings.opacity})`
    this.stemLines = []
    this.baseLines = []
    this.animatingLength = createSpring(0.05, 1, 0)

    this.memoizeMethods()
  }

  memoizeMethods () {
    this.getYPosition = memoize(this.getYPosition.bind(this), {})
    this.getBranchConnectorEndTime = memoize(this.getBranchConnectorEndTime.bind(this), {})
    this.shouldSpawnStemLine = memoize(this.shouldSpawnStemLine.bind(this), {})
    this.shouldSpawnBaseLine = memoize(this.shouldSpawnBaseLine.bind(this), {})
    this.hasStartedAnimating = memoize(this.hasStartedAnimating.bind(this), {})
    this.isFinishedAnimating = memoize(this.isFinishedAnimating.bind(this), {})
    this.getCompleteLine = memoize(this.getCompleteLine.bind(this), {})
  }

  getYPosition () {
    if (this.parent === null) {
      return this.offset
    }
    return this.parent.getYPosition() + this.offset
  }

  getBranchConnectorEndTime () {
    return this.parent === null ? 0 : this.startTime + this.branchConnectorWidth
  }

  shouldSpawnStemLine (curTime) {
    return this.stopTime === null && this.getBranchConnectorEndTime() < curTime && rand.chance(settings.stemLineCreationRate * positiveNoise1D(curTime * 0.4 * FPS + 50))
  }

  shouldSpawnBaseLine (curTime) {
    return this.stopTime === null && this.getBranchConnectorEndTime() < curTime && rand.chance(settings.branchRate)
  }

  shouldStop (curTime) {
    if (this.parent === null) return false
    const baseLineLifeTime = curTime - this.getBranchConnectorEndTime()
    return this.getBranchConnectorEndTime() < curTime && rand.chance(Math.pow(baseLineLifeTime / (60 * FPS), 3) * settings.branchDeathRate)
  }

  hasStartedAnimating (curTime) {
    return curTime > this.startTime + this.delay
  }

  isFinishedAnimating (curTime) {
    return this.hasStartedAnimating(curTime) && this.animatingLength.isAtDestination(settings.threshold)
  }

  update (curTime) {
    if (this.shouldSpawnStemLine(curTime)) {
      const mag = rand.gaussian(positiveNoise1D(curTime * 0.05 / FPS + 20) * rand.range(0.05, settings.maxStemMag), 0.01) * this.scaleFactor
      let angle = settings.stemAngle * positiveNoise1D(curTime * 0.02 / FPS + 10) * 0.2 + 0.4
      angle *= Math.PI * (rand.chance(rand.gaussian(positiveNoise1D(curTime * 0.05 / FPS + 70), 0.1)) ? 1 : -1)
      const delay = rand.range(2) * FPS
      this.stemLines.push(
        new StemLine(this, curTime, mag, angle, delay, this.scaleFactor)
      )
      objects += 1
    }

    if (this.shouldSpawnBaseLine(curTime)) {
      const offset = (Math.pow(rand.range(1), 3) * 0.15 + 0.02) * rand.sign()
      const delay = rand.range(1, 3) * FPS
      const scaleFactor = 0.8
      this.baseLines.push(
        new BaseLine(this, curTime, offset, delay, scaleFactor, settings.branchConnectorWidth)
      )
      objects += 1
    }

    if (this.stopTime === null && this.shouldStop(curTime)) {
      this.stopTime = curTime
    }

    if (this.hasStartedAnimating(curTime)) {
      this.animatingLength.updateValue(1)
    }
    this.animatingLength.tick()

    this.cleanUp(curTime)

    this.stemLines.forEach(l => l.update(curTime))
    this.baseLines.forEach(l => l.update(curTime))
  }

  getCompleteLine (curTime) {
    const startX = getXForTime(curTime, this.startTime)
    const endX = getXForTime(curTime, this.stopTime || curTime)
    const y = this.getYPosition()

    if (this.parent === null) {
      return [[startX, y], [endX, y]]
    }

    const branchConnectorEndX = getXForTime(curTime, this.startTime + this.branchConnectorWidth)
    const line = [
      [startX, this.parent.getYPosition()],
      [branchConnectorEndX, y]
    ]
    if (endX > branchConnectorEndX) {
      line.push([endX, y])
    }
    return line
  }

  render (ctx, curTime) {
    const completeLine = this.getCompleteLine(curTime)
    const lenT = this.animatingLength.tick(1, false)

    if (!completeLine.length) return
    const line = cutLine(completeLine, lenT)

    ctx.beginPath()
    ctx.lineWidth = this.lineWidth
    ctx.strokeStyle = this.strokeStyle
    ctx.moveTo(line[0][0] * WIDTH, line[0][1] * HEIGHT)
    line.slice(1).forEach(pt => ctx.lineTo(pt[0] * WIDTH, pt[1] * HEIGHT))
    ctx.stroke()

    this.stemLines.forEach(l => l.render(ctx, curTime))
    this.baseLines.forEach(l => l.render(ctx, curTime))
  }

  canRemove (curTime) {
    if (this.stopTime === null) return false
    if (getXForTime(curTime, this.stopTime) > 0) return false
    for (let child of this.baseLines) {
      if (!child.canRemove(curTime)) return false
    }
    return true
  }

  // purge stemLines and baseLines lists
  cleanUp (curTime) {
    const stemCount = this.stemLines.length
    const baseCount = this.baseLines.length
    this.stemLines = this.stemLines.filter(l => !l.canRemove(curTime))
    this.baseLines = this.baseLines.filter(l => !l.canRemove(curTime))
    objects -= (stemCount - this.stemLines.length) + (baseCount - this.baseLines.length)
  }
}

class StemLine {
  constructor (parent, startTime, mag, angle, delay, scaleFactor) {
    this.startTime = startTime
    this.parent = parent
    this.mag = mag
    this.angle = angle
    this.delay = delay
    this.scaleFactor = scaleFactor
    this.lineCap = new LineCap(this, rand.range(settings.maxLineCapSize) * positiveNoise1D(startTime * 0.5 * FPS + 90) * this.scaleFactor)
    this.lineWidth = 2
    this.strokeStyle = `hsla(0, 100%, 0%, ${settings.opacity})`
    this.animatingMag = createSpring(settings.stiffness, settings.dampening, 0)

    this.memoizeMethods()
  }

  memoizeMethods () {
    this.hasStartedAnimating = memoize(this.hasStartedAnimating.bind(this), {})
    this.isFinishedAnimating = memoize(this.isFinishedAnimating.bind(this), {})
    this.getStartEndPositions = memoize(this.getStartEndPositions.bind(this), {})
  }

  update (curTime) {
    if (this.hasStartedAnimating(curTime)) {
      this.animatingMag.updateValue(this.mag)
    }
    this.animatingMag.tick()
    this.lineCap.update(curTime)
  }

  hasStartedAnimating (curTime) {
    return this.parent.isFinishedAnimating(curTime) && curTime > this.startTime + this.delay
  }

  isFinishedAnimating (curTime) {
    return this.hasStartedAnimating(curTime) && this.animatingMag.isAtDestination(settings.threshold)
  }

  getStartEndPositions (curTime) {
    const x = getXForTime(curTime, this.startTime)
    const start = [x, this.parent.getYPosition()]
    const curMag = this.animatingMag.tick(1, false)
    const dir = [Math.cos(this.angle) * curMag, Math.sin(this.angle) * curMag]
    const end = vec2.add(dir, start, dir)
    return [start, end]
  }

  render (ctx, curTime) {
    if (this.startTime > curTime) return
    const [start, end] = this.getStartEndPositions(curTime)

    ctx.beginPath()
    ctx.lineWidth = this.lineWidth
    ctx.strokeStyle = this.strokeStyle
    ctx.moveTo(start[0] * WIDTH, start[1] * HEIGHT)
    ctx.lineTo(end[0] * WIDTH, end[1] * HEIGHT)
    ctx.stroke()

    this.lineCap.render(ctx, curTime)
  }

  canRemove (curTime) {
    return getXForTime(curTime, this.startTime) <= 0
  }
}

class LineCap {
  constructor (parent, size) {
    this.parent = parent
    this.size = size
    this.lineWidth = 2
    this.fill = rand.chance(Math.pow(1 - this.size / settings.maxLineCapSize, 2) * positiveNoise1D(parent.startTime * 0.1 * FPS + 2))
    this.strokeStyle = `hsla(0, 100%, 0%, ${settings.opacity})`
    this.animatingStroke = createSpring(settings.stiffness, settings.dampening, 0)
    this.animatingFill = createSpring(0.05, 1, 0)
  }

  isFinishedAnimating (curTime) {
    return this.parent.isFinishedAnimating(curTime) && this.animatingStroke.isAtDestination(settings.threshold)
  }

  update (curTime) {
    if (this.parent.isFinishedAnimating(curTime)) {
      this.animatingStroke.updateValue(Math.PI * 2)
    }
    if (this.fill && this.isFinishedAnimating(curTime)) {
      this.animatingFill.updateValue(0.95)
    }
    this.animatingStroke.tick()
    this.animatingFill.tick()
  }

  render (ctx, curTime) {
    const [start, end] = this.parent.getStartEndPositions(curTime)
    const dir = vec2.subtract([], end, start)
    vec2.normalize(dir, dir)
    const centerOffset = vec2.scale([], dir, this.size)
    const scaledEnd = vec2.multiply([], end, [WIDTH, HEIGHT])
    const center = vec2.add(scaledEnd, scaledEnd, centerOffset)
    const startAngle = Math.atan2(dir[1], dir[0]) + Math.PI
    const endAngle = startAngle + this.animatingStroke.tick(1, false)

    ctx.beginPath()
    ctx.lineWidth = this.lineWidth
    ctx.arc(center[0], center[1], this.size, startAngle, endAngle)
    const fill = this.animatingFill.tick(1, false)
    if (fill > 0) {
      ctx.fillStyle = `rgba(30, 30, 30, ${fill})`
      ctx.fill()
    }
    ctx.strokeStyle = this.strokeStyle
    ctx.stroke()
  }
}

setup()
function setup () {
  rand = createRandom(settings.seed)
  rootLine = new BaseLine(null, 0, 0.5)
}

const sketch = () => {
  let f = 0
  return ({ context, width, height, deltaTime }) => {
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    f += 1

    rootLine.update(f)
    rootLine.render(context, f)
    if (f % 100 === 0) console.log('objects:', objects)
  }
}

canvasSketch(sketch, {
  dimensions: [ WIDTH, HEIGHT ],
  animate: true,
  fps: FPS
})

let savedCalls = 0
function memoize (fn, cacheObj) {
  return function (...args) {
    const key = args.join('|')
    if (!cacheObj[key]) {
      cacheObj[key] = fn(...args)
    } else {
      savedCalls += 1
      if (savedCalls % 100000 === 0) console.log('savedCalls:', savedCalls)
    }
    return cacheObj[key]
  }
}

function lineLength (line) {
  return line.reduce((tot, pt, i) => tot + (i === 0 ? 0 : vec2.distance(pt, line[i - 1])), 0)
}

function cutLine (line, t) {
  let last = line[0]
  let toGo = lineLength(line) * t

  let toDraw = [last]
  for (let pt of line) {
    let segmentDist = vec2.distance(last, pt)
    if (!segmentDist) {
      continue
    }
    if (toGo === 0) {
      break
    }
    if (segmentDist <= toGo) {
      toDraw.push(pt)
      toGo -= segmentDist
      last = pt
      continue
    }
    let cutPerc = toGo / segmentDist
    let x = (pt[0] - last[0]) * cutPerc + last[0]
    let y = (pt[1] - last[1]) * cutPerc + last[1]
    toDraw.push([x, y])
    break
  }
  return toDraw
}
