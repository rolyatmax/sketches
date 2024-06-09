// WebGPU demo
// NOTE: you must visit this on localhost or webgpu won't work
// npm run dev

/// <reference types="@webgpu/types" />

import { GUI } from 'dat-gui'

const settings = {
  animDuration: 0.4,
  pauseBetween: 0,
  startOffsetMax: 2,
  boxSize: 250,
  boxDivisor: 3,
  colorSpread: 0.7
}

const textCanvas = document.createElement('canvas')
fit(textCanvas, document.body, 2)
const textCtx = textCanvas.getContext('2d')!

main()
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
  @group(0) @binding(1) var ourSampler: sampler;
  @group(0) @binding(2) var beforeTexture: texture_2d<f32>;
  @group(0) @binding(3) var afterTexture: texture_2d<f32>;

  @vertex
  fn mainVertex(@location(0) xy: vec2f) -> @builtin(position) vec4f {
    return vec4(xy, 0, 1);
  }

  /* discontinuous pseudorandom uniformly distributed in [-0.5, +0.5]^3 */
  fn random3(v: vec3f) -> vec3f {
    var j = 4096.0 * sin(dot(v, vec3f(17.0, 59.4, 15.0)));
    var r: vec3f;
    r.z = fract(512.0 * j);
    j *= 0.125;
    r.x = fract(512.0 * j);
    j *= 0.125;
    r.y = fract(512.0 * j);
    return r - 0.5;
  }

  fn rand(v: vec2f) -> f32 {
    return fract(sin(dot(v, vec2f(12.9898, 78.233))) * 43758.5453);
  }

  fn n(v: vec2f) -> f32 {
    var i = floor(v);
    var f = fract(v);
    f = f * f * (3.0 - 2.0 * f);
    var a = rand(i + vec2f(0.0, 0.0));
    var b = rand(i + vec2f(1.0, 0.0));
    var c = rand(i + vec2f(0.0, 1.0));
    var d = rand(i + vec2f(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  fn noise(v: vec2f) -> f32 {
    var a = v;
    var b = v + vec2f(0.0, 1.0);
    var c = v + vec2f(1.0, 0.0);
    var d = v + vec2f(1.0, 1.0);

    var t0 = n(a);
    var t1 = n(b * 0.3);
    var t2 = n(c * 50.0);
    var t3 = n(d * 4.0);

    return min(t0, max(t1, (t2 + t3) / 2.0));
    // return (t0 + t1 + t2 + t3) / 4.0;
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

    let coordSize = 1.0 / uniforms.dimensions / boxSize;

    let randVal = noise(idx.yx * 0.5 + uniforms.animRandOffset);
    var edge: f32;
    var n: f32;
    if (randVal < 0.35) {
      edge = xyT.x;
      n = coordSize.x;
    } else if (randVal < 0.7) {
      edge = xyT.y;
      n = coordSize.y;
    } else {
      edge = xyT.x * xyT.y;
      n = coordSize.x * coordSize.y;
    }

    return smoothstep(edge - n, edge + n, t) * C_MULT + HALF_ONE_MINUS_C_MULT;
  }

  const PI = 3.141592653589793;
  const HALF_PI = 1.5707963267948966;
  const C_MULT = 0.9;
  const HALF_ONE_MINUS_C_MULT = (1.0 - C_MULT) / 2.0;
  const COLOR1 = vec3f(0.2, 0.35, 0.8);
  const COLOR2 = vec3f(0.4, 0.3, 0.7);
  const COLOR3 = vec3f(1);

  @fragment
  fn mainFragment(
    @builtin(position) fragCoord: vec4f
  ) -> @location(0) vec4f {
    let texCoord = fragCoord.xy / uniforms.dimensions;
    let beforeColor = textureSample(beforeTexture, ourSampler, texCoord).rgb;
    let afterColor = textureSample(afterTexture, ourSampler, texCoord).rgb;

    let xy = fragCoord.xy - uniforms.dimensions / 2.0;
    let dur = uniforms.animDur;

    let boxSize0 = uniforms.boxSize;
    let boxSize1 = uniforms.boxSize / uniforms.boxDivisor;

    let idx0 = floor(xy / boxSize0);
    let startOffset0 = noise(idx0 * 0.3 + uniforms.animRandOffset) * uniforms.startOffsetMax;
    let startTime0 = uniforms.animStart + startOffset0;
    let endTime0 = startTime0 + dur;

    let idx1 = floor(xy / boxSize1);

    let middleTime = endTime0 + uniforms.pauseBetween;
    let firstOrSecondHalf = step(middleTime, uniforms.curTime); // if in first animation, this is 0.0, otherwise 1.0
    let flip = 1.0 - firstOrSecondHalf;

    let firstOrSecondLevel = firstOrSecondHalf * step(0.1, noise(idx0));
    let idx = mix(idx0, idx1, firstOrSecondLevel);
    let boxSize = mix(boxSize0, boxSize1, firstOrSecondLevel);

    let startOffset1 = noise(idx * 0.5 + uniforms.animRandOffset) * uniforms.startOffsetMax;
    let startTime1 = endTime0 + uniforms.pauseBetween + startOffset1;
    let startTime = mix(startTime0, startTime1, firstOrSecondHalf);
    let elapsed = uniforms.curTime - startTime;

    let r0 = noise(idx.yy * 0.5 + uniforms.animRandOffset) * uniforms.colorSpread;
    let r1 = noise(idx.yx * 0.5 + uniforms.animRandOffset) * uniforms.colorSpread;
    let r2 = noise(idx.xx * 0.5 + uniforms.animRandOffset) * uniforms.colorSpread;

    let c1 = mix(
      vec3f(0),
      COLOR1,
      abs(flip - getC((elapsed + r0) / dur, xy, boxSize))
    );

    let c2 = mix(
      vec3f(0),
      COLOR2,
      abs(flip - getC((elapsed + r1) / dur, xy, boxSize))
    );

    let c3 = mix(
      vec3f(0),
      COLOR3,
      abs(flip - getC((elapsed + r2) / dur, xy, boxSize))
    );

    // TODO: Figure out how to use the in-between values for antialiasing
    // instead of just testing against 0.0 (e.g. afterColor.r > 0.0)

    var color = c1 + c2 + c3;
    if (uniforms.curTime > middleTime && afterColor.r > 0.0) {
      color = (COLOR1 + COLOR2 + COLOR3) * HALF_ONE_MINUS_C_MULT;
    }
    if (uniforms.curTime < middleTime && beforeColor.r > 0.0) {
      color = (COLOR1 + COLOR2 + COLOR3) * HALF_ONE_MINUS_C_MULT;
    }

    if (random3(fragCoord.zxy).x > 0.47) {
      let l = n(fragCoord.xy * 0.5);
      color += l * 0.08;
    }

    return vec4(color, 1.0);
  }
`

  const shaderModule = device.createShaderModule({ code: shader })

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0, // uniforms
      visibility: GPUShaderStage.FRAGMENT,
      buffer: {},
    }, {
      binding: 1, // textCanvas sampler
      visibility: GPUShaderStage.FRAGMENT,
      sampler: {},
    }, {
      binding: 2, // textCanvas texture
      visibility: GPUShaderStage.FRAGMENT,
      texture: {},
    }, {
      binding: 3, // textCanvas texture
      visibility: GPUShaderStage.FRAGMENT,
      texture: {},
    }]
  })

  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear'
  })
  const beforeTexture = device.createTexture({
    size: { width: canvas.width, height: canvas.height },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  })
  drawTextToTexture(device, beforeTexture, textCtx, 'hello')
  const afterTexture = device.createTexture({
    size: { width: canvas.width, height: canvas.height },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  })
  drawTextToTexture(device, afterTexture, textCtx, 'world')

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
      }]
    },
    primitive: {
      topology: 'triangle-strip',
    },
  })

  const uniformBindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformsBuffer } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: beforeTexture.createView() },
      { binding: 3, resource: afterTexture.createView() },
    ]
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
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
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

function drawTextToTexture(device: GPUDevice, texture: GPUTexture, ctx: CanvasRenderingContext2D, text: string) {
  ctx.font = 'bold 600px sans-serif';
  (ctx as any).letterSpacing = '-45px'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, textCanvas.width, textCanvas.height)
  ctx.fillStyle = '#fff'
  ctx.fillText(text, textCanvas.width / 2, textCanvas.height / 2)
  device.queue.copyExternalImageToTexture(
    { source: ctx.canvas, flipY: false },
    { texture },
    { width: ctx.canvas.width, height: ctx.canvas.height },
  )
}
