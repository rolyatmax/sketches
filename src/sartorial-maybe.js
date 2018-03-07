// const { GUI } = require('dat-gui')
const createRegl = require('regl')
const fit = require('canvas-fit')
const mat4 = require('gl-mat4')
const createCamera = require('3d-view-controls')
const { createSpring } = require('spring-animator')

const { fetch } = window

const canvas = document.createElement('canvas')
const camera = createCamera(canvas)
const regl = createRegl(canvas)

window.addEventListener('resize', fit(canvas), false)
document.body.appendChild(canvas)

const settings = {
  dampening: 0.15,
  stiffness: 0.26
}

// camera.lookAt([-23, 19, 0], [3, 3, 9], [0, 99, 0])
camera.lookAt([0, 0, 0], [-5, 0, -3], [0, 99, 0])

// const gui = new GUI()
// gui
//   .add(settings, 'dampening', 0, 1)
//   .step(0.01)
// gui
//   .add(settings, 'stiffness', 0, 1)
//   .step(0.01)

const modelFiles = [
  '/src/models/fidi.mesh.json'
  // '/src/models/fidi.obj'
  // '/src/models/empire-state.obj',
  // '/src/models/chrysler.obj',
  // '/src/models/one-worldwide-plaza.obj',
  // '/src/models/woolworth.obj',
  // '/src/models/one-world-trade.obj',
  // '/src/models/bank-of-america-tower.obj'
]

Promise.all(modelFiles.map(f => fetch(f).then(r => r.json()))).then(models => {
  setup(models)
  // setup(models.map(m => new OBJFile(m).parse().models))
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
        Math.PI / 8,
        canvas.width / canvas.height,
        0.01,
        1000
      ),
    view: () => camera.matrix
  }
})

function startLoop() {
  regl.frame(({ time }) => {
    regl.clear({
      color: [1, 1, 1, 1],
      depth: 1
    })

    camera.tick()
    camera.up = [camera.up[0], 999, camera.up[2]]
    camera.center = [
      Math.sin(time / 4) * 30,
      Math.sin(time / 6) * 10 + 15,
      Math.cos(time / 4) * 30
    ]

    globalRender(render)
  })
}

function createModelRenderer(model, i) {
  // scale these down a bit
  const scaleFactor = 0.01
  const offset = 500
  model.vertexPositions = model.vertexPositions.map(vertex => {
    vertex[0] = vertex[0] * scaleFactor
    vertex[1] = vertex[1] * scaleFactor // this is the height
    vertex[2] = (vertex[2] + offset * i) * scaleFactor
    return vertex
  })

  const heightMultiplier = { tick: () => 1 }

  // const heightMultiplier = createSpring(
  //   settings.dampening,
  //   settings.stiffness,
  //   0
  // )
  // let k = 0
  // setTimeout(function setHeights() {
  //   setTimeout(setHeights, 2500)
  //   k += 1
  //   const val = k % 2 === 0 ? 0 : 1
  //   setTimeout(
  //     () => heightMultiplier.updateValue(val),
  //     Math.random() * 100 * i + 1000
  //   )
  // }, 0)

  const vertices = new Float32Array(model.vertexPositions.length * 3)
  for (let i = 0; i < model.vertexPositions.length; i++) {
    vertices[i * 3 + 0] = model.vertexPositions[i][0]
    vertices[i * 3 + 1] = model.vertexPositions[i][1]
    vertices[i * 3 + 2] = model.vertexPositions[i][2]
  }

  const renderPoints = regl({
    vert: `
    precision highp float;

    attribute vec3 position;

    varying vec4 fragColor;

    uniform mat4 projection;
    uniform mat4 view;
    uniform float heightMultiplier;

    void main() {
      gl_PointSize = 1.0;
      float y = position.y * heightMultiplier;
      gl_Position = projection * view * vec4(position.x, y, position.z, 1.0);
      fragColor = vec4(vec3(0.4), 1.0);
    }
    `,
    frag: `
    precision highp float;

    varying vec4 fragColor;

    uniform float heightMultiplier;

    void main() {
      if (heightMultiplier < 0.01) {
        discard;
      }
      gl_FragColor = fragColor;
    }
    `,
    attributes: { position: vertices },
    uniforms: {
      heightMultiplier: heightMultiplier.tick()
    },
    count: vertices.length / 3,
    primitive: 'points'
  })

  const colors = new Float32Array(model.facePositions.length * 4 * 3)
  const faces = new Float32Array(model.facePositions.length * 3 * 3)
  const normals = new Float32Array(model.facePositions.length * 3 * 3)

  let q = 0
  let r = 0
  for (let j = 0; j < model.facePositions.length; j++) {
    let bwValue = Math.random() * 0.1 + 0.7
    colors[j * 12 + 0] = colors[j * 12 + 1] = colors[j * 12 + 2] = bwValue
    colors[j * 12 + 4] = colors[j * 12 + 5] = colors[j * 12 + 6] = bwValue
    colors[j * 12 + 8] = colors[j * 12 + 9] = colors[j * 12 + 10] = bwValue
    colors[j * 12 + 3] = colors[j * 12 + 7] = colors[j * 12 + 11] = 0.8

    for (let k = -1; k <= model.facePositions[j].length; k++) {
      // do the first and last one twice so we can use a single triangle strip?
      const index = Math.max(0, Math.min(k, model.facePositions[j].length - 1))

      const v = model.vertexPositions[model.facePositions[j][index]]
      faces[q++] = v[0]
      faces[q++] = v[1]
      faces[q++] = v[2]

      const n = model.faceNormals[j][index]
      normals[r++] = n[0]
      normals[r++] = n[1]
      normals[r++] = n[2]
    }
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
    uniform float heightMultiplier;

    void main() {
      float y = position.y * heightMultiplier;
      gl_Position = projection * view * vec4(position.x, position.y, position.z, 1.0);
      fragColor = color;
      vNormal = normal;
    }
    `,
    frag: `
    precision highp float;

    varying vec4 fragColor;
    varying vec3 vNormal;

    uniform float heightMultiplier;

    void main() {
      if (heightMultiplier < 0.01) {
        discard;
      }
      float bW = clamp(1.0 - ((vNormal.x + vNormal.y + vNormal.z) / 3.0), 0.2, 1.0);
      gl_FragColor = vec4(vec3(0.5), 0.1);
      // gl_FragColor = fragColor;
    }
    `,
    blend: {
      enable: true,
      func: {
        srcRGB: 'src alpha',
        srcAlpha: 1,
        dstRGB: 'one minus src alpha',
        dstAlpha: 1
      },
      equation: { rgb: 'add', alpha: 'add' }
    },
    attributes: { position: faces, normal: normals, color: colors },
    uniforms: { heightMultiplier: () => heightMultiplier.tick() },
    count: faces.length / 3,
    primitive: 'triangle strip'
  })

  return function render() {
    renderPoints()
    renderFaces()
  }
}
