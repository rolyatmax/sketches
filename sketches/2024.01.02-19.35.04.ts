// WebGPU demo
// NOTE: you must visit this on localhost or webgpu won't work
// npm run dev

/// <reference types="@webgpu/types" />

import { GUI } from 'dat-gui'
import * as createLayout from 'layout-bmfont-text'
import * as wheel from 'mouse-wheel'

const MSDF_IMG_URL = './resources/images/msdf.png'
const MSDF_MANIFEST_URL = './resources/images/msdf-manifest.json'

const TEXT = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Sapien eget mi proin sed. Sit amet tellus cras adipiscing. Sollicitudin aliquam ultrices sagittis orci a scelerisque purus semper eget. Dis parturient montes nascetur ridiculus. Aenean sed adipiscing diam donec adipiscing tristique risus nec feugiat. Dolor morbi non arcu risus. Condimentum lacinia quis vel eros donec ac. Amet luctus venenatis lectus magna fringilla urna porttitor rhoncus. Neque convallis a cras semper auctor neque vitae tempus. Diam donec adipiscing tristique risus nec feugiat in fermentum.

Sit amet dictum sit amet justo donec enim diam vulputate. A iaculis at erat pellentesque adipiscing. Proin libero nunc consequat interdum varius sit. Mi sit amet mauris commodo quis. Mattis ullamcorper velit sed ullamcorper morbi. Enim ut sem viverra aliquet. Elit eget gravida cum sociis natoque. Magna fringilla urna porttitor rhoncus dolor. Nunc congue nisi vitae suscipit. Neque viverra justo nec ultrices dui sapien eget mi. Eget arcu dictum varius duis at. Pellentesque habitant morbi tristique senectus et netus et. Cras ornare arcu dui vivamus arcu. Nunc sed blandit libero volutpat sed cras ornare. Orci phasellus egestas tellus rutrum tellus pellentesque eu tincidunt. Amet cursus sit amet dictum sit amet justo.

Sed velit dignissim sodales ut eu sem integer vitae. Magna eget est lorem ipsum dolor sit amet consectetur. Hendrerit gravida rutrum quisque non tellus orci ac auctor. Risus nullam eget felis eget nunc lobortis mattis aliquam faucibus. Placerat vestibulum lectus mauris ultrices eros in cursus. Sed tempus urna et pharetra pharetra massa. Cras fermentum odio eu feugiat pretium nibh ipsum. Enim eu turpis egestas pretium aenean. Pulvinar etiam non quam lacus suspendisse faucibus. Dictum non consectetur a erat. Scelerisque fermentum dui faucibus in ornare quam. Phasellus egestas tellus rutrum tellus pellentesque eu tincidunt tortor aliquam. Gravida neque convallis a cras semper. Nec sagittis aliquam malesuada bibendum arcu. Eu mi bibendum neque egestas. Sit amet dictum sit amet justo donec enim diam vulputate. Et tortor consequat id porta nibh venenatis cras sed felis. Odio ut enim blandit volutpat maecenas volutpat. Sagittis id consectetur purus ut faucibus pulvinar elementum integer enim. Urna condimentum mattis pellentesque id.

Lorem ipsum dolor sit amet consectetur. Lobortis elementum nibh tellus molestie nunc. Neque vitae tempus quam pellentesque nec nam aliquam sem et. Enim sed faucibus turpis in eu mi bibendum. Purus gravida quis blandit turpis cursus in hac habitasse platea. Erat velit scelerisque in dictum non consectetur a erat. Nunc sed augue lacus viverra. Lacus viverra vitae congue eu consequat ac felis. Lacus suspendisse faucibus interdum posuere lorem ipsum dolor sit. Sem nulla pharetra diam sit amet nisl suscipit adipiscing bibendum. Vestibulum lectus mauris ultrices eros in. Nec dui nunc mattis enim. Gravida quis blandit turpis cursus in.

