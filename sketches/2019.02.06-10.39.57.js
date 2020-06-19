import * as luma from 'luma.gl'
const canvasSketch = require('canvas-sketch')
const { GUI } = require('dat-gui')
const { random } = require('canvas-sketch-util')
const createRoamingCamera = require('./common/create-roaming-camera')
const mat4 = require('gl-mat4')
const { createSpring } = require('spring-animator-1')

const SIZE = 1024

const onChange = () => setup()

const settings = {
  seed: 400,
  pointCount: 500000,
  pointSize: 20,
  noiseMag: 25,
  freq: 0.7,
  hueSpread: 0.1,
  hueStart: 0.56,
  saturation: 0.35,
  lightness: 0.35,
  cameraDist: 3,
  dampening: 0.01,
  stiffness: 1.5
}

let drawCirclesModel, setup, noiseSpring, hueSpreadSpring, hueStartSpring, sizeSpring
let moveToNextPosition = () => {}
let rand = random.createRandom(settings.seed)

function changeNoise () {
  noiseSpring.updateValue(rand.range(settings.noiseMag / 50))
  hueSpreadSpring.updateValue(rand.range(settings.hueSpread))
  hueStartSpring.updateValue(rand.value())
  sizeSpring.updateValue(rand.range(0.5, 1) * settings.pointSize)
}

const gui = new GUI()
const misc = gui.addFolder('misc')
misc.add(settings, 'seed', 0, 9999).step(1).onChange(onChange)
misc.add(settings, 'pointCount', 0, 1000000).step(1).onChange(onChange)
misc.add(settings, 'freq', 0, 3).onChange(onChange)
misc.add(settings, 'saturation', 0, 1).step(0.01)
misc.add(settings, 'lightness', 0, 1).step(0.01)
misc.add(settings, 'dampening', 0, 1).onChange(onChange)
misc.add(settings, 'stiffness', 0, 2).onChange(onChange)
misc.add(settings, 'cameraDist', 0, 10)

const interactive = gui.addFolder('interactive controls')
interactive.add(settings, 'hueStart', 0, 1).step(0.01).onChange(changeNoise)
interactive.add(settings, 'hueSpread', 0, 1).step(0.01).onChange(changeNoise)
interactive.add(settings, 'pointSize', 1, 100).onChange(changeNoise)
interactive.add(settings, 'noiseMag', 0, 100).onChange(changeNoise)
interactive.add({ next: () => moveToNextPosition() }, 'next')
interactive.add({ changeNoise }, 'changeNoise')

interactive.open()

const sketch = ({ gl }) => {
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
    noiseSpring = createSpring(settings.dampening, settings.stiffness, 0)
    hueSpreadSpring = createSpring(settings.dampening, settings.stiffness, 0)
    hueStartSpring = createSpring(settings.dampening, settings.stiffness, 0)
    sizeSpring = createSpring(settings.dampening, settings.stiffness, 1)
    const offset1 = rand.insideSphere(500)
    const points = new Array(settings.pointCount).fill(null).map(() => {
      const position = rand.insideSphere()
      const [x, y, z] = position
      const phi = (rand.noise3D(x, y, z, settings.freq) + 1) * Math.PI
      const v = rand.noise3D(x + offset1[0], y + offset1[1], z + offset1[2], settings.freq)
      const theta = Math.acos(v)
      const noiseOffset = [
        Math.sin(theta) * Math.cos(phi),
        Math.sin(theta) * Math.sin(phi),
        Math.cos(theta)
      ]
      return {
        position: position,
        noiseOffset: noiseOffset,
        size: rand.value(),
        hueSpreadAmount: v
      }
    })

    drawCirclesModel = new luma.Model(gl, {
      vs: `#version 300 es
        precision highp float;
        in vec3 position;
        in float size;
        in vec3 noiseOffset;
        in float hueSpreadAmount;

        uniform mat4 projection;
        uniform mat4 view;
        uniform float sizeMultiplier;
        uniform float noiseMultiplier;
        uniform float saturation;
        uniform float lightness;
        uniform float hueStart;
        uniform float hueSpread;

        out vec3 pointColor;

        float hue2rgb(float f1, float f2, float hue) {
          if (hue < 0.0)
            hue += 1.0;
          else if (hue > 1.0)
            hue -= 1.0;
          float res;
          if ((6.0 * hue) < 1.0)
            res = f1 + (f2 - f1) * 6.0 * hue;
          else if ((2.0 * hue) < 1.0)
            res = f2;
          else if ((3.0 * hue) < 2.0)
            res = f1 + (f2 - f1) * ((2.0 / 3.0) - hue) * 6.0;
          else
            res = f1;
          return res;
        }

        vec3 hsl2rgb(vec3 hsl) {
          vec3 rgb;
          if (hsl.y == 0.0) {
            rgb = vec3(hsl.z); // Luminance
          } else {
            float f2;
            if (hsl.z < 0.5) {
              f2 = hsl.z * (1.0 + hsl.y);
            } else {
              f2 = hsl.z + hsl.y - hsl.y * hsl.z;
            }
            float f1 = 2.0 * hsl.z - f2;
            rgb.r = hue2rgb(f1, f2, hsl.x + (1.0/3.0));
            rgb.g = hue2rgb(f1, f2, hsl.x);
            rgb.b = hue2rgb(f1, f2, hsl.x - (1.0/3.0));
          }
          return rgb;
        }

        void main() {
          vec3 pos = position + noiseOffset * noiseMultiplier;
          gl_Position = projection * view * vec4(pos, 1);
          gl_PointSize = size * sizeMultiplier;
          float hue = hueSpreadAmount * hueSpread + hueStart;
          pointColor = hsl2rgb(vec3(hue, saturation, lightness));
        }
      `,
      fs: `#version 300 es
        precision highp float;
        in vec3 pointColor;
        out vec4 fragColor;
        void main() {
          vec2 cxy = 2.0 * gl_PointCoord - 1.0;
          float r = dot(cxy, cxy);
          float delta = fwidth(r);
          float alpha = 1.0 - smoothstep(1.0 - delta, 1.0 + delta, r);
          if (r > 0.9) {
            discard;
          }
          fragColor = vec4(pointColor * alpha, alpha);
        }
      `,
      attributes: {
        position: new luma.Buffer(gl, {
          data: new Float32Array(points.map(p => p.position).flat()),
          size: 3,
          type: gl.FLOAT
        }),
        size: new luma.Buffer(gl, {
          data: new Float32Array(points.map(p => p.size).flat()),
          size: 1,
          type: gl.FLOAT
        }),
        noiseOffset: new luma.Buffer(gl, {
          data: new Float32Array(points.map(p => p.noiseOffset).flat()),
          size: 3,
          type: gl.FLOAT
        }),
        hueSpreadAmount: new luma.Buffer(gl, {
          data: new Float32Array(points.map(p => p.hueSpreadAmount).flat()),
          size: 1,
          type: gl.FLOAT
        })
      },
      drawMode: gl.POINTS,
      vertexCount: points.length
    })
  }

  setup()
  changeNoise()
  setTimeout(changeNoise, 6000)

  return () => {
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    camera.tick()
    drawCirclesModel.draw({
      uniforms: {
        view: camera.getMatrix(),
        projection: projection,
        sizeMultiplier: sizeSpring.tick(),
        noiseMultiplier: noiseSpring.tick(),
        saturation: settings.saturation,
        lightness: settings.lightness,
        hueStart: hueStartSpring.tick(),
        hueSpread: hueSpreadSpring.tick()
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
