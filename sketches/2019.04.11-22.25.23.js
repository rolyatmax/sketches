const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const createCamera = require('3d-view-controls')
const project = require('camera-project')
const mat4 = require('gl-mat4')
const vec3 = require('gl-vec3')

const WIDTH = 1024
const HEIGHT = 1024

const settings = {
  seed: 1,
  nodeCount: 4,
  fovyDiv: 2,
  lineWidth: 0.1,
  maxLastPositions: 4000,
  radiusMult: 30,
  alphaMult: 5,
  cameraSpeed: 2,
  distance: 0.4,
  camera: true
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'nodeCount', 1, 1000).step(1).onChange(setup)
gui.add(settings, 'fovyDiv', 1, 4)
gui.add(settings, 'lineWidth', 0, 1).step(0.01)
gui.add(settings, 'maxLastPositions', 1, 4000).step(1)
gui.add(settings, 'radiusMult', 5, 250)
gui.add(settings, 'alphaMult', 0, 10).step(0.01)
gui.add(settings, 'cameraSpeed', 0, 20).step(0.01)
gui.add(settings, 'distance', 0.1, 2).step(0.01)
gui.add(settings, 'camera')

let rand, camera, nodes

function setup () {
  rand = random.createRandom(settings.seed)
  camera.lookAt(
    [5, 5, 5],
    [0, 0, 0],
    [0, 0, 1]
  )
  camera.center = [
    Math.sin(0) * 5 * settings.distance,
    Math.cos(0) * 5 * settings.distance,
    0
  ]

  nodes = new Array(settings.nodeCount).fill().map(() => {
    const position = rand.insideSphere()
    const velocity = rand.onSphere(0.003)
    const lastPositions = []
    lastPositions.push(vec3.subtract([], position, velocity))
    return { position, lastPositions }
  })
}

const sketch = ({ canvas }) => {
  camera = createCamera(canvas, { zoomSpeed: 4 })
  setup()
  return ({ context, width, height, frame }) => {
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    camera.tick()

    if (settings.camera) {
      camera.center = [
        Math.sin(frame * 0.005 * settings.cameraSpeed) * 5 * settings.distance,
        Math.cos(frame * 0.005 * settings.cameraSpeed) * 5 * settings.distance,
        Math.cos(frame * 0.0001 * settings.cameraSpeed) * settings.distance
      ]
    }

    const viewport = [0, 0, WIDTH, HEIGHT]
    const projection = mat4.perspective(
      [],
      Math.PI / settings.fovyDiv,
      WIDTH / HEIGHT,
      10,
      1000
    )

    function get2DPositionAndDepth (pos) {
      const projView = mat4.multiply([], projection, camera.matrix)
      const position = project([], pos, viewport, projView)
      const depth = project([], pos, viewport, camera.matrix)[2]
      position[1] = HEIGHT - position[1]
      return {position, depth}
    }

    nodes.forEach(p => {
      const velocity = vec3.subtract([], p.position, p.lastPositions[0])
      const force = Math.max(1 / vec3.sqrLen(p.position), 1)
      const accel = vec3.scale([], p.position, -0.0001 * force)
      const friction = vec3.scale([], velocity, -0.001)
      vec3.add(accel, accel, friction)
      vec3.add(velocity, velocity, accel)
      p.lastPositions.unshift(p.position)
      p.lastPositions.length = Math.min(settings.maxLastPositions, p.lastPositions.length)
      const nextPosition = vec3.add([], p.position, velocity)
      p.position = nextPosition
    })

    const points = nodes.map(p => get2DPositionAndDepth(p.position))

    const scale = v => v * 0.5 + 0.5
    const getAlpha = pt => settings.alphaMult * scale(pt.depth)
    const getRadius = pt => settings.radiusMult * scale(pt.depth)

    const lines = nodes.map(p => p.lastPositions.map(get2DPositionAndDepth))
    for (let line of lines) {
      for (let i = 1; i < line.length; i++) {
        const pt1 = line[i - 1]
        const pt2 = line[i]

        const pt1Alpha = getAlpha(pt1)
        const pt1LineWidth = getRadius(pt1) * settings.lineWidth
        const pt2Alpha = getAlpha(pt2)
        const pt2LineWidth = getRadius(pt2) * settings.lineWidth
        const lineWidth = (pt1LineWidth + pt2LineWidth) / 2
        const lineColor = context.createLinearGradient(
          pt1.position[0], pt1.position[1],
          pt2.position[0], pt2.position[1]
        )
        lineColor.addColorStop(0, `hsla(200, 45%, 45%, ${pt1Alpha})`)
        lineColor.addColorStop(1, `hsla(200, 45%, 45%, ${pt2Alpha})`)
        drawPath(context, [pt1.position, pt2.position], lineColor, lineWidth)
      }
    }

    for (let pt of points) {
      const ptRadius = Math.max(0, getRadius(pt))
      const ptAlpha = getAlpha(pt)
      drawCircle(context, pt.position, ptRadius, `hsla(190, 50%, 50%, ${ptAlpha})`)
    }
  }
}

canvasSketch(sketch, {
  dimensions: [ WIDTH, HEIGHT ],
  animate: true
})

function drawCircle (ctx, position, radius, color) {
  ctx.beginPath()
  ctx.arc(position[0], position[1], radius, 0, Math.PI * 2)
  ctx.strokeStyle = color
  ctx.lineWidth = 10
  ctx.stroke()
}

function drawPath (ctx, line, color, lineWidth) {
  ctx.beginPath()
  ctx.moveTo(line[0][0], line[0][1])
  for (let pt of line.slice(1)) {
    ctx.lineTo(pt[0], pt[1])
  }
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.stroke()
}
