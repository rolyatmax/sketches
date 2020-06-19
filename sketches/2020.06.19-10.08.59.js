/**
 * Trying to sync up DOM-based annotations with objects rendered in WebGL
 */

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.10')
const { GUI } = require('dat-gui')
const mat4 = require('gl-mat4')
const vec3 = require('gl-vec3')
const createCamera = require('3d-view-controls')
const project = require('camera-project')
const mesh = require('primitive-icosphere')(10, { subdivisions: 1 })

const meshCenter = mesh.positions.reduce((av, pt) => [
  av[0] + pt[0] / mesh.positions.length,
  av[1] + pt[1] / mesh.positions.length,
  av[2] + pt[2] / mesh.positions.length
], [0, 0, 0])

const rico = window.rico = createRico()
const annotation = createAnnotation('Lorem ipsum', rico.canvas)
document.body.appendChild(annotation.el)

const settings = {
  pointIdx: 0,
  cameraDist: 50,
  roam: true
}

const gui = new GUI()
gui.add(settings, 'pointIdx', 0, mesh.positions.length - 1).step(1)
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
  count: mesh.positions.length,
  vs: `#version 300 es
  precision highp float;

  layout(location=0) in vec3 position;

  uniform mat4 projection;
  uniform mat4 view;

  void main() {
    gl_Position = projection * view * vec4(position, 1);
    gl_PointSize = 5.0;
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
    const pos = mesh.positions[settings.pointIdx]
    annotation.update(pos, viewProjMat)

    draw({
      uniforms: {
        view: camera.matrix,
        projection: projMat,
        color: [0.73, 0.73, 0.73, 1]
      },
      primitive: 'line loop'
    })
    draw({
      uniforms: {
        view: camera.matrix,
        projection: projMat,
        color: [0.2, 0.2, 0.2, 1]
      },
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

function createAnnotation (text, mainCanvas) {
  const el = document.createElement('div')
  el.style.fontFamily = 'monospace'
  el.style.fontSize = '16px'
  el.style.color = '#666'
  el.style.padding = '10px 15px'
  el.innerText = text
  el.style.position = 'absolute'
  el.style.border = '1px solid #ddd'

  const scratch = []
  function update (position3D, viewProjMatrix) {
    const viewport = [0, 0, mainCanvas.width, mainCanvas.height]
    const p = project(scratch, position3D, viewport, viewProjMatrix)
    el.style.bottom = `${p[1]}px`
    el.style.left = `${p[0]}px`
  }

  return { el, update }
}
