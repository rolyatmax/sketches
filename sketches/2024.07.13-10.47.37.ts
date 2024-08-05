// WebGPU demo
// NOTE: you must visit this on localhost or webgpu won't work

/// <reference types="@webgpu/types" />

import * as createCamera from '3d-view-controls'
import { mat4 } from 'gl-matrix'

const BUILDINGS_DATA_URL = 'resources/data/nyc-buildings/lower-manhattan.bin'

main()
async function main() {
  const { device, context } = await setupWebGPU()
  const canvas = context.canvas as HTMLCanvasElement
  const curTexture = context.getCurrentTexture()

  let isCameraMoving = false

  console.log('loading buildings data...')
  const result = await getBuildingsData(device, BUILDINGS_DATA_URL)
  const { indexCount, buffers, extent, buildingIdsArray } = result
  console.log('building data loaded')

  const center = [
    (extent.min[0] + extent.max[0]) / 2,
    (extent.min[1] + extent.max[1]) / 2
  ]

  const camera = createCamera(canvas, { zoomSpeed: 4 })
  camera.lookAt(
    [center[0], center[1], 70000], // center
    [center[0], center[1], 0], // eye
    [0, 0, 0] // up
  )

  const viewprojBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0, // viewproj
      visibility: GPUShaderStage.VERTEX,
      buffer: {}
    }]
  })

  // two mat4s = 32 floats
  const viewprojData = new Float32Array(32)
  const viewprojBuffer = createGPUBuffer(device, viewprojData, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)

  const viewprojBindGroup = device.createBindGroup({
    layout: viewprojBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: viewprojBuffer } }
    ]
  })

  const shader = `
  struct Uniforms {
    projection: mat4x4<f32>,
    view: mat4x4<f32>
  };

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;

  struct Output {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>
  };

  @vertex
  fn mainVertex(
    @location(0) position: vec3<f32>
  ) -> Output {
    let p = position;
    let t = smoothstep(-40, 500, p.z);
    var color = vec4f(0.4, 0.4, 0.55, 1) + vec4f(0.2, 0.3, 0.35, 0) * t;
    var output: Output;
    output.color = color;
    output.position = uniforms.projection * uniforms.view * vec4(p, 1);
    return output;
  }

  @fragment
  fn mainFragment(@location(0) color: vec4<f32>) -> @location(0) vec4<f32> {
    return color;
  }`

  const shaderModule = device.createShaderModule({ code: shader })
  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [viewprojBindGroupLayout]
    }),
    vertex: {
      module: shaderModule,
      entryPoint: 'mainVertex',
      buffers: [
        {
          arrayStride: 12,
          attributes: [
            {
              shaderLocation: 0,
              format: 'float32x3' as GPUVertexFormat,
              offset: 0
            }
          ]
        },
      ]
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'mainFragment',
      targets: [{ format: curTexture.format }]
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw',
      cullMode: 'back'
    },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less'
    }
  })

  const depthTexture = device.createTexture({
    size: { width: curTexture.width, height: curTexture.height },
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT
  })

  let projMatrix = mat4.create()

  const insetMapWidth = 500
  const insetMapHeight = 500
  const insetMapOffsetX = canvas.width - insetMapWidth - 50
  const insetMapOffsetY = canvas.height - insetMapHeight - 50

  const mapProjMatrix = mat4.perspective(mat4.create(), Math.PI / 8, insetMapWidth / insetMapHeight, 0.1, 10000000)
  const mapViewProjData = new Float32Array(32)
  mapViewProjData.set(mapProjMatrix, 0)
  camera.up = [0, 5, 0]
  camera.tick()
  mapViewProjData.set(camera.matrix, 16)

  const mapViewprojBuffer = createGPUBuffer(device, mapViewProjData, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)
  device.queue.writeBuffer(mapViewprojBuffer, 0, mapViewProjData, 0, mapViewProjData.length)
  const mapViewprojBindGroup = device.createBindGroup({
    layout: viewprojBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: mapViewprojBuffer } }
    ]
  })

  const insetMapTexture = device.createTexture({
    size: { width: insetMapWidth, height: insetMapHeight },
    format: 'bgra8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
  })
  const insetMapDepthTexture = device.createTexture({
    size: { width: insetMapWidth, height: insetMapHeight },
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT
  })

  const renderQuad = createQuadRenderer(device)

  requestAnimationFrame(function loop() {
    const { width, height } = canvas // using canvas width/height because on safari the width/height of the texture doesn't seem to update when resizing

    camera.up = [0, 0, 1]
    camera.tick()
    mat4.perspective(projMatrix, Math.PI / 8, width / height, 0.1, 10000000)
    const view = camera.matrix

    isCameraMoving = !mat4.equals(viewprojData.subarray(16), view) || !mat4.equals(viewprojData, projMatrix)
    const isDirty = isCameraMoving

    if (isDirty) {
      console.log('rendering')
      viewprojData.set(projMatrix, 0)
      viewprojData.set(view, 16)
      device.queue.writeBuffer(viewprojBuffer, 0, viewprojData, 0, viewprojData.length)

      const curTexture = context.getCurrentTexture()
      const curTextureView = curTexture.createView()
      const depthTextureView = depthTexture.createView()

      const commandEncoder = device.createCommandEncoder()
      const mainRenderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: curTextureView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear' as const,
          storeOp: 'store' as const
        }],
        depthStencilAttachment: {
          view: depthTextureView,
          depthClearValue: 1.0,
          depthLoadOp: 'clear',
          depthStoreOp: 'discard'
        }
      })

      mainRenderPass.setPipeline(pipeline)
      mainRenderPass.setBindGroup(0, viewprojBindGroup)
      mainRenderPass.setVertexBuffer(0, buffers.positions)
      mainRenderPass.setIndexBuffer(buffers.indexes, 'uint32')
      mainRenderPass.drawIndexed(indexCount)
      mainRenderPass.end()

      const insetMapRenderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: insetMapTexture.createView(),
          clearValue: { r: 0.1, g: 0, b: 0.2, a: 1 },
          loadOp: 'clear' as const,
          storeOp: 'store' as const
        }],
        depthStencilAttachment: {
          view: insetMapDepthTexture.createView(),
          depthClearValue: 1.0,
          depthLoadOp: 'clear',
          depthStoreOp: 'discard'
        }
      })

      insetMapRenderPass.setPipeline(pipeline)
      insetMapRenderPass.setBindGroup(0, mapViewprojBindGroup)
      insetMapRenderPass.setVertexBuffer(0, buffers.positions)
      insetMapRenderPass.setIndexBuffer(buffers.indexes, 'uint32')
      insetMapRenderPass.drawIndexed(indexCount)
      insetMapRenderPass.end()

      const finalRenderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: curTextureView,
          loadOp: 'load' as const,
          storeOp: 'store' as const
        }]
      })
      renderQuad(finalRenderPass, insetMapTexture, [insetMapWidth, insetMapHeight], [insetMapOffsetX, insetMapOffsetY])
      finalRenderPass.end()

      device.queue.submit([commandEncoder.finish()])
    }

    requestAnimationFrame(loop)
  })
}

