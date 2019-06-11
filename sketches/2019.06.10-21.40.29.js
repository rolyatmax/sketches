/* global fetch */

const canvasSketch = require('canvas-sketch')
const createRegl = require('regl')
const { GUI } = require('dat-gui')
const { random } = require('canvas-sketch-util')
const createRoamingCamera = require('../src/common/create-roaming-camera')
const mat4 = require('gl-mat4')
const { csvParseRows } = require('d3-dsv')
const { extent } = require('d3-array')

const SIZE = Math.min(window.innerHeight, window.innerWidth) // 800

const settings = {
  seed: 0,
  pointSize: 12,
  cameraDist: 5
}

let drawCircles, setup, data
let moveToNextPosition = () => {}
let rand = random.createRandom(settings.seed)

const gui = new GUI()
gui.add(settings, 'pointSize', 1, 100)
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
    Math.PI / 8,
    width / height,
    0.01,
    1000
  )
  const regl = createRegl({
    gl: gl,
    extensions: 'OES_standard_derivatives'
  })

  setup = function setup () {
    data = data.map(d => {
      const lat = Number(d[1])
      const lon = Number(d[0])
      const elevation = Number(d[2])
      const intensity = Number(d[3])
      return {lat, lon, elevation, intensity}
    }).filter(d => d.elevation > 0)

    const lonExtent = extent(data, d => d.lon)
    const latExtent = extent(data, d => d.lat)
    const elevationExtent = extent(data, d => d.elevation)
    const intensityExtent = extent(data, d => d.intensity)

    console.log({
      lat: latExtent,
      lon: lonExtent,
      elevation: elevationExtent,
      intensity: intensityExtent
    })

    const positions = data.map(d => [
      (d.lon - lonExtent[0] - (lonExtent[1] - lonExtent[0]) / 2) * 150,
      (d.lat - latExtent[0] - (latExtent[1] - latExtent[0]) / 2) * 150,
      (d.elevation - elevationExtent[0]) / 400
    ])
    const sizes = data.map(d => (
      (d.intensity - intensityExtent[0]) / (intensityExtent[1] - intensityExtent[0])) * rand.range(0.5, 2)
    )

    drawCircles = regl({
      vert: `
        precision highp float;
        attribute vec3 position;
        attribute float size;

        uniform mat4 projection;
        uniform mat4 view;
        uniform float sizeMult;
        
        void main() {
          gl_Position = projection * view * vec4(position, 1);
          gl_PointSize = 0.8;
        }
      `,
      frag: `
        precision lowp float;
        void main() {
          vec3 color = vec3(0.2);
          gl_FragColor = vec4(color, 0.05);
        }
      `,
      // frag: `
      //   #extension GL_OES_standard_derivatives : enable
      //   precision highp float;
      //   void main() {
      //     vec3 color = vec3(0.2);
      //     vec2 cxy = 2.0 * gl_PointCoord - 1.0;
      //     float r = dot(cxy, cxy);
      //     float delta = fwidth(r);
      //     float alpha = 1.0 - smoothstep(1.0 - delta, 1.0 + delta, r);
      //     if (r > 1.0) {
      //       discard;
      //     }
      //     gl_FragColor = vec4(color * alpha, alpha);
      //   }
      // `,
      uniforms: {
        view: camera.getMatrix,
        projection: projection,
        sizeMult: () => settings.pointSize
      },
      attributes: {
        position: positions,
        size: sizes
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
      primitive: 'lines',
      count: data.length
    })
  }

  setup()

  return ({ time }) => {
    regl.poll()
    camera.tick()
    // camera._camera.up = [camera._camera.up[0], camera._camera.up[1], 999]

    regl.clear({
      color: [ 1.0, 1.0, 1.0, 1.0 ],
      depth: 1
    })

    drawCircles()
  }
}

fetch('src/data/west-coast-lidar/west-coast-lidar-filtered.csv')
  .then(res => res.text())
  .then(res => {
    console.log('loaded!')
    data = csvParseRows(res)
    console.log('parsed!')
    canvasSketch(sketch, {
      animate: true,
      context: 'webgl',
      attributes: { antialias: true },
      dimensions: [SIZE, SIZE]
    })
  })
