const VERSION = '0.0.9'
// const { PicoGL } = require('./node_modules/picogl/src/picogl') // if you turn this on, you need to add -p esmify to the run cmd
const PicoGL = require('picogl')
const PicoMercator = require('pico-mercator')
const fit = require('canvas-fit')
const mapboxgl = require('mapbox-gl')

const RETURN = `
`

module.exports.createRico = createRico
module.exports.createDlite = createDlite

function createDlite (mapboxToken, initialViewState, mapStyle = 'mapbox://styles/mapbox/dark-v9', container = document.body) {
  mapboxgl.accessToken = mapboxToken

  const { center, zoom, bearing, pitch } = initialViewState

  const mapContainer = container.appendChild(document.createElement('div'))
  mapContainer.style.width = '100vw'
  mapContainer.style.height = '100vh'
  mapContainer.style.position = 'fixed'
  mapContainer.style.top = mapContainer.style.left = 0

  const link = document.head.appendChild(document.createElement('link'))
  link.rel = 'stylesheet'
  link.href = 'https://api.tiles.mapbox.com/mapbox-gl-js/v0.54.0/mapbox-gl.css'

  const mapbox = new mapboxgl.Map({
    container: mapContainer,
    style: mapStyle,
    center: center,
    zoom: zoom,
    bearing: bearing,
    pitch: pitch,
    interactive: true
  })

  const onload = new Promise(resolve => {
    mapbox.on('load', resolve)
  })

  const rico = createRico({ container })
  rico.canvas.setAttribute('id', 'dlite-canvas')
  rico.canvas.style['pointer-events'] = 'none' // let the user interact with the mapbox map below

  const viewProjMat = PicoMercator.pico_mercator_highPrecisionMat4()
  function getCameraUniforms () {
    const center = mapbox.getCenter().toArray()
    const zoom = mapbox.getZoom()
    const bearing = mapbox.getBearing()
    const pitch = mapbox.getPitch()

    PicoMercator.pico_mercator_mapboxViewProjectionMatrix(viewProjMat, center, zoom, pitch, bearing, rico.canvas.width, rico.canvas.height)

    // a very strange hack, but the pico_mercator_uniforms function is supposed to take a callback which has uniforms passed to it
    let uniforms = null
    PicoMercator.pico_mercator_uniforms(center, zoom, viewProjMat, (u) => { uniforms = u })
    return {
      ...uniforms,
      pixelsPerMeter: PicoMercator.pico_mercator_pixelsPerMeter(center[1], zoom)
    }
  }

  function dlite (layerOpts) {
    let vs = PicoMercator.pico_mercator_injectGLSLProjection(layerOpts.vs)
    const splitAt = vs.startsWith('#version 300 es') ? vs.indexOf(RETURN) + 1 : 0
    const head = vs.slice(0, splitAt)
    const body = vs.slice(splitAt)
    vs = head + DLITE_GLSL + body

    const ricoRender = rico({ ...layerOpts, vs })

    return function render (renderArgs) {
      const cameraUniforms = getCameraUniforms()
      return ricoRender({
        ...renderArgs,
        uniforms: {
          ...(renderArgs.uniforms || {}),
          ...cameraUniforms
        }
      })
    }
  }

  Object.assign(dlite, rico, {
    VERSION: VERSION,
    mapbox: mapbox,
    onload: onload
    // todo: include project / unproject functions from mercator projection
    // dlite.project
    // dlite.unproject
  })

  return dlite
}

const DLITE_GLSL = `\
uniform float pixelsPerMeter;

`

// -------- RICO (PicoGL in a thin wrapper to make it a bit more like REGL's API) --------------------

