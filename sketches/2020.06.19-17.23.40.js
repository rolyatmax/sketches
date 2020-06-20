/**
 * Trying to sync up DOM-based annotations with objects rendered in WebGL
 */

/* TODO:
  1. Replace the individual canvases with a single large 2D canvas covering the entire container
  2. Come up with enter/exit animations for annotations
  3. Make annotations avoid each other with force-directed graph
  4. Perhaps draw the lines a little differently (instead of always to the baseline?)
  5. Try with a bigger (less spherical) mesh
*/

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.10')
const { GUI } = require('dat-gui')
const mat4 = require('gl-mat4')
const vec2 = require('gl-vec2')
const createCamera = require('3d-view-controls')
const project = require('camera-project')
const { createSpring } = require('spring-animator')
const mesh = require('primitive-icosphere')(10, { subdivisions: 2 })

const meshCenter = mesh.positions.reduce((av, pt) => [
  av[0] + pt[0] / mesh.positions.length,
  av[1] + pt[1] / mesh.positions.length,
  av[2] + pt[2] / mesh.positions.length
], [0, 0, 0])

const rico = window.rico = createRico()
let n = 6
const annotations = []
while (n--) {
  const alreadyChosen = annotations.map(a => a.position)
  let p = null
  while (p === null || alreadyChosen.includes(p)) {
    p = mesh.positions[mesh.positions.length * Math.random() | 0]
  }
  annotations.push({
    spring: createAnnotation(`Position ${(Math.random() * 99999999 | 0).toString(16)}`, rico.canvas.parentElement),
    position: p
  })
}

const settings = {
  ptMargin: 50,
  ptHighlightRadius: 10,
  noTextRadius: 300,
  cameraDist: 50,
  roam: true
}

const gui = new GUI()
gui.add(settings, 'ptMargin', 0, 200)
gui.add(settings, 'ptHighlightRadius', 0, 100)
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
      camera.center = [
        settings.cameraDist * Math.cos(time / 5),
        settings.cameraDist * Math.sin(time / 3),
        settings.cameraDist * Math.sin(time / 4)
      ]
    }
    camera.tick()

    const projMat = mat4.perspective([], Math.PI / 4, width / height, 0.01, 1000)
    const viewProjMat = mat4.multiply([], projMat, camera.matrix)
    const noTextZone = [width / 2, height / 2, settings.noTextRadius]
    for (const a of annotations) {
      a.spring.update(a.position, viewProjMat, [width, height], noTextZone)
    }

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
        pointSize: 4
      },
      count: mesh.positions.length,
      primitive: 'points'
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
  const ctx = bgCanvas.getContext('2d')
  bgCanvas.style.position = 'absolute'
  bgCanvas.style.display = 'none'
  bgCanvas.style.boxShadow = 'none'
  const span = el.appendChild(document.createElement('span'))
  span.style.fontFamily = 'monospace'
  span.style.fontSize = '14px'
  span.style.color = 'firebrick'
  span.style.display = 'block'
  span.style.padding = '8px'
  span.innerText = text
  // span.style.border = '1px solid blue'
  el.style.position = 'absolute'
  el.style.pointerEvents = 'none'
  // el.style.border = '1px solid green'

  const bboxRect = span.getBoundingClientRect()
  const textElDims = [bboxRect.width, bboxRect.height]
  const textElCenter = textElDims.map(v => v / 2)

  bgCanvas.style.display = 'block'
  bgCanvas.style.zIndex = 0
  span.style.position = 'absolute'
  span.style.zIndex = 1

  const damping = 0.45
  const stiffness = 0.02
  let xySpring = null

  const baselineSideConnectionSpring = createSpring(0.2, 0.5, 0)

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

    // now make the element cover the text box and the point
    const ptPadding = settings.ptHighlightRadius + 1
    const xs = [
      position2D[0] - ptPadding,
      position2D[0] + ptPadding,
      curX - textElCenter[0],
      curX + textElCenter[0]
    ]

    const ys = [
      position2D[1] - ptPadding,
      position2D[1] + ptPadding,
      curY - textElCenter[1],
      curY + textElCenter[1]
    ]

    const xyMin = [Math.min(...xs), Math.min(...ys)]
    const xyMax = [Math.max(...xs), Math.max(...ys)]
    const dims = vec2.sub([], xyMax, xyMin)

    const curDir = vec2.subtract([], [curX, curY], noDrawCenter)
    const textPos = [
      curDir[0] < 0 ? 0 : dims[0] - textElDims[0],
      curDir[1] < 0 ? 0 : dims[1] - textElDims[1]
    ]

    // TODO: use translate transform here instead of top/left
    el.style.left = `${xyMin[0] - 1}px`
    el.style.top = `${xyMin[1] - 1}px`
    el.style.width = `${dims[0] + 2}px`
    el.style.height = `${dims[1] + 2}px`
    span.style.left = `${textPos[0] - 1}px`
    span.style.top = `${textPos[1] - 1}px`
    bgCanvas.width = dims[0] + 2
    bgCanvas.height = dims[1] + 2
    bgCanvas.style.width = '100%'
    bgCanvas.style.height = '100%'

    const circleCenter = vec2.sub([], position2D, xyMin)
    const circleRadius = settings.ptHighlightRadius

    baselineSideConnectionSpring.setDestination(curDir[0] > 0 ? 0 : 1)
    baselineSideConnectionSpring.tick()
    const t = baselineSideConnectionSpring.getCurrentValue()

    const baselineConnection = [
      textElDims[0] * t + textPos[0],
      textPos[1] + textElDims[1]
    ]

    const baselineStart = [
      Math.min(baselineConnection[0], textPos[0]),
      textPos[1] + textElDims[1]
    ]

    const baselineEnd = [
      Math.max(baselineConnection[0], textPos[0] + textElDims[0]),
      textPos[1] + textElDims[1]
    ]

    const ptToBaselineNorm = vec2.normalize([], vec2.subtract([], baselineConnection, circleCenter))
    const ptOnCircle = vec2.scaleAndAdd(ptToBaselineNorm, circleCenter, ptToBaselineNorm, circleRadius)

    ctx.clearRect(0, 0, dims[0], dims[1])
    ctx.strokeStyle = 'firebrick'
    ctx.beginPath()
    ctx.arc(circleCenter[0], circleCenter[1], circleRadius, 0, Math.PI * 2)
    ctx.moveTo(ptOnCircle[0], ptOnCircle[1])
    ctx.lineTo(baselineConnection[0], baselineConnection[1])
    ctx.moveTo(baselineStart[0], baselineStart[1])
    ctx.lineTo(baselineEnd[0], baselineEnd[1])
    ctx.stroke()
  }

  return { el, update }
}

// this only works if the pt is not inside the rect, which is fine for us because we push
// the pt outside of the text rect to start
function getClosestPtOnRect (pt, rect) { // rect is [x1, y1, x2, y2]
  const [x, y] = pt
  const [x1, y1, x2, y2] = rect
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
