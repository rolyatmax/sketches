const createRegl = require('regl')
const glsl = require('glslify')
const mat4 = require('gl-mat4')
const createCamera = require('3d-view-controls')
const css = require('dom-css')
const fit = require('canvas-fit')
const { GUI } = require('dat-gui')
const array = require('new-array')
const shuffle = require('shuffle-array')
const Alea = require('alea')
const { createSpring } = require('spring-animator')
const Delaunator = require('delaunator')
import includeFont from './common/include-font'
import addTitle from './common/add-title'
const createAnalyser = require('web-audio-analyser')
const createAudioControls = require('./common/audio-controls')
const createAudioTrackSelector = require('./common/audio-track-selector')

title('platitudinous-blood', '#555')

const canvas = document.body.appendChild(document.createElement('canvas'))
window.addEventListener('resize', fit(canvas), false)
const camera = createCamera(canvas)
const regl = createRegl(canvas)

camera.zoomSpeed = 4
camera.lookAt(
  [2.5, 2.5, 2.5],
  [0, 0, 0],
  [0.52, -0.11, 50]
)

let analyser, delaunay, points, positions, positionsBuffer, renderFrequencies, renderGrid
const fbo = regl.framebuffer({
  color: regl.texture({
    shape: [512, 512, 4]
  }),
  depth: false,
  stencil: false
})
const blurredFbo = regl.framebuffer({
  color: regl.texture({
    shape: [512, 512, 4]
  }),
  depth: false,
  stencil: false
})
const renderToFBO = regl({ framebuffer: fbo })
const renderToBlurredFBO = regl({ framebuffer: blurredFbo })

const renderBlur = createRenderBlur()
const tracks = [
  'src/audio/06-666(upsidedowncross).mp3',
  'src/audio/09-45.mp3',
  'src/audio/01-22(Over_Soon).mp3',
  'src/audio/03-715-Creeks.mp3',
  'src/audio/05-29Strafford Apts.mp3',
  'src/audio/07-21Moon Water.mp3',
  'src/audio/re-stacks.mp3',
  'src/audio/04-33_GOD_.mp3',
  'src/audio/08-8(circle).mp3',
  'src/audio/10-1000000Million.mp3',
  'src/audio/02-10Death_Breast.mp3'
]
setupAudio(tracks).then((audioAnalyser) => {
  analyser = audioAnalyser
  setup()
  start()
})

const settings = guiSettings({
  seed: [0, 0, 9999, 1, true],
  points: [4000, 600, 6000, 1, true],
  dampening: [0.35, 0.01, 1, 0.01, true],
  stiffness: [0.55, 0.01, 1, 0.01, true],
  linesDampening: [0.02, 0.01, 1, 0.01, true],
  linesStiffness: [0.9, 0.01, 1, 0.01, true],
  linesAnimationOffset: [30, 0, 100, 1, true],
  freqPow: [1.7, 0.01, 3, 0.01],
  connectedNeighbors: [4, 0, 10, 1, true],
  neighborWeight: [0.99, 0, 1, 0.01],
  connectedBinsStride: [1, 1, 12, 1, true], // make this a numFrequencyNodes setting or something
  blurAngle: [0.25, 0, 1, 0.01],
  blurMag: [7, 0, 20, 1],
  blurRadius: [0.0001, 0, 0.5, 0.0001],
  gridLines: [100, 1, 200, 1, true],
  gridMaxHeight: [0.35, 0.01, 2, 0.01],
  roam: [true]
}, setup)

