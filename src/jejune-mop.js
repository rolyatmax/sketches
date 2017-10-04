const createRegl = require('regl')
const glsl = require('glslify')
const mat4 = require('gl-mat4')
const createCamera = require('3d-view-controls')
const css = require('dom-css')
const fit = require('canvas-fit')
const { GUI } = require('dat-gui')
const array = require('new-array')
const Alea = require('alea')
import includeFont from './common/include-font'
import addTitle from './common/add-title'

title('jejune-mop', '#555')

const canvas = document.body.appendChild(document.createElement('canvas'))
window.addEventListener('resize', fit(canvas), false)
const camera = window.camera = createCamera(canvas)
const regl = createRegl({
  extensions: 'OES_texture_float',
  canvas: canvas
})

camera.zoomSpeed = 4
camera.lookAt(
  [2.5, 2.5, 2.5],
  [0, 0, 0.5],
  [0.52, -0.11, 50]
)

const blurredFbo = regl.framebuffer({
  color: regl.texture({
    shape: [canvas.width, canvas.height, 4]
  }),
  depth: false,
  stencil: false
})
const renderToBlurredFBO = regl({ framebuffer: blurredFbo })
const renderBlur = createRenderBlur()
const renderBloom = createRenderBloom()
// const renderBackground = createBackgroundGradient()

let stateManager, rand, render

const settings = guiSettings({
  seed: [0, 0, 9999, 1, true],
  points: [120000, 10, 500000, 1, true],
  speed: [5, 0, 20, 1],
  decay: [999, 975, 1000, 1],
  wind: [200, 0, 400, 1],
  powDist: [0.4, -1, 5, 0.01],
  pointSize: [7.3, 0, 15, 0.1],
  blurMag: [2, 0, 20, 1],
  blurWeight: [1.4, 0, 2, 0.01],
  originalWeight: [1.7, 0, 2, 0.01],
  bloom: [true],
  roam: [true],
  playing: [true]
}, setup)

