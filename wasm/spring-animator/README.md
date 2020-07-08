# spring-animator (wasm)

Just building this lib to test if I can move my spring animation logic into wasm.

To build this, you need to `cd` into this directory (`wasm/spring-animator`) and run:

```sh
$ wasm-pack build --out-dir ../../resources/wasm/spring-animator [--dev]
```

Then you'll need to load the WASM in the browser like so:

```js
// this would contain any values WASM expects to be imported from the JS
// see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WebAssembly/instantiate
const imports = {}
fetch('resources/wasm/spring-animator/spring_animator_wasm_bg.wasm')
  .then(res => res.arrayBuffer())
  .then(bytes => WebAssembly.instantiate(bytes, imports))
  .then(({ instance }) => {
    const wasmExports = instance.exports
    wasmExports.my_function()
    wasmExports.memory // WebAssembly.Memory
  })
```
