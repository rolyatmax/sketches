// WebGPU demo
// NOTE: you must visit this on localhost or webgpu won't work

/// <reference types="@webgpu/types" />

import * as createCamera from '3d-view-controls'
import { createSpring } from 'spring-animator'
import { mat4, vec2 } from 'gl-matrix'
import { GUI } from 'dat-gui'

const settings = {
  cameraDist: 20000,
  stiffness: 0.0005,
  damping: 0.04
}

const BUILDINGS_DATA_URL = 'resources/data/nyc-buildings/lower-manhattan-sorted.bin'

main()
async function main() {
  const { device, context } = await setupWebGPU()
  const canvas = context.canvas as HTMLCanvasElement
  const curTexture = context.getCurrentTexture()

  let isCameraMoving = false

  console.log('loading buildings data...')
  const result = await getBuildingsData(device, BUILDINGS_DATA_URL)
  const { buffers, extent } = result
  console.log('building data loaded')

  const center = [
    (extent.min[0] + extent.max[0]) / 2,
    (extent.min[1] + extent.max[1]) / 2
  ]

  const cameraEye = [center[0] - 4, center[1], 70000]
  const cameraCenter = [center[0], center[1], 0]

  const camera = createRoamingCamera({
    zoomSpeed: 4,
    canvas,
    center: cameraCenter,
    eye: cameraEye,
    damping: settings.damping,
    stiffness: settings.stiffness,
    getCameraPosition: () => ({
      center: [...center.map(v => v + (Math.random() - 0.5) * settings.cameraDist), Math.random() * 400],
      height: Math.random() * 10000 + 500,
      distance: Math.random() * 10000 + 1000,
      angle: (Math.random() * 2 - 1) * Math.PI
    })
  })

  const gui = new GUI()
  gui.add(settings, 'cameraDist', 0, 100000)
  gui.add(settings, 'stiffness', 0, 0.001).step(0.0001)
  gui.add(settings, 'damping', 0, 0.1).step(0.01)
  gui.add({ next: () => camera.moveToNextPosition() }, 'next')

  console.log('center', center)

  const viewprojBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0, // viewproj
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
      buffer: {}
    }]
  })

  // two mat4s = 32 floats
  const viewprojData = new Float32Array(32)
  const viewprojBuffer = createGPUBuffer(device, viewprojData.buffer, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)

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

  const indexGroupCount = 10000
  const indexGroups = getIndexGroups(indexGroupCount, result.data.positions, result.data.indexes)

  const culler = createGpuCuller(device, indexGroups, viewprojBindGroupLayout)
  const indirectBuffer = culler.indirectDrawParamsBuffer

  const mainRenderBundleEncoder = device.createRenderBundleEncoder({
    colorFormats: ['bgra8unorm' as const],
    depthStencilFormat: 'depth24plus' as const
  })
  mainRenderBundleEncoder.setPipeline(pipeline)
  mainRenderBundleEncoder.setBindGroup(0, viewprojBindGroup)
  mainRenderBundleEncoder.setVertexBuffer(0, buffers.positions)
  mainRenderBundleEncoder.setIndexBuffer(buffers.indexes, 'uint32')
  for (let i = 0; i < indexGroupCount; i++) {
    mainRenderBundleEncoder.drawIndexedIndirect(indirectBuffer, 20 * i)
  }
  const mainRenderBundle = mainRenderBundleEncoder.finish()

  requestAnimationFrame(function loop() {
    const { width, height } = canvas // using canvas width/height because on safari the width/height of the texture doesn't seem to update when resizing

    camera._camera.up = [0, 0, 1]
    camera.tick(settings.stiffness, settings.damping)
    mat4.perspective(projMatrix, Math.PI / 8, width / height, 1, 1000000)
    const view = camera.getMatrix()

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

      culler.cullGroups(commandEncoder, viewprojBindGroup)

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

      mainRenderPass.executeBundles([mainRenderBundle])
      mainRenderPass.end()

      device.queue.submit([commandEncoder.finish()])
    }

    requestAnimationFrame(loop)
  })
}