function setup () {
  rand = new Alea(settings.seed)
  stateManager = createStateManager(regl, settings)

  const entropies = new Float32Array(settings.points)

  array(settings.points).forEach((_, i) => {
    entropies[i] = rand()
  })

  render = regl({
    vert: glsl`
      attribute vec2 textureIndex;
      attribute float entropy;

      uniform sampler2D stateTexture;
      uniform mat4 projection;
      uniform mat4 view;
      uniform vec3 cameraEye;
      uniform float pointSize;
      uniform float time;
      uniform float blinkSpeed;

      varying vec4 fragColor;

      void main() {
        vec4 pointState = texture2D(stateTexture, textureIndex);
        vec3 position = pointState.xyz;
        float size = pointState.w;
        float intensity = clamp((sin(entropy * 3.1415 * 1.85 + time * blinkSpeed) - 0.8) * 5.0, 0.18, 1.0);
        float distToCamera = distance(cameraEye, position);
        gl_PointSize = (pointSize - distToCamera) * size;
        fragColor = vec4(vec3(intensity), (1.0 - distToCamera / pointSize));
        gl_Position = projection * view * vec4(position, 1);
      }
    `,
    frag: glsl`
      precision highp float;
      varying vec4 fragColor;
      void main() {
        gl_FragColor = fragColor;
      }
    `,
    attributes: {
      textureIndex: stateManager.getStateIndexes(),
      entropy: entropies
    },
    uniforms: {
      stateTexture: regl.prop('stateTexture'),
      projection: ({viewportWidth, viewportHeight}) => mat4.perspective(
        [],
        Math.PI / 4,
        viewportWidth / viewportHeight,
        0.01,
        1000
      ),
      view: () => camera.matrix,
      cameraEye: () => camera.eye,
      pointSize: () => settings.pointSize,
      time: ({ time }) => time,
      blinkSpeed: 1
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
    count: settings.points,
    primitive: 'points'
  })
}

setup()
regl.frame(({ time }) => {
  camera.tick()
  camera.up = [camera.up[0], camera.up[1], 999]
  if (settings.roam) {
    camera.center = [
      Math.sin(time / 4) * 2.5,
      Math.cos(time / 4) * 4.5,
      (Math.sin(time / 4) * 0.5 + 0.5) * 3 - 0.2
    ]
  }
  if (settings.playing) {
    stateManager.tick()
  }
  renderToBlurredFBO(() => {
    regl.clear({
      color: [0.18, 0.18, 0.18, 1],
      depth: 1
    })
    // renderBackground()
    render({
      stateTexture: stateManager.getStateTexture()
    })
  })
  if (settings.bloom) {
    renderBloom({ iChannel0: blurredFbo })
  } else {
    renderBlur({ iChannel0: blurredFbo, direction: [0, 0] })
  }
})

// ///// helpers (to abstract down the line?) //////

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

function guiSettings (settings, onChange) {
  const settingsObj = {}
  const gui = new GUI()
  css(gui.domElement.parentElement, { zIndex: 11 })
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

function createRenderBlur () {
  return regl({
    vert: glsl`
      precision highp float;

      attribute vec2 position;

      void main() {
        gl_Position = vec4(position, 0, 1);
      }
    `,
    frag: glsl`
      precision highp float;

      uniform vec2 iResolution;
      uniform sampler2D iChannel0;
      uniform vec2 direction;

      #pragma glslify: blur = require(glsl-fast-gaussian-blur/13)

      void main() {
        vec2 uv = vec2(gl_FragCoord.xy / iResolution.xy);
        vec2 perpendicularDirection = vec2(direction.x * -1.0, direction.y);
        vec4 pixel1 = blur(iChannel0, uv, iResolution.xy, direction);
        vec4 pixel2 = blur(iChannel0, uv, iResolution.xy, perpendicularDirection);
        gl_FragColor = mix(pixel1, pixel2, 0.5);
      }
    `,
    uniforms: {
      iResolution: ({viewportWidth, viewportHeight}) => [viewportWidth, viewportHeight],
      iChannel0: regl.prop('iChannel0'), // sampler2D
      direction: regl.prop('direction')
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
}

function createRenderBloom () {
  const blueTextureBuffer = new Uint8Array(canvas.width * canvas.height * 4)
  for (let i = 0; i < blueTextureBuffer.length; i += 4) {
    const x = i / 4 % canvas.width
    const y = i / 4 / canvas.width | 0
    if (x > 100 && y > 100) {
      blueTextureBuffer[i] = blueTextureBuffer[i + 1] = 0
      blueTextureBuffer[i + 2] = blueTextureBuffer[i + 3] = 255
    } else {
      blueTextureBuffer[i] = blueTextureBuffer[i + 1] = blueTextureBuffer[i + 2] = Math.random() * 255 | 0
      blueTextureBuffer[i + 3] = 255
    }
  }
  const tempFbo = regl.framebuffer({
    color: regl.texture({
      shape: [canvas.width, canvas.height, 4],
      data: blueTextureBuffer
    }),
    depth: true,
    stencil: false
  })

  const renderBloomBlur = regl({
    vert: glsl`
      precision highp float;

      attribute vec2 position;

      varying vec2 uv;

      void main() {
        uv = position / 2.0 + 0.5;
        gl_Position = vec4(position, 0, 1);
      }
    `,
    frag: glsl`
      precision highp float;

      varying vec2 uv;

      uniform vec2 iResolution;
      uniform sampler2D iChannel0;
      uniform float blurMag;

      vec3 tex(vec2 uv);

      #pragma glslify: blur = require('glsl-hash-blur', sample=tex, iterations=20);

      vec3 tex(vec2 uv) {
        vec3 rgb = texture2D(iChannel0, uv).rgb;
        return rgb;
      }

      void main() {
        float aspect = iResolution.x / iResolution.y;
        vec3 blurred = blur(uv, blurMag / 200.0, 1.0 / aspect);
        gl_FragColor = vec4(blurred, 0.8);
      }
    `,
    uniforms: {
      iResolution: () => [canvas.width, canvas.height],
      iChannel0: regl.prop('iChannel0'), // sampler2D
      blurMag: () => settings.blurMag
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

  const renderBloomCombine = regl({
    vert: glsl`
      precision highp float;

      attribute vec2 position;

      varying vec2 uv;

      void main() {
        uv = position / 2.0 + 0.5;
        gl_Position = vec4(position, 0, 1);
      }
    `,
    frag: glsl`
      precision highp float;

      varying vec2 uv;

      uniform sampler2D iChannel0;
      uniform sampler2D blurredFrame;
      uniform float blurWeight;
      uniform float originalWeight;

      void main () {
        vec4 blurred = texture2D(blurredFrame, uv);
        vec4 original = texture2D(iChannel0, uv);
        if (blurred.r < 0.2 && original.r < 0.2) {
          gl_FragColor = original;
        } else {
          blurred.r = pow(blurred.r, 1.9);
          blurred.g = pow(blurred.g, 2.0);
          blurred.b = pow(blurred.b, 1.5);
          vec4 result = original * originalWeight + blurred * blurWeight;
          gl_FragColor = vec4(result.rgb / 1.5, result.a);
        }
      }
    `,
    uniforms: {
      iChannel0: regl.prop('iChannel0'), // sampler2D
      blurredFrame: regl.prop('blurredFrame'), // sampler2D
      blurWeight: () => settings.blurWeight,
      originalWeight: () => settings.originalWeight
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

  return function render ({ iChannel0 }) {
    regl({ framebuffer: tempFbo })(() => {
      regl.clear({
        color: [0.18, 0.18, 0.18, 1],
        depth: 1
      })
      renderBloomBlur({ iChannel0 })
    })
    renderBloomCombine({ iChannel0, blurredFrame: tempFbo })
  }
}

function createStateManager (regl, settings) {
  const stateTextureSize = Math.ceil(Math.sqrt(settings.points))
  const stateTextureLength = stateTextureSize * stateTextureSize
  const initialState = new Float32Array(stateTextureLength * 4)
  for (let i = 0; i < stateTextureLength; ++i) {
    initialState[i * 4] = rand() * 2 - 1
    initialState[i * 4 + 1] = rand() * 2 - 1
    initialState[i * 4 + 2] = 0
    initialState[i * 4 + 3] = 0
  }

  const randomState = new Float32Array(stateTextureLength * 4)
  for (let i = 0; i < stateTextureLength; ++i) {
    randomState[i * 4] = rand()
    randomState[i * 4 + 1] = rand()
    randomState[i * 4 + 2] = rand()
    randomState[i * 4 + 3] = rand()
  }
  const randomTexture = createStateBuffer(randomState, stateTextureSize)
  let prevStateTexture = createStateBuffer(initialState, stateTextureSize)
  let curStateTexture = createStateBuffer(initialState, stateTextureSize)
  let nextStateTexture = createStateBuffer(initialState, stateTextureSize)

  const stateIndexes = []
  for (let j = 0; j < settings.points; j++) {
    const stateIndexX = j % stateTextureSize
    const stateIndexY = j / stateTextureSize | 0
    stateIndexes.push([stateIndexX / stateTextureSize, stateIndexY / stateTextureSize])
  }

  const updateState = regl({
    framebuffer: () => nextStateTexture,

    vert: glsl`
      precision mediump float;

      attribute vec2 position;

      varying vec2 textureIndex;

      void main() {
        // map bottom left -1,-1 (normalized device coords) to 0,0 (particle texture index)
        // and 1,1 (ndc) to 1,1 (texture)
        textureIndex = 0.5 * (1.0 + position);
        gl_Position = vec4(position, 0, 1);
      }
    `,

    frag: glsl`
      precision mediump float;

      uniform sampler2D curStateTexture;
      uniform sampler2D prevStateTexture;
      uniform sampler2D randomTexture;
      uniform float decay;
      uniform float powDist;
      uniform float noiseIntensity;
      uniform float time;
      uniform float speed;

      varying vec2 textureIndex;

      #pragma glslify: snoise3 = require(glsl-noise/simplex/3d)

      float rand(vec2 co){
        return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453);
      }

      vec4 newPoint(vec4 randomVal) {
        float angle = rand(randomVal.xy) * 3.1415 * 2.0;
        float mag = pow(rand(randomVal.zw), powDist);

        float x = cos(angle) * mag;
        float y = sin(angle) * mag;
        float z = 0.0;

        // set size 0 to indicate this is new
        return vec4(x, y, z, 0);
      }

      void main() {
        vec4 randomVal = texture2D(randomTexture, textureIndex);
        vec4 curState = texture2D(curStateTexture, textureIndex);
        vec3 curPosition = curState.xyz;
        vec4 prevState = texture2D(prevStateTexture, textureIndex);
        vec3 prevPosition = prevState.xyz;

        // if there's no size, it means this is a new one
        vec4 nextState;
        if (curState.w == 0.0) {
          vec3 nextPosition = curPosition + vec3(
            (rand(randomVal.xw) * 2.0 - 1.0) * 0.001 * speed / 10.0,
            (rand(randomVal.yw) * 2.0 - 1.0) * 0.001 * speed / 10.0,
            rand(randomVal.xz) * 0.005 * speed / 10.0
          );
          float mag = length(curState.xy);
          float nextSize = rand(randomVal.yz) * 1.5 * (1.5 - mag);
          nextState = vec4(nextPosition, nextSize);
        } else {
          vec3 velocity = (curPosition - prevPosition) * decay * 0.001;

          vec3 noiseAddition = vec3(snoise3(curPosition + vec3(time)), snoise3(curPosition + vec3(100) + vec3(time)), 0.1);
          noiseAddition *= noiseIntensity * 0.000001 * speed / 10.0;
          velocity += noiseAddition;

          vec3 nextPosition = curPosition + velocity;
          float nextSize = curState.w * decay * 0.001;

          float distToCenter = distance(nextPosition.xy, vec2(0));
          if (nextSize < 0.01 || pow(rand(nextPosition.xy), 0.4) < distToCenter * 0.2) {
            nextState = newPoint(randomVal);
          } else {
            nextState = vec4(nextPosition, nextSize);
          }
        }

        // we store the new position as the color in this frame buffer
        gl_FragColor = nextState;
      }
    `,

    uniforms: {
      curStateTexture: () => curStateTexture,
      prevStateTexture: () => prevStateTexture,
      randomTexture: () => randomTexture,
      decay: () => settings.decay,
      powDist: () => settings.powDist,
      noiseIntensity: () => settings.wind,
      time: ({ time }) => time,
      speed: () => settings.speed
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

  function getStateIndexes () {
    return stateIndexes
  }

  function tick () {
    cycleStates()
    updateState()
  }

  function getStateTexture () {
    return curStateTexture
  }

  return {
    tick,
    getStateTexture,
    getStateIndexes
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
    const tmp = prevStateTexture
    prevStateTexture = curStateTexture
    curStateTexture = nextStateTexture
    nextStateTexture = tmp
  }
}
