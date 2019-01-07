const canvasSketch = require('canvas-sketch')
const createRegl = require('regl')
const { GUI } = require('dat-gui')
const { random } = require('canvas-sketch-util')
const createCamera = require('3d-view-controls')
const mat4 = require('gl-mat4')

let drawCircles, setup

const onChange = () => setup()

const settings = {
  seed: 0,
  pointCount: 10000,
  pointSize: 17,
  hueStart: 0.56,
  hueSpread: 0.12,
  lightnessStart: 0.45,
  lightnessSpread: 0.1,
  saturation: 0.57
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(onChange)
gui.add(settings, 'pointCount', 0, 1000000).step(1).onChange(onChange)
gui.add(settings, 'pointSize', 1, 100).onChange(onChange)
gui.add(settings, 'hueStart', 0, 1).step(0.01)
gui.add(settings, 'hueSpread', 0, 1).step(0.01)
gui.add(settings, 'saturation', 0, 1).step(0.01)
gui.add(settings, 'lightnessStart', 0, 1).step(0.01)
gui.add(settings, 'lightnessSpread', 0, 1).step(0.01)

const sketch = ({ gl }) => {
  const camera = createCamera(gl.canvas, { zoomSpeed: 4 })
  const projection = mat4.perspective(
    [],
    Math.PI / 4,
    window.innerWidth / window.innerHeight,
    0.01,
    1000
  )
  const regl = createRegl({
    gl: gl,
    extensions: 'OES_standard_derivatives'
  })

  setup = function setup () {
    const rand = random.createRandom(settings.seed)
    const points = new Array(settings.pointCount).fill(null).map(() => {
      return {
        position: rand.insideSphere(),
        size: rand.range(0.5, settings.pointSize),
        hue: rand.range(0, 1),
        lightness: rand.range(0, 1)
      }
    })

    drawCircles = regl({
      vert: `
        precision highp float;
        attribute vec3 position;
        attribute float size;
        attribute float hue;
        attribute float lightness;

        uniform mat4 projection;
        uniform mat4 view;
        uniform vec2 hueRange;
        uniform float saturation;
        uniform vec2 lightnessRange;

        varying vec3 color;
        varying vec3 distToCamera;
        
        vec3 hueToRGB(float hue) {
          float r = abs(hue * 6.0 - 3.0) - 1.0;
          float g = 2.0 - abs(hue * 6.0 - 2.0);
          float b = 2.0 - abs(hue * 6.0 - 4.0);
          return clamp(vec3(r, g, b), 0.0, 1.0);
        }

        vec3 czm_HSLToRGB(vec3 hsl) {
          vec3 rgb = hueToRGB(hsl.x);
          float c = (1.0 - abs(2.0 * hsl.z - 1.0)) * hsl.y;
          return (rgb - 0.5) * c + hsl.z;
        }
        
        void main() {
          gl_Position = projection * view * vec4(position, 1);
          gl_PointSize = size;
          float hueSpread = hueRange.y - hueRange.x;
          float lightnessSpread = lightnessRange.y - lightnessRange.x;
          float l = pow(1.0 - (gl_Position.z * 0.5 + 0.5), 9.0); // * lightness;
          vec3 hsl = vec3(
            mod(hueSpread * hue + hueRange.x, 1.0),
            saturation,
            lightnessSpread * l + lightnessRange.x
          );
          color = czm_HSLToRGB(hsl);
        }
      `,
      frag: `
        #extension GL_OES_standard_derivatives : enable
        precision highp float;
        varying vec3 color;
        void main() {
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
        hueRange: () => [settings.hueStart, settings.hueStart + settings.hueSpread],
        lightnessRange: () => [settings.lightnessStart, settings.lightnessStart + settings.lightnessSpread],
        saturation: () => settings.saturation,
        view: () => camera.matrix,
        projection: projection
      },
      attributes: {
        position: points.map(p => p.position),
        size: points.map(p => p.size),
        hue: points.map(p => p.hue),
        lightness: points.map(p => p.lightness)
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
      color: [ 0.19, 0.19, 0.19, 1.0 ],
      depth: 1
    })

    drawCircles()
  }
}

canvasSketch(sketch, {
  animate: true,
  context: 'webgl',
  attributes: { antialias: true }
})
