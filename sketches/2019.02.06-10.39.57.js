const canvasSketch = require('canvas-sketch')
import * as luma from 'luma.gl'
const { GUI } = require('dat-gui')
const { random } = require('canvas-sketch-util')
const createRoamingCamera = require('../src/common/create-roaming-camera')
const mat4 = require('gl-mat4')
const vec3 = require('gl-vec3')
const d3Color = require('d3-color')

const SIZE = 800

const onChange = () => setup()

const settings = {
  seed: 0,
  pointCount: 20000,
  pointSize: 12,
  noiseMag: 25,
  freq: 0.7,
  cameraDist: 5,
  hueSpread: 100,
  hueStart: 100,
  saturation: 50,
  lightness: 50
}

let drawCirclesModel, setup
let moveToNextPosition = () => {}
let rand = random.createRandom(settings.seed)

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(onChange)
gui.add(settings, 'pointCount', 0, 1000000).step(1).onChange(onChange)
gui.add(settings, 'pointSize', 1, 100).onChange(onChange)
gui.add(settings, 'noiseMag', 0, 100).onChange(onChange)
gui.add(settings, 'freq', 0, 3).onChange(onChange)
gui.add(settings, 'hueStart', 0, 360).onChange(onChange)
gui.add(settings, 'hueSpread', 0, 360).onChange(onChange)
gui.add(settings, 'saturation', 0, 100).onChange(onChange)
gui.add(settings, 'lightness', 0, 100).onChange(onChange)

gui.add(settings, 'cameraDist', 0, 10)
gui.add({ next: () => moveToNextPosition() }, 'next')

const sketch = ({ gl, width, height }) => {
  const camera = createRoamingCamera({
    canvas: gl.canvas,
    zoomSpeed: 4,
    center: [1, 1, 1],
    eye: [0, 0, 0],
    dampening: 0.01,
    stiffness: 1.5,
    getCameraPosition: () => rand.onSphere(settings.cameraDist)
  })

  moveToNextPosition = camera.moveToNextPosition

  const projection = mat4.perspective(
    [],
    Math.PI / 4,
    gl.canvas.width / gl.canvas.height,
    0.01,
    1000
  )

  setup = function setup () {
    luma.setParameters(gl, {
      clearColor: [1, 1, 1, 1],
      clearDepth: 1,
      depthTest: true,
      depthFunc: gl.LEQUAL
    })

    rand = random.createRandom(settings.seed)
    const offset1 = rand.insideSphere(500)
    const points = new Array(settings.pointCount).fill(null).map(() => {
      const position = rand.insideSphere()
      const [x, y, z] = position
      const phi = (rand.noise3D(x, y, z, settings.freq) + 1) * Math.PI
      const v = rand.noise3D(x + offset1[0], y + offset1[1], z + offset1[2], settings.freq)
      const theta = Math.acos(v)
      const rad = settings.noiseMag / 100
      const velocity = [
        rad * Math.sin(theta) * Math.cos(phi),
        rad * Math.sin(theta) * Math.sin(phi),
        rad * Math.cos(theta)
      ]
      // const hue = (v * 0.5 + 0.5) * settings.hueSpread + settings.hueStart
      // const {r, g, b} = d3Color.rgb(`hsl(${hue}, ${settings.saturation}%, ${settings.lightness}%)`)
      return {
        position: vec3.add(position, position, velocity),
        // size: rand.range(0.5, settings.pointSize),
        // color: [r, g, b].map(v => v / 255)
      }
    })

    drawCirclesModel = new luma.Model(gl, {
      vs: `
        precision highp float;
        attribute vec3 position;

        uniform mat4 projection;
        uniform mat4 view;
        varying vec3 pointColor;
        
        void main() {
          gl_Position = projection * view * vec4(position, 1);
          gl_PointSize = 3.0;
          pointColor = vec3(0.2, 0.5, 0.7);
        }
      `,
      fs: `
        precision highp float;
        varying vec3 pointColor;
        void main() {
          gl_FragColor = vec4(pointColor, 1.0);
        }
      `,
      attributes: {
        position: new luma.Buffer(gl, {
          data: new Float32Array(points.map(p => p.position).flat()),
          size: 3,
          type: gl.FLOAT
        })
      },
      drawMode: gl.POINTS,
      vertexCount: points.length
    })
  }

  setup()

  return ({ time }) => {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    camera.tick()
    drawCirclesModel.draw({
      uniforms: {
        view: camera.getMatrix(),
        projection: projection
      }
    })
  }
}

canvasSketch(sketch, {
  animate: true,
  context: 'webgl2',
  attributes: { antialias: true },
  dimensions: [SIZE, SIZE]
})
