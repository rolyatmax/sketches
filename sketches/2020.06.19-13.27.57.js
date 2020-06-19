/**
 * Trying to sync up DOM-based annotations with objects rendered in WebGL
 */

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.10')
const { GUI } = require('dat-gui')
const mat4 = require('gl-mat4')
const vec2 = require('gl-vec2')
const createCamera = require('3d-view-controls')
const project = require('camera-project')
const { createSpring } = require('spring-animator')
const mesh = require('primitive-icosphere')(10, { subdivisions: 1 })

const meshCenter = mesh.positions.reduce((av, pt) => [
  av[0] + pt[0] / mesh.positions.length,
  av[1] + pt[1] / mesh.positions.length,
  av[2] + pt[2] / mesh.positions.length
], [0, 0, 0])

const rico = window.rico = createRico()
const annotation = createAnnotation('Lorem ipsum', rico.canvas.parentElement)

const settings = {
  ptMargin: 50,
  noTextRadius: 300,
  cameraDist: 50,
  roam: true
}

const gui = new GUI()
gui.add(settings, 'ptMargin', 0, 200)
gui.add(settings, 'noTextRadius', 0, 500)
gui.add(settings, 'cameraDist', 0, 100)
gui.add(settings, 'roam')

const camera = createCamera(rico.canvas, { zoomSpeed: 4 })
camera.lookAt(
  [50, 50, 50],
  meshCenter,
  [0, 0, 1]
)

const vertexArray = rico.createVertexArray()
  .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 3, new Float32Array(mesh.positions.flat())))

const draw = rico({
  depth: true,
  vertexArray: vertexArray,
  vs: `#version 300 es
  precision highp float;

  layout(location=0) in vec3 position;

  uniform mat4 projection;
  uniform mat4 view;
  uniform float pointSize;

  void main() {
    gl_Position = projection * view * vec4(position, 1);
    gl_PointSize = pointSize;
  }
  `,
  fs: `#version 300 es
  precision highp float;
  uniform vec4 color;
  out vec4 fragColor;
  void main() {
    fragColor = color;
  }
  `
})

const sketch = () => {
  return ({ width, height, time }) => {
    rico.clear(0.97, 0.98, 0.99, 1)
    if (settings.roam) {
      camera.up = [0, 1, 0]
      camera.center = [settings.cameraDist * Math.cos(time / 5), 0, settings.cameraDist * Math.sin(time / 5)]
    }
    camera.tick()

    const projMat = mat4.perspective([], Math.PI / 4, width / height, 0.01, 1000)
    const viewProjMat = mat4.multiply([], projMat, camera.matrix)
    const noTextZone = [width / 2, height / 2, settings.noTextRadius]
    annotation.update(mesh.positions[0], viewProjMat, [width, height], noTextZone)

    draw({
      uniforms: {
        view: camera.matrix,
        projection: projMat,
        color: [0.73, 0.73, 0.73, 1],
        pointSize: 1
      },
      count: mesh.positions.length,
      primitive: 'line loop'
    })
    draw({
      uniforms: {
        view: camera.matrix,
        projection: projMat,
        color: [0.2, 0.2, 0.2, 1],
        pointSize: 5
      },
      count: mesh.positions.length,
      primitive: 'points'
    })

    // draw the highlighted point
    draw({
      uniforms: {
        view: camera.matrix,
        projection: projMat,
        color: [0.9, 0.5, 0.5, 1],
        pointSize: 10
      },
      primitive: 'points',
      count: 1
    })
  }
}

canvasSketch(sketch, {
  canvas: rico.canvas,
  context: 'webgl2',
  pixelRatio: 1,
  animate: true
})