function createGpuCuller(device: GPUDevice, indexGroups: IndexGroup[], viewProjBindGroupLayout: GPUBindGroupLayout) {
  const indirectDrawParams = new Uint32Array(5 * indexGroups.length)
  const bBoxData = new Float32Array(indexGroups.length * 8) // minxyz_, maxxyz_
  const indexGroupDrawData = new Uint32Array(indexGroups.length) // indexCount
  let i = 0
  for (const indexGroup of indexGroups) {
    indirectDrawParams[i * 5] = indexGroup.indexCount
    indirectDrawParams[i * 5 + 1] = 1
    indirectDrawParams[i * 5 + 2] = indexGroup.indexOffset
    bBoxData.set(indexGroup.min, i * 8)
    bBoxData.set(indexGroup.max, i * 8 + 4)
    indexGroupDrawData[i] = indexGroup.indexCount
    i++
  }

  const bBoxBuffer = createGPUBuffer(device, bBoxData.buffer, GPUBufferUsage.STORAGE)
  const indexGroupDrawBuffer = createGPUBuffer(device, indexGroupDrawData.buffer, GPUBufferUsage.STORAGE)
  const indirectDrawParamsBuffer = createGPUBuffer(device, indirectDrawParams.buffer, GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT)

  const shader = `
    struct Box {
      min: vec3<f32>,
      max: vec3<f32>,
    }

    struct Plane {
      normal: vec3<f32>,
      distance: f32,
    }

    fn get_plane(x: f32, y: f32, z: f32, w: f32) -> Plane {
      let normal = vec3<f32>(x, y, z);
      let inverse_normal_length = 1.0 / length(normal);
      return Plane(
        normal * inverse_normal_length,
        w * inverse_normal_length
      );
    }

    fn get_planes(m: mat4x4<f32>) -> array<Plane, 6> {
      return array<Plane, 6>(
        // right
        get_plane(m[0][3] - m[0][0], m[1][3] - m[1][0], m[2][3] - m[2][0], m[3][3] - m[3][0]),
        // left
        get_plane(m[0][3] + m[0][0], m[1][3] + m[1][0], m[2][3] + m[2][0], m[3][3] + m[3][0]),
        // bottom
        get_plane(m[0][3] + m[0][1], m[1][3] + m[1][1], m[2][3] + m[2][1], m[3][3] + m[3][1]),
        // top
        get_plane(m[0][3] - m[0][1], m[1][3] - m[1][1], m[2][3] - m[2][1], m[3][3] - m[3][1]),
        // z-far
        get_plane(m[0][3] - m[0][2], m[1][3] - m[1][2], m[2][3] - m[2][2], m[3][3] - m[3][2]),
        // z-near
        get_plane(m[0][3] + m[0][2], m[1][3] + m[1][2], m[2][3] + m[2][2], m[3][3] + m[3][2])
      );
    }

    fn distance_to_point(plane: Plane, p: vec3<f32>) -> f32 {
      return dot(plane.normal, p) + plane.distance;
    }

    fn intersects_box(matrix: mat4x4<f32>, box: Box) -> bool {
      let planes = get_planes(matrix);
      for (var i: u32 = 0u; i < 6u; i++) {
        let plane = planes[i];
        // corner at max distance
        let p = vec3<f32>(
          select(box.min.x, box.max.x, plane.normal.x > 0.0),
          select(box.min.y, box.max.y, plane.normal.y > 0.0),
          select(box.min.z, box.max.z, plane.normal.z > 0.0)
        );

        if (distance_to_point(plane, p) < 0.0) {
          return false;
        }
      }

      return true;
    }

    struct InputBbox {
      min: vec4<f32>,
      max: vec4<f32>,
    };

    struct Uniforms {
      projection: mat4x4<f32>,
      view: mat4x4<f32>
    };

    @group(0) @binding(0) var<uniform> uniforms: Uniforms;

    @group(1) @binding(1) var<storage, read> indexCounts: array<u32>;
    @group(1) @binding(2) var<storage, read> boxes: array<InputBbox>;
    @group(1) @binding(3) var<storage, read_write> results: array<u32>;

    @compute @workgroup_size(64)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
      let index = global_id.x;
      if (index >= arrayLength(&boxes)) {
        return;
      }

      let matrix = uniforms.projection * uniforms.view;
      let box = boxes[index];
      let indexCount = indexCounts[index];
      let isVisible = intersects_box(matrix, Box(box.min.xyz, box.max.xyz));
      results[index * 5] = select(0u, indexCount, isVisible);
    }
  `

  const indexGroupsBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage' as const }
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage' as const }
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'storage' as const }
      }
    ]
  })

  const computePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [viewProjBindGroupLayout, indexGroupsBindGroupLayout]
    }),
    compute: {
      module: device.createShaderModule({ code: shader }),
      entryPoint: 'main'
    }
  })

  const indexGroupsBindGroup = device.createBindGroup({
    layout: indexGroupsBindGroupLayout,
    entries: [
      { binding: 1, resource: { buffer: indexGroupDrawBuffer } },
      { binding: 2, resource: { buffer: bBoxBuffer } },
      { binding: 3, resource: { buffer: indirectDrawParamsBuffer } }
    ]
  })

  function cullGroups(commandEncoder: GPUCommandEncoder, viewProjBindGroup: GPUBindGroup) {
    const computePass = commandEncoder.beginComputePass()
    computePass.setPipeline(computePipeline)
    computePass.setBindGroup(0, viewProjBindGroup)
    computePass.setBindGroup(1, indexGroupsBindGroup)
    computePass.dispatchWorkgroups(Math.ceil(indexGroups.length / 64))
    computePass.end()
  }

  return { cullGroups, indirectDrawParamsBuffer }
}

