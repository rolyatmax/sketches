const canvasSketch = require('canvas-sketch')
const createRegl = require('regl')
const { GUI } = require('dat-gui')
const { random } = require('canvas-sketch-util')
const createRoamingCamera = require('./common/create-roaming-camera')
const mat4 = require('gl-mat4')
const vec3 = require('gl-vec3')
const d3Color = require('d3-color')

// ///////////////////////////////////
// TODO:
//  * USE SPRING ANIMATIONS
//  * (FIX SPRING ANIMATIONS TO MAKE MORE INTERRUPTIBLE)
//  * FIX ROAMING CAMERA TO CHANGE POSITION EVERY N FRAMES
//      (not seconds) AND MAKE CONFIGURABLE
// ///////////////////////////////////

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
  lightness: 50,
  dampening: 0.1,
  stiffness: 0.1
}

let drawCircles, setup, animator
let moveToNextPosition = () => {}
let rand = random.createRandom(settings.seed)
let lastTime = 0
let curTime = 0

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
gui.add(settings, 'dampening', 0, 2).step(0.01).onChange(setup)
gui.add(settings, 'stiffness', 0, 2).step(0.01).onChange(setup)

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
    moveEveryNFrames: 300,
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
    extensions: ['OES_standard_derivatives', 'OES_texture_float']
  })

  setup = function setup () {
    rand = random.createRandom(settings.seed)
    const offset1 = rand.insideSphere(500)
    const points = new Array(settings.pointCount).fill(null).map(() => {
      const position = rand.onSphere()
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
      const hue = (v * 0.5 + 0.5) * settings.hueSpread + settings.hueStart
      const { r, g, b } = d3Color.rgb(`hsl(${hue}, ${settings.saturation}%, ${settings.lightness}%)`)
      const timeOffset = rand.noise3D(x + offset1[0] + 1000, y + offset1[1] + 1000, z + offset1[2] + 1000, settings.freq)
      return {
        position: position,
        size: rand.range(0.5, settings.pointSize),
        color: [r, g, b].map(v => v / 255),
        offset: vec3.add([], position, velocity),
        timeOffset: (timeOffset * 0.5 + 0.75) * 1000
      }
    })

    animator = createStateTransitioner(regl, points)

    drawCircles = regl({
      vert: `
        precision highp float;
        attribute vec3 position;
        attribute vec3 offset;
        attribute float size;
        attribute vec3 color;
        attribute vec2 stateIndex;

        uniform mat4 projection;
        uniform mat4 view;
        uniform sampler2D animatingStateTexture;
        varying vec3 pointColor;

        void main() {
          vec4 curState = texture2D(animatingStateTexture, stateIndex);
          float t = curState.x;
          vec3 vel = offset * t;
          gl_Position = projection * view * vec4(position + vel, 1);
          gl_PointSize = size;
          pointColor = color;
        }
      `,
      frag: `
        #extension GL_OES_standard_derivatives : enable
        precision highp float;
        varying vec3 pointColor;
        void main() {
          vec2 cxy = 2.0 * gl_PointCoord - 1.0;
          float r = dot(cxy, cxy);
          float delta = fwidth(r);
          float alpha = 1.0 - smoothstep(1.0 - delta, 1.0 + delta, r);
          if (r > 1.0) {
            discard;
          }
          gl_FragColor = vec4(pointColor * alpha, alpha);
        }
      `,
      uniforms: {
        view: camera.getMatrix,
        projection: projection,
        animatingStateTexture: regl.prop('animatingStateTexture')
      },
      attributes: {
        position: points.map(p => p.position),
        size: points.map(p => p.size),
        color: points.map(p => p.color),
        offset: points.map(p => p.offset),
        timeOffset: points.map(p => p.timeOffset),
        stateIndex: animator.getStateIndexes()
      },
      blend: {
        enable: true,
        func: {
          srcRGB: 'src alpha',
          srcAlpha: 'src alpha', // 1,
          dstRGB: 'one minus src alpha',
          dstAlpha: 'one minus src alpha' // 1
        },
        equation: {
          rgb: 'add',
          alpha: 'add'
        }
      },
      primitive: 'points',
      count: points.length
    })
    lastTime = 0
    curTime = 0
  }

  setup()

  return ({ time }) => {
    regl.poll()
    curTime += time - lastTime

    camera.tick()
    animator.tick({
      time: curTime,
      dampening: settings.dampening,
      stiffness: settings.stiffness
    })

    regl.clear({
      color: [1.0, 1.0, 1.0, 1.0],
      depth: 1
    })

    drawCircles({
      animatingStateTexture: animator.getStateTexture()
    })
  }
}

canvasSketch(sketch, {
  animate: true,
  context: 'webgl',
  attributes: { antialias: true },
  dimensions: [SIZE, SIZE]
})