function createQuadRenderer(device: GPUDevice) {
  const shader = `
  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) texCoord: vec2f,
  }

  @vertex
  fn mainVertex(@builtin(vertex_index) VertexIndex: u32) -> VertexOutput {
    var positions = array<vec2f, 4>(
      vec2f(-1, -1),
      vec2f(-1, 1),
      vec2f(1, -1),
      vec2f(1, 1)
    );

    let p = positions[VertexIndex];
    let c = (vec2f(0, 1) - (p * 0.5 + 0.5)) * vec2f(-1, 1);

    var output: VertexOutput;
    output.position = vec4f(p, 0, 1);
    output.texCoord = c;
    return output;
  }

  @group(0) @binding(0) var texSampler: sampler;
  @group(0) @binding(1) var tex: texture_2d<f32>;

  @fragment
  fn mainFragment(@location(0) texCoord: vec2f) -> @location(0) vec4f {
    return textureSample(tex, texSampler, texCoord);
  }
  `

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {},
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {},
      },
    ],
  });

  const shaderModule = device.createShaderModule({ code: shader })
  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: shaderModule,
      entryPoint: 'mainVertex',
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'mainFragment',
      targets: [{ format: 'bgra8unorm' as const }]
    },
    primitive: {
      topology: 'triangle-strip',
    },
  })

  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  })

  const bindGroupsByTexture = new Map<GPUTexture, GPUBindGroup>()
  return function renderBg(renderPass: GPURenderPassEncoder, texture: GPUTexture, dimensions: [number, number], offset: [number, number] = [0, 0]) {
    if (!bindGroupsByTexture.has(texture)) {
      bindGroupsByTexture.set(texture, device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: texture.createView() }
        ]
      }))
    }
    const bindGroup = bindGroupsByTexture.get(texture)!

    renderPass.setPipeline(pipeline)
    renderPass.setBindGroup(0, bindGroup)
    renderPass.setViewport(offset[0], offset[1], dimensions[0], dimensions[1], 0, 1)
    renderPass.draw(4)
  }
}

// buildings data streamer

type BuildingsData = {
  indexCount: number
  extent: {
    min: [number, number, number]
    max: [number, number, number]
  }
  buildingIdsArray: Uint32Array
  buffers: {
    positions: GPUBuffer
    indexes: GPUBuffer
    // barys: GPUBuffer
    buildingIds: GPUBuffer
  }
}