function createAnnotation (text, parentEl) {
  const canvasMargin = 20
  const dir45deg = Math.sqrt(1 / 2)
  const el = parentEl.appendChild(document.createElement('div'))
  if (!parentEl.style.position) {
    parentEl.style.position = 'relative'
    console.log('setting position: relative on canvas parent element:', parentEl)
  }
  const bgCanvas = el.appendChild(document.createElement('canvas'))
  bgCanvas.style.position = 'absolute'
  bgCanvas.style.display = 'none'
  const span = el.appendChild(document.createElement('span'))
  span.style.fontFamily = 'monospace'
  span.style.fontSize = '16px'
  span.style.color = '#666'
  span.style.display = 'block'
  span.style.padding = '20px 30px'
  span.innerText = text
  el.style.position = 'absolute'
  el.style.border = '1px solid red'

  const bboxRect = el.getBoundingClientRect()
  const textElDims = [bboxRect.width, bboxRect.height]
  const textElCenter = textElDims.map(v => v / 2)

  const damping = 0.35
  const stiffness = 0.05
  let xySpring = null

  const scratch = []
  function update (position3D, viewProjMatrix, canvasDimensions, noTextZone) { // noTextZone defined as a circle: [x, y, r]
    const pointMargin = settings.ptMargin
    const [width, height] = canvasDimensions
    const bbox = {
      top: canvasMargin,
      bottom: height - canvasMargin,
      left: canvasMargin,
      right: width - canvasMargin
    }
    const viewport = [0, 0, width, height]
    let [x, y] = project(scratch, position3D, viewport, viewProjMatrix)
    y = height - y // Y axis goes the other way in WebGL
    const position2D = [x, y]

    const noDrawCenter = noTextZone.slice(0, 2)
    const noDrawRadius = noTextZone[2]
    const noDrawCenterToPt = vec2.sub(scratch, position2D, noDrawCenter)
    const dir = vec2.normalize([dir45deg, -1 * dir45deg], noDrawCenterToPt)

    x += Math.sign(dir[0]) * textElCenter[0]
    y += Math.sign(dir[1]) * textElCenter[1]

    // now position x, y outside of no-text zone
    const closestPtToCenter = getClosestPtOnRect(noDrawCenter, [x - textElCenter[0], y - textElCenter[1], x + textElCenter[0], y + textElCenter[1]])
    const noDrawCenterToClosestPt = vec2.sub(scratch, closestPtToCenter, noDrawCenter)
    if (vec2.length(noDrawCenterToClosestPt) < noDrawRadius) {
      const defaultDir = dir.slice() // if the length is 0, then move in the same direction that the point is from the center
      const [offsetX, offsetY] = vec2.scale([], vec2.normalize(defaultDir, noDrawCenterToClosestPt), noDrawRadius)
      x = offsetX + noDrawCenter[0] + x - closestPtToCenter[0]
      y = offsetY + noDrawCenter[1] + y - closestPtToCenter[1]
    }

    // enforce a margin around the point itself
    const closestPt = getClosestPtOnRect(position2D, [x - textElCenter[0], y - textElCenter[1], x + textElCenter[0], y + textElCenter[1]])
    const ptToClosestOnRect = vec2.sub(scratch, closestPt, position2D)
    if (vec2.length(ptToClosestOnRect) < pointMargin) {
      const defaultDir = dir.slice() // if the length is 0, then move in the same direction that the point is from the center
      const [offsetX, offsetY] = vec2.scale([], vec2.normalize(defaultDir, ptToClosestOnRect), pointMargin)
      x = offsetX + position2D[0] + x - closestPt[0]
      y = offsetY + position2D[1] + y - closestPt[1]
    }

    // make sure text fits within the canvas's margins
    if (y - textElCenter[1] < bbox.top) y += bbox.top - (y - textElCenter[1])
    if (y + textElCenter[1] > bbox.bottom) y -= y + textElCenter[1] - bbox.bottom
    if (x - textElCenter[0] < bbox.left) x += bbox.left - (x - textElCenter[0])
    if (x + textElCenter[0] > bbox.right) x -= x + textElCenter[0] - bbox.right

    if (!xySpring) xySpring = createSpring(stiffness, damping, [x, y])
    xySpring.setDestination([x, y])
    xySpring.tick()

    const [curX, curY] = xySpring.getCurrentValue()

    el.style.left = `${curX - textElCenter[0]}px`
    el.style.top = `${curY - textElCenter[1]}px`
  }

  return { el, update }
}

// this only works if the pt is not inside the rect, which is fine for us because we push
// the pt outside of the text rect to start
function getClosestPtOnRect (pt, rect) { // rect is [x1, y1, x2, y2]
  const [x, y] = pt
  const [x1, y1, x2, y2] = rect
  // if the rect is entirely on one side of the pt (in both axes), then the closest pt is the corner

  let closestX, closestY
  if (x < x1 && x < x2) {
    closestX = x1
  } else if (x > x1 && x > x2) {
    closestX = x2
  } else {
    closestX = x
  }

  if (y < y1 && y < y2) {
    closestY = y1
  } else if (y > y1 && y > y2) {
    closestY = y2
  } else {
    closestY = y
  }

  return [closestX, closestY]
}

/* IDEA:
  - Define no-text zones on the canvas and write an algorithm to figure out how to place text
  as close as possible to a 2D point while still outside of a no-text zone.
      - Do this by measuring the size of the text element and trying to position it such that it
      doesn't overlap with any no-text zones

        * First pass: Assuming the no-text zone is defined as a circle, push the annotation to the edge of the circle
        along the vector (pt - center). Make sure there is some minimum offset in both x and y axes,
        then push the text back if necessary to make it fit on the screen

  - Once the text is positioned, create a canvas that stretches from the point to the text, upon
    which you can animate the drawing of a line.
*/
