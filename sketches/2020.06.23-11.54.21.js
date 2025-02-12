/**
 * Trying to sync up DOM-based annotations with objects rendered in WebGL - now with animations
 */

/* TODO:
  1. Try with a bigger (less spherical) mesh
  2. Fix resizing bug
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

const totalAnnotations = 5
setTimeout(function iterator () {
  setTimeout(iterator, 3000)
  if (annotations.all.length < totalAnnotations) {
    let p = null
    while (p === null || alreadyChosen.has(p)) {
      p = mesh.positions[mesh.positions.length * Math.random() | 0]
    }
    annotations.add(`Position ${(Math.random() * 99999999 | 0).toString(16)}`, p)
    alreadyChosen.add(p)
  } else {
    const randAnnotation = annotations.all[annotations.all.length * Math.random() | 0]
    randAnnotation.remove()
  }
}, 3000)

const settings = {
  ptMargin: 50,
  ptHighlightRadius: 10,
  noTextRadius: 300,
  repellentPow: 2,
  repellentMult: 0.02,
  cameraDist: 50,
  roam: true
}

const gui = new GUI()
gui.add(settings, 'ptMargin', 0, 200)
gui.add(settings, 'ptHighlightRadius', 0, 100)
gui.add(settings, 'noTextRadius', 0, 500)
gui.add(settings, 'repellentPow', 0, 3).step(0.01)
gui.add(settings, 'repellentMult', 0, 1).step(0.01)
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
  const precision = 0.01

  const annotations = []

  return { add, render, all: annotations }

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

    const positionSpring = createSpring(stiffness, damping, position3D, precision)
    const visibleSpring = createSpring(stiffness, damping, 0, precision)
    const textElDiagonalLeng = vec2.length(textElCenter)

    function update (position3D) {
      positionSpring.setDestination(position3D)
    }

    function remove () {
      annotation.isRemoving = true
    }

    const annotation = {
      span,
      textElCenter,
      textElDiagonalLeng,
      positionSpring,
      visibleSpring,
      rectSpring: null,
      update,
      remove
    }

    annotations.push(annotation)

    return { update, remove }
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

    // first update all the annotation targets' 2D positions (and create springs if necessary)
    for (const annotation of annotations) {
      const { positionSpring } = annotation
      positionSpring.tick()
      const position3D = positionSpring.getCurrentValue()
      let [x, y] = project([], position3D, viewport, viewProjMatrix)
      y = height - y // Y axis goes the other way in WebGL
      annotation.position2D = [x, y]
      if (!annotation.rectSpring) annotation.rectSpring = createSpring(stiffness, damping, [x, y], precision)
    }

    for (const annotation of annotations) {
      const { textElCenter, position2D, textElDiagonalLeng, isRemoving, span } = annotation
      const canvasCenter = [width / 2, height / 2]
      const noDrawRadius = settings.noTextRadius
      const canvasCenterToPt = vec2.sub([], position2D, canvasCenter)
      const defaultDir = [dir45deg, -1 * dir45deg]
      const dir = vec2.normalize(defaultDir, canvasCenterToPt)
      const pointMargin = settings.ptMargin + textElDiagonalLeng
      let [x, y] = annotation.position2D

      // now position x, y outside of no-text zone
      if (vec2.length(canvasCenterToPt) < noDrawRadius) {
        x = dir[0] * noDrawRadius + canvasCenter[0]
        y = dir[1] * noDrawRadius + canvasCenter[1]
      }

      // enforce a margin around the point itself
      if (vec2.dist([x, y], position2D) < pointMargin) {
        x = dir[0] * pointMargin + position2D[0]
        y = dir[1] * pointMargin + position2D[1]
      }

      // make sure text fits within the canvas's margins
      if (y - textElCenter[1] < bbox.top) y += bbox.top - (y - textElCenter[1])
      if (y + textElCenter[1] > bbox.bottom) y -= y + textElCenter[1] - bbox.bottom
      if (x - textElCenter[0] < bbox.left) x += bbox.left - (x - textElCenter[0])
      if (x + textElCenter[0] > bbox.right) x -= x + textElCenter[0] - bbox.right

      const [prevX, prevY] = annotation.rectSpring.getCurrentValue()
      const lastPos = [prevX, prevY]

      const repellentForces = [0, 0]
      for (const a of annotations) {
        if (a === annotation) continue
        const otherAnnotationPos = a.rectSpring.getCurrentValue()
        const margin = textElDiagonalLeng + a.textElDiagonalLeng + 20 // extra buffer
        vec2.add(repellentForces, repellentForces, getRepellentForce(lastPos, otherAnnotationPos, margin, settings.repellentPow, settings.repellentMult))
        vec2.add(repellentForces, repellentForces, getRepellentForce(lastPos, a.position2D, pointMargin, settings.repellentPow, settings.repellentMult))
        // TODO??:
        // GET RID OF CROSSING ANNOTATION LINES BY CHECKING TO SEE IF THE POSITION2D AND ANNOTATION ARE ON THE SAME SIDE OF
        // ALL THE ANNOTATIONS' LINES, AND THEN ADD A REPELLER ON THE OPPOSITE SIDE OF THE LINE??
      }

      x += repellentForces[0]
      y += repellentForces[1]

      let isVisible = 1
      if (isRemoving || position2D[0] < 0 || position2D[1] < 0 || position2D[0] > width || position2D[1] > height) {
        isVisible = 0
      }

      annotation.rectSpring.setDestination([x, y])
      annotation.visibleSpring.setDestination(isVisible)
      annotation.rectSpring.tick()
      annotation.visibleSpring.tick()

      const [curX, curY] = annotation.rectSpring.getCurrentValue()
      const curVisibility = annotation.visibleSpring.getCurrentValue()

      span.style.transform = `translate(${curX - textElCenter[0]}px, ${curY - textElCenter[1]}px)`
      span.style.opacity = curVisibility

      const rectIntersect = getRectIntersection([curX, curY], position2D, textElCenter)

      const circleRadius = settings.ptHighlightRadius
      const curDir = vec2.normalize([], vec2.sub([], [curX, curY], position2D))
      const ptOnCircle = vec2.scaleAndAdd([], position2D, curDir, circleRadius)
      const lineToRect = vec2.sub([], rectIntersect, ptOnCircle)
      const scaledLine = vec2.scale([], lineToRect, curVisibility)
      const endPt = vec2.add([], ptOnCircle, scaledLine)

      ctx.strokeStyle = `rgba(178, 34, 34, ${curVisibility})`
      ctx.beginPath()
      ctx.arc(position2D[0], position2D[1], circleRadius, 0, Math.PI * 2 * curVisibility)
      ctx.moveTo(ptOnCircle[0], ptOnCircle[1])
      ctx.lineTo(endPt[0], endPt[1])
      ctx.stroke()

      // ctx.strokeStyle = 'lightblue'
      // ctx.beginPath()
      // ctx.arc(canvasCenter[0], canvasCenter[1], settings.noTextRadius, 0, Math.PI * 2)
      // ctx.stroke()

      if (isRemoving && annotation.visibleSpring.isAtDestination()) {
        const idx = annotations.indexOf(annotation)
        annotation.span.parentElement.removeChild(annotation.span)
        annotations.splice(idx, 1)
      }
    }
  }
}

function getRepellentForce (position, repellentPosition, distThreshold, power, multiplier) {
  const posToRep = vec2.sub([], position, repellentPosition)
  const sqDist = vec2.sqrLen(posToRep)
  if (sqDist >= distThreshold * distThreshold) return [0, 0]
  const posToRepNormal = vec2.normalize([], posToRep)
  const dist = vec2.len(posToRep)
  const thresholdDiff = distThreshold - dist
  return vec2.scale(posToRepNormal, posToRepNormal, Math.pow(thresholdDiff, power) * multiplier)
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