type IndexGroup = {
  indexCount: number
  indexOffset: number
  min: [number, number, number]
  max: [number, number, number]
}
function getIndexGroups(groupCount: number, vertices: Float32Array, indexes: Uint32Array): IndexGroup[] {
  const indexCountPerDraw = Math.ceil(indexes.length / groupCount / 3) * 3
  const indexGroups = new Array<IndexGroup>()
  let indexOffset = 0
  for (let i = 0; i < groupCount; i++) {
    const indexCount = Math.min(indexCountPerDraw, indexes.length - indexOffset)
    const min: [number, number, number] = [Infinity, Infinity, Infinity]
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
    for (let j = 0; j < indexCount; j++) {
      const idx = indexes[indexOffset + j] * 3
      min[0] = Math.min(min[0], vertices[idx])
      min[1] = Math.min(min[1], vertices[idx + 1])
      min[2] = Math.min(min[2], vertices[idx + 2])
      max[0] = Math.max(max[0], vertices[idx])
      max[1] = Math.max(max[1], vertices[idx + 1])
      max[2] = Math.max(max[2], vertices[idx + 2])
    }

    indexGroups.push({ indexCount, indexOffset, min, max })
    indexOffset += indexCountPerDraw
  }
  return indexGroups
}

// buildings data streamer

type BuildingsData = {
  indexCount: number
  extent: {
    min: [number, number, number]
    max: [number, number, number]
  }
  data: {
    buildingIds: Uint32Array
    positions: Float32Array
    indexes: Uint32Array
  }
  buffers: {
    positions: GPUBuffer
    indexes: GPUBuffer
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
    data: {
      buildingIds,
      positions: vertices,
      indexes
    },
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

// DEVELOPING ROAMING CAMERA 2.0 HERE

type RoamingCameraOpts = {
  canvas: HTMLCanvasElement
  zoomSpeed: number
  center: number[]
  eye: number[]
  getCameraPosition: () => { center: number[], height: number, distance: number, angle: number }
  damping: number
  stiffness: number
  moveEveryNFrames?: number
}

function createRoamingCamera(opts: RoamingCameraOpts) {
  const { canvas, zoomSpeed, center, eye, getCameraPosition, damping, stiffness, moveEveryNFrames } = opts
  let isRoaming = false
  let frameCount = 0

  canvas.addEventListener('mousedown', stopRoaming)

  const camera = createCamera(canvas, {
    zoomSpeed: zoomSpeed
  })

  const values = getAnimatingValues(eye, center)
  const centerSpring = createSpring(stiffness, damping, center)
  const heightSpring = createSpring(stiffness, damping, values.height)
  const distanceSpring = createSpring(stiffness, damping, values.distance)
  const angleSpring = createSpring(stiffness, damping, values.angle)

  camera.lookAt(
    eye,
    center,
    [0, 0, 1]
  )
  camera.tick()

  setRandomCameraPosition()

  function setRandomCameraPosition () {
    const { center, height, distance, angle } = getCameraPosition()
    centerSpring.setDestination(center)
    heightSpring.setDestination(height)
    distanceSpring.setDestination(distance)
    angleSpring.setDestination(angle)
    frameCount = 0
  }

  function tick (s?: number, d?: number) {
    if (isRoaming) {
      centerSpring.tick(s, d)
      heightSpring.tick(s, d)
      distanceSpring.tick(s, d)
      angleSpring.tick(s, d)

      const eye = getEyeFromAnimatingValues(
        centerSpring.getCurrentValue(),
        heightSpring.getCurrentValue(),
        distanceSpring.getCurrentValue(),
        angleSpring.getCurrentValue()
      )

      camera.lookAt(
        eye,
        centerSpring.getCurrentValue(),
        [0, 0, 1]
      )
      frameCount += 1
      if (moveEveryNFrames && frameCount >= moveEveryNFrames) {
        setRandomCameraPosition()
      }
    }
    camera.tick()
  }
  function getMatrix () {
    return new Float32Array(camera.matrix)
  }
  function getCenter () {
    return new Float32Array(camera.center)
  }
  function stopRoaming () {
    isRoaming = false
    frameCount = 0
  }
  function startRoaming () {
    setSpringsToCurrentCameraValues()
    setRandomCameraPosition()
    isRoaming = true
  }

  function setSpringsToCurrentCameraValues () {
    const values = getAnimatingValues(camera.eye, camera.center)
    centerSpring.setDestination(camera.center, false)
    heightSpring.setDestination(values.height, false)
    distanceSpring.setDestination(values.distance, false)
    angleSpring.setDestination(values.angle, false)
  }

  (window as any).camera = camera
  return {
    tick,
    getMatrix,
    getCenter,
    startRoaming,
    stopRoaming,
    _camera: camera,
    moveToNextPosition: () => {
      if (isRoaming) setRandomCameraPosition()
      else startRoaming()
    }
  }
}

function getAnimatingValues(eye: number[], center: number[]): { height: number, distance: number, angle: number } {
  const height = eye[2] - center[2]
  const distance = vec2.dist([eye[0], eye[1]], [center[0], center[1]])
  const angle = Math.atan2(eye[1] - center[1], eye[0] - center[0])
  return { height, distance, angle }
}

function getEyeFromAnimatingValues(center: number[], height: number, distance: number, angle: number): number[] {
  return [
    center[0] + Math.cos(angle) * distance,
    center[1] + Math.sin(angle) * distance,
    center[2] + height
  ]
}