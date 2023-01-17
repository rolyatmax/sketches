// WebGPU demo
// NOTE: you must visit this on localhost or webgpu won't work
// npx budo -H localhost 2023.01.02-19.15.37.ts -- -p tsify

// this demo originally adapted from: https://github.com/jack1232/webgpu02

/// <reference types="@webgpu/types" />

import * as fit from 'canvas-fit'

async function main() {
  if (!window.navigator.gpu) {
    console.log(`Your current browser does not support WebGPU! Make sure you are on a system
      with WebGPU enabled. Currently, WebGPU is only supported in Chrome Canary
      with the flag "enable-unsafe-webgpu" enabled.`)
    throw new Error('Your current browser does not support WebGPU!')
  }

  const canvas = document.body.appendChild(document.createElement('canvas'))
  window.addEventListener('resize', fit(canvas), false)

  const adapter = await window.navigator.gpu.requestAdapter()
  if (!adapter) throw new Error('Failed to requestAdapter()')

  const device = await adapter.requestDevice()
  if (!device) throw new Error('Failed to requestDevice()')

  const context = canvas.getContext('webgpu')
  if (!context) throw new Error('Failed to getContext("webgpu")')

  const format = 'bgra8unorm'

  context.configure({
    device: device,
    format: format,
    alphaMode: 'opaque'
  })

  const vertex = `
    @vertex
    fn main(@builtin(vertex_index) VertexIndex: u32) -> @builtin(position) vec4<f32> {
      var pos = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 0.5),
        vec2<f32>(-0.5, -0.5),
        vec2<f32>(0.5, -0.5)
      );
      return vec4<f32>(pos[VertexIndex], 0.0, 1.0);
    }
  `

  const fragment = `
    @fragment
    fn main() -> @location(0) vec4<f32> {
      return vec4<f32>(0.2, 1.0, 1.0, 1.0);
    }
  `

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: device.createShaderModule({
        code: vertex
      }),
      entryPoint: 'main'
    },
    fragment: {
      module: device.createShaderModule({
        code: fragment
      }),
      entryPoint: 'main',
      targets: [{
        format: format as GPUTextureFormat
      }]
    },
    primitive:{
      topology: 'triangle-list',
    }
  })

  const commandEncoder = device.createCommandEncoder()
  const textureView = context.getCurrentTexture().createView()
  const renderPass = commandEncoder.beginRenderPass({
    colorAttachments: [{
      view: textureView,
      clearValue: { r: 0.95, g: 0.95, b: 0.98, a: 1.0 },
      loadOp: 'clear' as GPULoadOp,
      storeOp: 'store' as GPUStoreOp
    }]
  })
  renderPass.setPipeline(pipeline)
  renderPass.draw(3, 1, 0, 0)
  renderPass.end()

  device.queue.submit([commandEncoder.finish()])
}

main()
