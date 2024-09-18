// WebGPU demo
// NOTE: you must visit this on localhost or webgpu won't work

/// <reference types="@webgpu/types" />

import { GUI } from 'dat-gui'
import * as createCamera from '3d-view-controls'
import { mat4 } from 'gl-matrix'
import * as createCube from 'primitive-cube'

main()
async function main() {
  const { device, context } = await setupWebGPU()
  const canvas = context.canvas as HTMLCanvasElement
  const curTexture = context.getCurrentTexture()

  const settings = {
    ptSize: 0.072
  }

  const gui = new GUI()
  gui.add(settings, 'ptSize', 0.005, 0.3, 0.001)

  let isCameraMoving = false

  const lidarPtsData = await loadLidarPtsData()
  const ptCount = lidarPtsData.length / 7

  // a unit cube
  const cube = createCube()
  const vertexData = new Float32Array(cube.cells.map(face => face.map(idx => cube.positions[idx]).flat()).flat())
  const vertexPts = vertexData.length / 3

  const vertexBuffer = createGPUBuffer(device, vertexData.buffer, GPUBufferUsage.VERTEX)
  const instanceBuffer = createGPUBuffer(device, lidarPtsData.buffer, GPUBufferUsage.VERTEX)

  const CENTER = [2, 2, 0]
  const EYE = [3, 3, 0]

  const camera = createCamera(canvas, { zoomSpeed: 4 })
  camera.lookAt(
    EYE, // eye
    CENTER, // center
    [0, 0, 1] // up
  )

  const shader = `
    struct Uniforms {
      projection: mat4x4<f32>,
      view: mat4x4<f32>,
      ptSize: f32,
    };

    @group(0) @binding(0) var<uniform> uniforms: Uniforms;

    struct Output {
      @builtin(position) position: vec4<f32>,
      @location(0) color: vec3<f32>
    };

    @vertex
    fn mainVertex(
      @location(0) p: vec3<f32>,
      @location(1) position: vec3<f32>,
      @location(2) intensityColor: vec4<f32>,
    ) -> Output {
      let color = intensityColor.yzw;
      let intensity = intensityColor.x;

      let ptSize = uniforms.ptSize * intensity;

      var output: Output;
      output.color = color; // * intensity;
      output.position = uniforms.projection * uniforms.view * vec4(position + p * ptSize, 1);
      return output;
    }

    @fragment
    fn mainFragment(@location(0) color: vec3<f32>) -> @location(0) vec4<f32> {
      return vec4(color, 1);
    }
  `

  const uniformData = new Float32Array(36) // 16 + 16 + 1 + padding
  const uniformBuffer = createGPUBuffer(device, uniformData.buffer, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)

  const shaderModule = device.createShaderModule({ code: shader })

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
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
          arrayStride: 4 * 3,
          stepMode: 'vertex' as const,
          attributes: [
            {
              shaderLocation: 0,
              format: 'float32x3' as const,
              offset: 0
            }
          ]
        },
        {
          arrayStride: 4 * 7,
          stepMode: 'instance' as const,
          attributes: [
            {
              shaderLocation: 1,
              format: 'float32x3' as const,
              offset: 0
            },
            {
              shaderLocation: 2,
              format: 'float32x4' as const,
              offset: 4 * 3
            }
          ]
        }
      ]
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'mainFragment',
      targets: [{ format: 'bgra8unorm' as const }]
    },
    primitive: { topology: 'triangle-list' },
    depthStencil:{
      format: 'depth24plus' as const,
      depthWriteEnabled: true,
      depthCompare: 'less'
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
      }
    ]
  })

  const depthTexture = device.createTexture({
    size: { width: curTexture.width, height: curTexture.height },
    format: 'depth24plus' as const,
    usage: GPUTextureUsage.RENDER_ATTACHMENT
  })

  let projMatrix = mat4.create()
  requestAnimationFrame(function render(t) {
    const { width, height } = canvas // using canvas width/height because on safari the width/height of the texture doesn't seem to update when resizing

    camera.up = [0, 0, 1]
    camera.tick()
    mat4.perspective(projMatrix, Math.PI / 3, width / height, 0.2, 100)
    const view = camera.matrix

    isCameraMoving = !mat4.equals(uniformData.subarray(16), view) || !mat4.equals(uniformData, projMatrix) || uniformData[32] !== settings.ptSize
    const isDirty = isCameraMoving

    if (isDirty) {
      const commandEncoder = device.createCommandEncoder()
      const curTexture = context.getCurrentTexture()
      const textureView = curTexture.createView()

      uniformData.set(projMatrix, 0)
      uniformData.set(view, 16)
      uniformData[32] = settings.ptSize

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
      renderPass.setVertexBuffer(1, instanceBuffer)
      renderPass.setBindGroup(0, uniformBindGroup)
      renderPass.draw(vertexPts, Math.floor(ptCount))
      renderPass.end()
      device.queue.submit([commandEncoder.finish()])
    }
    requestAnimationFrame(render)
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

/*

pts file format:

A pts file is a simple text file used to store point data typically from LIDAR scanners. The first line gives the number of points to follow. Each subsequent line has 7 values, the first three are the (x,y,z) coordinates of the point, the fourth is an "intensity" value, and the last three are the (r,g,b) colour estimates. The (r,g,b) values range from 0 to 255 (single unsigned byte). The intensity value is an estimate of the fraction of incident radiation reflected by the surface at that point, 0 indicates is a very poor return while 255 is a very stong return.

Example
253730194
-0.41025 -2.0806 8.00981 55 52 44 65
-0.63016 -1.84527 6.59447 228 228 230 225
-0.4766 -2.14446 7.91288 60 56 54 68

*/

// returns a Float32Array of all the pts data:
// x, y, z, intensity, r, g, b
async function loadLidarPtsData(): Promise<Float32Array> {
  const response = await fetch('/resources/data/home-lidar/8_18_2024.pts')
  if (!response.ok) throw new Error('Failed to load lidar data')
  const text = await response.text()
  const lines = text.split('\n').filter(Boolean)
  if (lines.length < 2) throw new Error('Invalid pts file')
  const ptCount = parseInt(lines.shift() as string)
  const data = new Float32Array(ptCount * 7)
  lines.forEach((line, i) => {
    const [x, y, z, intensity, r, g, b] = line.split(' ').map(parseFloat)
    data.set([x, y, z, intensity / 255, r / 255, g / 255, b / 255], i * 7)
  })
  return data
}
