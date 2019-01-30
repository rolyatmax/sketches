const canvasSketch = require('canvas-sketch')
const createRegl = require('regl')
const { GUI } = require('dat-gui')
const { random } = require('canvas-sketch-util')
const createRoamingCamera = require('../src/common/create-roaming-camera')
const mat4 = require('gl-mat4')
const vec3 = require('gl-vec3')

const SIZE = 800

const onChange = () => setup()

const settings = {
  seed: 0,
  pointCount: 20000,
  pointSize: 12,
  noiseMag: 25,
  freq: 0.7,
  cameraDist: 5
}

let drawCircles, setup
let moveToNextPosition = () => {}
let rand = random.createRandom(settings.seed)

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(onChange)
gui.add(settings, 'pointCount', 0, 1000000).step(1).onChange(onChange)
gui.add(settings, 'pointSize', 1, 100).onChange(onChange)
gui.add(settings, 'noiseMag', 0, 100).onChange(onChange)
gui.add(settings, 'freq', 0, 3).onChange(onChange)
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
    width / height,
    0.01,
    1000
  )
  const regl = createRegl({
    gl: gl,
    extensions: 'OES_standard_derivatives'
  })

  setup = function setup () {
    rand = random.createRandom(settings.seed)
    const offset1 = rand.insideSphere(500)
    const points = new Array(settings.pointCount).fill(null).map(() => {
      const position = rand.insideSphere()
      const [x, y, z] = position
      const phi = (rand.noise3D(x, y, z, settings.freq) + 1) * Math.PI
      const v = rand.noise3D(x + offset1[0], y + offset1[1], z + offset1[2], settings.freq)
      const theta = Math.acos(v)
      const r = settings.noiseMag / 100
      const velocity = [
        r * Math.sin(theta) * Math.cos(phi),
        r * Math.sin(theta) * Math.sin(phi),
        r * Math.cos(theta)
      ]
      return {
        position: vec3.add(position, position, velocity),
        size: rand.range(0.5, settings.pointSize)
      }
    })

    drawCircles = regl({
      vert: `
        precision highp float;
        attribute vec3 position;
        attribute float size;

        uniform mat4 projection;
        uniform mat4 view;
        
        void main() {
          gl_Position = projection * view * vec4(position, 1);
          gl_PointSize = size;
        }
      `,
      frag: `
        #extension GL_OES_standard_derivatives : enable
        precision highp float;
        void main() {
          vec3 color = vec3(0.17);
          vec2 cxy = 2.0 * gl_PointCoord - 1.0;
          float r = dot(cxy, cxy);
          float delta = fwidth(r);
          float alpha = 1.0 - smoothstep(1.0 - delta, 1.0 + delta, r);
          if (r > 1.0) {
            discard;
          }
          gl_FragColor = vec4(color * alpha, alpha);
        }
      `,
      uniforms: {
        view: camera.getMatrix,
        projection: projection
      },
      attributes: {
        position: points.map(p => p.position),
        size: points.map(p => p.size)
      },
      blend: {
        enable: true,
        func: {
          srcRGB: 'src alpha',
          srcAlpha: 1,
          dstRGB: 'one minus src alpha',
          dstAlpha: 1
        },
        equation: {
          rgb: 'add',
          alpha: 'add'
        }
      },
      primitive: 'points',
      count: points.length
    })
  }

  setup()

  return ({ time }) => {
    regl.poll()
    camera.tick()

    regl.clear({
      color: [ 1.0, 1.0, 1.0, 1.0 ],
      depth: 1
    })

    drawCircles()
  }
}

canvasSketch(sketch, {
  animate: true,
  context: 'webgl',
  attributes: { antialias: true },
  dimensions: [SIZE, SIZE]
})
