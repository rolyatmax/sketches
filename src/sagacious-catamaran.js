const Alea = require('alea')
const SimplexNoise = require('simplex-noise')
const { GUI } = require('dat-gui')
const Delaunator = require('delaunator')
const createRegl = require('regl')
const fit = require('canvas-fit')
const mat4 = require('gl-mat4')
const vec2 = require('gl-vec2')
// const vec3 = require('gl-vec3')
// const getNormal = require('get-plane-normal')
const createCamera = require('3d-view-controls')
// const array = require('new-array')

const canvas = document.createElement('canvas')
const camera = createCamera(canvas)
const regl = createRegl({
  extensions: 'OES_texture_float',
  canvas: canvas
})

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
  points: [80, 24, 50000, 1, true],
  minPtDistance: [0.5, 0.01, 0.5, 0.01, true],
  maxTileSideLen: [1, 0.001, 1, 0.001, true],
  roam: [false]
}, setup)

let drawTriangles, tileManager
setup()
function setup () {
  const rand = new Alea(settings.seed)
  const simplex = new SimplexNoise(rand)

  // create points
  const points = []
  // let failedTries = 0
  // const squaredMinDist = settings.minPtDistance * settings.minPtDistance
  // while (points.length < settings.points && failedTries < 50) {
  //   const rads = rand() * Math.PI * 2
  //   const mag = Math.pow(rand(), 0.5) / 2
  //   const x = Math.cos(rads) * mag
  //   const y = Math.sin(rads) * mag
  //   let failed = false
  //   for (let pt of points) {
  //     if (vec2.squaredDistance(pt, [x, y]) < squaredMinDist) {
  //       failed = true
  //       break
  //     }
  //   }
  //   if (!failed) {
  //     points.push([x, y])
  //   } else {
  //     failedTries += 1
  //   }
  // }
  const rowCount = Math.ceil(Math.sqrt(settings.points))
  let x = rowCount
  while (x--) {
    let y = rowCount
    while (y--) {
      points.push([
        x / rowCount * 2 - 1,
        y / rowCount * 2 - 1
      ])
    }
  }

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
    const upperCorner = [
      Math.min(pt1[0], pt2[0], pt3[0]),
      Math.min(pt1[1], pt2[1], pt3[1])
    ]
    const height = simplex.noise2D(upperCorner[0], upperCorner[1]) / 5
    if (rand() < 0.4) { continue }
    tiles.push([
      [pt1[0], pt1[1], height],
      [pt2[0], pt2[1], height],
      [pt3[0], pt3[1], height]
    ])
  }

  tileManager = createTileManager(regl, tiles, settings)

  // convert tiles into triangles into vertex attributes
  const attributes = {
    tileIndex: [],
    pointIndex: [],
    order: []
  }
  for (let i = 0; i < tiles.length; i++) {
    // top face
    attributes.tileIndex.push(i, i, i)
    attributes.order.push(0, 1, 2)
    attributes.pointIndex.push(
      0, 1, 2,
      2, 0, 1,
      1, 2, 0
    )

    // side A face
    attributes.tileIndex.push(i, i, i)
    attributes.order.push(0, 1, 2)
    attributes.pointIndex.push(
      0, 5, 3,
      3, 0, 5,
      5, 3, 0
    )

    attributes.tileIndex.push(i, i, i)
    attributes.order.push(0, 1, 2)
    attributes.pointIndex.push(
      0, 2, 5,
      5, 0, 2,
      2, 5, 0
    )

    // side B face
    attributes.tileIndex.push(i, i, i)
    attributes.order.push(0, 1, 2)
    attributes.pointIndex.push(
      2, 4, 5,
      5, 2, 4,
      4, 5, 2
    )
    attributes.tileIndex.push(i, i, i)
    attributes.order.push(0, 1, 2)
    attributes.pointIndex.push(
      2, 1, 4,
      4, 2, 1,
      1, 4, 2
    )

    // side C face
    attributes.tileIndex.push(i, i, i)
    attributes.order.push(0, 1, 2)
    attributes.pointIndex.push(
      1, 3, 4,
      4, 1, 3,
      3, 4, 1
    )
    attributes.tileIndex.push(i, i, i)
    attributes.order.push(0, 1, 2)
    attributes.pointIndex.push(
      1, 0, 3,
      3, 1, 0,
      0, 3, 1
    )
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
    vert: `
    attribute float tileIndex;
    attribute vec3 pointIndex;
    attribute float order;

    varying vec4 fragColor;
    varying vec3 barycentricCoords;

    uniform mat4 projection;
    uniform mat4 view;
    uniform vec3 lightSource;
    uniform float tick;
    uniform float textureSize;
    uniform sampler2D tileState;

    vec3 getNormal(vec3 pt1, vec3 pt2, vec3 pt3) {
      vec3 normal = cross(pt1 - pt2, pt2 - pt3);
      return normalize(normal);
    }

    vec3 calculatePosition(vec3 position, bool isBase) {
      float z;
      if (isBase) {
        z = 0.0;
      } else {
        z = clamp(position.z, 0.0, 1.0);
        // z = sin(position.z * 10.0 + tick / 200.0) * 0.1 + 0.02;
        // z = clamp(z, 0.0, 1.0);
      }
      return vec3(position.xy, z);
    }

    // should prob use ints in here?
    vec3 getPositionFromTexture (float tileNumber, float pointNumber) {
      float index = tileNumber * 3.0 + mod(pointNumber, 3.0);
      float xLookup = mod(index, textureSize);
      float yLookup = floor(index / textureSize);
      vec2 lookup = vec2(
        xLookup / textureSize,
        yLookup / textureSize
      );
      vec4 point = texture2D(tileState, lookup);
      return point.xyz;
    }

    void main() {
      vec3 position = getPositionFromTexture(tileIndex, pointIndex.x);
      vec3 adjacentPositionA = getPositionFromTexture(tileIndex, pointIndex.y);
      vec3 adjacentPositionB = getPositionFromTexture(tileIndex, pointIndex.z);

      vec3 computedPosition = calculatePosition(position, pointIndex.x > 2.0);
      vec3 computedAdjacentA = calculatePosition(adjacentPositionA, pointIndex.y > 2.0);
      vec3 computedAdjacentB = calculatePosition(adjacentPositionB, pointIndex.z > 2.0);
      // if all zs are 0, let's throw this triangle away
      if (computedPosition.z == 0.0 && computedAdjacentA.z == 0.0 && computedAdjacentB.z == 0.0) {
        computedPosition = vec3(0);
      }

      vec3 normal = getNormal(computedPosition, computedAdjacentA, computedAdjacentB);
      vec3 lightDirection = normalize(lightSource - position);

      // do something with the dotProduct to figure out shading
      vec3 color = vec3(0.95, 0.95, 0.95);
      if (abs(normal.z) < 0.0001) {
        vec3 blue = vec3(0.67, 0.76, 0.9);
        // vec3 green = vec3(0.52, 0.8, 0.56);
        vec3 purple = vec3(0.55, 0.51, 0.8);
        vec3 white = vec3(0.95);
        float a = smoothstep(0.0, 1.0, abs(dot(vec2(0, 1), normal.xy)));
        color = mix(purple, blue, a);
        color = mix(color, white, computedPosition.z);
      }
      barycentricCoords = vec3(0, 0, 1);
      if (order == 0.0) {
        barycentricCoords = vec3(0, 1, 0);
      }
      if (order == 1.0) {
        barycentricCoords = vec3(1, 0, 0);
      }

      // ignore sides
      // if (computedPosition.z == 0.0 || computedAdjacentA.z == 0.0 || computedAdjacentB.z == 0.0) {
      //   barycentricCoords = vec3(1, 1, 1);
      // }

      fragColor = vec4(color, 1.0);
      gl_Position = projection * view * vec4(computedPosition, 1.0);
    }
    `,

    frag: `
    precision highp float;

    varying vec4 fragColor;
    varying vec3 barycentricCoords;

    uniform float wireframeSize;

    void main() {
      if (barycentricCoords.x < wireframeSize || barycentricCoords.y < wireframeSize || barycentricCoords.z < wireframeSize) {
        vec3 gray = vec3(0.3, 0.3, 0.3);
        gl_FragColor = fragColor;
      } else {
        discard;
        // gl_FragColor = vec4(0);
      }
    }
    `,
    attributes: attributes,
    count: attributes.tileIndex.length
  })
}

