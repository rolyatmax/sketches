/* global fetch, WebAssembly */
const canvasSketch = require('canvas-sketch')

const wasmImports = {}
fetch('resources/wasm/spring-animator/spring_animator_wasm_bg.wasm')
  .then(res => res.arrayBuffer())
  .then(bytes => WebAssembly.instantiate(bytes, wasmImports))
  .then(({ instance }) => {
    const wasmExports = instance.exports
    alert('wasm add! ' + wasmExports.add(183765, 1239587))
    // wasmExports.memory // WebAssembly.Memory
  })
