/**
 * This sketch is about calculating the distance of a point to a line (and find the corresponding
 * intersection on that line)
 */

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite-0.0.9')
const { GUI } = require('dat-gui')
const createCamera = require('3d-view-controls')
const mat4 = require('gl-mat4')
// const vec3 = require('gl-vec3')

const rico = window.rico = createRico()

const settings = {
  ptAX: -40,
  ptAY: -5,
  ptAZ: -10
}

const gui = new GUI()
gui.add(settings, 'ptAX', -50, 50)
gui.add(settings, 'ptAY', -50, 50)
gui.add(settings, 'ptAZ', -50, 50)

let draw

const camera = createCamera(rico.canvas, { zoomSpeed: 4 })

camera.lookAt(
  [15, 15, 15],
  [0, 0, 0],
  [1, 1, 1]
)

const BLUE = [0, 0, 1]
const RED = [1, 0, 0]
const GREEN = [0, 1, 0]

const ptA = [settings.ptAX, settings.ptAY, settings.ptAZ]
const ptB = [-5, 60, 0.20]
const ptC = [-30, 0.1, 0.3]

function setup () {
  // const bToA = vec3.subtract([], ptA, ptB)
  // const dir = vec3.normalize([], bToA)
  // const perp = [-dir[1], dir[0], dir[2]]
  // const cToA = vec3.subtract([], ptA, ptC)
  // const mag = vec3.dot(perp, cToA)
  // const ptD = vec3.add([], vec3.scale([], perp, mag), ptC)
  // const bToD = vec3.subtract([], ptD, ptB)
  // const mag2 = vec3.dot(bToD, dir)
  // vec3.add(ptD, vec3.scale([], dir, mag2), ptB)

  const colors = [BLUE, BLUE, GREEN, RED]
  const colorsData = new Float32Array(colors.length * 3)
  for (let j = 0; j < colors.length; j++) {
    colorsData[j * 3 + 0] = colors[j][0]
    colorsData[j * 3 + 1] = colors[j][1]
    colorsData[j * 3 + 2] = colors[j][2]
  }

  draw = rico({
    vs: `#version 300 es
    precision highp float;

    layout(location=0) in float ptIdx;
    layout(location=1) in vec3 color;

    out vec4 vColor;

    uniform vec3 ptA;
    uniform vec3 ptB;
    uniform vec3 ptC;
    uniform mat4 projection;
    uniform mat4 view;

    void main() {
      vColor = vec4(color, 1);

      vec3 position = vec3(0);
      if (ptIdx == 0.0) position = ptA;
      if (ptIdx == 1.0) position = ptB;
      if (ptIdx == 2.0) position = ptC;
      if (ptIdx == 3.0) {
        // NOT SURE THIS ACTUALLY WORKS - HMMMM
        vec3 bToADir = normalize(ptA - ptB);
        vec3 perp = vec3(-bToADir.y, bToADir.x, bToADir.z);
        vec3 bToTmp = perp * dot(perp, ptA - ptC) + ptC - ptB;
        position = bToADir * dot(bToTmp, bToADir) + ptB;
      }

      gl_Position = projection * view * vec4(position, 1);
      gl_PointSize = 10.0;
    }
    `,
    fs: `#version 300 es
    precision highp float;
    
    in vec4 vColor;
    out vec4 fragColor;

    void main() {
      fragColor = vColor;
    }
    `,
    vertexArray: rico.createVertexArray()
      .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 1, new Float32Array([0, 1, 2, 3])))
      .vertexAttributeBuffer(1, rico.createVertexBuffer(rico.gl.FLOAT, 3, colorsData)),
    count: 4
  })
}

const sketch = () => {
  setup()
  return ({ width, height }) => {
    camera.tick()
    rico.clear(1, 1, 1, 1)

    const drawUniforms = {
      view: camera.matrix,
      projection: mat4.perspective([], Math.PI / 8, width / height, 0.01, 1000),
      ptA: [settings.ptAX, settings.ptAY, settings.ptAZ],
      ptB: ptB,
      ptC: ptC
    }

    draw({ primitive: 'lines', uniforms: drawUniforms })
    draw({ primitive: 'points', uniforms: drawUniforms })
  }
}

canvasSketch(sketch, {
  canvas: rico.canvas,
  context: 'webgl2',
  pixelRatio: 1,
  animate: true
})
