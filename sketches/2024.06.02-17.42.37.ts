const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.9')
const createCamera = require('3d-view-controls')
const mat4 = require('gl-mat4')
const vec3 = require('gl-vec3')

const rico = createRico()

const sketch = () => {
  const camera = createCamera(rico.canvas, { zoomSpeed: 4 })
  camera.lookAt(
    [1, 0, 1], // center
    [0.4, 0, 0], // eye
    [1, 1, 1] // up
  )

  /*
    *  (0, -1)-------------_(1, -1)
    *       |          _,-"  |
    *       o      _,-"      o
    *       |  _,-"          |
    *   (0, 1)"-------------(1, 1)
    */
  const positionsBuffer = rico.createVertexBuffer(rico.gl.FLOAT, 2, new Float32Array([0, 1, 0, -1, 1, -1, 1, 1]))

  const line: number[] = []
  const segmentCount = 8000
  for (let i = 0; i < segmentCount; i++) {
    const x = (Math.pow(Math.random(), 3) * 2 - 1) * 3
    const y = (Math.random() * 2 - 1) * 3
    line.push(x, y, 0)
  }

  const lineSegmentsCount = (line.length / 3) - 1

  const lineData = new Float32Array(line)

  const stride = 12
  const lineDataBuffer = rico.createInterleavedBuffer(stride, lineData)

  const drawSegments = rico({
    vs: `#version 300 es
    precision highp float;

    layout(location=0) in vec2 pos;
    layout(location=1) in vec3 iStart;
    layout(location=2) in vec3 iEnd;

    uniform float lineWidth;
    uniform mat4 projection;
    uniform mat4 view;

    void main() {
      // redo this logic:
      // - first figure out if we're doing the first or the second point using pos.x
      // - then figure out the prev and next points also using pos.x
      // - then calculate the normal for prev -> current and current -> next
      // - then average those normals to get the normal for the current point
      // - then multiply that normal by pos.y * lineWidth to get the offset

      vec3 currentPt = pos.x < 0.5 ? iStart : iEnd;
      vec3 line = normalize(iEnd - iStart);
      vec3 norm = vec3(-line.y, line.x, line.z);
      vec3 offset = norm * lineWidth * pos.y;
      vec3 p = offset + currentPt;

      gl_Position = projection * view * vec4(p, 1);
    }
    `,
    fs: `#version 300 es
    precision highp float;

    out vec4 fragColor;

    void main() {
      fragColor = vec4(0.5, 0.6, 0.7, 1.0);
    }
    `,
    vertexArray: rico.createVertexArray()
      .vertexAttributeBuffer(0, positionsBuffer)
      .instanceAttributeBuffer(1, lineDataBuffer, { type: rico.gl.FLOAT, size: 3, stride, offset: 0 * stride })
      .instanceAttributeBuffer(2, lineDataBuffer, { type: rico.gl.FLOAT, size: 3, stride, offset: 1 * stride }),
    primitive: 'triangle fan',
    count: 4,
    instanceCount: lineSegmentsCount,
  })

  const circleGeometry: number[] = []
  const circleResolution = 64
  for (let i = 0; i < circleResolution; i++) {
    const t = (i / circleResolution) * Math.PI * 2
    circleGeometry.push(Math.cos(t), Math.sin(t))
  }
  const circleGeoBuffer = rico.createVertexBuffer(rico.gl.FLOAT, 2, new Float32Array(circleGeometry))

  const drawCaps = rico({
    vs: `#version 300 es
    precision highp float;

    layout(location=0) in vec2 pos;
    layout(location=1) in vec3 point;

    uniform float lineWidth;
    uniform mat4 projection;
    uniform mat4 view;

    void main() {
      vec3 p = vec3(pos.xy * lineWidth, 0) + point;
      gl_Position = projection * view * vec4(p, 1);
    }
    `,
    fs: `#version 300 es
    precision highp float;

    out vec4 fragColor;

    void main() {
      fragColor = vec4(0.5, 0.6, 0.7, 1.0);
    }
    `,
    vertexArray: rico.createVertexArray()
      .vertexAttributeBuffer(0, circleGeoBuffer)
      .instanceAttributeBuffer(1, lineDataBuffer, { type: rico.gl.FLOAT, size: 3, stride, offset: 0 }),
    primitive: 'triangle fan',
    count: circleResolution,
    instanceCount: lineSegmentsCount + 1,
  })

  return ({ width, height }) => {
    camera.tick()
    rico.clear(0.18, 0.18, 0.18, 1)

    const drawUniforms = {
      lineWidth: 0.001,
      view: camera.matrix,
      projection: mat4.perspective([], Math.PI / 12, width / height, 0.01, 1000),
      lineSegmentsCount,
    }

    drawCaps({ uniforms: drawUniforms })
    drawSegments({ uniforms: drawUniforms })
  }
}

canvasSketch(sketch, {
  canvas: rico.canvas,
  context: 'webgl2',
  pixelRatio: 1,
  animate: true
})
