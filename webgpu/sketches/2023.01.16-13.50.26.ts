import { mat4 } from 'gl-matrix'
import createCameraControls from '3d-view-controls'

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
  window.addEventListener('resize', fit(canvas, document.body, 2), false)

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

  const CENTER = [1249.5, 1249.5, 800]
  const EYE = [CENTER[0] - 2000, CENTER[1] - 2000, 2000]
  const camera = createCameraControls(canvas, {
    eye: EYE,
    center: CENTER
  })

  const result = await getLidarStreamer(device, 'https://nyc-lidar-demo.s3.amazonaws.com/987210.bin')
  // const result = await getLidarStreamer(device, 'https://nyc-lidar-demo.s3.amazonaws.com/midtown-sampled-xl.bin')
  // const result = await getLidarStreamer(device, 'https://nyc-lidar-demo.s3.amazonaws.com/manhattan-sampled-lg.bin')

  const { getCurrentPointCount, offset, buffer: vertexBuffer } = result
  const minZ = offset[2]

  const shader = `
    struct Uniforms {
      projection: mat4x4<f32>,
      view: mat4x4<f32>,
      fadeHeightRange: vec2<f32>
    };

    @group(0) @binding(0) var<uniform> uniforms: Uniforms;

    struct Output {
      @builtin(position) position: vec4<f32>,
      @location(0) color: vec3<f32>
    };

    fn getColorFromPalette(t: f32) -> vec3<f32> {
      const C1 = vec3(0.22745, 0.06667, 0.10980);
      const C2 = vec3(0.34118, 0.28627, 0.31765);
      const C3 = vec3(0.51373, 0.59608, 0.55686);
      const C4 = vec3(0.73725, 0.87059, 0.64706);
      const C5 = vec3(0.90196, 0.97647, 0.73725);

      if (t < 0.25) {
        return mix(C1, C2, smoothstep(0.0, 0.25, t));
      }
      if (t < 0.5) {
        return mix(C2, C3, smoothstep(0.25, 0.5, t));
      }
      if (t < 0.75) {
        return mix(C3, C4, smoothstep(0.5, 0.75, t));
      }
      return mix(C4, C5, smoothstep(0.75, 1.0, t));
    }

    @vertex
    fn mainVertex(
      @location(0) position: vec3<u32>,
      @location(1) intensity: vec2<f32>
    ) -> Output {
      let p = vec3<f32>(position);
      const colorPow = 2.0;
      const colorOffset = 0.5;
      // see note below. had to make this a vec2 & ignore the x component
      let t = intensity.y;
      var color = getColorFromPalette(pow(t + colorOffset, colorPow));
      let colorMult = 0.05 + smoothstep(uniforms.fadeHeightRange.y, uniforms.fadeHeightRange.x, p.z);
      color *= colorMult;
      var output: Output;
      output.color = color;
      output.position = uniforms.projection * uniforms.view * vec4(p, 1);
      return output;
    }

    @fragment
    fn mainFragment(@location(0) color: vec3<f32>) -> @location(0) vec4<f32> {
      return vec4(color, 1);
    }
  `

  const uniformData = new Float32Array(36) // 16 + 16 + 2 + padding
  const uniformBuffer = createGPUBuffer(device, uniformData, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)

  const shaderModule = device.createShaderModule({ code: shader })

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0, // projection uniform
      visibility: GPUShaderStage.VERTEX,
      buffer: {},
    }, {
      binding: 1, // view uniform
      visibility: GPUShaderStage.VERTEX,
      buffer: {},
    }, {
      binding: 2, // fadeHeightRange
      visibility: GPUShaderStage.VERTEX,
      buffer: {},
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
          arrayStride: 8,
          attributes: [
            {
              shaderLocation: 0,
              format: 'uint16x4', // x3 is not possible, so make vec4 and ignore the w component
              offset: 0
            },
            {
              shaderLocation: 1,
              format: 'unorm16x2', // unorm16x1 is not possible, so make vec2 and ignore the x component
              offset: 4
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
    primitive: { topology: 'point-list' },
    depthStencil:{
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less"
  }
  })

  const uniformBindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer
        }
      },
      {
        binding: 1,
        resource: {
          buffer: uniformBuffer
        }
      },
      {
        binding: 2,
        resource: {
          buffer: uniformBuffer
        }
      }
    ]
  })

  requestAnimationFrame(function render(t) {
    requestAnimationFrame(render)

    const commandEncoder = device.createCommandEncoder()
    const curTexture = context.getCurrentTexture()
    const textureView = curTexture.createView()
    const { width, height } = curTexture
    const depthTexture = device.createTexture({
      size: [width, height, 1],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    })

    camera.up = [0, 0, 1]
    camera.tick()
    const projection = mat4.perspective(new Float32Array(16), Math.PI / 4, width / height, 1, 1000000)
    const view = camera.matrix
    const fadeHeightStart = minZ + 1200 // 2100
    const fadeHeightEnd = minZ + 450 // 900
    uniformData.set(projection, 0)
    uniformData.set(view, 16)
    uniformData.set([fadeHeightStart, fadeHeightEnd], 32)

    device.queue.writeBuffer(uniformBuffer, 0, uniformData)

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.11, g: 0.12, b: 0.13, a: 1.0 },
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
    renderPass.draw(getCurrentPointCount())
    renderPass.end()
    device.queue.submit([commandEncoder.finish()])
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


// ---------------------

async function getLidarStreamer(device: GPUDevice, url: string) {
  const startTime = performance.now()
  const response = await fetch(url)

  if (!response.body) {
    throw new Error('Unable to fetch lidar data. No response.body.')
  }

  const littleEndian = isLittleEndian()

  /*
  Binary Data format:
    pointCount - uint32
    xOffset, yOffset, zOffset - int32s
    pt1 xDelta, yDelta, zDelta - uint16s
    pt1 intensity - uint16
    pt2...
  */
  const reader = response.body.getReader()

  const result = await reader.read()
  if (result.done || !result.value) throw new Error('Unable to fetch lidar data. Stream completed before any data was received.')
  const dataview = new DataView(result.value.buffer)
  const pointCount = dataview.getUint32(0, littleEndian)
  const offset = [
    dataview.getInt32(4, littleEndian),
    dataview.getInt32(8, littleEndian),
    dataview.getInt32(12, littleEndian)
  ]

  console.log({ pointCount, offset })

  const pointSizeInBytes = 4 * 2 // each point has 4 uint16 values
  const lidarData = new Uint8Array(pointCount * pointSizeInBytes)
  const remainingBytes = result.value.buffer.byteLength - 16
  const ptCountFromFirstLoad = Math.floor(remainingBytes / 8)
  const ptByteCount = ptCountFromFirstLoad * 8
  const initialData = new Uint8Array(result.value.buffer, 16, ptByteCount)
  lidarData.set(initialData)

  let i = initialData.length
  let currentPointCount = ptCountFromFirstLoad
  let leftoverBytesFromLast = new Uint8Array(result.value.buffer, ptByteCount + 16)

  const buffer = createGPUBuffer(device, lidarData.buffer, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST)

  setTimeout(async function loadChunk() {
    let chunks = 1
    while (true) {
      const result = await reader.read()
      if (result.done) {
        console.log(`finished loading data in ${chunks} chunks. time(ms):`, performance.now() - startTime)
        console.log(`points: ${currentPointCount}, bytes: ${i}`)
        return
      }
      chunks += 1
      // this should always have a value, but this check will satisfy typescript
      if (result.value) {
        const byteCount = result.value.buffer.byteLength + leftoverBytesFromLast.byteLength
        const ptCount = Math.floor(byteCount / 8)
        const data = new Uint8Array(ptCount * 8)
        const dataFromCurResult = new Uint8Array(result.value.buffer, 0, data.length - leftoverBytesFromLast.length)
        data.set(leftoverBytesFromLast)
        data.set(dataFromCurResult, leftoverBytesFromLast.length)
        device.queue.writeBuffer(buffer, i, data.buffer)
        i += data.length
        currentPointCount += ptCount
        leftoverBytesFromLast = new Uint8Array(result.value.slice().buffer, dataFromCurResult.length)
      }
    }
  }, 0)

  return {
    offset,
    pointCount,
    getCurrentPointCount: () => currentPointCount,
    buffer
  }
}

function isLittleEndian () {
  const buffer = new ArrayBuffer(2)
  new DataView(buffer).setInt16(0, 256, true /* littleEndian */)
  // Int16Array uses the platform's endianness.
  return new Int16Array(buffer)[0] === 256
}
