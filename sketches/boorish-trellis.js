import includeFont from './common/include-font'
import addTitle from './common/add-title'
const Alea = require('alea')
const SimplexNoise = require('simplex-noise')
const { GUI } = require('dat-gui')
const Delaunator = require('delaunator')
const createRegl = require('regl')
const glslify = require('glslify')
const fit = require('canvas-fit')
const mat4 = require('gl-mat4')
const vec2 = require('gl-vec2')
const createCamera = require('3d-view-controls')
const array = require('new-array')
const css = require('dom-css')

title('boorish-trellis', '#ddd')

const canvas = document.createElement('canvas')
const camera = createCamera(canvas)
const regl = createRegl(canvas)

camera.zoomSpeed = 4
camera.lookAt(
  [2.5, 2.5, 2.5],
  [0, 0, 0],
  [0.52, -0.11, 50]
)

window.camera = camera
window.addEventListener('resize', fit(canvas), false)
document.body.appendChild(canvas)

const settings = guiSettings({
  seed: [442, 0, 1000, 1, true],
  points: [8000, 3, 50000, 1, true],
  maxTileSideLen: [0.1, 0.001, 1, 0.001, true],
  radiusPowFunc: [-0.08, -1, 4, 0.01, true],
  tileHeight: [4, 0.1, 10, 0.1],
  roam: [true]
}, setup)

let drawTriangles
setup()
function setup () {
  const rand = new Alea(settings.seed)
  const simplex = new SimplexNoise(rand)

  // create points
  const points = array(settings.points).map(() => {
    // two different ways to choose random points
    if (rand() < 0.5) {
      const x = rand() - 0.5
      const y = rand() - 0.5
      return [x, y]
    }
    const rads = rand() * Math.PI * 2
    const mag = Math.pow(rand(), settings.radiusPowFunc) / 2
    const x = Math.cos(rads) * mag
    const y = Math.sin(rads) * mag
    return [x, y]
  })
  // create tiles from points
  const delaunay = new Delaunator(points)
  const tiles = []
  for (let i = 0; i < delaunay.triangles.length; i += 3) {
    const pt1 = points[delaunay.triangles[i]]
    const pt2 = points[delaunay.triangles[i + 1]]
    const pt3 = points[delaunay.triangles[i + 2]]
    if (
      vec2.distance(pt1, pt2) > settings.maxTileSideLen ||
      vec2.distance(pt2, pt3) > settings.maxTileSideLen ||
      vec2.distance(pt3, pt1) > settings.maxTileSideLen
    ) {
      continue
    }
    const average = []
    vec2.add(average, pt1, pt2)
    vec2.add(average, average, pt3)
    vec2.scale(average, average, 1 / 3)
    const height = simplex.noise2D(average[0], average[1])
    tiles.push([
      [pt1[0], pt1[1], height],
      [pt2[0], pt2[1], height],
      [pt3[0], pt3[1], height]
    ])
  }

  const attributes = {
    position: [],
    adjacentPositionA: [],
    adjacentPositionB: [],
    isBase: [],
    adjacentIsBaseA: [],
    adjacentIsBaseB: []
  }
  for (const tile of tiles) {
    // top face
    attributes.position.push(tile[0], tile[1], tile[2])
    attributes.adjacentPositionA.push(tile[1], tile[2], tile[0])
    attributes.adjacentPositionB.push(tile[2], tile[0], tile[1])
    attributes.isBase.push(0, 0, 0)
    attributes.adjacentIsBaseA.push(0, 0, 0)
    attributes.adjacentIsBaseB.push(0, 0, 0)

    // side A face
    attributes.position.push(tile[0], tile[1], tile[0])
    attributes.adjacentPositionA.push(tile[1], tile[0], tile[0])
    attributes.adjacentPositionB.push(tile[0], tile[0], tile[1])
    attributes.isBase.push(0, 0, 1)
    attributes.adjacentIsBaseA.push(0, 1, 0)
    attributes.adjacentIsBaseB.push(1, 0, 0)
    attributes.position.push(tile[1], tile[1], tile[0])
    attributes.adjacentPositionA.push(tile[1], tile[0], tile[1])
    attributes.adjacentPositionB.push(tile[0], tile[1], tile[1])
    attributes.isBase.push(0, 1, 1)
    attributes.adjacentIsBaseA.push(1, 1, 0)
    attributes.adjacentIsBaseB.push(1, 0, 1)

    // side B face
    attributes.position.push(tile[2], tile[1], tile[2])
    attributes.adjacentPositionA.push(tile[1], tile[2], tile[2])
    attributes.adjacentPositionB.push(tile[2], tile[2], tile[1])
    attributes.isBase.push(0, 0, 1)
    attributes.adjacentIsBaseA.push(0, 1, 0)
    attributes.adjacentIsBaseB.push(1, 0, 0)
    attributes.position.push(tile[1], tile[1], tile[2])
    attributes.adjacentPositionA.push(tile[1], tile[2], tile[1])
    attributes.adjacentPositionB.push(tile[2], tile[1], tile[1])
    attributes.isBase.push(0, 1, 1)
    attributes.adjacentIsBaseA.push(1, 1, 0)
    attributes.adjacentIsBaseB.push(1, 0, 1)

    // side C face
    attributes.position.push(tile[2], tile[0], tile[2])
    attributes.adjacentPositionA.push(tile[0], tile[2], tile[2])
    attributes.adjacentPositionB.push(tile[2], tile[2], tile[0])
    attributes.isBase.push(0, 0, 1)
    attributes.adjacentIsBaseA.push(0, 1, 0)
    attributes.adjacentIsBaseB.push(1, 0, 0)
    attributes.position.push(tile[0], tile[0], tile[2])
    attributes.adjacentPositionA.push(tile[0], tile[2], tile[0])
    attributes.adjacentPositionB.push(tile[2], tile[0], tile[0])
    attributes.isBase.push(0, 1, 1)
    attributes.adjacentIsBaseA.push(1, 1, 0)
    attributes.adjacentIsBaseB.push(1, 0, 1)
  }

  // debuggggg
  // attributes.position.slice(0, 21).forEach((pos, i) => {
  //   function getPos (p, isBase) {
  //     if (isBase) return [p[0], p[1], 0]
  //     return p
  //   }
  //   pos = getPos(pos, attributes.isBase[i])
  //   const adjPosA = getPos(attributes.adjacentPositionA[i], attributes.adjacentIsBaseA[i])
  //   const adjPosB = getPos(attributes.adjacentPositionB[i], attributes.adjacentIsBaseB[i])
  //   console.log(pos, adjPosA, adjPosB, getNormal([], pos, adjPosA, adjPosB))
  // })

  drawTriangles = regl({
    vert: glslify.file('./shaders/boorish-trellis.vert'),
    frag: glslify.file('./shaders/simple.frag'),
    attributes: attributes,
    count: attributes.position.length
  })
}

