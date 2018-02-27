const createRegl = require('regl')
const OBJFile = require('obj-file-parser')
const fit = require('canvas-fit')
const mat4 = require('gl-mat4')
const createCamera = require('3d-view-controls')

const { fetch } = window

const canvas = document.createElement('canvas')
const camera = createCamera(canvas)
const regl = createRegl(canvas)

// TODO: figure this outttt
// camera.lookAt([0, 0, 0], [0, -30, 0], [0, 99, 0])

window.addEventListener('resize', fit(canvas), false)
document.body.appendChild(canvas)

const modelFiles = [
  '/src/models/empire-state.obj',
  '/src/models/chrysler.obj',
  '/src/models/one-worldwide-plaza.obj',
  '/src/models/woolworth.obj',
  '/src/models/one-world-trade.obj',
  '/src/models/bank-of-america-tower.obj'
]

Promise.all(modelFiles.map(f => fetch(f).then(r => r.text()))).then(models => {
  setup(models.map(m => new OBJFile(m).parse().models[0]))
  startLoop()
})

let render

function setup(models) {
  window.models = models
  const renderers = models.map(createModelRenderer)
  render = function() {
    renderers.forEach(r => r())
  }
}

const globalRender = regl({
  uniforms: {
    projection: () =>
      mat4.perspective(
        [],
        Math.PI / 4,
        canvas.width / canvas.height,
        0.01,
        1000
      ),
    view: () => camera.matrix
  }
})

function startLoop() {
  regl.frame(() => {
    regl.clear({
      color: [1, 1, 1, 1],
      depth: 1
    })
    camera.tick()
    globalRender(render)
  })
}

function createModelRenderer(model, i) {
  // scale these down a bit
  const scaleFactor = 0.01
  const offset = 500
  model.vertices = model.vertices.map(vertex => {
    vertex.x = vertex.x * -scaleFactor
    vertex.y = vertex.y * scaleFactor // this is the height
    vertex.z = (vertex.z + offset * i) * scaleFactor
    return vertex
  })

  const vertices = new Float32Array(model.vertices.length * 3)
  for (let i = 0; i < model.vertices.length; i++) {
    vertices[i * 3 + 0] = model.vertices[i].x
    vertices[i * 3 + 1] = model.vertices[i].y
    vertices[i * 3 + 2] = model.vertices[i].z
  }

  const renderPoints = regl({
    vert: `
    precision highp float;

    attribute vec3 position;

    varying vec4 fragColor;

    uniform mat4 projection;
    uniform mat4 view;

    void main() {
      gl_PointSize = 1.0;
      gl_Position = projection * view * vec4(position, 1.0);
      fragColor = vec4(vec3(0.1), 0.3);
    }
    `,
    frag: `
    precision highp float;

    varying vec4 fragColor;

    void main() {
      gl_FragColor = fragColor;
    }
    `,
    attributes: { position: vertices },
    count: vertices.length / 3,
    primitive: 'points'
  })

  const colors = new Float32Array(model.faces.length * 4 * 3)
  const faces = new Float32Array(model.faces.length * 3 * 3)
  const normals = new Float32Array(model.faces.length * 3 * 3)

  for (let j = 0; j < model.faces.length; j++) {
    let bwValue = Math.random() * 0.1 + 0.7
    colors[j * 12 + 0] = colors[j * 12 + 1] = colors[j * 12 + 2] = bwValue
    colors[j * 12 + 4] = colors[j * 12 + 5] = colors[j * 12 + 6] = bwValue
    colors[j * 12 + 8] = colors[j * 12 + 9] = colors[j * 12 + 10] = bwValue
    colors[j * 12 + 3] = colors[j * 12 + 7] = colors[j * 12 + 11] = 0.8

    let v
    // minus 1 because these lists are not 0-indexed, they start at 1
    v = model.vertices[model.faces[j].vertices[0].vertexIndex - 1]
    faces[j * 9 + 0] = v.x
    faces[j * 9 + 1] = v.y
    faces[j * 9 + 2] = v.z
    v = model.vertices[model.faces[j].vertices[1].vertexIndex - 1]
    faces[j * 9 + 3] = v.x
    faces[j * 9 + 4] = v.y
    faces[j * 9 + 5] = v.z
    v = model.vertices[model.faces[j].vertices[2].vertexIndex - 1]
    faces[j * 9 + 6] = v.x
    faces[j * 9 + 7] = v.y
    faces[j * 9 + 8] = v.z

    let n
    // minus 1 because these lists are not 0-indexed, they start at 1
    n = model.vertexNormals[model.faces[j].vertices[0].vertexNormalIndex - 1]
    normals[j * 9 + 0] = n.x
    normals[j * 9 + 1] = n.y
    normals[j * 9 + 2] = n.z
    n = model.vertexNormals[model.faces[j].vertices[1].vertexNormalIndex - 1]
    normals[j * 9 + 3] = n.x
    normals[j * 9 + 4] = n.y
    normals[j * 9 + 5] = n.z
    n = model.vertexNormals[model.faces[j].vertices[2].vertexNormalIndex - 1]
    normals[j * 9 + 6] = n.x
    normals[j * 9 + 7] = n.y
    normals[j * 9 + 8] = n.z
  }

  const renderFaces = regl({
    vert: `
    precision highp float;

    attribute vec3 position;
    attribute vec3 normal;
    attribute vec4 color;

    varying vec4 fragColor;
    varying vec3 vNormal;

    uniform mat4 projection;
    uniform mat4 view;

    void main() {
      gl_Position = projection * view * vec4(position, 1.0);
      fragColor = color;
      vNormal = normal;
    }
    `,
    frag: `
    precision highp float;

    varying vec4 fragColor;
    varying vec3 vNormal;

    void main() {
      float bW = clamp(1.0 - ((vNormal.x + vNormal.y + vNormal.z) / 3.0), 0.1, 1.0);
      gl_FragColor = vec4(vec3(bW - 0.05), 1.0);
      // gl_FragColor = fragColor;
    }
    `,
    attributes: { position: faces, normal: normals, color: colors },
    count: faces.length / 3,
    primitive: 'triangles'
  })

  return function render() {
    renderPoints()
    renderFaces()
  }
}
