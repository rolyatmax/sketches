// WebGPU demo
// NOTE: you must visit this on localhost or webgpu won't work

/// <reference types="@webgpu/types" />

import * as createCamera from '3d-view-controls'
import * as mat4 from 'gl-mat4'

const lineWidths = [
  // 0.001,
  // 0.005,
  0.009,
  0.024,
  0.05
]

main()
async function main() {
  const { device, context } = await setupWebGPU()

  const canvas = context.canvas
  const camera = createCamera(canvas, { zoomSpeed: 4 })
  camera.lookAt(
    [0, 0, 20], // center
    [0, 0, 0], // eye
    [1, 1, 1] // up
  )

  /*
    *  (-1, -1)-------------_(1, -1)
    *       |          _,-"  |
    *       o      _,-"      o
    *       |  _,-"          |
    *   (-1, 1)"-------------(1, 1)
    */
  const positionsData = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
  const positionsBuffer = createGPUBuffer(device, positionsData.buffer, GPUBufferUsage.VERTEX)

  const line: number[] = []
  const segmentCount = 150
  for (let i = 0; i < segmentCount; i++) {
    const x = (Math.pow(Math.random(), 3) * 2 - 1) * 3
    const y = (Math.random() * 2 - 1) * 3
    line.push(x, y, 0)

    if (Math.random() < 0.5) {
      line.push(9999, 9999, 9999)
    }
  }

  const lineSegmentsCount = (line.length / 3) - 1

  const lineData = new Float32Array(line)
  const lineBuffer = createGPUBuffer(device, lineData.buffer, GPUBufferUsage.VERTEX)

  const shader = `
  struct Uniforms {
    projection: mat4x4f,
    view: mat4x4f
  };

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;
  @group(1) @binding(0) var<uniform> lineWidth: f32;

  @vertex
  fn mainVertex(
    @location(0) pos: vec2f,
    @location(1) iStart: vec3f,
    @location(2) iEnd: vec3f
  ) -> @builtin(position) vec4f {
    if (iStart.x > 9998.0 || iEnd.x > 9998.0) {
      return vec4(0);
    }

    let x = pos.x * 0.5 + 0.5;
    let currentPt = mix(iStart, iEnd, x);
    let line = normalize(iEnd - iStart);
    let norm = vec3(-line.y, line.x, line.z);
    let offset = norm * lineWidth * pos.y;
    let p = offset + currentPt;

    return uniforms.projection * uniforms.view * vec4(p, 1);
  }

  @fragment
  fn mainFragment() -> @location(0) vec4f {
    return vec4(0.5, 0.6, 0.7, 1.0);
  }

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
  };

  @vertex
  fn quadVertex(
    @location(0) pos: vec2f,
    @location(1) point: vec3f
  ) -> VertexOutput {
    var p = vec3(pos.xy * lineWidth, 0) + point;
    if (point.x > 9998.0) {
      p = vec3(0);
    }

    var out: VertexOutput;
    out.position = uniforms.projection * uniforms.view * vec4(p, 1);
    out.uv = pos;
    return out;
  }

  @fragment
  fn circleFragment(
    @location(0) uv: vec2f
  ) -> @location(0) vec4f {
    let sqLen = uv.x * uv.x + uv.y * uv.y;
    if (sqLen > 1.0) {
      discard;
    }
    return vec4(0.5, 0.6, 0.7, 1.0);
  }
`

  const shaderModule = device.createShaderModule({ code: shader })

  const uniformsBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0, // uniforms
      visibility: GPUShaderStage.VERTEX,
      buffer: {}
    }]
  })

  const lineWidthsBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0, // lineWidth,
      visibility: GPUShaderStage.VERTEX,
      buffer: {}
    }]
  })

  // two mat4s = 32 floats
  const uniformsData = new Float32Array(32 * 4)
  const uniformsBuffer = createGPUBuffer(device, uniformsData, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)

  const stride = 3 * 4 // 3 floats
  const lineSegmentPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [uniformsBindGroupLayout, lineWidthsBindGroupLayout] }),
    vertex: {
      module: shaderModule,
      entryPoint: 'mainVertex',
      buffers: [{
        arrayStride: 2 * 4, // 2 floats
        stepMode: 'vertex' as GPUVertexStepMode,
        attributes: [{
          shaderLocation: 0,
          offset: 0,
          format: 'float32x2' as GPUVertexFormat
        }]
      },
      {
        arrayStride: stride,
        stepMode: 'instance' as GPUVertexStepMode,
        attributes: [{
          shaderLocation: 1,
          offset: 0,
          format: 'float32x3' as GPUVertexFormat
        }]
      },
      {
        arrayStride: stride,
        stepMode: 'instance' as GPUVertexStepMode,
        attributes: [{
          shaderLocation: 2,
          offset: 0,
          format: 'float32x3' as GPUVertexFormat
        }]
      }]
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'mainFragment',
      targets: [{
        format: 'bgra8unorm' as GPUTextureFormat,
      }]
    },
    primitive: {
      topology: 'triangle-strip',
    },
  })

  const lineCapPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [uniformsBindGroupLayout, lineWidthsBindGroupLayout] }),
    vertex: {
      module: shaderModule,
      entryPoint: 'quadVertex',
      buffers: [{
        arrayStride: 2 * 4, // 2 floats
        stepMode: 'vertex' as GPUVertexStepMode,
        attributes: [{
          shaderLocation: 0,
          offset: 0,
          format: 'float32x2' as GPUVertexFormat
        }]
      },
      {
        arrayStride: stride,
        stepMode: 'instance' as GPUVertexStepMode,
        attributes: [{
          shaderLocation: 1,
          offset: 0,
          format: 'float32x3' as GPUVertexFormat
        }]
      }]
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'circleFragment',
      targets: [{
        format: 'bgra8unorm' as GPUTextureFormat,
      }]
    },
    primitive: {
      topology: 'triangle-strip',
    },
  })

  const uniformBindGroup = device.createBindGroup({
    layout: uniformsBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformsBuffer } }
    ]
  })

  const lineWidthsBindGroups = lineWidths.map(lineWidth =>
    createLineWidthsBindGroup(device, lineWidthsBindGroupLayout, lineWidth)
  )

  requestAnimationFrame(function loop() {
    requestAnimationFrame(loop)

    const curTexture = context.getCurrentTexture()
    // const { width, height } = curTexture
    const { width, height } = canvas // using canvas width/height because on safari the width/height of the texture doesn't seem to update when resizing

    camera.tick()
    const projection = mat4.perspective([], Math.PI / 12, width / height, 0.01, 1000)
    const view = camera.matrix

    uniformsData.set(projection, 0)
    uniformsData.set(view, 16)
    device.queue.writeBuffer(uniformsBuffer, 0, uniformsData, 0, uniformsData.length)

    const commandEncoder = device.createCommandEncoder()
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: curTexture.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear' as GPULoadOp,
        storeOp: 'store' as GPUStoreOp
      }]
    })

    renderPass.setBindGroup(0, uniformBindGroup)
    renderPass.setVertexBuffer(0, positionsBuffer)

    const loops = lineWidthsBindGroups.length
    lineWidthsBindGroups.forEach((bg, idx) => {
      const count = Math.floor(lineSegmentsCount / loops)
      // draw line segments
      renderPass.setPipeline(lineSegmentPipeline)
      renderPass.setVertexBuffer(1, lineBuffer, count * idx * 12)
      renderPass.setVertexBuffer(2, lineBuffer, 12 + count * idx * 12)
      renderPass.setBindGroup(1, bg)
      renderPass.draw(4, count)

      // draw line caps
      renderPass.setPipeline(lineCapPipeline)
      renderPass.draw(4, count + 1)
    })

    renderPass.end()
    device.queue.submit([commandEncoder.finish()])
  })
}

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

function createLineWidthsBindGroup(device: GPUDevice, bgLayout: GPUBindGroupLayout, lineWidth: number) {
  return device.createBindGroup({
    layout: bgLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: createGPUBuffer(device, new Float32Array([lineWidth]).buffer, GPUBufferUsage.UNIFORM)
        }
      }
    ]
  })
}
