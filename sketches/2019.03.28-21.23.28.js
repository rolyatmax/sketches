const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const createCamera = require('3d-view-controls')
const project = require('camera-project')
const mat4 = require('gl-mat4')
const vec2 = require('gl-vec2')

const WIDTH = 1024
const HEIGHT = 1024

const settings = {
  seed: 1,
  nodeCount: 50,
  fovyDiv: 2,
  lineWidth: 0.1,
  radiusMult: 100,
  alphaMult: 5,
  cameraSpeed: 1,
  distance: 0.5,
  camera: true
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'nodeCount', 1, 1000).step(1).onChange(setup)
gui.add(settings, 'fovyDiv', 1, 4)
gui.add(settings, 'lineWidth', 0, 1).step(0.01)
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

  nodes = new Array(settings.nodeCount).fill().map(() => ({
    position: rand.onSphere()
  }))
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
        camera.center[2]
      ]
    }

    const projection = mat4.perspective(
      [],
      Math.PI / settings.fovyDiv,
      WIDTH / HEIGHT,
      10,
      1000
    )

    const viewport = [0, 0, WIDTH, HEIGHT]
    const points = nodes.map(p => {
      const projView = mat4.multiply([], projection, camera.matrix)
      const position = project([], p.position, viewport, projView)
      const depth = project([], p.position, viewport, camera.matrix)[2]
      position[1] = HEIGHT - position[1]
      return { position, depth }
    })

    const getPoint = (rads, radius, pt) => [
      Math.cos(rads) * radius + pt.position[0],
      Math.sin(rads) * radius + pt.position[1]
    ]

    const scale = v => v * 0.5 + 0.5
    const getAlpha = pt => settings.alphaMult * scale(pt.depth)
    const getRadius = pt => settings.radiusMult * scale(pt.depth)
    for (let i = 0; i < points.length - 1; i++) {
      const pt1 = points[i]
      const pt1Radius = Math.max(0, getRadius(pt1))
      const pt1Alpha = getAlpha(pt1)
      const pt2 = points[i + 1]
      const pt2Radius = Math.max(0, getRadius(pt2))
      const pt2Alpha = getAlpha(pt2)
      const toPt2 = vec2.subtract([], pt1.position, pt2.position)
      const rads = Math.atan2(toPt2[1], toPt2[0])
      const topRads = rads + Math.PI * 0.5
      const bottomRads = rads - Math.PI * 0.5
      const line = [
        getPoint(topRads, pt1Radius * settings.lineWidth, pt1),
        getPoint(bottomRads, pt1Radius * settings.lineWidth, pt1),
        getPoint(bottomRads, pt2Radius * settings.lineWidth, pt2),
        getPoint(topRads, pt2Radius * settings.lineWidth, pt2)
      ]
      const lineColor = context.createLinearGradient(
        pt1.position[0], pt1.position[1],
        pt2.position[0], pt2.position[1]
      )
      lineColor.addColorStop(0, `hsla(200, 45%, 45%, ${pt1Alpha})`)
      lineColor.addColorStop(1, `hsla(200, 45%, 45%, ${pt2Alpha})`)
      drawPath(context, line, lineColor, true)
    }

    for (const pt of points) {
      const ptRadius = Math.max(0, getRadius(pt))
      const ptAlpha = getAlpha(pt)
      drawCircle(context, pt.position, ptRadius, `hsla(190, 50%, 50%, ${ptAlpha})`)
    }
  }
}

canvasSketch(sketch, {
  dimensions: [WIDTH, HEIGHT],
  animate: true
})

function drawCircle (ctx, position, radius, color) {
  ctx.beginPath()
  ctx.fillStyle = color
  ctx.arc(position[0], position[1], radius, 0, Math.PI * 2)
  ctx.fill()
}

function drawPath (ctx, line, color, fill) {
  ctx.beginPath()
  ctx.moveTo(line[0][0], line[0][1])
  for (const pt of line.slice(1)) {
    ctx.lineTo(pt[0], pt[1])
  }
  if (fill) {
    ctx.fillStyle = color
    ctx.fill()
  } else {
    ctx.strokeStyle = color
    ctx.stroke()
  }
}