Sed euismod nisi porta lorem mollis aliquam ut. Dolor morbi non arcu risus. Praesent elementum facilisis leo vel fringilla est. Urna condimentum mattis pellentesque id nibh tortor id aliquet. Mauris vitae ultricies leo integer malesuada nunc vel risus commodo. Nibh tortor id aliquet lectus proin nibh nisl condimentum. Arcu cursus vitae congue mauris rhoncus. Odio tempor orci dapibus ultrices in iaculis nunc. Morbi tristique senectus et netus et malesuada fames. Eu augue ut lectus arcu bibendum. Augue ut lectus arcu bibendum at varius. Tempus imperdiet nulla malesuada pellentesque elit eget gravida. Elementum curabitur vitae nunc sed velit dignissim sodales ut eu. Duis tristique sollicitudin nibh sit amet commodo nulla. Volutpat maecenas volutpat blandit aliquam etiam. Commodo viverra maecenas accumsan lacus. Scelerisque fermentum dui faucibus in ornare quam.
`

const settings = {
  animDuration: 5,
  fontWeight: 0.7,
}

async function main() {
  const { device, context } = await setupWebGPU()
  const canvas = context.canvas

  let animStart = Date.now()
  let textScale = 0.2
  wheel(canvas, (dx, dy) => {
    textScale += dy * 0.0001
    textScale = Math.max(0, Math.min(1, textScale))
  }, true)

  canvas.addEventListener('click', () => {
    animStart = Date.now() + 500
  })

  const gui = new GUI()
  gui.add(settings, 'animDuration', 0, 10).onChange(() => {
    animStart = Date.now()
  })
  gui.add(settings, 'fontWeight', 0, 1.2)

  const { setText, render } = await createTextRenderer(device, MSDF_IMG_URL, MSDF_MANIFEST_URL)

  setText(TEXT, {
    width: 2000,
    lineHeight: 55,
    letterSpacing: -2,
  })

  requestAnimationFrame(function loop() {
    requestAnimationFrame(loop)
    render(context.getCurrentTexture(), textScale, animStart, settings.animDuration, settings.fontWeight)
  })
}

main()

function createGPUBuffer(
  device: GPUDevice,
  data: ArrayBuffer,
  usageFlag: GPUBufferUsageFlags
) {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: usageFlag,
    mappedAtCreation: true
  })
  new Uint8Array(buffer.getMappedRange()).set(
    new Uint8Array(data)
  )
  buffer.unmap()
  return buffer
}

function fit(canvas: HTMLCanvasElement, parent: HTMLElement, scale = 1) {
  const p = parent

  canvas.style.position = canvas.style.position || 'absolute'
  canvas.style.top = '0'
  canvas.style.left = '0'
  return resize()

  function resize() {
    let width = window.innerWidth
    let height = window.innerHeight
    if (p && p !== document.body) {
      const bounds = p.getBoundingClientRect()
      width  = bounds.width
      height = bounds.height
    }
    canvas.width = width * scale
    canvas.height = height * scale
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    return resize
  }
}

function flat(arr: any[]) {
  return arr.reduce((acc, val) => acc.concat(val), [])
}

async function setupWebGPU(canvas?: HTMLCanvasElement) {
  if (!window.navigator.gpu) {
    const message = `
      Your current browser does not support WebGPU! Make sure you are on a system
      with WebGPU enabled, e.g. Chrome Canary with chrome://flags#enable-unsafe-webgpu enabled.
    `
    document.body.innerText = message
    throw new Error(message)
  }

  const adapter = await window.navigator.gpu.requestAdapter()
  if (!adapter) throw new Error('Failed to requestAdapter()')

  const device = await adapter.requestDevice()
  if (!device) throw new Error('Failed to requestDevice()')

  if (!canvas) {
    canvas = document.body.appendChild(document.createElement('canvas'))
    window.addEventListener('resize', fit(canvas, document.body, window.devicePixelRatio), false)
  }

  const context = canvas.getContext('webgpu')
  if (!context) throw new Error('Failed to getContext("webgpu")')

  context.configure({
    device: device,
    format: navigator.gpu.getPreferredCanvasFormat(),
    alphaMode: 'opaque'
  })

  return { device, context }
}

type Char = {
  id: number
  index: number
  char: string
  width: number
  height: number
  xoffset: number
  yoffset:number
  xadvance: number
  chnl: number
  x:number
  y: number
  page: number
}

type Glyph = {
  data: Char
  position: [number, number]
  index: number
  line: number
}

type TextLayout = {
  width: number
  height: number
  glyphs: Glyph[]
}

type LayoutOpts = {
  width: number
  lineHeight: number
  letterSpacing: number
}

async function createTextRenderer(device: GPUDevice, msdfImgUrl: string, msdfManifestUrl: string) {
  const msdfBlob = await fetch(msdfImgUrl).then(r => r.blob())
  const msdfImg = await createImageBitmap(msdfBlob, { colorSpaceConversion: 'none' })

  const manifest = await fetch(msdfManifestUrl).then(r => r.json())
  const chars = new Map<string, Char>()
  manifest.chars.forEach((c: Char) => chars.set(c.char, c))

  // 2 floats for width/height + textScale + animT + fontWeight
  const uniformsData = new Float32Array(6)
  const uniformsBuffer = createGPUBuffer(device, uniformsData, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)

  const sampler = device.createSampler({
    label: 'alphabet sampler',
    magFilter: 'linear',
    minFilter: 'linear'
  })
  const texture = device.createTexture({
    size: { width: 512, height: 512 },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  })

  device.queue.copyExternalImageToTexture(
    { source: msdfImg, flipY: false },
    { texture },
    { width: 512, height: 512 },
  )

  const shader = `
    struct Uniforms {
      @location(0) dimensions: vec2f,
      @location(1) textScale: f32,
      @location(2) animT: f32,
      @location(3) fontWeight: f32,
    };

    @group(0) @binding(0) var<uniform> uniforms: Uniforms;
    @group(0) @binding(1) var ourSampler: sampler;
    @group(0) @binding(2) var ourTexture: texture_2d<f32>;

    struct Output {
      @builtin(position) position: vec4f,
      @location(1) xy: vec2f,
      @location(2) fgColor: vec4f,
      @location(3) random: f32,
    };

    @vertex
    fn mainVertex(
      @location(0) xy: vec2f,
      @location(1) charPosition: vec2f,
      @location(2) charSize: vec2f,
      @location(3) instancePosition: vec2f,
      @location(4) randoms: vec2f
    ) -> Output {
      var sizeMult = 1.0; // rand(randoms) * 0.3 + 0.7;
      var p = xy * sizeMult * charSize + instancePosition;
      p /= uniforms.dimensions;
      p *= uniforms.textScale;
      // flip the Y
      p.y *= -1.0;

      var output: Output;
      output.position = vec4(p, 0.0, 1.0);
      var random = rand(randoms);
      var offset = charPosition / vec2f(512.0, 512.0);
      var scale = charSize / vec2f(512.0, 512.0);
      output.xy = scale * xy + offset;
      var c = vec3f(
        rand(vec2f(random, 0.0)),
        rand(vec2f(0.0, random)),
        rand(vec2f(random, random))
      );
      c *= vec3f(0.1, 0.2, 0.7);
      c += 0.1;
      output.fgColor = vec4(c, 0.9);
      output.random = random;
      return output;
    }

    fn median(r: f32, g: f32, b: f32) -> f32 {
      return max(min(r, g), min(max(r, g), b));
    }

    fn rand(v: vec2f) -> f32 {
      return fract(sin(dot(v, vec2f(12.9898, 78.233))) * 43758.5453);
    }

    fn noise(v: vec2f) -> f32 {
      var i = floor(v);
      var f = fract(v);
      f = f * f * (3.0 - 2.0 * f);
      var a = rand(i + vec2f(0.0, 0.0));
      var b = rand(i + vec2f(1.0, 0.0));
      var c = rand(i + vec2f(0.0, 1.0));
      var d = rand(i + vec2f(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    @fragment
    fn mainFragment(
      @location(1) xy: vec2f,
      @location(2) fgColor: vec4f,
      @location(3) random: f32,
    ) -> @location(0) vec4f {
      var bgColor = vec4f(1.0, 1.0, 1.0, 0.0);
      var msd: vec3f = textureSample(ourTexture, ourSampler, xy).rgb;
      var sd: f32 = median(msd.r, msd.g, msd.b);
      var r = random * 2.0 - 1.0;
      var animT = clamp(uniforms.animT, 0.0, 1.0);
      animT = 1.0 - pow(1.0 - animT, 5.0);
      var t = 1.0 - animT;
      t *= r * 0.5 + 0.75;
      var nOffset = random * 50.0;
      var n = noise(xy * 40.0 + nOffset);
      var p = t * 18.0 + 1.3 - uniforms.fontWeight;
      sd = pow(sd, p * n * 3.0 - 0.3);
      var screenPxDistance: f32 = uniforms.textScale * (sd - 0.5);
      var opacity: f32 = clamp(screenPxDistance + 0.5, 0.0, 1.0);
      if (opacity < 0.01) {
        discard;
      }
      return mix(bgColor, fgColor, opacity);
    }
  `

  const shaderModule = device.createShaderModule({ code: shader })

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0, // uniforms
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: {},
    }, {
      binding: 1, // alphabet sampler
      visibility: GPUShaderStage.FRAGMENT,
      sampler: {},
    }, {
      binding: 2, // alphabet texture
      visibility: GPUShaderStage.FRAGMENT,
      texture: {},
    }]
  })

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout]
    }),
    vertex: {
      module: shaderModule,
      entryPoint: 'mainVertex',
      buffers: [
        {
          arrayStride: 8,
          attributes: [
            {
              shaderLocation: 0,
              format: 'float32x2',
              offset: 0
            }
          ]
        } as GPUVertexBufferLayout,
        {
          arrayStride: 8 * 4,
          stepMode: 'instance',
          attributes: [
            { // charPosition
              shaderLocation: 1,
              offset: 0,
              format: 'float32x2'
            },
            { // charSize
              shaderLocation: 2,
              offset: 8,
              format: 'float32x2'
            },
            { // instancePosition
              shaderLocation: 3,
              offset: 16,
              format: 'float32x2'
            },
            { // randoms
              shaderLocation: 4,
              offset: 24,
              format: 'float32x2'
            }
          ],
        } as GPUVertexBufferLayout
      ]
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'mainFragment',
      targets: [{
        format: 'bgra8unorm' as GPUTextureFormat,
        blend: {
          color: {
            srcFactor: 'one' as GPUBlendFactor,
            dstFactor: 'one-minus-src-alpha' as GPUBlendFactor
          },
          alpha: {
            srcFactor: 'one' as GPUBlendFactor,
            dstFactor: 'one-minus-src-alpha' as GPUBlendFactor
          },
        },
      }]
    },
    primitive: { topology: 'triangle-strip' }
  })

  const uniformBindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformsBuffer } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: texture.createView() }
    ]
  })

  const vertexData = new Float32Array([
    1, 0,
    1, 1,
    0, 0,
    0, 1
  ])
  const vertexBuffer = createGPUBuffer(device, vertexData.buffer, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST)

  let instanceBuffer: GPUBuffer | null = null
  let instanceCount = 0

  let layout: TextLayout | null = null

  return { setText, getLayout, render }

  function getLayout() {
    return layout
  }

  function setText(text: string, opts: LayoutOpts) {
    layout = createLayout({
      ...opts,
      text: text,
      font: manifest,
    }) as TextLayout

    const glyphs = layout.glyphs.filter(
      (glyph) => glyph.data.width * glyph.data.height > 0
    )

    instanceCount = glyphs.length

    const halfWidth = layout.width / 2
    const halfHeight = layout.height / 2
    // charPosition, charSize, instancePosition, random
    const instanceData = new Float32Array(flat(glyphs.map((glyph) => {
      return [
        glyph.data.x, glyph.data.y,
        glyph.data.width, glyph.data.height,
        glyph.position[0] + glyph.data.xoffset - halfWidth, glyph.position[1] + glyph.data.yoffset + halfHeight,
        Math.random(), Math.random()
      ]
    })))
    if (instanceBuffer) instanceBuffer.destroy()
    instanceBuffer = createGPUBuffer(device, instanceData.buffer, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST)
  }

  function render(curTexture: GPUTexture, textScale: number, animStart: number, animDuration: number, fontWeight: number) {
    if (!instanceBuffer || instanceCount === 0) return

    const commandEncoder = device.createCommandEncoder()
    const { width, height } = curTexture

    const MIN_TEXT_SCALE = 0.5
    const MAX_TEXT_SCALE = 120
    const tScale = Math.pow(textScale, 2) * MAX_TEXT_SCALE + MIN_TEXT_SCALE
    const animT = (Date.now() - animStart) / (animDuration * 1000)

    uniformsData.set([width, height, tScale, animT, fontWeight], 0)
    device.queue.writeBuffer(uniformsBuffer, 0, uniformsData, 0, 5)

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: curTexture.createView(),
        clearValue: { r: 0.99, g: 0.99, b: 0.99, a: 1.0 },
        loadOp: 'clear' as GPULoadOp,
        storeOp: 'store' as GPUStoreOp
      }]
    })

    renderPass.setPipeline(pipeline)
    renderPass.setVertexBuffer(0, vertexBuffer)
    renderPass.setVertexBuffer(1, instanceBuffer)
    renderPass.setBindGroup(0, uniformBindGroup)
    renderPass.draw(4, instanceCount)
    renderPass.end()
    device.queue.submit([commandEncoder.finish()])
  }
}
