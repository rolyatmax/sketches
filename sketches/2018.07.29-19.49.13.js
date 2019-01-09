const canvasSketch = require('canvas-sketch')
const createRegl = require('regl')
const createCamera = require('3d-view-controls')
const mat4 = require('gl-mat4')
const vec3 = require('gl-vec3')
const getNormal = require('get-plane-normal')
const Alea = require('alea')
const { GUI } = require('dat-gui')
const quickhull = require('quickhull3d')

const settings = {
  seed: 1,
  points: 100,
  size: 5,
  gridSize: 20,
  blobs: 16,
  spread: 20,
  cameraDist: 2,
  cameraSpread: 0.75,
  blur: 0.01,
  blend: 0.5,
  r: 0.1,
  g: 0.1,
  b: 0.95,
  opacity: 1,
  roam: true
}

const WIDTH = 600
const HEIGHT = 600

const sketch = ({ gl }) => {
  const gui = new GUI()
  gui.add(settings, 'seed', 0, 1000).step(1).onChange(update)
  gui.add(settings, 'points', 4, 1000).step(1).onChange(update)
  gui.add(settings, 'size', 1, 100).onChange(update)
  gui.add(settings, 'gridSize', 1, 20).step(1).onChange(update)
  gui.add(settings, 'blobs', 1, 100).step(1).onChange(update)
  gui.add(settings, 'spread', 1, 200).onChange(update)
  gui.add(settings, 'cameraDist', 1, 20)
  gui.add(settings, 'cameraSpread', 0, 2).step(0.01)
  gui.add(settings, 'blur', 0, 1).step(0.01)
  gui.add(settings, 'blend', 0, 1).step(0.01)
  gui.add(settings, 'r', 0, 1).step(0.01).onChange(update)
  gui.add(settings, 'g', 0, 1).step(0.01).onChange(update)
  gui.add(settings, 'b', 0, 1).step(0.01).onChange(update)
  gui.add(settings, 'opacity', 0, 1).step(0.01).onChange(update)
  gui.add(settings, 'roam')

  const regl = createRegl({ gl })
  let cells

  const fbo = regl.framebuffer({
    color: regl.texture({
      shape: [WIDTH, HEIGHT, 4]
    }),
    depth: false,
    stencil: false
  })

  const renderTo = regl({ framebuffer: regl.prop('toFbo') })
  const renderFrom = regl({
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
      iChannel0: regl.prop('fromFbo')
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

  let render
  function update () {
    const rand = new Alea(settings.seed)
    cells = (new Array(settings.gridSize * settings.gridSize)).fill().map((_, i) => {
      const position = [i % settings.gridSize, i / settings.gridSize | 0]
      const camera = createCamera(gl.canvas, { zoomSpeed: 4 })
      camera.lookAt(
        [50, 50, 50],
        [0, 0, 0],
        [0, 0, 1]
      )
      return { camera, position }
    })

    function createBlob () {
      const center = getRandomPtInSphere(rand, rand() * settings.spread)
      const points = new Array(settings.points).fill(0).map(() => {
        const pt = getRandomPtInSphere(rand, rand() * settings.size)
        vec3.add(pt, pt, center)
        return pt
      })

      const hullMesh = quickhull(points)
      const positions = []
      const colors = []
      const normals = []
      hullMesh.forEach(faceIndices => {
        const p = faceIndices.map((i) => points[i])
        const c = [settings.r, settings.g, settings.b]
        const n = getNormal([], p[0], p[1], p[2])
        positions.push(p[0], p[1], p[2])
        colors.push(c, c, c)
        normals.push(n, n, n)
      })
      return { positions, colors, normals }
    }

    const faces = new Array(settings.blobs).fill(0).map(createBlob).reduce((allFaces, mesh) => {
      return {
        positions: allFaces.positions.concat(mesh.positions),
        colors: allFaces.colors.concat(mesh.colors),
        normals: allFaces.normals.concat(mesh.normals)
      }
    }, { positions: [], colors: [], normals: [] })

    render = regl({
      vert: `
      attribute vec3 position;
      // attribute vec3 color;
      attribute vec3 normal;
  
      varying vec4 vFragColor;

      uniform mat4 projection;
      uniform mat4 view;
      uniform vec3 color;
      uniform float opacity;

      void main() {
        vec3 lightDir = normalize(vec3(10, 20, 30));
        float reflection = dot(normal, lightDir);
        vec3 c = mix(vec3(0.8), color, reflection);

        vFragColor = vec4(c, reflection * opacity);
        gl_PointSize = 2.0;
        gl_Position = projection * view * vec4(position, 1);
      }
      `,
      frag: `
      precision mediump float;
      varying vec4 vFragColor;

      uniform vec2 gridPosition;
      uniform vec2 resolution;
      uniform float gridSize;
      uniform float blend;

      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec2 start = gridPosition / gridSize;
        float cellSize = 1.0 / gridSize;
        if (uv.x < start.x || uv.x > start.x + cellSize || uv.y < start.y || uv.y > start.y + cellSize) {
          discard;
        }
        vec3 color = mix(vFragColor.rgb, vec3(uv.x, uv.y, uv.y), blend);
        gl_FragColor = vec4(color, vFragColor.a);
      }
      `,
      attributes: {
        position: faces.positions,
        color: faces.colors,
        normal: faces.normals
      },
      uniforms: {
        color: regl.prop('color'),
        opacity: () => settings.opacity,
        blend: () => settings.blend,
        projection: ({ viewportWidth, viewportHeight }) => mat4.perspective(
          [],
          Math.PI / 4,
          viewportWidth / viewportHeight,
          0.01,
          1000
        ),
        view: regl.prop('camera'),
        gridPosition: regl.prop('gridPosition'),
        gridSize: () => settings.gridSize,
        resolution: ({ viewportWidth, viewportHeight }) => [viewportWidth, viewportHeight]
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
      count: faces.positions.length,
      primitive: 'triangles'
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

  update()
  return ({ time, frame }) => {
    regl.poll()

    cells.forEach(({ camera }, i) => {
      camera.tick()

      camera.up = [camera.up[0], camera.up[1], 999]
      if (settings.roam) {
        // TODO: make this different for every camera
        camera.center = [
          Math.sin(time + i * settings.cameraSpread) * 20 * settings.cameraDist,
          Math.cos(time + i * settings.cameraSpread) * 40 * settings.cameraDist,
          (Math.sin(time + i * settings.cameraSpread) * 0.5 + 0.5) * 30 * settings.cameraDist
        ]
      }
    })

    const color = [
      Math.sin((time * 2 + 10) / 10) * 0.2 + settings.r,
      Math.cos((time * 3 + 4) / 10) * 0.2 + settings.g,
      Math.sin((time * 5 + 7) / 10) * 0.2 + settings.b
    ]

    renderTo({ toFbo: fbo }, () => {
      renderBG({ bgColor: [ 0.18, 0.18, 0.18, settings.blur ] })
      cells.forEach(({ camera, position }) => render({
        color,
        camera: camera.matrix,
        gridPosition: position
      }))
    })
    renderFrom({ fromFbo: fbo })
  }
}

canvasSketch(sketch, {
  animate: true,
  dimensions: [WIDTH, HEIGHT],
  context: 'webgl',
  flush: false,
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