export const MAX_BUFFER_SIZE_BYTES = 268435456 // 256MiB
export const MAX_ARRAY_SIZE = Math.floor(MAX_BUFFER_SIZE_BYTES / 4 / 3 / 32) * 3
export const MAX_ARRAY_SIZE_BYTES = MAX_ARRAY_SIZE * 4

if (MAX_ARRAY_SIZE % 3 !== 0) throw new Error('Array size is not divisible by 3, which is required for triangle lists')

async function getBuildingsData (device: GPUDevice, url: string): Promise<BuildingsData> {
  const response = await fetch(url)
  if (!response.body) {
    throw new Error('Unable to fetch data. No response.body.')
  }

  const decoder = new StreamDecoder()
  const reader = response.body.getReader()

  while (true) {
    const result = await reader.read()
    if (result?.value) decoder.onChunk(result.value)
    if (result.done) break
  }

  const { vertices, buildingIds, indexes, buildingCount, triangleCount, version, extent } = decoder.getCurrentResult()!
  const positionsSample = vertices.slice(0, 18)
  const indexSample = indexes.slice(0, 9)
  const buildingIdsSample = buildingIds.slice(0, 18)
  console.log({ buildingCount, triangleCount, version, positionsSample, indexSample, buildingIdsSample })

  const positionsBuffer = createGPUBuffer(device, vertices.buffer, GPUBufferUsage.VERTEX)
  const buildingIdsBuffer = createGPUBuffer(device, buildingIds.buffer, GPUBufferUsage.VERTEX)
  const indexesBuffer = createGPUBuffer(device, indexes.buffer, GPUBufferUsage.INDEX)

  return {
    indexCount: triangleCount * 3,
    extent,
    buildingIdsArray: buildingIds,
    buffers: {
      buildingIds: buildingIdsBuffer,
      positions: positionsBuffer,
      indexes: indexesBuffer
    }
  }
}

/*

Client-side code for decoding the following data format in Uint8 chunks.

Usage:

    const decoder = new StreamDecoder()
    decoder.onChunk(uint8Array) // call on every chunk (whether loading from a Socket or a BodyReader stream, etc)
    const result: Result = decoder.getCurrentResult()
    decoder.done // this will be true when all data expected from the header is done processing

Data format (v0.1.0):

---- HEADER ----
version major - u8
version minor - u8
version patch - u8
empty - u8
vertexCount - uint32
triangleCount - uint32
buildingCount - uint32
-----
buildingByteLength - uint32
buildingId - uint32
vertexCount - uint32
vertexA - float32x3
vertexB - float32x3
...
triangleCount - uint32
triA - uint8x3 (or uint16x3 if vertexCount > 255)
triB - uint8x3 (or uint16x3 if vertexCount > 255)
Possible padding here to make this list align to 4bytes
...
repeat with next building

*/

type Result = {
  vertices: Float32Array
  // TODO: support barycentric coords - maybe on the next version of the data?
  // barys: Float32Array
  indexes: Uint32Array
  buildingIds: Uint32Array
  buildingsProcessed: number
  trianglesProcessed: number
  verticesProcessed: number
  buildingCount: number
  triangleCount: number
  version: string
  extent: {
    min: [number, number, number]
    max: [number, number, number]
  }
}

const HEADER_SIZE = 16

class StreamDecoder {
  private result: Result | null = null
  private leftoverChunk: Uint8Array | null = null
  public done: Boolean = false
  public onChunk (chunk: Uint8Array): void {
    chunk = this.mergeWithLeftoverChunk(chunk)

    const needsHeader = this.result === null
    if (needsHeader) {
      if (chunk.length < HEADER_SIZE) {
        this.leftoverChunk = chunk.slice() // TODO: DO I NEED TO COPY THIS?
        return
      }
      this.processHeader(new Uint8Array(chunk.buffer, chunk.byteOffset, HEADER_SIZE))
      chunk = new Uint8Array(chunk.buffer, chunk.byteOffset + HEADER_SIZE)
    }

    while (true) {
      if (chunk.length === 0) break
      const dataview = new DataView(chunk.buffer, chunk.byteOffset)
      const buildingByteLength = dataview.getUint32(0, true)
      // see if this chunk contains the data for the entire building (minus 4 bytes for the
      // buildingByteLength uint32 - which isn't included in the count)
      // if not, then stick all of it in the leftoverChunk and try again on the next tick
      if (chunk.length < buildingByteLength + 4) {
        this.leftoverChunk = chunk.slice() // TODO: DO I NEED TO COPY THIS?
        break
      }
      this.processBuilding(new Uint8Array(chunk.buffer, chunk.byteOffset + 4, buildingByteLength))
      chunk = new Uint8Array(chunk.buffer, chunk.byteOffset + 4 + buildingByteLength)
    }

    if (this.result && this.result.buildingsProcessed === this.result.buildingCount) {
      this.done = true
      if (chunk.length !== 0) throw new Error('Decoding data failed: processed all buildings with data left over')
    }
  }

