// WebGPU demo
// NOTE: you must visit this on localhost or webgpu won't work
/// <reference types="@webgpu/types" />

import { createSpring } from 'spring-animator'
import { vec2 } from 'gl-matrix'
import { GUI } from 'dat-gui'
import * as Delaunator from 'delaunator'

main()
async function main() {
  const { device, context } = await setupWebGPU()

  const settings = {}
  const gui = new GUI()

  const pts: [number, number][] = [
    // [-1, -1],
    // [-1, 1],
    // [1, -1],
    // [1, 1],
  ]

  const colors: [number, number, number, number][] = [
    // [0, 0, 0, 1],
    // [0, 0, 0, 1],
    // [0, 0, 0, 1],
    // [0, 0, 0, 1],
  ]

  let aspect = context.canvas.width / context.canvas.height

  const ptCountWidth = 20 // of width
  const ptCountHeight = Math.round(ptCountWidth / aspect)
  for (let i = 0; i <= ptCountWidth; i++) {
    for (let j = 0; j <= ptCountHeight; j++) {
      const offset = i % 2 === 0 ? 0 : (2 / (ptCountHeight - 1) / 2)
      pts.push([i / ptCountWidth * 2 - 1, j / ptCountHeight * 2 - 1 + offset])
      // colors.push([Math.random() * 0.5 + 0.5, Math.random() * 0.5 + 0.5, Math.random() * 0.5 + 0.5, 1])
      colors.push(Math.random() < 0.5 ? [Math.random() * 0.2 * 5, Math.random() * 0.1 * 5, Math.random() * 0.3 * 5, 1] : [0, 0, 0, 1])
    }
  }

  const ptsData = new Float32Array(flatten(pts))
  const ptsBuffer = createGPUBuffer(device, ptsData.buffer, GPUBufferUsage.VERTEX)

  const colorsData = new Float32Array(flatten(colors))
  const colorsBuffer = createGPUBuffer(device, colorsData.buffer, GPUBufferUsage.VERTEX)

  const triangles = Delaunator.from(pts).triangles
  const indexBuffer = createGPUBuffer(device, triangles.buffer, GPUBufferUsage.INDEX)
  console.log(triangles)

  const shader = `
  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
  };

  @vertex
  fn mainVertex(
    @location(0) position: vec2f,
    @location(1) color: vec4f
  ) -> VertexOutput {
    var output: VertexOutput;
    output.color = color;
    output.position = vec4f(position, 0, 1);
    return output;
  }

  @fragment
  fn mainFragment(
    @location(0) color: vec4<f32>
  ) -> @location(0) vec4f {
    return color;
  }`

  const shaderModule = device.createShaderModule({ code: shader })
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'mainVertex',
      buffers: [
        {
          arrayStride: 8,
          attributes: [{
            shaderLocation: 0,
            format: 'float32x2' as const,
            offset: 0
          }]
        },
        {
          arrayStride: 16,
          attributes: [{
            shaderLocation: 1,
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
      topology: 'triangle-list',
      // topology: 'point-list',
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
    renderPass.setVertexBuffer(0, ptsBuffer)
    renderPass.setVertexBuffer(1, colorsBuffer)
    renderPass.setIndexBuffer(indexBuffer, 'uint32')
    renderPass.drawIndexed(triangles.length, 1, 0, 0, 0)
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