function setup () {
  const rand = new Alea(settings.seed)
  points = []

  renderGrid = createRenderGrid()

  // fill up the points list with the freqency-tracking nodes
  const frequenciesCount = analyser.frequencies().length // 1024
  for (let q = 0; q < frequenciesCount; q += settings.connectedBinsStride) {
    const mag = Math.pow(rand(), 1 - q / frequenciesCount) * 0.9
    const rads = rand() * Math.PI * 2
    const position = [
      Math.cos(rads) * mag,
      Math.sin(rads) * mag
      // rand() * 2 - 1,
      // rand() * 2 - 1
    ]
    const id = points.length
    const point = createPoint(id, position)
    point.frequencyBin = q
    points.push(point)
  }

  array(settings.points - points.length).forEach((_, i) => {
    const id = points.length
    points.push(createPoint(id, [rand() * 2 - 1, rand() * 2 - 1]))
  })

  function createPoint (id, position) {
    return {
      position: position,
      id: id,
      neighbors: new Set(), // gonna fill this up with the results of delaunay
      spring: createSpring(settings.dampening, settings.stiffness, 0)
    }
  }

  delaunay = new Delaunator(points.map((pt) => pt.position))
  for (let j = 0; j < delaunay.triangles.length; j += 3) {
    const pt1 = delaunay.triangles[j]
    const pt2 = delaunay.triangles[j + 1]
    const pt3 = delaunay.triangles[j + 2]

    points[pt1].neighbors.add(pt2)
    points[pt1].neighbors.add(pt3)
    points[pt2].neighbors.add(pt1)
    points[pt2].neighbors.add(pt3)
    points[pt3].neighbors.add(pt1)
    points[pt3].neighbors.add(pt2)
  }

  points.forEach(pt => {
    pt.neighbors = shuffle(Array.from(pt.neighbors)).slice(0, settings.connectedNeighbors)
  })

  positions = new Float32Array(delaunay.triangles.length * 3)
  positionsBuffer = regl.buffer()

  renderFrequencies = regl({
    vert: glsl`
      attribute vec3 position;

      varying vec4 fragColor;

      void main() {
        float actualIntensity = position.z * 1.2;
        fragColor = vec4(vec3(actualIntensity), 1);
        gl_Position = vec4(position.xy, 0, 1);
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
      position: positionsBuffer
    },
    count: delaunay.triangles.length,
    primitive: 'triangles'
  })
}

function update () {
  const frequencies = analyser.frequencies()
  points.forEach(pt => {
    let value = 0
    if (pt.frequencyBin || pt.frequencyBin === 0) {
      value = Math.pow(frequencies[pt.frequencyBin] / 255, settings.freqPow) // max bin value
    }
    const neighbors = pt.neighbors
    const neighborSum = neighbors.reduce((total, ptID) => {
      return total + points[ptID].spring.tick(1, false)
    }, 0)
    const neighborAverage = neighbors.length ? neighborSum / neighbors.length : 0
    value = Math.max(value, neighborAverage * settings.neighborWeight)

    pt.spring.updateValue(value)
    pt.spring.tick()
  })

  for (let j = 0; j < delaunay.triangles.length; j++) {
    const ptIndex = delaunay.triangles[j]
    const point = points[ptIndex]
    positions[j * 3] = point.position[0]
    positions[j * 3 + 1] = point.position[1]
    positions[j * 3 + 2] = point.spring.tick(1, false)
  }

  positionsBuffer(positions)
}

function start () {
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
    update()
    renderToFBO(() => {
      regl.clear({
        color: [0, 0, 0, 1],
        depth: 1
      })
      renderFrequencies()
    })
    renderToBlurredFBO(() => {
      regl.clear({
        color: [0, 0, 0, 1],
        depth: 1
      })
      renderBlur({ iChannel0: fbo })
    })
    regl.clear({
      color: [0.18, 0.18, 0.18, 1],
      depth: 1
    })
    renderGrid({ frequencyVals: blurredFbo })
  })
}

// ///// helpers (to abstract down the line?) //////

function setupAudio (tracks) {
  const audio = new window.Audio()
  audio.crossOrigin = 'Anonymous'
  const audioControls = createAudioControls(audio)
  const trackSelector = createAudioTrackSelector(audio, tracks)

  css(trackSelector.el, { position: 'relative', zIndex: 10 })

  document.body.appendChild(audioControls.el)
  document.body.appendChild(trackSelector.el)

  window.requestAnimationFrame(loop)
  function loop () {
    window.requestAnimationFrame(loop)
    audioControls.tick()
  }

  return new Promise((resolve, reject) => {
    audio.addEventListener('canplay', function onLoad () {
      audio.removeEventListener('canplay', onLoad)
      const analyser = createAnalyser(audio, { audible: true, stereo: false })
      resolve(analyser)
    })
  })
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

function createRenderGrid () {
  const lines = []

  for (let j = 1; j < settings.gridLines; j++) {
    lines.push({
      axis: 'x',
      offset: createSpring(settings.linesDampening, settings.linesStiffness, j / settings.gridLines * 2 - 1)
    })
    lines.push({
      axis: 'y',
      offset: createSpring(settings.linesDampening, settings.linesStiffness, j / settings.gridLines * 2 - 1)
    })
  }

  function getLinesPositions (linesPositions, lines) {
    const granularity = 50 // settings.gridLines
    let k = 0
    for (let line of lines) {
      const nextOffset = line.offset.tick(1, false)
      for (let q = 0; q < granularity; q++) {
        const t = q / granularity * 2 - 1
        const nextT = (q + 1) / granularity * 2 - 1
        linesPositions[k++] = [
          line.axis === 'x' ? nextOffset : t,
          line.axis === 'y' ? nextOffset : t
        ]
        linesPositions[k++] = [
          line.axis === 'x' ? nextOffset : nextT,
          line.axis === 'y' ? nextOffset : nextT
        ]
      }
    }
    return linesPositions
  }

  const linesPositions = getLinesPositions([], lines)
  const linesBuffer = regl.buffer(linesPositions)
  const render = regl({
    vert: glsl`
      attribute vec2 position;

      varying vec4 fragColor;

      uniform sampler2D frequencyVals;
      uniform vec2 resolution;
      uniform mat4 projection;
      uniform mat4 view;
      uniform float gridMaxHeight;

      void main() {
        vec2 lookup = (position + 1.0) / 2.0;
        float frequencyVal = texture2D(frequencyVals, lookup).x;
        vec3 rgb = clamp(sin((vec3(frequencyVal) + vec3(0.1, 0.3, 0.5)) * 1.9), 0.0, 0.95);
        float opacity = clamp(pow(frequencyVal * 1.5, 2.0), 0.0, 0.95);
        fragColor = vec4(rgb, opacity);
        gl_Position = projection * view * vec4(position.xy, frequencyVal * gridMaxHeight, 1);
      }
    `,
    frag: glsl`
      precision highp float;
      varying vec4 fragColor;
      void main() {
        gl_FragColor = fragColor;
      }
    `,
    uniforms: {
      projection: ({viewportWidth, viewportHeight}) => mat4.perspective(
        [],
        Math.PI / 4,
        viewportWidth / viewportHeight,
        0.01,
        1000
      ),
      view: () => camera.matrix,
      frequencyVals: regl.prop('frequencyVals'),
      gridMaxHeight: () => settings.gridMaxHeight
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
    attributes: {
      position: linesBuffer
    },
    count: linesPositions.length,
    primitive: 'lines'
  })

  setOnTimeout()

  function setNewLineOffsets () {
    lines.sort((a, b) => {
      return a.offset.tick(1, false) > b.offset.tick(1, false) ? 1 : -1
    })
    lines.forEach((line, i) => {
      setTimeout(() => {
        line.offset.updateValue(Math.random() * 2 - 1)
      }, i * settings.linesAnimationOffset)
    })
  }

  function setOnTimeout () {
    setTimeout(() => {
      setNewLineOffsets()
      setOnTimeout()
    }, 8000)
  }

  return function ({ frequencyVals }) {
    getLinesPositions(linesPositions, lines)
    linesBuffer(linesPositions)
    for (let line of lines) {
      line.offset.tick()
    }
    render({ frequencyVals })
  }
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
      direction: () => {
        const rads = settings.blurAngle * Math.PI
        return [
          Math.cos(rads) * settings.blurMag,
          Math.sin(rads) * settings.blurMag
        ]
      }
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

// function createRenderBloom () {
//   const tempFbo = regl.framebuffer({
//     color: regl.texture({
//       shape: [canvas.width, canvas.height, 4]
//     }),
//     depth: true,
//     stencil: false
//   })
//
//   const renderBloomBlur = regl({
//     framebuffer: tempFbo,
//     vert: glsl`
//       precision highp float;
//
//       attribute vec2 position;
//
//       void main() {
//         gl_Position = vec4(position, 0, 1);
//       }
//     `,
//     frag: glsl`
//       precision highp float;
//
//       uniform vec2 resolution;
//       uniform sampler2D iChannel0;
//       uniform float radius;
//
//       vec3 tex(vec2 uv);
//
//       #pragma glslify: blur = require('glsl-hash-blur', sample=tex, iterations=20)
//
//       vec3 tex(vec2 uv) {
//         return texture2D(iChannel0, uv).rgb;
//       }
//
//       void main() {
//         vec2 uv = vec2(gl_FragCoord.xy / resolution.xy);
//         float distToCenter = distance(vec2(0.5), uv);
//         float weightedRadius = radius * pow(distToCenter * 5.0, 2.0);
//         float aspect = resolution.x / resolution.y;
//         gl_FragColor = vec4(blur(uv, weightedRadius, aspect), 1.0);
//       }
//     `,
//     uniforms: {
//       resolution: ({viewportWidth, viewportHeight}) => [viewportWidth, viewportHeight],
//       iChannel0: regl.prop('iChannel0'), // sampler2D
//       radius: () => settings.blurRadius
//     },
//     attributes: {
//       position: [
//         -1, -1,
//         -1, 4,
//         4, -1
//       ]
//     },
//     count: 3,
//     primitive: 'triangles'
//   })
//
//   const renderBloomCombine = regl({
//     vert: glsl`
//       precision highp float;
//
//       attribute vec2 position;
//
//       void main() {
//         gl_Position = vec4(position, 0, 1);
//       }
//     `,
//     frag: glsl`
//       precision highp float;
//
//       uniform sampler2D iChannel0;
//       uniform sampler2D blurredFrame;
//       uniform vec2 resolution;
//
//       void main () {
//         vec2 uv = vec2(gl_FragCoord.xy / resolution.xy);
//         float distToCenter = distance(uv, vec2(0.5));
//         vec4 blurred = texture2D(blurredFrame, uv);
//         blurred.r = pow(blurred.r, 2.0);
//         blurred.g = pow(blurred.g, 2.0);
//         blurred.b = pow(blurred.b, 2.0);
//         vec4 result = texture2D(iChannel0, uv) + blurred * (1.0 - distToCenter) * 0.7;
//         gl_FragColor = vec4(result.rgb, 1.0);
//       }
//     `,
//     uniforms: {
//       resolution: ({viewportWidth, viewportHeight}) => [viewportWidth, viewportHeight],
//       iChannel0: regl.prop('iChannel0'), // sampler2D
//       blurredFrame: () => tempFbo // sampler2D
//     },
//     attributes: {
//       position: [
//         -1, -1,
//         -1, 4,
//         4, -1
//       ]
//     },
//     count: 3,
//     primitive: 'triangles'
//   })
//
//   return function render ({ iChannel0 }) {
//     renderBloomBlur({ iChannel0 })
//     renderBloomCombine({ iChannel0 })
//   }
// }
