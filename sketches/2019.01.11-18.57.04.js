const canvasSketch = require('canvas-sketch')
const { GUI } = require('dat-gui')
const Color = require('color')
const createCamera = require('perspective-camera')
const icosphere = require('icosphere')
const sortBy = require('lodash/sortBy')
const getPlaneNormal = require('get-plane-normal')
const { normalize, dot, subtract, add, scale } = require('gl-vec3')

const WIDTH = 2048
const HEIGHT = 2048

const settings = {
  subdivisions: 0,
  gridSize: 9,
  lightSpeed: 4,
  cameraSpeed: 1,
  lineWidth: 3,
  showEdges: true,
  opacity: 5,
  dist: 3.5,
  color: '#6DA67A'
}

const gui = new GUI()
gui.add(settings, 'subdivisions', 0, 3).step(1).onChange(setup)
gui.add(settings, 'gridSize', 1, 10).step(1).onChange(setup)
gui.add(settings, 'opacity', 0, 100).step(1)
gui.add(settings, 'lightSpeed', 0, 10).step(1)
gui.add(settings, 'cameraSpeed', 0, 10).step(1)
gui.add(settings, 'dist', 1, 10)
gui.add(settings, 'lineWidth', 1, 10)
gui.add(settings, 'showEdges')

let cameras, tris

function setup () {
  cameras = (new Array(settings.gridSize * settings.gridSize)).fill().map(() => {
    const camera = createCamera({
      viewport: [0, 0, WIDTH, HEIGHT]
    })
    camera.identity()
    return camera
  })

  const mesh = icosphere(settings.subdivisions)

  tris = mesh.cells.map(cell => ({
    positions: cell.map((i) => mesh.positions[i]),
    color: settings.color
  }))
}

const sketch = () => {
  setup()
  return ({ context, width, height, time }) => {
    const millis = time * 1000
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    const lightSrcRads = millis / 3000 * settings.lightSpeed
    const lightSource = [
      0 * settings.dist,
      Math.cos(lightSrcRads) * settings.dist,
      Math.sin(lightSrcRads) * settings.dist
    ]

    cameras.forEach((camera, i) => {
      const cameraRads = millis / 10000 * settings.cameraSpeed
      const offset = i * (Math.cos(time * 0.5 + Math.PI / 2) * 0.5 + 0.5) * 0.5
      const cameraPosition = [
        Math.cos(cameraRads + offset) * settings.dist,
        Math.sin(cameraRads + offset) * settings.dist / 2,
        Math.sin(cameraRads + offset) * settings.dist
      ]

      camera.identity()
      camera.translate(cameraPosition)
      camera.lookAt([0, 0, 0])
      camera.update()

      tris = tris.map((tri) => ({
        ...tri,
        points: tri.positions.map((positions) => camera.project(positions))
      }))

      tris = sortBy(tris, ({ points }) => Math.min(...points.map(p => p[2])))

      tris = tris.map((tri) => {
        const { color, positions } = tri
        const center = getCenterOfPlane(positions)
        const lightDirection = normalize([], subtract([], lightSource, center))
        const norm = getPlaneNormal([], ...positions)
        const dotProduct = dot(lightDirection, norm)
        const lightenPerc = Math.pow(Math.max(0, dotProduct), 0.75) * 0.5
        return {
          ...tri,
          litColor: Color(color).lighten(lightenPerc).alpha(settings.opacity / 100).toString()
        }
      })

      const gridPosition = [
        i % settings.gridSize,
        i / settings.gridSize | 0
      ]
      const clippingArea = [
        gridPosition[0] / settings.gridSize * width,
        gridPosition[1] / settings.gridSize * height
      ]
      const cellDimensions = [
        width / settings.gridSize,
        height / settings.gridSize
      ]
      context.save()
      context.beginPath()
      context.rect(
        clippingArea[0], clippingArea[1],
        cellDimensions[0], cellDimensions[1]
      )
      context.clip()
      tris.reverse().forEach(({ points, litColor }) => drawTriangle(context, points, litColor))
      context.restore()
    })
  }
}

canvasSketch(sketch, {
  dimensions: [WIDTH, HEIGHT],
  animate: true
})

function getCenterOfPlane (pts) {
  const total = [0, 0, 0]
  pts.forEach(pt => add(total, total, pt))
  return scale(total, total, 1 / pts.length)
}

function drawTriangle (ctx, points, color) {
  ctx.fillStyle = color
  ctx.lineWidth = settings.lineWidth
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  ctx.lineTo(points[1][0], points[1][1])
  ctx.lineTo(points[2][0], points[2][1])
  ctx.lineTo(points[0][0], points[0][1])
  ctx.fill()
  if (settings.showEdges) {
    for (let i = 0; i < points.length; i++) {
      const pt1 = points[i]
      const pt2 = points[(i + 1) % points.length]
      ctx.beginPath()
      ctx.moveTo(pt1[0], pt1[1])
      ctx.lineTo(pt2[0], pt2[1])
      const gradient = ctx.createLinearGradient(pt1[0], pt1[1], pt2[0], pt2[1])
      gradient.addColorStop(0, 'rgba(30, 30, 30, 0.4)')
      gradient.addColorStop(0.5, 'rgba(30, 30, 30, 0)')
      gradient.addColorStop(1, 'rgba(30, 30, 30, 0.4)')
      ctx.strokeStyle = gradient
      ctx.stroke()
    }
  }
}
