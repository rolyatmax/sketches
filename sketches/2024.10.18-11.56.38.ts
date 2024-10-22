// WebGPU demo
// NOTE: you must visit this on localhost or webgpu won't work
/// <reference types="@webgpu/types" />

import { mat4 } from 'gl-matrix'
import { GUI } from 'dat-gui'

const palettes = [
  [166, 124, 135, 255],
  [63, 85, 115, 255],
  [106, 138, 166, 255],
  [218, 182, 182, 255],
  [242, 228, 228, 255],
  [101, 105, 117, 255],
  [116, 93, 113, 255]
]

const MAX_GRID_DIM_SIZE = 64

// --------------------------------------
// NEXT TODO:
//  - use different bind groups for uniforms and cells
//  - make a uniforms manager that can create uniforms buffers and update them
//    and create bind groups / layouts and maybe even keep the WGSL shader code
//    uniforms struct in sync with the uniforms manager
//  - add animations for cell size and color
//  - improve performance by rendering each cell as an instance
// --------------------------------------

main()
async function main() {
  const { device, context } = await setupWebGPU()

  const settings = {
    gridWidth: 8,
    gridHeight: 9,
    cellSize: 60,
    cellSpacing: 105,
    squircleK: 3.7,
    curColIdx: 0
  }

  const gui = new GUI()
  gui.add(settings, 'gridWidth', 1, MAX_GRID_DIM_SIZE).name('Grid Width').step(1)
  gui.add(settings, 'gridHeight', 1, MAX_GRID_DIM_SIZE).name('Grid Height').step(1)
  gui.add(settings, 'cellSize', 1, 400).name('Cell Size').step(1)
  gui.add(settings, 'cellSpacing', 0, 400).name('Cell Spacing').step(1)
  gui.add(settings, 'squircleK', 1, 20).name('Squircle K').step(0.1)
  gui.add(settings, 'curColIdx', 0, 32).name('Current Column').step(1)

  const verticesData = new Float32Array([-1, -1, -1, 1, 1, -1, 1, 1])
  const verticesBuffer = createGPUBuffer(device, verticesData.buffer, GPUBufferUsage.VERTEX)

  const shader = `
  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
  };

  struct Uniforms {
    dimensions: vec2f,
    gridDimensions: vec2f,
    cellSize: f32,
    cellSpacing: f32,
    squircleK: f32,
    curColIdx: f32,
    palettes: array<vec4f, ${palettes.length}>,
  };

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;
  @group(0) @binding(1) var<storage, read> cells: array<vec2<u32>>;

  @vertex
  fn mainVertex(
    @location(0) position: vec2f
  ) -> @builtin(position) vec4<f32> {
    return vec4f(position, 0, 1);
  }

  fn getCellPosition(ij: vec2f) -> vec2f {
    return ij * uniforms.cellSpacing + uniforms.cellSize / 2.0;
  }

  fn squircle(p: vec2f, center: vec2f, size: vec2f, k: f32) -> f32 {
    let q = abs(p - center) / size;
    return pow(pow(q.x, k) + pow(q.y, k), 1.0 / k);
  }

  @fragment
  fn mainFragment(
    @builtin(position) position: vec4<f32>
  ) -> @location(0) vec4f {
    // grid is just cell spacing * grid dimensions - 1 + cell size
    let gridDims = uniforms.cellSize + (uniforms.gridDimensions - 1.0) * uniforms.cellSpacing;
    let gridOffset = (uniforms.dimensions - gridDims) / 2.0;
    let cellDims = vec2f(uniforms.cellSize, uniforms.cellSize);
    let gridBuffer = gridDims * 0.1;
    let minXY = gridOffset - gridBuffer;
    let maxXY = gridOffset + gridDims + gridBuffer;

    // if position is outside of grid, return white
    if (position.x < minXY.x || position.x > maxXY.x || position.y < minXY.y || position.y > maxXY.y) {
      return vec4f(1.0);
    }

    // rgb is weighted sum of colors, a is sum of weights
    var color: vec4f = vec4f(0.0, 0.0, 0.0, 0.01);

    // Calculate grid position once
    let gridPos = (position.xy - gridOffset) / uniforms.cellSpacing;
    let gridPosFloor = floor(gridPos);

    // Limit the loop to nearby cells
    let cellRadius = 2.0;
    let startI = max(0.0, gridPosFloor.x - cellRadius);
    let endI = min(uniforms.gridDimensions.x - 1.0, gridPosFloor.x + cellRadius);
    let startJ = max(0.0, gridPosFloor.y - cellRadius);
    let endJ = min(uniforms.gridDimensions.y - 1.0, gridPosFloor.y + cellRadius);

    for (var i = startI; i <= endI; i += 1.0) {
      let isCur: f32 = step(abs(i - uniforms.curColIdx), 0.001);
      for (var j = startJ; j <= endJ; j += 1.0) {
        let cellIdx = u32(j * uniforms.gridDimensions.x + i);
        let cell = cells[cellIdx];
        let cellColor: vec4f = uniforms.palettes[cell.y];
        let fadedColor = vec4f(mix(vec3f(1.0), cellColor.rgb, 0.4), 1.0);
        let cellPosition = getCellPosition(vec2f(i, j)) + gridOffset;
        let t = squircle(position.xy, cellPosition, cellDims, uniforms.squircleK);
        let weight = 1.0 - smoothstep(0.0, 1.0, t);
        let curColor = mix(fadedColor, cellColor, isCur);
        color += curColor * weight * f32(cell.x);
      }
    }

    let breakpoint = 0.12;
    let fade = 0.008;
    return mix(vec4f(1.0), color / color.a, smoothstep(breakpoint - fade, breakpoint + fade, color.a));
  }`

  const cellData = new Uint32Array(MAX_GRID_DIM_SIZE * MAX_GRID_DIM_SIZE * 2)
  let n = 0
  while (n < cellData.length) {
    // on or off
    cellData[n++] = Math.random() > 0.5 ? 1.0 : 0.0
    // palette color index
    cellData[n++] = Math.random() * palettes.length | 0
  }
  console.log(cellData)
  const cellBuffer = createGPUBuffer(device, cellData.buffer, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST)

  const uniformsData = new Float32Array([
    context.canvas.width, context.canvas.height,
    settings.gridWidth, settings.gridHeight,
    settings.cellSize, settings.cellSpacing,
    settings.squircleK, settings.curColIdx % settings.gridWidth,
    ...flatten(palettes).map(c => c / 255)
  ])
  const uniformsBuffer = createGPUBuffer(device, uniformsData.buffer, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)
  const uniformsGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform' as const }
    }, {
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT,
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
      targets: [{ format: 'bgra8unorm' as const }]
    },
    primitive: {
      topology: 'triangle-strip',
    }
  })

  requestAnimationFrame(function loop() {
    // for (let i = 0; i < cellData.length; i++) {
    //   cellData[i] = Math.random()
    // }
    // device.queue.writeBuffer(cellBuffer, 0, cellData)

    // update uniforms
    uniformsData[0] = context.canvas.width
    uniformsData[1] = context.canvas.height
    uniformsData[2] = settings.gridWidth
    uniformsData[3] = settings.gridHeight
    uniformsData[4] = settings.cellSize
    uniformsData[5] = settings.cellSpacing
    uniformsData[6] = settings.squircleK
    uniformsData[7] = settings.curColIdx % settings.gridWidth
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
    renderPass.draw(4)
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
