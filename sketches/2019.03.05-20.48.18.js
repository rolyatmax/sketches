const canvasSketch = require('canvas-sketch')
const { GUI } = require('dat-gui')
const Alea = require('alea')
const glsl = require('glslify')
const mat4 = require('gl-mat4')
const createRegl = require('regl')
const createCamera = require('3d-view-controls')
const getNormal = require('triangle-normal')
const geoao = require('geo-ambient-occlusion')
// const primitiveIcosphere = require('primitive-icosphere')

const WIDTH = 1024
const HEIGHT = 1024

let random, renderCube, curAO, lastAO, positions, normals, setup

const settings = {
  meshCount: 500,
  spreadSize: 40,
  sampleCount: 512,
  resolution: 512,
  bias: 0.12
}

const onChange = () => setup()

const gui = new GUI()
gui.add(settings, 'meshCount', 1, 1000).step(1).onChange(onChange)
gui.add(settings, 'spreadSize', 1, 100).step(1).onChange(onChange)
gui.add(settings, 'sampleCount', 1, 10000).step(1).onChange(onChange)
gui.add(settings, 'resolution', 1, 2048).step(1).onChange(onChange)
gui.add(settings, 'bias', 0, 0.5).step(0.001).onChange(onChange)

const sketch = ({canvas}) => {
  const camera = createCamera(canvas, { zoomSpeed: 4 })
  const regl = createRegl({
    extensions: ['OES_texture_float'],
    canvas: canvas
  })

  camera.lookAt(
    [50, 50, 50],
    [0, 0, 0],
    [0, 0, 1]
  )

  // const mesh = primitiveIcosphere(1, { subdivisions: 1 })
  const mesh = require('primitive-cube')()
  window.mesh = mesh

  setup = function () {
    updatePositions(settings.spreadSize)
    updateAO()
    renderCube = regl({
      vert: glsl`
        precision highp float;
    
        attribute vec3 position;
        attribute float curAO;
        attribute float lastAO;
        varying float ao;
        uniform mat4 projection;
        uniform mat4 view;
  
        void main (void) {
          ao = (curAO + lastAO) / 2.0;
          gl_Position = projection * view * vec4(position, 1.0);
        }
      `,
      frag: glsl`
        precision highp float;
        
        varying float ao;
        uniform vec4 color;
  
        void main() {
          gl_FragColor = color;
          gl_FragColor.rgb *= 1.0 - pow(ao, 0.8);
          // gl_FragColor.rgb *= (light * 0.35 + 0.65);
        }
      `,
      attributes: {
        position: () => positions,
        normal: () => normals,
        curAO: () => curAO,
        lastAO: () => lastAO
      },
      uniforms: {
        projection: mat4.perspective(
          [],
          Math.PI / 4,
          WIDTH / HEIGHT,
          10,
          1000
        ),
        view: () => camera.matrix,
        color: regl.prop('color')
      },
      count: () => positions.length / 3,
      primitive: 'triangles'
    })
  }

  function updatePositions (spreadSize) {
    random = new Alea(1)
    const geometry = getGeometry(mesh, settings.meshCount, spreadSize)

    positions = geometry.positions
    normals = geometry.normals
  }

  function updateAO () {
    const aoSampler = geoao(positions, {
      resolution: settings.resolution,
      bias: settings.bias,
      normals: normals,
      regl: regl
    })

    for (let i = 0; i < settings.sampleCount; i++) {
      aoSampler.sample()
    }

    const ao = aoSampler.report()
    lastAO = curAO || ao
    curAO = ao

    aoSampler.dispose()
  }

  setup()
  let frame = 0
  return () => {
    frame += 1
    const time = frame / 30
    regl.poll()
    camera.tick()
    camera.center = [
      Math.sin(time * 0.3) * 100,
      Math.cos(time * 0.4) * 90,
      Math.sin((time + 10) * 0.5) * 85
    ]

    // updatePositions(settings.spreadSize + Math.sin((time * 0.85) + 90) * 8)

    // if (frame % 2 === 0) updateAO()

    regl.clear({
      color: [0.97, 0.96, 0.95, 1],
      depth: 1
    })
    renderCube({
      color: [0.45, 0.57, 0.76, 1]
    })
  }
}

canvasSketch(sketch, {
  dimensions: [ WIDTH, HEIGHT ],
  context: 'webgl',
  attributes: { antialias: true },
  animate: true
})

// -------------

function getGeometry (mesh, meshCount, spreadSize) {
  const positions = []
  const normals = []

  const rand = () => (random() - 0.5) * 2 * spreadSize

  let j = meshCount
  while (j--) {
    const offset = [rand(), rand(), rand()]
    mesh.cells.forEach((tri) => {
      for (let i = 0; i < 3; i++) {
        positions.push(
          mesh.positions[tri[i]][0] * 5 + offset[0],
          mesh.positions[tri[i]][1] * 5 + offset[1],
          mesh.positions[tri[i]][2] * 5 + offset[2]
        )
      }
    })
  }

  for (let i = 0; i < positions.length; i += 9) {
    const curNormal = getNormal(
      positions[i + 0], positions[i + 1], positions[i + 2],
      positions[i + 3], positions[i + 4], positions[i + 5],
      positions[i + 6], positions[i + 7], positions[i + 8],
      []
    )

    normals.push(
      curNormal[0], curNormal[1], curNormal[2],
      curNormal[0], curNormal[1], curNormal[2],
      curNormal[0], curNormal[1], curNormal[2]
    )
  }
  return { positions, normals }
}
