// WebGPU demo
// NOTE: you must visit this on localhost or webgpu won't work
/// <reference types="@webgpu/types" />

import { mat4 } from 'gl-matrix'
import { GUI } from 'dat-gui'

main()
async function main() {
  const { device, context } = await setupWebGPU()

  const settings = {}
  const gui = new GUI()

  const positions: number[] = []
  const colors: number[] = []
  const size = 20
  const spacing = 1
  const rows = 50
  const cols = 200

  const totalWidth = cols * (size + spacing) + spacing
  const totalHeight = rows * (size + spacing) + spacing

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      // each position is the center of a cell, and there is spacing between cells and around the outside
      const x = i * (size + spacing) + spacing + size / 2
      const y = j * (size + spacing) + spacing + size / 2
      positions.push(x - totalWidth / 2, y - totalHeight / 2)
      colors.push(Math.random() * 0.4 + 0.4, Math.random() * 0.2 + 0.2, Math.random() * 0.5 + 0.5, 1)
    }
  }

  const verticesData = new Float32Array([-1, -1, -1, 1, 1, -1, 1, 1])
  const verticesBuffer = createGPUBuffer(device, verticesData.buffer, GPUBufferUsage.VERTEX)

  const positionsData = new Float32Array(positions)
  const positionsBuffer = createGPUBuffer(device, positionsData.buffer, GPUBufferUsage.VERTEX)

  const colorsData = new Float32Array(colors)
  const colorsBuffer = createGPUBuffer(device, colorsData.buffer, GPUBufferUsage.VERTEX)

  const projectionMatrix = mat4.ortho(
    mat4.create(),
    -context.canvas.width / 2,
    context.canvas.width / 2,
    -context.canvas.height / 2,
    context.canvas.height / 2,
    -1, 1
  )

  const shader = `
  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
  };

  struct Uniforms {
    projectionMatrix: mat4x4<f32>,
    size: f32,
  };

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;

  @vertex
  fn mainVertex(
    @location(0) pt: vec2f,
    @location(1) position: vec2f,
    @location(2) color: vec4f
  ) -> VertexOutput {
    let p = uniforms.size * 0.5 * pt + position;
    var output: VertexOutput;
    output.color = color;
    output.position = uniforms.projectionMatrix * vec4f(p, 0, 1);
    return output;
  }

  @fragment
  fn mainFragment(
    @location(0) color: vec4<f32>
  ) -> @location(0) vec4f {
    return color;
  }`

  const projectionMatrixData = new Float32Array(projectionMatrix)
  const bufferData = new Float32Array(projectionMatrixData.length + 4)
  bufferData.set(projectionMatrixData)
  bufferData[projectionMatrixData.length] = size
  const projectionMatrixUniform = createGPUBuffer(device, bufferData.buffer, GPUBufferUsage.UNIFORM)
  const projectionGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX,
      buffer: {}
    }]
  })

  const bufferGroup = device.createBindGroup({
    layout: projectionGroupLayout,
    entries: [{ binding: 0, resource: { buffer: projectionMatrixUniform } }]
  })

  const shaderModule = device.createShaderModule({ code: shader })
  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [projectionGroupLayout]
    }),
    vertex: {
      module: shaderModule,
      entryPoint: 'mainVertex',
      buffers: [
        {
          arrayStride: 8,
          stepMode: 'vertex' as const,
          attributes: [{
            shaderLocation: 0,
            format: 'float32x2' as const,
            offset: 0
          }]
        },
        {
          arrayStride: 8,
          stepMode: 'instance' as const,
          attributes: [{
            shaderLocation: 1,
            format: 'float32x2' as const,
            offset: 0
          }]
        },
        {
          arrayStride: 16,
          stepMode: 'instance' as const,
          attributes: [{
            shaderLocation: 2,
            format: 'float32x4' as const,
            offset: 0
          }]
        }
      ]
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'mainFragment',
      targets: [{ format: 'bgra8unorm' as const }]
    },
    primitive: {
      topology: 'triangle-strip',
    }
  })

  requestAnimationFrame(function loop() {
    const curTexture = context.getCurrentTexture()

    const commandEncoder = device.createCommandEncoder()
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: curTexture.createView(),
          clearValue: { r: 0.02, g: 0, b: 0.1, a: 1 },
          loadOp: 'clear' as const,
          storeOp: 'store' as const
        },
      ],
    })
    renderPass.setPipeline(pipeline)
    renderPass.setBindGroup(0, bufferGroup)
    renderPass.setVertexBuffer(0, verticesBuffer)
    renderPass.setVertexBuffer(1, positionsBuffer)
    renderPass.setVertexBuffer(2, colorsBuffer)
    renderPass.draw(4, rows * cols)
    renderPass.end()

    device.queue.submit([commandEncoder.finish()])

    requestAnimationFrame(loop)
  })
}

function createGPUBuffer(
  device: GPUDevice,
  data: ArrayBuffer & { buffer?: never }, // make sure this is NOT a TypedArray
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

function flatten<T>(arr: T[][]): T[] {
  return arr.reduce((flat, toFlatten) => {
    return flat.concat(toFlatten)
  }, [])
}
