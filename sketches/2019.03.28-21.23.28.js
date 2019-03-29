const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const createCamera = require('3d-view-controls')
const project = require('camera-project')
const mat4 = require('gl-mat4')
const vec4 = require('gl-vec4')

const WIDTH = 2048
const HEIGHT = 2048

const settings = {
  seed: 1,
  nodeCount: 100,
  cameraSpeed: 10
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'nodeCount', 1, 1000).step(1).onChange(setup)
gui.add(settings, 'cameraSpeed', 0, 20).step(1)

let rand, camera, nodes

function setup () {
  rand = random.createRandom(settings.seed)
  camera.lookAt(
    [5, 5, 5],
    [0, 0, 0],
    [0, 0, 1]
  )

  nodes = new Array(settings.nodeCount).fill().map(() => ({
    position: [rand.range(-1, 1), rand.range(-1, 1), rand.range(-1, 1), 1]
  }))
}

const sketch = ({ canvas }) => {
  camera = createCamera(canvas, { zoomSpeed: 4 })
  setup()
  return ({ context, width, height, frame }) => {
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    camera.tick()

    const viewport = [0, 0, WIDTH, HEIGHT]
    const points = nodes.map(p => {
      // const pt = vec4.transformMat4([], p.position, camera.matrix)
      return project([], p.position, viewport, camera.matrix)
      // return [
      //   (pt[0] * 0.5 + 0.5) * WIDTH,
      //   (1 - (pt[1] * 0.5 + 0.5)) * HEIGHT,
      //   pt[2],
      //   pt[3]
      // ]
    })

    // console.log(points[0])
    for (let pt of points) {
      drawCircle(context, pt, 10, 'hsl(170, 50%, 50%)')
    }
  }
}

canvasSketch(sketch, {
  dimensions: [ WIDTH, HEIGHT ],
  animate: true
})

function drawCircle (ctx, position, radius, color) {
  ctx.beginPath()
  ctx.fillStyle = color
  ctx.arc(position[0], position[1], radius, 0, Math.PI * 2)
  ctx.fill()
}