  private mergeWithLeftoverChunk (chunk: Uint8Array): Uint8Array {
    if (!this.leftoverChunk || this.leftoverChunk.length === 0) {
      return chunk
    }
    // TODO: CREATE A DATASTRUCTURE THAT HOLDS 2+ BUFFERS AND CAN PROCESS THEM WITHOUT
    // HAVING TO DO COPIES TO MERGE THE TWO BUFFERS INTO ONE
    const newChunk = new Uint8Array(this.leftoverChunk.length + chunk.length)
    newChunk.set(this.leftoverChunk, 0)
    newChunk.set(chunk, this.leftoverChunk.length)
    this.leftoverChunk = null
    return newChunk
  }

  private processBuilding (chunk: Uint8Array): void {
    if (!this.result) throw new Error('Decoding data failed: tried processing building before header')

    const dataview = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    let i = 0
    const buildingId = dataview.getUint32(i, true)
    const vertexCount = dataview.getUint32(i + 4, true)
    const vertices = new Float32Array(chunk.buffer, chunk.byteOffset + 8, vertexCount * 3)
    i += 8 + vertices.byteLength
    const triangleCount = dataview.getUint32(i, true)
    i += 4
    const TypedArray = vertexCount > 255 ? Uint16Array : Uint8Array
    const triangles = new TypedArray(chunk.buffer, chunk.byteOffset + i, triangleCount * 3)

    const triangleListInBytes = TypedArray.BYTES_PER_ELEMENT * triangleCount * 3
    const expectedPadding = (4 - triangleListInBytes % 4) % 4
    // the chunk should have been completely consumed after the list of triangles + expectedPadding
    if (chunk.byteLength !== i + triangles.byteLength + expectedPadding) {
      throw new Error('Decoding data failed: building data has leftover bytes after processing')
    }

    const lastVertex = this.result.verticesProcessed
    const lastVertexIdx = lastVertex * 3
    this.result.vertices.set(vertices, lastVertexIdx)

    for (let k = 0; k < vertexCount; k++) {
      this.result.extent.min[0] = Math.min(vertices[k * 3], this.result.extent.min[0])
      this.result.extent.min[1] = Math.min(vertices[k * 3 + 1], this.result.extent.min[1])
      this.result.extent.min[2] = Math.min(vertices[k * 3 + 2], this.result.extent.min[2])
      this.result.extent.max[0] = Math.max(vertices[k * 3], this.result.extent.max[0])
      this.result.extent.max[1] = Math.max(vertices[k * 3 + 1], this.result.extent.max[1])
      this.result.extent.max[2] = Math.max(vertices[k * 3 + 2], this.result.extent.max[2])
    }

    for (let k = 0; k < vertexCount; k++) {
      this.result.buildingIds[this.result.verticesProcessed + k] = buildingId
    }

    this.result.verticesProcessed += vertexCount

    for (let j = 0; j < triangles.length; j += 3) {
      const idx = this.result.trianglesProcessed * 3
      this.result.indexes[idx] = triangles[j] + lastVertex
      this.result.indexes[idx + 1] = triangles[j + 1] + lastVertex
      this.result.indexes[idx + 2] = triangles[j + 2] + lastVertex
      this.result.trianglesProcessed += 1
    }

    this.result.buildingsProcessed += 1
  }

  private processHeader (chunk: Uint8Array): void {
    const dataview = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    const version = `${chunk[0]}.${chunk[1]}.${chunk[2]}`
    if (chunk[3] !== 0) throw new Error('Decoding data failed: invalid header')
    const vertexCount = dataview.getUint32(4, true)
    const triangleCount = dataview.getUint32(8, true)
    const buildingCount = dataview.getUint32(12, true)
    const indexCount = triangleCount * 3
    console.log({ version, triangleCount, buildingCount, vertexCount, indexCount })
    this.result = {
      vertices: new Float32Array(vertexCount * 3),
      indexes: new Uint32Array(indexCount),
      buildingIds: new Uint32Array(vertexCount),
      buildingsProcessed: 0,
      trianglesProcessed: 0,
      verticesProcessed: 0,
      buildingCount,
      triangleCount,
      version,
      extent: {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity]
      }
    }
  }

  public getCurrentResult (): Result | null {
    return this.result
  }
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