const DEFAULT_FRAGMENT_SHADER = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
  fragColor = vec4(0);
}`

// also accepts null values
function isEqualVaryings (arr1, arr2) {
  if (arr1 === null && arr2 === null) return true
  if (arr1 === null || arr2 === null) return false
  if (arr1.length !== arr2.length) return false
  let j = 0
  while (j < arr1.length) {
    if (arr1[j] !== arr2[j]) return false
    j += 1
  }
  return true
}

// TODO: make this optionally take a gl context, too
function createRico ({ canvas, container = document.body } = {}) {
  const ricoCanvas = canvas || container.appendChild(document.createElement('canvas'))
  let resizeCanvas
  if (!canvas) resizeCanvas = fit(ricoCanvas, container)
  const picoApp = PicoGL.createApp(ricoCanvas)

  if (!canvas) {
    // TODO: provide a teardown function?
    window.addEventListener('resize', function resize () {
      resizeCanvas()
      picoApp.viewport(0, 0, picoApp.gl.drawingBufferWidth, picoApp.gl.drawingBufferHeight)
    }, false)
  }

  // { vs, fs, uniforms, uniformBuffers, vertexArray, primitive, count, instanceCount, framebuffer, transform, blend, depth, rasterize, cullBackfaces }
  function rico (layerOpts) {
    let timer = null

    let transformFeedback = null
    let transformFeedbackVaryings = null
    let curProgramTransformFeedbackVaryings = null
    if (layerOpts.transform) {
      transformFeedbackVaryings = Object.keys(layerOpts.transform).sort()
      curProgramTransformFeedbackVaryings = transformFeedbackVaryings.slice()
      transformFeedback = picoApp.createTransformFeedback()
      for (let i = 0; i < transformFeedbackVaryings.length; i++) {
        const varying = transformFeedbackVaryings[i]
        transformFeedback.feedbackBuffer(i, layerOpts.transform[varying])
      }
    }

    const vs = layerOpts.vs
    const fs = layerOpts.fs || DEFAULT_FRAGMENT_SHADER
    const program = picoApp.createProgram(vs, fs, transformFeedbackVaryings)
    let drawCall = picoApp.createDrawCall(program, layerOpts.vertexArray)

    // can pass in any updates to draw call EXCEPT vs and fs changes
    return function render (renderOpts = {}) {
      let lastTiming = null
      const useTimer = 'timer' in renderOpts ? renderOpts.timer : 'timer' in layerOpts ? layerOpts.timer : false
      if (useTimer) {
        timer = timer || picoApp.createTimer()
        if (timer.ready()) {
          const { gpuTime, cpuTime } = timer
          lastTiming = { gpuTime, cpuTime }
        }
        timer.start()
      }

      // the varyings just for this call
      let renderTransformVaryings = transformFeedbackVaryings
      if ('transform' in renderOpts) {
        transformFeedback = transformFeedback || picoApp.createTransformFeedback()
        renderTransformVaryings = Object.keys(renderOpts.transform).sort()
        for (let i = 0; i < renderTransformVaryings.length; i++) {
          const varying = renderTransformVaryings[i]
          transformFeedback.feedbackBuffer(i, renderOpts.transform[varying])
        }
      }

      // TODO: maybe end up owning vertexArray and attribute creation?
      // TODO: should we write over the drawCall like this or have this just persist through the end of this frame's render?
      const hasNewVaryings = !isEqualVaryings(curProgramTransformFeedbackVaryings, renderTransformVaryings)
      if ('vertexArray' in renderOpts || hasNewVaryings) {
        drawCall = picoApp.createDrawCall(program, renderOpts.vertexArray, renderTransformVaryings)
        curProgramTransformFeedbackVaryings = renderTransformVaryings
      }

      const blend = 'blend' in renderOpts ? renderOpts.blend : 'blend' in layerOpts ? layerOpts.blend : null
      if (blend !== null) {
        if (blend === false) {
          picoApp.noBlend()
        } else {
          picoApp.blend()
          picoApp.blendFuncSeparate(
            typeof blend.csrc === 'string' ? stringToGLConstant(blend.csrc) : blend.csrc,
            typeof blend.cdest === 'string' ? stringToGLConstant(blend.cdest) : blend.cdest,
            typeof blend.asrc === 'string' ? stringToGLConstant(blend.asrc) : blend.asrc,
            typeof blend.adest === 'string' ? stringToGLConstant(blend.adest) : blend.adest
          )
        }
      }

      const depth = 'depth' in renderOpts ? renderOpts.depth : 'depth' in layerOpts ? layerOpts.depth : null
      if (depth !== null) {
        if (depth === true) picoApp.depthTest()
        else picoApp.noDepthTest()
      }

      const rasterize = 'rasterize' in renderOpts ? renderOpts.rasterize : 'rasterize' in layerOpts ? layerOpts.rasterize : null
      if (rasterize !== null) {
        if (rasterize === true) picoApp.rasterize()
        else picoApp.noRasterize()
      }

      const cullBackfaces = 'cullBackfaces' in renderOpts ? renderOpts.cullBackfaces : 'cullBackfaces' in layerOpts ? layerOpts.cullBackfaces : null
      if (cullBackfaces !== null) {
        if (cullBackfaces === true) picoApp.cullBackfaces()
        else picoApp.drawBackfaces()
      }

      const framebuffer = 'framebuffer' in renderOpts ? renderOpts.framebuffer : 'framebuffer' in layerOpts ? layerOpts.framebuffer : null
      if (framebuffer === null) picoApp.defaultDrawFramebuffer()
      else picoApp.drawFramebuffer(framebuffer)

      const uniformBlocks = {
        ...(('uniformBlocks' in layerOpts) ? layerOpts.uniformBlocks : {}),
        ...(('uniformBlocks' in renderOpts) ? renderOpts.uniformBlocks : {})
      }
      for (const name in uniformBlocks) {
        drawCall.uniformBlock(name, uniformBlocks[name])
      }

      const uniforms = {
        ...(('uniforms' in layerOpts) ? layerOpts.uniforms : {}),
        ...(('uniforms' in renderOpts) ? renderOpts.uniforms : {})
      }
      // TODO: make this work for texture uniforms
      for (const name in uniforms) {
        drawCall.uniform(name, uniforms[name])
      }

      // TODO: let users pass in a string for primitive
      const primitive = 'primitive' in renderOpts ? renderOpts.primitive : 'primitive' in layerOpts ? layerOpts.primitive : null
      if (primitive !== null) drawCall.primitive(typeof primitive === 'string' ? stringToGLConstant(primitive) : primitive)
      const count = 'count' in renderOpts ? renderOpts.count : 'count' in layerOpts ? layerOpts.count : null
      const instanceCount = 'instanceCount' in renderOpts ? renderOpts.instanceCount : 'instanceCount' in layerOpts ? layerOpts.instanceCount : null
      if (count !== null && instanceCount !== null) {
        drawCall.drawRanges([0, count, instanceCount])
      } else if (count !== null) {
        drawCall.drawRanges([0, count])
      }

      // if you've passed `null` for transform feedback, then use that instead of the stored transformFeedback
      const tf = ('transform' in renderOpts && !renderOpts.transform) ? null : transformFeedback
      drawCall.transformFeedback(tf)

      drawCall.draw()

      if (useTimer) {
        timer.end()
      }

      return lastTiming
    }
  }

  function stringToGLConstant (str) {
    return picoApp.gl[str.replace(' ', '_').toUpperCase()]
  }

  rico.picoApp = picoApp
  rico.gl = picoApp.gl
  rico.canvas = ricoCanvas
  rico.createVertexArray = picoApp.createVertexArray.bind(picoApp) // ??? merge other pico fns with the rico object?
  rico.createVertexBuffer = picoApp.createVertexBuffer.bind(picoApp) // ??? merge other pico fns with the rico object?
  rico.createInterleavedBuffer = picoApp.createInterleavedBuffer.bind(picoApp) // ??? merge other pico fns with the rico object?
  rico.PicoGL = PicoGL
  rico.clear = function clear (...color) {
    picoApp.clearColor(...color)
    picoApp.clear()
  }
  return rico
}
