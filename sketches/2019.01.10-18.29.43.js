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
  points: 1000,
  size: 68,
  gridSize: 3,
  blobs: 62,
  spread: 150,
  cameraDist: 14,
  cameraSpread: 0.1,
  blend: 0.01,
  r: 0.5,
  g: 0.5,
  b: 0.95,
  opacity: 0.95,
  roam: true
}

const WIDTH = 500
const HEIGHT = 500

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
  gui.add(settings, 'blend', 0, 1).step(0.01)
  gui.add(settings, 'r', 0, 1).step(0.01).onChange(update)
  gui.add(settings, 'g', 0, 1).step(0.01).onChange(update)
  gui.add(settings, 'b', 0, 1).step(0.01).onChange(update)
  gui.add(settings, 'opacity', 0, 1).step(0.01).onChange(update)
  gui.add(settings, 'roam')

  const regl = createRegl({ gl })
  let cells

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
      precision mediump float;
      attribute vec3 position;
      attribute vec3 normal;
  
      varying vec4 vFragColor;

      uniform mat4 projection;
      uniform mat4 view;
      uniform vec3 color;
      uniform float opacity;
      uniform float blend;

      void main() {
        gl_PointSize = 5.0;
        gl_Position = projection * view * vec4(position, 1);
        vec3 vals = (position + vec3(1)) / 2.0 + vec3(0.2);
        vec3 blendedColor = mix(color, vals, blend * 0.1);
        vFragColor = vec4(blendedColor, opacity);
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
        gl_FragColor = vFragColor;
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
      count: faces.positions.length,
      primitive: regl.prop('primitive')
    })
  }

  update()
  return ({ time, frame }) => {
    regl.poll()
    regl.clear({
      color: [1, 1, 1, 1],
      depth: 1
    })

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

    cells.forEach(({ camera, position }) => {
      render({
        color,
        camera: camera.matrix,
        gridPosition: position,
        primitive: 'lines'
      })
      render({
        color,
        camera: camera.matrix,
        gridPosition: position,
        primitive: 'points'
      })
    })
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
