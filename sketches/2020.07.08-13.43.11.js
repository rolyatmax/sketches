/* global fetch, WebAssembly */
const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')

const WIDTH = 2048
const HEIGHT = 2048

window.init = init
console.log(init)

const wasmImports = {}
fetch('resources/wasm/spring-animator/spring_animator_wasm_bg.wasm')
  .then(res => res.arrayBuffer())
  .then(bytes => WebAssembly.instantiate(bytes, wasmImports))
  .then(({ instance }) => {
    const wasmExports = instance.exports
    alert('wasm add! ' + wasmExports.add(183765, 1239587))
    // wasmExports.memory // WebAssembly.Memory
  })

// console.log(wasm.add(2, 3))

// const settings = {
//   seed: 1
// }

// const gui = new GUI()
// gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)

// let rand

// function setup () {
//   rand = random.createRandom(settings.seed)
// }

// const sketch = () => {
//   setup()
//   return ({ context, width, height }) => {
//     context.fillStyle = 'white'
//     context.fillRect(0, 0, width, height)
//   }
// }

// canvasSketch(sketch, {
//   dimensions: [WIDTH, HEIGHT],
//   animate: true
// })