function createStateTransitioner (regl, data) {
  let [
    prevAnimatingStateTexture,
    curAnimatingStateTexture,
    nextAnimatingStateTexture
  ] = createAnimatingStateTextures(data, () => ([
    0, // animation t value
    0, // empty slot
    0, // empty slot
    0 // empty slot
  ]))

  const { stateIndexes, metadataTexture } = createMetadataStateTexture(data, pt => ([
    pt.timeOffset,
    0, // empty slot
    0, // empty slot
    0 // empty slot
  ]))

  const updateState = regl({
    framebuffer: () => nextAnimatingStateTexture,

    vert: `
    precision mediump float;
    attribute vec2 position;
    varying vec2 stateIndex;
    void main() {
      stateIndex = 0.5 * (1.0 + position);
      gl_Position = vec4(position, 0, 1);
    }
    `,

    frag: `
    precision mediump float;

    uniform sampler2D curAnimatingStateTexture;
    uniform sampler2D prevAnimatingStateTexture;
    uniform sampler2D metadataTexture;

    uniform float time;
    uniform float dampening;
    uniform float stiffness;

    varying vec2 stateIndex;

    float getNextValue(float cur, float prev, float dest) {
      float velocity = cur - prev;
      float delta = dest - cur;
      float spring = delta * stiffness;
      float damper = velocity * -1.0 * dampening;
      return spring + damper + velocity + cur;
    }

    void main() {
      vec4 curState = texture2D(curAnimatingStateTexture, stateIndex);
      vec4 prevState = texture2D(prevAnimatingStateTexture, stateIndex);
      vec4 metadata = texture2D(metadataTexture, stateIndex);

      // TODO: MAKE LOGIC CUSTOMIZABLE
      float timeOffset = metadata.x;

      bool isAnimating = time > timeOffset;

      float destT = isAnimating ? 1.0 : 0.0;

      float t = getNextValue(curState.x, prevState.x, destT);

      gl_FragColor = vec4(t, 0.0, 0.0, 0.0);
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
      curAnimatingStateTexture: () => curAnimatingStateTexture,
      prevAnimatingStateTexture: () => prevAnimatingStateTexture,
      metadataTexture: metadataTexture,
      time: regl.prop('time'),
      dampening: regl.prop('dampening'),
      stiffness: regl.prop('stiffness')
    },

    count: 4,
    primitive: 'triangle strip'
  })

  function getStateIndexes () {
    return stateIndexes
  }

  function tick (context) {
    cycleStates()
    // TODO: make these params of createStateTransitioner
    updateState({
      time: context.time,
      dampening: context.dampening,
      stiffness: context.stiffness
    })
  }

  function getStateTexture () {
    return curAnimatingStateTexture
  }

  return {
    tick,
    getStateTexture,
    getStateIndexes
  }

  function createAnimatingStateTextures (data, getInitialAnimatingValues) {
    const stateTextureSize = Math.ceil(Math.sqrt(data.length))
    const stateTextureLength = stateTextureSize * stateTextureSize
    const initialState = new Float32Array(stateTextureLength * 4)
    data.forEach((datum, i) => {
      const [x, y, z, w] = getInitialAnimatingValues(datum, i)
      initialState[i * 4 + 0] = x
      initialState[i * 4 + 1] = y
      initialState[i * 4 + 2] = z
      initialState[i * 4 + 3] = w
    })
    return [
      createStateBuffer(initialState, stateTextureSize),
      createStateBuffer(initialState, stateTextureSize),
      createStateBuffer(initialState, stateTextureSize)
    ]
  }

  function createMetadataStateTexture (data, getSlotValues) {
    const stateTextureSize = Math.ceil(Math.sqrt(data.length))
    const stateTextureLength = stateTextureSize * stateTextureSize
    const metadata = new Float32Array(stateTextureLength * 4)
    const stateIndexes = data.map((datum, j) => {
      const [x, y, z, w] = getSlotValues(datum, j)
      metadata[j * 4 + 0] = x
      metadata[j * 4 + 1] = y
      metadata[j * 4 + 2] = z
      metadata[j * 4 + 3] = w

      const stateIndexX = j % stateTextureSize
      const stateIndexY = j / stateTextureSize | 0
      return [stateIndexX / stateTextureSize, stateIndexY / stateTextureSize]
    })
    const metadataTexture = createStateBuffer(metadata, stateTextureSize)
    return { stateIndexes, metadataTexture }
  }

  function createStateBuffer (initialState, textureSize) {
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
    const tmp = prevAnimatingStateTexture
    prevAnimatingStateTexture = curAnimatingStateTexture
    curAnimatingStateTexture = nextAnimatingStateTexture
    nextAnimatingStateTexture = tmp
  }
}
