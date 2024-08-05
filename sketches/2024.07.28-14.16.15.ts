// WebGPU demo
// NOTE: you must visit this on localhost or webgpu won't work

/// <reference types="@webgpu/types" />

import * as createCamera from '3d-view-controls'
import { mat4 } from 'gl-matrix'

const SAMPLE_DIVISOR = 1

main()
async function main() {
  const { device, context } = await setupWebGPU()
  const canvas = context.canvas as HTMLCanvasElement
  const curTexture = context.getCurrentTexture()

  // const BUILDING_FOOTPRINT = [
  //   [987994, 211969],
  //   [987940, 212011],
  //   [987975, 212074],
  //   [988086, 212136],
  //   [988105, 212126],
  //   [988336, 211998],
  //   [988455, 211932],
  //   [988398, 211828],
  //   [988363, 211765]
  // ]
  // const BUILDING_FOOTPRINT = [[987689,212136],[987604,212183],[987611,212238],[987622,212315],[987629,212332],[987630,212334],[987648,212367],[987655,212379],[987659,212377],[987740,212333],[987830,212283],[987766,212169],[987734,212111]]
  const BUILDING_FOOTPRINT = [[987569.625,211910.515625],[987567.3125,211917.40625],[987577.5625,212000.796875],[987681.875,212069.5],[987739.75,212037.40625],[987721.3125,211936.1875],[987719.25,211932.4375],[987679.5,211860.71875],[987673.375,211849.6875],[987571,211906.453125]]

  // const URL = 'resources/data/nyc-lidar/987210-sample.bin'
  const URL = 'resources/data/nyc-lidar/987210.bin'
  const CENTROID = getCentroid(BUILDING_FOOTPRINT)

  let isCameraMoving = false

  const expandedHull = expand(BUILDING_FOOTPRINT, CENTROID, 20)
  const result = await getLidarData(URL, expandedHull)
  const lidarPtsData = result.data
  const offset = result.offset
  console.log('lidar data loaded', result)
  const vertexBuffer = createGPUBuffer(device, lidarPtsData.buffer, GPUBufferUsage.VERTEX)
  const ptCount = lidarPtsData.length / 4

  const CENTER = [CENTROID[0] - offset[0], CENTROID[1] - offset[1], 400]
  // const EYE = [CENTER[0] - 500, CENTER[1] - 500, 800]

  function getEye(t: number) {
    const angle = easeOut(t, 3) * Math.PI * 2 * 3
    const d = 6000 - easeOut(t, 8) * 5300
    // const d = 400
    return [CENTER[0] - Math.cos(angle) * d, CENTER[1] - Math.sin(angle) * d, 1000]
  }

  const camera = createCamera(canvas, { zoomSpeed: 4 })
  camera.lookAt(
    getEye(0), // eye
    CENTER, // center
    [0, 0, 1] // up
  )

  const minZ = -800

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
  const uniformBuffer = createGPUBuffer(device, uniformData.buffer, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)

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
          arrayStride: 8 * SAMPLE_DIVISOR,
          attributes: [
            {
              shaderLocation: 0,
              format: 'uint16x4' as const, // x3 is not possible, so make vec4 and ignore the w component
              offset: 0
            },
            {
              shaderLocation: 1,
              format: 'unorm16x2' as const, // unorm16x1 is not possible, so make vec2 and ignore the x component
              offset: 4
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
    primitive: { topology: 'point-list' },
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

  const depthTexture = device.createTexture({
    size: { width: curTexture.width, height: curTexture.height },
    format: 'depth24plus' as const,
    usage: GPUTextureUsage.RENDER_ATTACHMENT
  })

  let projMatrix = mat4.create()
  requestAnimationFrame(function render(t) {
    const { width, height } = canvas // using canvas width/height because on safari the width/height of the texture doesn't seem to update when resizing

    camera.lookAt(
      getEye((t / 10000) % 1), // eye
      CENTER, // center
      [0, 0, 1] // up
    )
    camera.up = [0, 0, 1]
    camera.tick()
    mat4.perspective(projMatrix, Math.PI / 4, width / height, 1, 1000000)
    const view = camera.matrix

    isCameraMoving = !mat4.equals(uniformData.subarray(16), view) || !mat4.equals(uniformData, projMatrix)
    const isDirty = isCameraMoving

    if (isDirty) {
      const commandEncoder = device.createCommandEncoder()
      const curTexture = context.getCurrentTexture()
      const textureView = curTexture.createView()

      const fadeHeightStart = minZ + 1200 // 2100
      const fadeHeightEnd = minZ + 450 // 900
      uniformData.set(projMatrix, 0)
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
      renderPass.draw(Math.floor(ptCount / SAMPLE_DIVISOR))
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

// ---------------------

async function getLidarData(url: string, hull: number[][]): Promise<{ data: Uint16Array, offset: number[] }> {
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

  const dataBuffer = await response.arrayBuffer()
  const dataview = new DataView(dataBuffer)
  const pointCount = dataview.getUint32(0, littleEndian)
  const offset = [
    dataview.getInt32(4, littleEndian),
    dataview.getInt32(8, littleEndian),
    dataview.getInt32(12, littleEndian)
  ]

  const filteredPts: number[] = []
  const remainingBytes = dataBuffer.byteLength - 16
  const ptCount = Math.floor(remainingBytes / 8)
  const ptData = new Uint16Array(dataBuffer, 16, ptCount * 4)

  const offsetHull = hull.map(pt => [pt[0] - offset[0], pt[1] - offset[1]])

  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]

  for (let i = 0; i < ptData.length; i += 4) {
    const x = ptData[i]
    const y = ptData[i + 1]
    const z = ptData[i + 2]
    const intensity = ptData[i + 3]

    min[0] = Math.min(min[0], x)
    min[1] = Math.min(min[1], y)
    min[2] = Math.min(min[2], z)
    max[0] = Math.max(max[0], x)
    max[1] = Math.max(max[1], y)
    max[2] = Math.max(max[2], z)

    if (isInConvexHull([x, y], offsetHull)) {
      filteredPts.push(x, y, z, intensity)
    }
  }

  console.log({ pointCount, offset, min, max })

  return {
    data: new Uint16Array(filteredPts),
    offset
  }
}

function isLittleEndian () {
  const buffer = new ArrayBuffer(2)
  new DataView(buffer).setInt16(0, 256, true /* littleEndian */)
  // Int16Array uses the platform's endianness.
  return new Int16Array(buffer)[0] === 256
}

function isInConvexHull(pt: number[], hull: number[][]) {
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]
    const b = hull[(i + 1) % hull.length]
    const cross = (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0])
    if (cross > 0) {
      return false
    }
  }
  return true
}

function getCentroid(hull: number[][]) {
  return hull.reduce((acc, pt) => [acc[0] + pt[0], acc[1] + pt[1]], [0, 0]).map(v => v / hull.length)
}

function expand(hull: number[][], centroid: number[], amount: number) {
  return hull.map(pt => {
    const angle = Math.atan2(pt[1] - centroid[1], pt[0] - centroid[0])
    return [
      pt[0] + Math.cos(angle) * amount,
      pt[1] + Math.sin(angle) * amount
    ]
  })
}

function easeOut(t: number, pow: number) {
  return 1 - Math.pow(1 - t, pow)
}
