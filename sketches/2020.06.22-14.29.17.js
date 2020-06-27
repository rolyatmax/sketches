/**
 * Trying to sync up DOM-based annotations with objects rendered in WebGL
 */

/* TODO:
  1. Come up with enter/exit animations for annotations
  2. Make annotations avoid each other with force-directed graph
  3. Try with a bigger (less spherical) mesh
  4. Fix resizing bug
*/

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.10')
const { GUI } = require('dat-gui')
const mat4 = require('gl-mat4')
const vec2 = require('gl-vec2')
const createCamera = require('3d-view-controls')
const project = require('camera-project')
const { createSpring } = require('spring-animator')
const fit = require('canvas-fit')
const mesh = require('primitive-icosphere')(10, { subdivisions: 2 })

const meshCenter = mesh.positions.reduce((av, pt) => [
  av[0] + pt[0] / mesh.positions.length,
  av[1] + pt[1] / mesh.positions.length,
  av[2] + pt[2] / mesh.positions.length
], [0, 0, 0])

const rico = window.rico = createRico()
const annotations = createAnnotationManager(rico.canvas.parentElement)

const alreadyChosen = new Set()

let n = 5
while (n--) {
  let p = null
  while (p === null || alreadyChosen.has(p)) {
    p = mesh.positions[mesh.positions.length * Math.random() | 0]
  }
  const { remove, update } = annotations.add(`Position ${(Math.random() * 99999999 | 0).toString(16)}`, p)
  window.removeMe = remove
  window.updateMe = update
  alreadyChosen.add(p)
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
    annotations.render(viewProjMat)

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

// pass in the parentElement to the webgl canvas
// the parentElement must be the same size as the canvas,
function createAnnotationManager (parentEl) {
  const el = parentEl.appendChild(document.createElement('div'))
  if (!parentEl.style.position) {
    parentEl.style.position = 'relative'
    console.log('setting position: relative on canvas parent element:', parentEl)
  }
  el.style.position = 'absolute'
  el.style.width = '100%'
  el.style.height = '100%'
  el.style.pointerEvents = 'none'
  const bgCanvas = el.appendChild(document.createElement('canvas'))
  el.addEventListener('resize', fit(bgCanvas, el))
  const ctx = bgCanvas.getContext('2d')
  bgCanvas.style.position = 'absolute'
  bgCanvas.style.boxShadow = 'none'
  bgCanvas.style.display = 'block'
  bgCanvas.style.zIndex = 0

  const canvasMargin = 20
  const dir45deg = Math.sqrt(1 / 2)

  const damping = 0.45
  const stiffness = 0.02

  const annotations = []

  return { add, render }

  function add (text, position3D) {
    const span = el.appendChild(document.createElement('span'))
    span.style.left = 0
    span.style.top = 0
    span.style.fontFamily = 'monospace'
    span.style.fontSize = '14px'
    span.style.color = 'firebrick'
    span.style.display = 'inline-block'
    span.style.padding = '8px'
    span.innerText = text
    span.style.pointerEvents = 'auto'
    // span.style.border = '1px solid blue'

    const bboxRect = span.getBoundingClientRect()
    const textElDims = [bboxRect.width, bboxRect.height]
    const textElCenter = textElDims.map(v => v / 2)

    span.style.position = 'absolute'
    span.style.zIndex = 1

    const positionSpring = createSpring(stiffness, damping, position3D)
    const annotation = { span, textElCenter, positionSpring, rectSpring: null }
    annotations.push(annotation)

    return {
      update (position3D) {
        positionSpring.setDestination(position3D)
      },
      remove () {
        annotation.isRemoving = true
      }
    }
  }

  function render (viewProjMatrix) {
    const { width, height } = bgCanvas
    const viewport = [0, 0, width, height]
    const bbox = {
      top: canvasMargin,
      bottom: height - canvasMargin,
      left: canvasMargin,
      right: width - canvasMargin
    }

    ctx.clearRect(0, 0, width, height)
    // ctx.fillStyle = 'rgba(255, 0, 0, 0.2)'
    // ctx.fillRect(0, 0, bgCanvas.width, bgCanvas.height)

    for (const annotation of annotations) {
      const { positionSpring, textElCenter, isRemoving, span } = annotation
      positionSpring.tick()
      const position3D = positionSpring.getCurrentValue()
      let [x, y] = project([], position3D, viewport, viewProjMatrix)
      y = height - y // Y axis goes the other way in WebGL
      const position2D = [x, y]

      const canvasCenter = [width / 2, height / 2]
      const noDrawRadius = settings.noTextRadius
      const canvasCenterToPt = vec2.sub([], position2D, canvasCenter)
      const dir = vec2.normalize([dir45deg, -1 * dir45deg], canvasCenterToPt)

      // now position x, y outside of no-text zone
      if (vec2.length(canvasCenterToPt) < noDrawRadius) {
        x = dir[0] * noDrawRadius + canvasCenter[0]
        y = dir[1] * noDrawRadius + canvasCenter[1]
      }

      // enforce a margin around the point itself
      const textElDiagonalLeng = vec2.length(textElCenter)
      const pointMargin = settings.ptMargin + textElDiagonalLeng
      if (vec2.dist([x, y], position2D) < pointMargin) {
        x = dir[0] * pointMargin + position2D[0]
        y = dir[1] * pointMargin + position2D[1]
      }

      // make sure text fits within the canvas's margins
      if (y - textElCenter[1] < bbox.top) y += bbox.top - (y - textElCenter[1])
      if (y + textElCenter[1] > bbox.bottom) y -= y + textElCenter[1] - bbox.bottom
      if (x - textElCenter[0] < bbox.left) x += bbox.left - (x - textElCenter[0])
      if (x + textElCenter[0] > bbox.right) x -= x + textElCenter[0] - bbox.right

      let isVisible = 1
      if (isRemoving || position2D[0] < 0 || position2D[1] < 0 || position2D[0] > width || position2D[1] > height) {
        isVisible = 0
      }

      if (!annotation.rectSpring) annotation.rectSpring = createSpring(stiffness, damping, [x, y, 0])
      annotation.rectSpring.setDestination([x, y, isVisible])
      annotation.rectSpring.tick()

      const [curX, curY, curVisibility] = annotation.rectSpring.getCurrentValue()

      span.style.transform = `translate(${curX - textElCenter[0]}px, ${curY - textElCenter[1]}px)`
      span.style.opacity = curVisibility

      const rectIntersect = getRectIntersection([curX, curY], position2D, textElCenter)

      const circleRadius = settings.ptHighlightRadius
      const curDir = vec2.normalize([], vec2.sub([], [curX, curY], position2D))
      const ptOnCircle = vec2.scaleAndAdd([], position2D, curDir, circleRadius)

      ctx.strokeStyle = `rgba(178, 34, 34, ${curVisibility})`
      ctx.beginPath()
      ctx.arc(position2D[0], position2D[1], circleRadius, 0, Math.PI * 2)
      ctx.moveTo(ptOnCircle[0], ptOnCircle[1])
      ctx.lineTo(rectIntersect[0], rectIntersect[1])
      ctx.stroke()

      if (annotation.rectSpring.isAtDestination()) {
        const idx = annotations.indexOf(annotation)
        annotations.splice(idx, 1)
      }
    }
  }
}

function getRectIntersection (rectCenter, position2D, textElCenter) {
  const rectToPosition = vec2.subtract([], position2D, rectCenter)
  const [textHalfWidth, textHalfHeight] = textElCenter
  const m = rectToPosition[1] / rectToPosition[0]
  const b = rectCenter[1] - m * rectCenter[0]
  const x = rectCenter[0] + textHalfWidth * Math.sign(rectToPosition[0])
  const y = rectCenter[1] + textHalfHeight * Math.sign(rectToPosition[1])
  const intersections = [
    [x, m * x + b],
    [(y - b) / m, y]
  ]
  return vec2.sqrDist(intersections[0], rectCenter) < vec2.sqrDist(intersections[1], rectCenter) ? intersections[0] : intersections[1]
}
