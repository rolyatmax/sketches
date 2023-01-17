export {} // file needs an import or export to be treated as a module

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
  window.addEventListener('resize', fit(canvas, document.body), false)

  const adapter = await window.navigator.gpu.requestAdapter()
  if (!adapter) throw new Error('Failed to requestAdapter()')

  const device = await adapter.requestDevice()
  if (!device) throw new Error('Failed to requestDevice()')

  const context = canvas.getContext('webgpu')
  if (!context) throw new Error('Failed to getContext("webgpu")')

  const format = navigator.gpu.getPreferredCanvasFormat()
  context.configure({
    device: device,
    format: format,
    alphaMode: 'opaque'
  })

  const shader = `
    struct Uniforms {
      t: f32
    };

    @group(0) @binding(0) var<uniform> uniforms: Uniforms;

    struct Output {
      @builtin(position) position: vec4<f32>,
      @location(0) vColor: vec4<f32>,
    };

    @vertex
    fn mainVertex(
      @location(0) pos: vec4<f32>,
      @location(1) color: vec4<f32>,
      @location(2) rand: f32,
      @location(3) rate: f32
    ) -> Output {
      var t = sin(rand + uniforms.t * rate) * 0.25 + 0.75;
      var output: Output;
      output.position = pos;
      output.vColor = color * t;
      return output;
    }

    @fragment
    fn mainFragment(@location(0) vColor: vec4<f32>) -> @location(0) vec4<f32> {
      return vColor;
    }
  `

  const vertexData = new Float32Array([
    // position  // color        // rand  // rate
    -0.5, -0.5,  0.9, 0.9, 0.5,  25,      1,
    0.5, -0.5,   0.1, 0.9, 0.9,  1289,    0.5,
    -0.5, 0.5,   0.9, 0.6, 0.1,  3,       0.3,
    0.5, 0.5,    0.3, 0.1, 0.9,  -91863,  0.2
  ])
  const vertexBuffer = createGPUBuffer(device, vertexData, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST)

  const uniformData = new Float32Array([1])
  const uniformBuffer = createGPUBuffer(device, uniformData, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)

  const shaderModule = device.createShaderModule({ code: shader })
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'mainVertex',
      buffers: [
        {
          arrayStride: 4 * (2 + 3 + 1 + 1),
          attributes: [
            {
              shaderLocation: 0,
              format: 'float32x2',
              offset: 0
            },
            {
              shaderLocation: 1,
              format: 'float32x3',
              offset: 8
            },
            {
              shaderLocation: 2,
              format: 'float32',
              offset: 20
            },
            {
              shaderLocation: 3,
              format: 'float32',
              offset: 24
            }
          ]
        }
      ]
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'mainFragment',
      targets: [{ format }]
    },
    primitive: { topology: 'triangle-strip' }
  })

  const uniformBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer
        }
      }
    ]
  })

  requestAnimationFrame(function render(t) {
    requestAnimationFrame(render)

    uniformData[0] = t / 1000
    device.queue.writeBuffer(uniformBuffer, 0, uniformData)

    const commandEncoder = device.createCommandEncoder()
    const textureView = context.getCurrentTexture().createView()
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.9, g: 0.95, b: 0.98, a: 1.0 },
        loadOp: 'clear' as GPULoadOp,
        storeOp: 'store' as GPUStoreOp
      }]
    })
    renderPass.setPipeline(pipeline)
    renderPass.setVertexBuffer(0, vertexBuffer)
    renderPass.setBindGroup(0, uniformBindGroup)
    renderPass.draw(4)
    renderPass.end()
    device.queue.submit([commandEncoder.finish()])
  })
}

main()

function createGPUBuffer(
  device: GPUDevice,
  data: Float32Array,
  usageFlag: GPUBufferUsageFlags
) {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: usageFlag,
    mappedAtCreation: true
  })
  new Float32Array(buffer.getMappedRange()).set(data)
  buffer.unmap()
  return buffer
}

function fit(canvas: HTMLCanvasElement, parent: HTMLElement, scale = 1) {
  const p = parent || canvas.parentNode

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
