// WebGPU demo
// NOTE: you must visit this on localhost or webgpu won't work
/// <reference types="@webgpu/types" />

import { GUI } from 'dat-gui'
import * as random from 'canvas-sketch-util/random'

const palettes = [
  [166, 124, 135, 255],
  [63, 85, 115, 255],
  [106, 138, 166, 255],
  [218, 182, 182, 255],
  [242, 228, 228, 255],
  [101, 105, 117, 255],
  [116, 93, 113, 255]
]

// --------------------------------------
// NEXT TODO:
//  - make a uniforms manager that can create uniforms buffers and update them
//    and create bind groups / layouts and maybe even keep the WGSL shader code
//    uniforms struct in sync with the uniforms manager
//  - add animations for cell size and color
// --------------------------------------

main()
async function main() {
  const { device, context } = await setupWebGPU()

  const settings = {
    seed: 1,
    gridWidth: 8,
    gridHeight: 9,
    instruments: 2,
    cellSize: 90,
    cellSpacing: 100,
    squircleK: 2.9
  }

  const gui = new GUI()
  gui.add(settings, 'seed', 1, 10000).name('Seed').step(1)
  gui.add(settings, 'cellSize', 1, 400).name('Cell Size').step(1)
  gui.add(settings, 'cellSpacing', 0, 400).name('Cell Spacing').step(1)
  gui.add(settings, 'squircleK', 1, 20).name('Squircle K').step(0.1)

  const verticesData = new Float32Array([-1, -1, -1, 1, 1, -1, 1, 1])
  const verticesBuffer = createGPUBuffer(device, verticesData.buffer, GPUBufferUsage.VERTEX)

  const shader = `
  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
    @location(1) rand: vec4f,
    @location(2) size: vec2f,
    @location(3) uv: vec2f
  };

  struct Cell {
    color: vec4f,
    rand: vec4f,
    size: vec2f,
    position: vec2f
  };

  struct Uniforms {
    dimensions: vec2f,
    cellSize: f32,
    squircleK: f32,
  };

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;
  @group(0) @binding(1) var<storage, read> cells: array<Cell>;

  @vertex
  fn mainVertex(
    @location(0) position: vec2f,
    @builtin(instance_index) instanceIdx: u32
  ) -> VertexOutput {
    let p = cells[instanceIdx].position / uniforms.dimensions * 2.0 - 1.0;
    let normalizedCellSize = uniforms.cellSize / uniforms.dimensions;

    var output: VertexOutput;
    output.position = vec4f(p + position * normalizedCellSize, 0, 1);
    output.color = cells[instanceIdx].color;
    output.rand = cells[instanceIdx].rand;
    output.size = cells[instanceIdx].size;
    output.uv = position;
    return output;
  }

  fn squircle(p: vec2f, k: f32) -> f32 {
    let q = abs(p) / 1.0;
    return pow(pow(q.x, k) + pow(q.y, k), 1.0 / k);
  }

  @fragment
  fn mainFragment(
    @location(0) color: vec4f,
    @location(1) rand: vec4f,
    @location(2) size: vec2f,
    @location(3) uv: vec2f
  ) -> @location(0) vec4f {
    let t = squircle(uv, uniforms.squircleK);

    let mainColor = vec4f(color.rgb, color.a * (0.6 + 0.4 * rand.y));

    // Define outline parameters
    let outlineWidth = 0.03;
    let outlineStart = 1.0 - outlineWidth;
    let outlineColor = vec4f(0.1, 0.1, 0.1, 0.3 + rand.x * 0.4);

    // Calculate the main shape weight
    let mainWeight = smoothstep(1.0 - 0.05, 1.0, t);

    // Calculate the outline weight - no longer multiplied by size.x
    let outlineWeight = smoothstep(outlineStart - 0.02, outlineStart, t) *
                      (1.0 - smoothstep(outlineStart, outlineStart + 0.02, t));

    // Combine main shape and outline
    let mainShape = mix(vec4f(1.0, 1.0, 1.0, 0.0), mainColor, (1.0 - mainWeight) * size.x);
    // The outline is now always visible, only the main shape is affected by size
    return mix(mainShape, outlineColor, outlineWeight);
  }`

  function getCellPosition(i: number, j: number, instrument: number): [number, number] {
    const gridWidth = settings.cellSize + (settings.gridWidth - 1) * settings.cellSpacing
    const gridHeight = settings.cellSize + (settings.gridHeight - 1) * settings.cellSpacing

    const instrumentSpacing = settings.cellSpacing * 3

    const totalWidth = settings.instruments * gridWidth + instrumentSpacing * (settings.instruments - 1)

    const gridOffsetX = (context.canvas.width - totalWidth) / 2 + instrument * (gridWidth + instrumentSpacing)
    const gridOffsetY = (context.canvas.height - gridHeight) / 2
    return [
      i * settings.cellSpacing + settings.cellSize / 2 + gridOffsetX,
      j * settings.cellSpacing + settings.cellSize / 2 + gridOffsetY
    ]
  }

  function fillCellData(data: Float32Array, i: number) {
    const rand = random.createRandom(settings.seed + i)
    let n = i * cellComponentCount
    // cell color
    const color = rand.pick(palettes)
    data[n++] = color[0] / 255
    data[n++] = color[1] / 255
    data[n++] = color[2] / 255
    data[n++] = color[3] / 255

    // cell random values
    data[n++] = rand.value()
    data[n++] = rand.value()
    data[n++] = rand.value()
    data[n++] = rand.value()

    // cell size
    const isOn = rand.chance(0.4)
    data[n++] = isOn ? 1.0 : 0.0
    data[n++] = isOn ? 1.0 : 0.0

    // cell position
    const instrument = Math.floor(i / (settings.gridWidth * settings.gridHeight))
    const x = i % settings.gridWidth
    const y = Math.floor(i / settings.gridWidth) % settings.gridHeight
    const position = getCellPosition(x, y, instrument)
    data[n++] = position[0]
    data[n++] = position[1]
  }

  const cellComponentCount = 12
  const cellCount = settings.instruments * settings.gridWidth * settings.gridHeight
  const cellData = new Float32Array(cellCount * cellComponentCount)

  let i = 0
  while (i < cellCount) {
    fillCellData(cellData, i++)
  }
  console.log(cellData)
  const cellBuffer = createGPUBuffer(device, cellData.buffer, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST)

  const uniformsData = new Float32Array([
    context.canvas.width, context.canvas.height,
    settings.cellSize, settings.squircleK
  ])
  const uniformsBuffer = createGPUBuffer(device, uniformsData.buffer, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)
  const uniformsGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform' as const }
    }, {
      binding: 1,
      visibility: GPUShaderStage.VERTEX,
      buffer: { type: 'read-only-storage' as const }
    }]
  })

  const bindGroup = device.createBindGroup({
    layout: uniformsGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformsBuffer } },
      { binding: 1, resource: { buffer: cellBuffer } }
    ]
  })

  const shaderModule = device.createShaderModule({ code: shader })
  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [uniformsGroupLayout]
    }),
    vertex: {
      module: shaderModule,
      entryPoint: 'mainVertex',
      buffers: [{
        arrayStride: 8,
        stepMode: 'vertex' as const,
        attributes: [{
          shaderLocation: 0,
          format: 'float32x2' as const,
          offset: 0
        }]
      }]
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'mainFragment',
      targets: [{
        format: 'bgra8unorm' as const,
        blend: {
          color: {
            srcFactor: 'src-alpha' as const,
            dstFactor: 'one-minus-src-alpha' as const,
            operation: 'add' as const,
          },
          alpha: {
            srcFactor: 'src-alpha' as const,
            dstFactor: 'one-minus-src-alpha' as const,
            operation: 'add' as const,
          }
        }
      }]
    },
    primitive: {
      topology: 'triangle-strip',
    }
  })

  requestAnimationFrame(function loop() {
    let i = 0
    while (i < cellCount) {
      fillCellData(cellData, i++)
    }
    device.queue.writeBuffer(cellBuffer, 0, cellData)

    // update uniforms
    uniformsData[0] = context.canvas.width
    uniformsData[1] = context.canvas.height
    uniformsData[2] = settings.cellSize
    uniformsData[3] = settings.squircleK
    device.queue.writeBuffer(uniformsBuffer, 0, uniformsData)

    const curTexture = context.getCurrentTexture()

    const commandEncoder = device.createCommandEncoder()
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: curTexture.createView(),
          clearValue: { r: 1, g: 1, b: 1, a: 1 },
          loadOp: 'clear' as const,
          storeOp: 'store' as const
        },
      ],
    })
    renderPass.setPipeline(pipeline)
    renderPass.setBindGroup(0, bindGroup)
    renderPass.setVertexBuffer(0, verticesBuffer)
    renderPass.draw(4, cellCount)
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
