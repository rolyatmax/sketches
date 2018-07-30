const canvasSketch = require('canvas-sketch')
const createRegl = require('regl')
const createCamera = require('3d-view-controls')
const mat4 = require('gl-mat4')
const Alea = require('alea')
const { GUI } = require('dat-gui')

const settings = {
  seed: 1,
  points: 100,
  size: 5,
  blobs: 2,
  spread: 20,
  cameraDist: 3,
  roam: true
}

const WIDTH = 800
const HEIGHT = 800

const sketch = ({ gl }) => {
  const gui = new GUI()
  gui.add(settings, 'seed', 0, 1000).step(1).onChange(update)
  gui.add(settings, 'points', 4, 1000).step(1).onChange(update)
  gui.add(settings, 'size', 1, 100).onChange(update)
  gui.add(settings, 'blobs', 1, 100).step(1).onChange(update)
  gui.add(settings, 'spread', 1, 200).onChange(update)
  gui.add(settings, 'cameraDist', 1, 20)
  gui.add(settings, 'roam')

  const regl = createRegl({ gl })
  const camera = createCamera(gl.canvas, { zoomSpeed: 4 })

  camera.lookAt(
    [50, 50, 50],
    [0, 0, 0],
    [0, 0, 1]
  )

  const fbo = regl.framebuffer({
    color: regl.texture({
      shape: [WIDTH, HEIGHT, 4]
    }),
    depth: false,
    stencil: false
  })
  const renderToFbo = regl({ framebuffer: fbo })

  let render
  function update () {
    const rand = new Alea(settings.seed)

    const points = new Array(settings.points).fill(0).map(() => {
      return getRandomPtInSphere(rand, rand() * settings.size)
    })

    render = regl({
      vert: `
      attribute vec3 position;
  
      varying vec4 vFragColor;

      uniform mat4 projection;
      uniform mat4 view;

      void main() {
        vFragColor = vec4(0, 0, 0, 1);
        gl_PointSize = 3.0;
        gl_Position = projection * view * vec4(position, 1);
      }
      `,
      frag: `
      precision mediump float;
      varying vec4 vFragColor;

      void main() {
        gl_FragColor = vFragColor;
      }
      `,
      attributes: {
        position: points
      },
      uniforms: {
        projection: ({ viewportWidth, viewportHeight }) => mat4.perspective(
          [],
          Math.PI / 4,
          viewportWidth / viewportHeight,
          0.01,
          1000
        ),
        view: () => camera.matrix
      },
      count: points.length,
      primitive: 'points'
    })
  }

  const renderBG = regl({
    vert: `
      precision highp float;
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0, 1);
      }
    `,
    frag: `
      precision highp float;
      uniform vec4 bgColor;
      void main() {
        gl_FragColor = bgColor;
      }
    `,
    uniforms: {
      bgColor: regl.prop('bgColor')
    },
    attributes: {
      position: [
        -1, -1,
        -1, 4,
        4, -1
      ]
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
    count: 3,
    primitive: 'triangles'
  })

  const renderFbo = regl({
    vert: `
      precision highp float;
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0, 1);
      }
    `,
    frag: `
      precision highp float;
      uniform vec2 iResolution;
      uniform sampler2D iChannel0;
      void main() {
        vec2 uv = vec2(gl_FragCoord.xy / iResolution.xy);
        gl_FragColor = texture2D(iChannel0, uv);
      }
    `,
    uniforms: {
      iResolution: ({viewportWidth, viewportHeight}) => [viewportWidth, viewportHeight],
      iChannel0: () => fbo
    },
    attributes: {
      position: [
        -1, -1,
        -1, 4,
        4, -1
      ]
    },
    count: 3,
    primitive: 'triangles'
  })

  update()
  return ({ time, frame }) => {
    regl.poll()
    camera.tick()

    camera.up = [camera.up[0], camera.up[1], 999]
    if (settings.roam) {
      camera.center = [
        Math.sin(time) * 20 * settings.cameraDist,
        Math.cos(time) * 40 * settings.cameraDist,
        (Math.sin(time) * 0.5 + 0.5) * 30 * settings.cameraDist
      ]
    }
    renderToFbo(() => {
      // renderBG({ bgColor: [ 0.18, 0.18, 0.18, 0.9 ] })
      // regl.clear({
      //   color: [ 1, 1, 1, 1 ],
      //   depth: 1
      // })
      render()
    })
    renderFbo()
  }
}

canvasSketch(sketch, {
  animate: true,
  dimensions: [WIDTH, HEIGHT],
  context: 'webgl',
  flush: true,
  attributes: { antialias: true } // Turn on MSAA
})

function getRandomPtInSphere (rand, r) {
  const alpha = rand() * Math.PI * 2
  const beta = rand() * Math.PI
  const r2 = Math.sin(beta) * r
  const y = Math.cos(beta) * r
  const x = Math.cos(alpha) * r2
  const z = Math.sin(alpha) * r2
  return [x, y, z]
}
