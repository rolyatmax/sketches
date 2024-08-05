// WebGPU demo
// NOTE: you must visit this on localhost or webgpu won't work

/// <reference types="@webgpu/types" />

main()
async function main() {
  const { device, context } = await setupWebGPU()
  const canvas = context.canvas
  const curTexture = context.getCurrentTexture()

  let pickingData: Uint8Array | null = null

  const pickingTexture = device.createTexture({
    size: { width: canvas.width, height: canvas.height },
    format: 'bgra8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT
  })

  const pickingBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })

  let mouseXY: number[] | null = null
  let selectedObject = false

  canvas.addEventListener('mousemove', (event) => {
    if (event instanceof MouseEvent) {
      if (!mouseXY) mouseXY = []
      mouseXY[0] = event.clientX
      mouseXY[1] = event.clientY
    }
  })

  const shader = `
  @vertex fn vs(
    @builtin(vertex_index) vertexIndex : u32
  ) -> @builtin(position) vec4f {
    let pos = array(
      vec2f( 0.0,  0.5),  // top center
      vec2f(-0.5, -0.5),  // bottom left
      vec2f( 0.5, -0.5)   // bottom right
    );

    return vec4f(pos[vertexIndex], 0.0, 1.0);
  }

  @fragment
  fn fs() -> @location(0) vec4f {
    return vec4(0.0, 1.0, 0.0, 1.0);
  }
`

  const shaderModule = device.createShaderModule({ code: shader })
  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: []
    }),
    vertex: {
      module: shaderModule,
      entryPoint: 'vs',
      buffers: []
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs',
      targets: [{ format: curTexture.format }]
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'none'
    }
  })

  const bundleEncoder = device.createRenderBundleEncoder({
    colorFormats: [curTexture.format]
  })
  bundleEncoder.setPipeline(pipeline)
  bundleEncoder.draw(3)
  const renderBundle = bundleEncoder.finish()

  requestAnimationFrame(function loop() {
    const curTexture = context.getCurrentTexture()
    const commandEncoder = device.createCommandEncoder()
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: curTexture.createView(),
        clearValue: { r: 0, g: 0, b: 1, a: 1 },
        loadOp: 'clear' as GPULoadOp,
        storeOp: 'store' as GPUStoreOp
      }]
    })
    renderPass.executeBundles([renderBundle])
    renderPass.end()

    const renderPass2 = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: pickingTexture.createView(),
        clearValue: { r: 0, g: 0, b: 1, a: 1 },
        loadOp: 'clear' as GPULoadOp,
        storeOp: 'store' as GPUStoreOp
      }]
    })
    renderPass2.executeBundles([renderBundle])
    renderPass2.end()

    if (pickingBuffer.mapState === 'unmapped' && mouseXY) {
      commandEncoder.copyTextureToBuffer(
        { texture: pickingTexture, origin: [mouseXY[0] * 2, mouseXY[1] * 2] },
        { buffer: pickingBuffer },
        [1, 1]
      )
    }

    device.queue.submit([commandEncoder.finish()])

    if (pickingBuffer.mapState === 'unmapped' && mouseXY) {
      pickingBuffer.mapAsync(GPUMapMode.READ).then(() => {
        pickingData = new Uint8Array(pickingBuffer.getMappedRange())

        if (pickingData[0] === 0 && pickingData[1] === 255 && pickingData[2] === 0) {
          selectedObject = true
        } else {
          selectedObject = false
        }

        pickingBuffer.unmap()
      })
    }

    console.log(selectedObject)

    requestAnimationFrame(loop)
  })
}

function createGPUBuffer(
  device: GPUDevice,
  data: ArrayBuffer,
  usageFlag: GPUBufferUsageFlags,
  byteOffset = 0,
  byteLength = data.byteLength
) {
  const buffer = device.createBuffer({
    size: byteLength,
    usage: usageFlag,
    mappedAtCreation: true
  })
  new Uint8Array(buffer.getMappedRange()).set(
    new Uint8Array(data, byteOffset, byteLength)
  )
  buffer.unmap()
  return buffer
}

async function setupWebGPU(canvas?: HTMLCanvasElement) {
  if (!window.navigator.gpu) {
    const message = `
      Your current browser does not support WebGPU! Make sure you are on a system
      with WebGPU enabled, e.g. Chrome or Safari (with the WebGPU flag enabled).
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