const drawGlobal = regl({
  uniforms: {
    projection: ({ viewportWidth, viewportHeight }) => (
      mat4.perspective([],
        Math.PI / 8,
        viewportWidth / viewportHeight,
        0.01,
        1000)
    ),
    view: () => camera.matrix,
    lightSource: [5, 5, 5],
    tick: ({ tick }) => tick,
    tileHeight: () => settings.tileHeight
  },

  primitive: 'triangles'
})

regl.frame(({ time }) => {
  regl.clear({
    color: [0.95, 0.95, 0.95, 1],
    depth: 1
  })
  camera.tick()
  camera.up = [camera.up[0], camera.up[1], 999]
  if (settings.roam) {
    camera.center = [
      Math.sin(time / 4) * 1.5,
      Math.cos(time / 4) * 1.5,
      Math.sin(time / 4) * 1.5
    ]
  }
  drawGlobal(() => drawTriangles())
})

// ------------- helpers -------------

function guiSettings (settings, onChange) {
  const settingsObj = {}
  const gui = new GUI()
  for (const key in settings) {
    settingsObj[key] = settings[key][0]
    const setting = gui
      .add(settingsObj, key, settings[key][1], settings[key][2])
    if (settings[key][3]) {
      setting.step(settings[key][3])
    }
    if (settings[key][4]) {
      setting.onChange(onChange)
    }
  }
  return settingsObj
}

function title (name, color) {
  includeFont({
    fontFamily: '"Space Mono", sans-serif',
    url: 'https://fonts.googleapis.com/css?family=Space+Mono:700'
  })

  const title = addTitle(name)
  css(title, {
    opacity: 0,
    color: color,
    bottom: '5vh',
    right: '5vh',
    transition: 'opacity 800ms linear',
    zIndex: 10
  })

  document.body.appendChild(title)
  setTimeout(() => {
    css(title, 'opacity', 1)
  }, 200)
}
