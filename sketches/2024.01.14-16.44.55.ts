// WebGPU demo
// NOTE: you must visit this on localhost or webgpu won't work
// npm run dev

/// <reference types="@webgpu/types" />

import { GUI } from 'dat-gui'

const settings = {
  animDuration: 0.5,
  pauseBetween: 1,
  startOffsetMax: 4,
  boxSize: 220,
  boxDivisor: 1.4,
  colorSpread: 0.15
}

async function main() {
  const { device, context } = await setupWebGPU()
  const canvas = context.canvas

  let animStart = performance.now() / 1000 + 1
  let animRandOffset = Math.random() * 200

  canvas.addEventListener('click', () => {
    animStart = performance.now() / 1000 + 0.5
    animRandOffset = Math.random() * 200
  })

  const gui = new GUI()
  gui.add(settings, 'animDuration', 0, 10).onChange(() => {
    animStart = performance.now() / 1000
  })
  gui.add(settings, 'pauseBetween', 0, 2)
  gui.add(settings, 'startOffsetMax', 0, 30)
  gui.add(settings, 'boxSize', 1, 500).step(1)
  gui.add(settings, 'boxDivisor', 1, 6)
  gui.add(settings, 'colorSpread', 0, 1)

  const shader = `
  struct Uniforms {
    @location(0) dimensions: vec2f,
    @location(1) animStart: f32,
    @location(2) boxSize: f32,
    @location(3) curTime: f32,
    @location(4) animDur: f32,
    @location(5) startOffsetMax: f32,
    @location(6) boxDivisor: f32,
    @location(7) pauseBetween: f32,
    @location(8) animRandOffset: f32,
    @location(9) colorSpread: f32
  };

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;

  @vertex
  fn mainVertex(@location(0) xy: vec2f) -> @builtin(position) vec4f {
    return vec4(xy, 0, 1);
  }

  fn rand(v: vec2f) -> f32 {
    return fract(sin(dot(v, vec2f(12.9898, 78.233))) * 43758.5453);
  }

  fn noise(v: vec2f) -> f32 {
    var i = floor(v);
    var f = fract(v);
    f = f * f * (3.0 - 2.0 * f);
    var a = rand(i + vec2f(0.0, 0.0));
    var b = rand(i + vec2f(1.0, 0.0));
    var c = rand(i + vec2f(0.0, 1.0));
    var d = rand(i + vec2f(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  fn ease(t: f32) -> f32 {
    if (t < 0.5) {
      return (1.0 - pow(1.0 - pow(2.0 * t, 2.0), 0.5)) / 2.0;
    } else {
      return (pow(1.0 - pow(-2.0 * t + 2.0, 2.0), 0.5) + 1.0) / 2.0;
    }
  }

  fn getC(time: f32, xy: vec2f, boxSize: f32) -> f32 {
    let xyBySize = xy / boxSize;
    let idx = floor(xyBySize);
    let xyT = fract(xyBySize);
    let t = ease(clamp(time, 0.0, 1.0));
    let coordSize = 1.0 / uniforms.dimensions;
    let n = coordSize.y / boxSize;
    let stepStart = clamp(t - n, 0.0, 1.0);
    let stepEnd = clamp(t + n, 0.0, 1.0);
    let val = noise(idx.yx * 0.5 + uniforms.animRandOffset);
    var edge: f32 = xyT.x;
    if (val < 0.45) {
      edge = xyT.x;
    } else if (val < 0.9) {
      edge = xyT.y;
    } else {
      edge = xyT.x * xyT.y;
    }
    return smoothstep(stepStart, stepEnd, edge) * 0.9 + 0.1;
  }

  const PI = 3.141592653589793;
  const HALF_PI = 1.5707963267948966;

  @fragment
  fn mainFragment(
    @builtin(position) fragCoord: vec4f
  ) -> @location(0) vec4f {
    let xy = fragCoord.xy - uniforms.dimensions / 2.0;
    let dur = uniforms.animDur;

    let boxSize1 = uniforms.boxSize;
    let boxSize2 = uniforms.boxSize / uniforms.boxDivisor;

    let idx0 = floor(xy / boxSize1);
    let startOffset0 = noise(idx0 * 0.3 + uniforms.animRandOffset) * uniforms.startOffsetMax;
    let startTime0 = uniforms.animStart + startOffset0;

    let idx1 = floor(xy / boxSize2);
    let startOffset1 = noise(idx1 * 0.5 + uniforms.animRandOffset) * uniforms.startOffsetMax;

    let endTime0 = startTime0 + dur;
    let startTime1 = endTime0 + uniforms.pauseBetween + startOffset1;

    let firstOrSecond = step(endTime0 + uniforms.pauseBetween / 2.0, uniforms.curTime); // if in first animation, this is 0.0, otherwise 1.0
    let startTime = mix(startTime0, startTime1, firstOrSecond);
    let elapsed = uniforms.curTime - startTime;
    let flip = 1.0 - firstOrSecond;
    let idx = mix(idx0, idx1, firstOrSecond);
    let boxSize = mix(boxSize1, boxSize2, firstOrSecond);

    let r0 = noise(idx.yy * 0.5 + uniforms.animRandOffset) * uniforms.colorSpread;
    let r1 = noise(idx.yx * 0.5 + uniforms.animRandOffset) * uniforms.colorSpread;
    let r2 = noise(idx.xx * 0.5 + uniforms.animRandOffset) * uniforms.colorSpread;

    // -----------------------------------------
    // TODO NEXT:
    //    Get the timings right by correctly dealing with these r0, r1, r2 values
    //    that are used to offset the timings and mess with the real start/end times.
    //    I think this is causing the issue where the animation appears to be already
    //    in progress when you start the animation (and the animDuration is long)
    // -----------------------------------------
    return vec4(
      abs(flip - getC((elapsed + r0) / dur + r2 * 3.0, xy, boxSize)),
      abs(flip - getC((elapsed + r1) / dur + r0 * 3.0, xy, boxSize)),
      abs(flip - getC((elapsed + r2) / dur + r1 * 3.0, xy, boxSize)),
      0.9
    );
  }
`

  const shaderModule = device.createShaderModule({ code: shader })

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0, // uniforms
      visibility: GPUShaderStage.FRAGMENT,
      buffer: {},
    }]
  })

  const uniformsData = new Float32Array([
    canvas.width, canvas.height,
    animStart,
    settings.boxSize,
    performance.now() / 1000,
    settings.animDuration,
    settings.startOffsetMax,
    settings.boxDivisor,
    settings.pauseBetween,
    animRandOffset,
    settings.colorSpread,
    0
  ])
  const uniformsBuffer = createGPUBuffer(device, uniformsData, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: {
      module: shaderModule,
      entryPoint: 'mainVertex',
      buffers: [{
        arrayStride: 2 * 4,
        attributes: [{
          shaderLocation: 0,
          offset: 0,
          format: 'float32x2'
        }]
      } as GPUVertexBufferLayout]
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'mainFragment',
      targets: [{
        format: 'bgra8unorm' as GPUTextureFormat,
        blend: {
          color: {
            srcFactor: 'one' as GPUBlendFactor,
            dstFactor: 'one-minus-src-alpha' as GPUBlendFactor
          },
          alpha: {
            srcFactor: 'one' as GPUBlendFactor,
            dstFactor: 'one-minus-src-alpha' as GPUBlendFactor
          },
        }
      }]
    },
    primitive: {
      topology: 'triangle-strip',
    },
  })

  const uniformBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{
      binding: 0, // uniforms
      resource: {
        buffer: uniformsBuffer
      }
    }]
  })

  const xyData = new Float32Array([1, -1, 1, 1, -1, -1, -1, 1])
  const xyBuffer = createGPUBuffer(device, xyData.buffer, GPUBufferUsage.VERTEX)

  requestAnimationFrame(function loop() {
    requestAnimationFrame(loop)

    const curTexture = context.getCurrentTexture()
    const { width, height } = curTexture
    uniformsData.set([
      width, height,
      animStart,
      settings.boxSize,
      performance.now() / 1000,
      settings.animDuration,
      settings.startOffsetMax,
      settings.boxDivisor,
      settings.pauseBetween,
      animRandOffset,
      settings.colorSpread
    ], 0)
    device.queue.writeBuffer(uniformsBuffer, 0, uniformsData, 0, uniformsData.length)

    const commandEncoder = device.createCommandEncoder()
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: curTexture.createView(),
        clearValue: { r: 1, g: 1, b: 1, a: 1 },
        loadOp: 'clear' as GPULoadOp,
        storeOp: 'store' as GPUStoreOp
      }]
    })
    renderPass.setPipeline(pipeline)
    renderPass.setVertexBuffer(0, xyBuffer)
    renderPass.setBindGroup(0, uniformBindGroup)
    renderPass.draw(4)
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

function flat(arr: any[]) {
  return arr.reduce((acc, val) => acc.concat(val), [])
}

async function setupWebGPU(canvas?: HTMLCanvasElement) {
  if (!window.navigator.gpu) {
    const message = `
      Your current browser does not support WebGPU! Make sure you are on a system
      with WebGPU enabled, e.g. Chrome Canary with chrome://flags#enable-unsafe-webgpu enabled.
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
