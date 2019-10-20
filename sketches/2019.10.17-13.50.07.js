/**
 * Drawing a circle on a plane that is perpendicular to a given heading
 */

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.9')
const { GUI } = require('dat-gui')
const createCamera = require('3d-view-controls')
const mat4 = require('gl-mat4')
const vec3 = require('gl-vec3')
const primitiveIcosphere = require('primitive-icosphere')

const mesh = primitiveIcosphere(1, { subdivisions: 3 })
const rico = window.rico = createRico()

const settings = {
  headingIdx: 0,
  size: 0.1
}

const gui = new GUI()
gui.add(settings, 'headingIdx', 0, mesh.positions.length - 1).step(1)
gui.add(settings, 'size', 0.01, 1)

const vertexArray = rico.createVertexArray()

const camera = createCamera(rico.canvas, { zoomSpeed: 4 })

camera.lookAt(
  [10, 10, 10],
  [0, 0, 0],
  [1, 1, 1]
)

const pointsCount = mesh.positions.length + 1

const positionsData = new Float32Array(pointsCount * 3)
// first point is the origin
positionsData[0] = positionsData[1] = positionsData[2] = 0
for (let j = 1; j < pointsCount; j++) {
  positionsData[j * 3 + 0] = mesh.positions[j - 1][0]
  positionsData[j * 3 + 1] = mesh.positions[j - 1][1]
  positionsData[j * 3 + 2] = mesh.positions[j - 1][2]
}

const o = [0, 0, 0]
const a = mesh.positions[0].slice()
const rX = vec3.dot(a, a) / a[0]
const r = [rX, 0, 0]
const ar = vec3.subtract([], r, a)
vec3.normalize(ar, ar)
vec3.add(r, a, ar)
const oa = vec3.subtract([], a, o)
const an = vec3.cross([], ar, oa)
const n = vec3.add([], a, an)

const linePositionsData = new Float32Array([
  a[0], a[1], a[2],
  r[0], r[1], r[2],
  a[0], a[1], a[2],
  o[0], o[1], o[2],
  a[0], a[1], a[2],
  n[0], n[1], n[2]
])

const circle = []
const granularity = 8
let i = granularity
while (i--) {
  const rads = i / granularity * Math.PI * 2
  circle.push(Math.cos(rads), Math.sin(rads))
}
const circlePositionsData = new Float32Array(circle)

const draw = rico({
  vs: `#version 300 es
  precision highp float;

  layout(location=0) in vec3 position;

  out vec4 vColor;

  uniform vec3 color;
  uniform mat4 projection;
  uniform mat4 view;

  void main() {
    vColor = vec4(color, 1);
    gl_Position = projection * view * vec4(position, 1);
    gl_PointSize = 1.5;
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
  vertexArray: vertexArray.vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 3, positionsData)),
  count: pointsCount
})

const drawCircle = rico({
  vertexArray: rico.createVertexArray()
    .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 2, circlePositionsData)),
  count: granularity,
  primitive: 'line loop',
  vs: `#version 300 es
  precision highp float;

  layout(location=0) in vec2 position;

  out vec4 vColor;

  uniform float size;
  uniform vec3 heading;
  uniform vec3 color;
  uniform mat4 projection;
  uniform mat4 view;

  #define ORIGIN vec3(0)

  void main() {
    vColor = vec4(color, 1);

    vec3 p = vec3(position * size, 1.0);

    vec3 a = heading;
    vec3 r = vec3(dot(a, a) / a.x, 0, 0);
    vec3 ar = normalize(r - a);
    r = a + ar;
    vec3 oa = a - ORIGIN;
    vec3 an = cross(ar, oa);
    vec3 n = a + an;

    mat3 m = mat3(ar, an, oa);

    p = m * p;
    p = normalize(p);

    gl_Position = projection * view * vec4(p, 1);
    gl_PointSize = 1.5;
  }
  `,
  fs: `#version 300 es
  precision highp float;
  
  in vec4 vColor;
  out vec4 fragColor;

  void main() {
    fragColor = vColor;
  }
  `
})

const sketch = () => {
  return ({ width, height }) => {
    camera.tick()
    rico.clear(1, 1, 1, 1)

    const drawUniforms = {
      view: camera.matrix,
      projection: mat4.perspective([], Math.PI / 8, width / height, 0.01, 1000)
    }

    draw({
      vertexArray: vertexArray.vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 3, positionsData)),
      primitive: 'points',
      uniforms: { ...drawUniforms, color: [0.5, 0.6, 0.7] }
    })
    draw({
      vertexArray: vertexArray.vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 3, linePositionsData)),
      primitive: 'lines',
      count: 6,
      uniforms: { ...drawUniforms, color: [0.7, 0.5, 0.6] }
    })
    drawCircle({
      uniforms: {
        ...drawUniforms,
        color: [0.7, 0.6, 0.5],
        heading: mesh.positions[settings.headingIdx],
        size: settings.size
      }
    })
  }
}

canvasSketch(sketch, {
  canvas: rico.canvas,
  context: 'webgl2',
  pixelRatio: 1,
  animate: true
})