const drawGlobal = regl({
  uniforms: {
    projection: ({viewportWidth, viewportHeight}) => (
      mat4.perspective([],
        Math.PI / 8,
        viewportWidth / viewportHeight,
        0.01,
        1000)
    ),
    view: () => camera.matrix,
    lightSource: [5, 5, 5],
    tick: ({ tick }) => tick,
    tileState: () => tileManager.getStateTexture(),
    textureSize: () => tileManager.getTextureSize(),
    wireframeSize: ({ tick }) => 0.05// Math.sin(tick / 50) / 8 + 0.15
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
  tileManager.tick()
  if (settings.roam) {
    camera.center = [
      Math.sin(time / 4) * 2.5 + 2.5,
      Math.cos(time / 4) * 2.5 + 2.5,
      (Math.sin(time / 4) + 1.5) * 2.5
    ]
  }
  drawGlobal(() => drawTriangles())
})

function createTileManager (regl, tiles, settings) {
  // each tile in tiles is an array of 3 vec3 positions (each tile is a triangle)
  const tileStateTextureSize = Math.ceil(Math.sqrt(tiles.length * 3))
  console.log(`texture size: ${tileStateTextureSize} x ${tileStateTextureSize} for ${tiles.length} tiles`)
  const tileStateTextureLength = tileStateTextureSize * tileStateTextureSize
  const initialTileState = new Float32Array(tileStateTextureLength * 4)
  for (let i = 0; i < tiles.length; ++i) {
    const [point1, point2, point3] = tiles[i]
    // point 1
    initialTileState[i * 12] = point1[0] // x
    initialTileState[i * 12 + 1] = point1[1] // y
    initialTileState[i * 12 + 2] = point1[2] // z
    initialTileState[i * 12 + 3] = 0 // nothing

    // point 2
    initialTileState[i * 12 + 4] = point2[0] // x
    initialTileState[i * 12 + 5] = point2[1] // y
    initialTileState[i * 12 + 6] = point2[2] // z
    initialTileState[i * 12 + 7] = 0 // nothing

    // point 3
    initialTileState[i * 12 + 8] = point3[0] // x
    initialTileState[i * 12 + 9] = point3[1] // y
    initialTileState[i * 12 + 10] = point3[2] // z
    initialTileState[i * 12 + 11] = 0 // nothing
  }

  let prevTileStateTexture = createStateBuffer(initialTileState, tileStateTextureSize)
  let curTileStateTexture = createStateBuffer(initialTileState, tileStateTextureSize)
  let nextTileStateTexture = createStateBuffer(initialTileState, tileStateTextureSize)

  const dampening = 1.0
  const stiffness = 0.1

  let height = 0.5
  document.body.addEventListener('click', e => { height = Math.random() })

  const updateState = regl({
    framebuffer: () => nextTileStateTexture,

    vert: `
    precision mediump float;

    attribute vec2 position;

    varying vec2 tileStateIndex;

    void main() {
      // map bottom left -1,-1 (normalized device coords) to 0,0 (particle texture index)
      // and 1,1 (ndc) to 1,1 (texture)
      tileStateIndex = 0.5 * (1.0 + position);
      gl_Position = vec4(position, 0, 1);
    }
    `,

    frag: `
    precision mediump float;

    uniform sampler2D curTileStateTexture;
    uniform sampler2D prevTileStateTexture;
    // uniform sampler2D tripMetaDataTexture;

    uniform float dampening;
    uniform float stiffness;
    uniform float height;

    varying vec2 tileStateIndex;

    float getNextValue(float cur, float prev, float dest, float s, float d) {
      float velocity = clamp(0.0, 0.02, cur - prev);
      float delta = dest - cur;
      float spring = delta * s;
      float damper = velocity * -1.0 * d;
      return spring + damper + velocity + cur;
    }

    void main() {
      vec4 curState = texture2D(curTileStateTexture, tileStateIndex);
      vec4 prevState = texture2D(prevTileStateTexture, tileStateIndex);

      // float i = cos(height * 20.0 + tileStateIndex.y * 2.0) / 5.0;
      // float j = sin(height * 50.0 + tileStateIndex.y * 3.0) / 5.0;
      float h = sin(height * 30.0 + tileStateIndex.y * 3.0) + 1.0;

      float x = getNextValue(curState.x, prevState.x, curState.x, stiffness, dampening);
      float y = getNextValue(curState.y, prevState.y, curState.y, stiffness, dampening);
      float z = getNextValue(curState.z, prevState.z, h / 5.0, stiffness, dampening * pow(length(curState.xy), 1.1));

      gl_FragColor = vec4(x, y, z, 0.0);
    }
    `,

    attributes: {
      position: [
        -1, -1,
        1, -1,
        -1, 1,
        1, 1
      ]
    },

    uniforms: {
      curTileStateTexture: () => curTileStateTexture,
      prevTileStateTexture: () => prevTileStateTexture,
      // tileMetaDataTexture: tileMetaDataTexture,
      dampening: dampening,
      stiffness: stiffness,
      height: () => height
    },

    count: 4,
    primitive: 'triangle strip'
  })

  function tick (context) {
    cycleStates()
    updateState()
  }

  function getStateTexture () {
    return curTileStateTexture
  }

  function getTextureSize () {
    return tileStateTextureSize
  }

  return {
    tick,
    getTextureSize,
    getStateTexture
  }

  function createStateBuffer (initialState, textureSize) {
    console.log(initialState)
    const initialTexture = regl.texture({
      data: initialState,
      shape: [textureSize, textureSize, 4],
      type: 'float'
    })
    return regl.framebuffer({
      color: initialTexture,
      depth: false,
      stencil: false
    })
  }

  function cycleStates () {
    const tmp = prevTileStateTexture
    prevTileStateTexture = curTileStateTexture
    curTileStateTexture = nextTileStateTexture
    nextTileStateTexture = tmp
  }
}

// ------------- helpers -------------

function guiSettings (settings, onChange) {
  const settingsObj = {}
  const gui = new GUI()
  for (let key in settings) {
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
