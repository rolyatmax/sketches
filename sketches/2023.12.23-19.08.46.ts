// WebGPU demo
// NOTE: you must visit this on localhost or webgpu won't work
// npm run dev

/// <reference types="@webgpu/types" />

export {}

async function main() {
  if (!window.navigator.gpu) {
    const message = `
      Your current browser does not support WebGPU! Make sure you are on a system
      with WebGPU enabled, e.g. Chrome Canary with chrome://flags#enable-unsafe-webgpu enabled.
    `
    document.body.innerText = message
    throw new Error(message)
  }

  const canvas = document.body.appendChild(document.createElement('canvas'))
  window.addEventListener('resize', fit(canvas, document.body, window.devicePixelRatio), false)

  const adapter = await window.navigator.gpu.requestAdapter()
  if (!adapter) throw new Error('Failed to requestAdapter()')

  const device = await adapter.requestDevice()
  if (!device) throw new Error('Failed to requestDevice()')

  const context = canvas.getContext('webgpu')
  if (!context) throw new Error('Failed to getContext("webgpu")')

  const msdfBlob = await fetch('./resources/images/msdf.png').then(r => r.blob())
  const msdfImg = await createImageBitmap(msdfBlob, { colorSpaceConversion: 'none' })

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

  const manifest = await fetch('./resources/images/msdf-manifest.json').then(r => r.json())
  const chars = new Map<string, Char>()
  manifest.chars.forEach((c: Char) => chars.set(c.char, c))

  const format = navigator.gpu.getPreferredCanvasFormat()
  context.configure({
    device: device,
    format: format,
    alphaMode: 'opaque'
  })

  const texture = context.getCurrentTexture()

  const shader = `
    struct Uniforms {
      dimensions: vec2<f32>,
      offset: vec2<f32>,
      yScale: f32
    };

    @group(0) @binding(0) var<uniform> uniforms: Uniforms;
    @group(0) @binding(1) var ourSampler: sampler;
    @group(0) @binding(2) var ourTexture: texture_2d<f32>;

    struct Output {
      @builtin(position) position: vec4<f32>,
      @location(1) xy: vec2<f32>
    };

    @vertex
    fn mainVertex(
      @location(0) position: vec2<f32>,
      @location(1) xy: vec2<f32>
    ) -> Output {
      var output: Output;
      output.position = vec4(position, 0.0, 1.0);
      var offset: vec2f = uniforms.offset / vec2f(512.0, 512.0);
      output.xy = uniforms.yScale * xy + offset;
      return output;
    }

    fn median(r: f32, g: f32, b: f32) -> f32 {
      return max(min(r, g), min(max(r, g), b));
    }

    @fragment
    fn mainFragment(
      @location(1) xy: vec2<f32>
    ) -> @location(0) vec4<f32> {
      var bgColor: vec4f = vec4f(0.2, 0.2, 0.2, 1.0);
      var fgColor: vec4f = vec4f(1.0, 1.0, 1.0, 1.0);
      var msd: vec3f = textureSample(ourTexture, ourSampler, xy).rgb;
      var sd: f32 = median(msd.r, msd.g, msd.b);
      var screenPxDistance: f32 = 20.0 * (sd - 0.5);
      var opacity: f32 = clamp(screenPxDistance + 0.5, 0.0, 1.0);
      return mix(bgColor, fgColor, opacity);
    }
  `
  // 2 floats for width/height + 2 floats for offset + 1 float for yScale + 1 padding
  const uniformData = new Float32Array(6)
  const uniformBuffer = createGPUBuffer(device, uniformData, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)

  const ourSampler = device.createSampler({
    label: 'alphabet sampler',
    magFilter: 'linear',
    minFilter: 'linear'
  })
  const ourTexture = device.createTexture({
    size: { width: 512, height: 512 },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  })

  device.queue.copyExternalImageToTexture(
    { source: msdfImg, flipY: false },
    { texture: ourTexture },
    { width: 512, height: 512 },
  )

  const shaderModule = device.createShaderModule({ code: shader })

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0, // width/height + offset uniform
      visibility: GPUShaderStage.VERTEX,
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
  });

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout]
    }),
    vertex: {
      module: shaderModule,
      entryPoint: 'mainVertex',
      buffers: [
        {
          arrayStride: 16,
          attributes: [
            {
              shaderLocation: 0,
              format: 'float32x2',
              offset: 0
            },
            {
              shaderLocation: 1,
              format: 'float32x2',
              offset: 8
            }
          ]
        } as GPUVertexBufferLayout
      ]
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'mainFragment',
      targets: [{ format: texture.format }]
    },
    primitive: { topology: 'triangle-strip' },
    depthStencil:{
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less'
    }
  })

  const uniformBindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: ourSampler },
      { binding: 2, resource: ourTexture.createView() }
    ]
  })

  const depthTexture = device.createTexture({
    size: { width: texture.width, height: texture.height },
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT
  })

  const data = new Float32Array([
    0.5, 0.5, 1, 0,
    0.5, -0.5, 1, 1,
    -0.5, 0.5, 0, 0,
    -0.5, -0.5, 0, 1
  ])
  const vertexBuffer = createGPUBuffer(device, data.buffer, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST)
  // device.queue.writeBuffer(vertexBuffer, 0, data.buffer)

  let curChar: Char | null = chars.get('A') ?? null
  window.addEventListener('keyup', function(e) {
    curChar = chars.get(e.key) || null
    console.log(curChar)
  })

  function render(curTexture: GPUTexture) {
    const commandEncoder = device.createCommandEncoder()
    const textureView = curTexture.createView()
    const { width, height } = curTexture

    const offset = curChar ? [curChar.x, curChar.y] : [0, 0]
    const yScale = curChar ? curChar.height / 512 : 0.2

    uniformData.set([width, height, offset[0], offset[1], yScale], 0)

    device.queue.writeBuffer(uniformBuffer, 0, uniformData, 0, 5)

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.99, g: 0.99, b: 0.99, a: 1.0 },
        loadOp: 'clear' as GPULoadOp,
        storeOp: 'store' as GPUStoreOp
      }],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp:'clear',
        depthStoreOp: 'store'
      }
    })

    renderPass.setPipeline(pipeline)
    renderPass.setVertexBuffer(0, vertexBuffer)
    renderPass.setBindGroup(0, uniformBindGroup)
    renderPass.draw(4)
    renderPass.end()
    device.queue.submit([commandEncoder.finish()])
  }

  requestAnimationFrame(function loop() {
    requestAnimationFrame(loop)
    render(context.getCurrentTexture())
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
