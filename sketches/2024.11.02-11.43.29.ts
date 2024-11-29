// WebGL2 version of the squircle grid demo
import { GUI } from 'dat-gui'
import * as random from 'canvas-sketch-util/random'

const palettes = [
  [166, 124, 135, 255],
  [63, 85, 115, 255],
  [106, 138, 166, 255],
  [218, 182, 182, 255],
  [242, 228, 228, 255],
  [101, 105, 117, 255],
  [116, 93, 113, 255]
]

main()
async function main() {
  const canvas = document.createElement('canvas')
  document.body.appendChild(canvas)
  window.addEventListener('resize', fit(canvas, document.body, window.devicePixelRatio), false)

  const gl = canvas.getContext('webgl2')
  if (!gl) throw new Error('WebGL2 not supported')

  const settings = {
    seed: 1,
    gridWidth: 8,
    gridHeight: 9,
    instruments: 2,
    cellSize: 90,
    cellSpacing: 100,
    squircleK: 2.9
  }

  const gui = new GUI()
  gui.add(settings, 'seed', 1, 10000).name('Seed').step(1)
  gui.add(settings, 'cellSize', 1, 400).name('Cell Size').step(1)
  gui.add(settings, 'cellSpacing', 0, 400).name('Cell Spacing').step(1)
  gui.add(settings, 'squircleK', 1, 20).name('Squircle K').step(0.1)

  // Vertex shader
  const vertexShader = `#version 300 es
    precision highp float;

    layout(location = 0) in vec2 position;
    layout(location = 1) in vec4 instanceColor;
    layout(location = 2) in vec4 instanceRand;
    layout(location = 3) in vec2 instanceSize;
    layout(location = 4) in vec2 instancePosition;

    uniform vec2 dimensions;
    uniform float cellSize;

    out vec4 vColor;
    out vec4 vRand;
    out vec2 vSize;
    out vec2 vUv;

    void main() {
      vec2 p = instancePosition / dimensions * 2.0 - 1.0;
      vec2 normalizedCellSize = vec2(cellSize) / dimensions;

      gl_Position = vec4(p + position * normalizedCellSize, 0, 1);
      vColor = instanceColor;
      vRand = instanceRand;
      vSize = instanceSize;
      vUv = position;
    }
  `

  // Fragment shader
  const fragmentShader = `#version 300 es
    precision highp float;

    in vec4 vColor;
    in vec4 vRand;
    in vec2 vSize;
    in vec2 vUv;

    uniform float squircleK;

    out vec4 fragColor;

    float squircle(vec2 p, float k) {
      vec2 q = abs(p) / 1.0;
      return pow(pow(q.x, k) + pow(q.y, k), 1.0 / k);
    }

    void main() {
      float t = squircle(vUv, squircleK);

      float mainAlpha = 0.6 + 0.4 * vRand.y;
      vec4 mainColor = vColor * mainAlpha;
      float outlineAlpha = 0.3 + vRand.x * 0.4;
      vec4 outlineColor = vec4(0.1, 0.1, 0.1, 1.0) * outlineAlpha;

      float outlineWidth = 0.03;
      float outlineStart = 1.0 - outlineWidth;

      float mainWeight = smoothstep(1.0 - 0.05, 1.0, t);
      float outlineWeight = smoothstep(outlineStart - 0.02, outlineStart, t) *
                           (1.0 - smoothstep(outlineStart, outlineStart + 0.02, t));

      vec4 mainShape = mix(vec4(1.0), mainColor, (1.0 - mainWeight) * vSize.x);
      fragColor = mix(mainShape, outlineColor, outlineWeight);
    }
  `

  // Create and compile shaders
  const program = createProgram(gl, vertexShader, fragmentShader)
  gl.useProgram(program)

  // Create vertex buffer
  const vertices = new Float32Array([-1, -1, -1, 1, 1, -1, 1, 1])
  const vertexBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)

  // Setup instance data and buffers
  const cellComponentCount = 12
  const cellCount = settings.instruments * settings.gridWidth * settings.gridHeight
  const instanceData = new Float32Array(cellCount * cellComponentCount)

  const instanceBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.DYNAMIC_DRAW)

  // Setup attributes
  const positionLoc = 0
  const colorLoc = 1
  const randLoc = 2
  const sizeLoc = 3
  const instancePosLoc = 4

  gl.enableVertexAttribArray(positionLoc)
  gl.enableVertexAttribArray(colorLoc)
  gl.enableVertexAttribArray(randLoc)
  gl.enableVertexAttribArray(sizeLoc)
  gl.enableVertexAttribArray(instancePosLoc)

  // Get uniform locations
  const dimensionsLoc = gl.getUniformLocation(program, 'dimensions')
  const cellSizeLoc = gl.getUniformLocation(program, 'cellSize')
  const squircleKLoc = gl.getUniformLocation(program, 'squircleK')

  function getCellPosition(i: number, j: number, instrument: number): [number, number] {
    const gridWidth = settings.cellSize + (settings.gridWidth - 1) * settings.cellSpacing
    const gridHeight = settings.cellSize + (settings.gridHeight - 1) * settings.cellSpacing
    const instrumentSpacing = settings.cellSpacing * 3
    const totalWidth = settings.instruments * gridWidth + instrumentSpacing * (settings.instruments - 1)
    const gridOffsetX = (gl!.canvas.width - totalWidth) / 2 + instrument * (gridWidth + instrumentSpacing)
    const gridOffsetY = (gl!.canvas.height - gridHeight) / 2
    return [
      i * settings.cellSpacing + settings.cellSize / 2 + gridOffsetX,
      j * settings.cellSpacing + settings.cellSize / 2 + gridOffsetY
    ]
  }

  function fillInstanceData() {
    let i = 0
    while (i < cellCount) {
      const rand = random.createRandom(settings.seed + i)
      let n = i * cellComponentCount

      // Color
      const color = rand.pick(palettes)
      instanceData[n++] = color[0] / 255
      instanceData[n++] = color[1] / 255
      instanceData[n++] = color[2] / 255
      instanceData[n++] = color[3] / 255

      // Random values
      instanceData[n++] = rand.value()
      instanceData[n++] = rand.value()
      instanceData[n++] = rand.value()
      instanceData[n++] = rand.value()

      // Size
      const isOn = rand.chance(0.4)
      instanceData[n++] = isOn ? 1.0 : 0.0
      instanceData[n++] = isOn ? 1.0 : 0.0

      // Position
      const instrument = Math.floor(i / (settings.gridWidth * settings.gridHeight))
      const x = i % settings.gridWidth
      const y = Math.floor(i / settings.gridWidth) % settings.gridHeight
      const position = getCellPosition(x, y, instrument)
      instanceData[n++] = position[0]
      instanceData[n++] = position[1]

      i++
    }
  }

  function render() {
    if (!gl) return

    const width = gl.canvas.width
    const height = gl.canvas.height
    gl.viewport(0, 0, width, height)

    // Clear canvas
    gl.clearColor(1, 1, 1, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    // Update instance data
    fillInstanceData()
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData)

    // Update uniforms
    gl.uniform2f(dimensionsLoc, width, height)
    gl.uniform1f(cellSizeLoc, settings.cellSize)
    gl.uniform1f(squircleKLoc, settings.squircleK)

    // Set up vertex attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer)
    gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, cellComponentCount * 4, 0)
    gl.vertexAttribPointer(randLoc, 4, gl.FLOAT, false, cellComponentCount * 4, 16)
    gl.vertexAttribPointer(sizeLoc, 2, gl.FLOAT, false, cellComponentCount * 4, 32)
    gl.vertexAttribPointer(instancePosLoc, 2, gl.FLOAT, false, cellComponentCount * 4, 40)

    gl.vertexAttribDivisor(colorLoc, 1)
    gl.vertexAttribDivisor(randLoc, 1)
    gl.vertexAttribDivisor(sizeLoc, 1)
    gl.vertexAttribDivisor(instancePosLoc, 1)

    // Enable blending
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA) // For premultiplied alpha

    // Draw
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, cellCount)

    requestAnimationFrame(render)
  }

  render()
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Failed to create shader')

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    throw new Error('Failed to compile shader')
  }

  return shader
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource)

  const program = gl.createProgram()
  if (!program) throw new Error('Failed to create program')

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    throw new Error('Failed to link program')
  }

  return program
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
