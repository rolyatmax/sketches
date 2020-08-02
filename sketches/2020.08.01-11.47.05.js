// Trying to merge the 3D SDF raytracing stuff with the physarum 3d sim

const canvasSketch = require('canvas-sketch')
const { createRico } = require('../lib/dlite/dlite-0.0.10')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const palettes = require('nice-color-palettes')
const createPaletteAnimator = require('../lib/palette-animator/palette-animator-0.0.1')
const injectGLSL = require('../lib/inject-glsl/inject-glsl-0.0.1')
const NOISE_GLSL = require('../lib/noise-glsl/noise-glsl-0.0.1')
const createRoamingCamera = require('../lib/roaming-camera/roaming-camera-0.0.1')

const rico = window.rico = createRico()

const settings = {
  seed: 0,
  palette: 5,
  dimensions: 128,
  agentCount: 60000,
  pointSize: 0.8,
  stepSize: 0.055,
  headingStepSpread: 0.28,
  sensorSpread: 0.4,
  sensorDist: 0.03,
  decay: 0.99,
  diffuse: 1,
  trailIntensity: 0.55,
  cameraDist: 3,
  wrap: true,

  colorCount: 10,
  shadeIntensity: 0.21,
  threshold: 0.00001,
  pixelSize: 0.001,
  rayStepSize: 0.2,
  sampleCount: 32
}

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
gui.add(settings, 'palette', 0, 99).step(1)
gui.add(settings, 'dimensions', 32, 1028).step(1).onChange(setup)
gui.add(settings, 'agentCount', 1000, 800000).step(1).onChange(setup)
gui.add(settings, 'pointSize', 0.01, 8)
gui.add(settings, 'stepSize', 0.001, 0.2).step(0.001)
gui.add(settings, 'headingStepSpread', 0.01, 5).step(0.01)
gui.add(settings, 'sensorSpread', 0.01, 5).step(0.01)
gui.add(settings, 'sensorDist', 0.0001, 0.5)
gui.add(settings, 'decay', 0.3, 0.999).step(0.001)
gui.add(settings, 'diffuse', 0, 4).step(1)
gui.add(settings, 'trailIntensity', 0, 1)
gui.add(settings, 'colorCount', 0, 99).step(1)
gui.add(settings, 'shadeIntensity', 0, 0.5).step(0.01)
gui.add(settings, 'threshold', 0.000001, 0.001).step(0.000001)
gui.add(settings, 'pixelSize', 0.00001, 0.1).step(0.00001)
gui.add(settings, 'rayStepSize', 0.0001, 1).step(0.0001)
gui.add(settings, 'sampleCount', 16, 1024).step(1)
gui.add(settings, 'cameraDist', 0.5, 10)

gui.add(settings, 'wrap')
gui.add({ restart: setup }, 'restart')

const paletteAnimator = createPaletteAnimator(palettes, 0.001, 0.1, settings.palette - 1)
const { PALETTE_ANIMATOR_GLSL } = paletteAnimator

const camera = window.camera = createRoamingCamera({
  canvas: rico.canvas,
  zoomSpeed: 4,
  center: [5, 2, 4],
  eye: [0, 0, 0],
  damping: 0.03,
  stiffness: 0.0001,
  getCameraPosition: () => [
    (Math.random() - 0.5) * settings.cameraDist,
    (Math.random() - 0.5) * settings.cameraDist,
    (Math.random() - 0.5) * settings.cameraDist
  ]
})

let updateAgents, agentsPositionsBuffers, agentsHeadingsBuffers, trailMapFramebuffers, layTrails, renderTrails, processTrails
let rand = random.createRandom(settings.seed)

const agentsVertexArray = rico.createVertexArray()

function setup () {
  rand = random.createRandom(settings.seed)

  const agentsPositionData1 = new Float32Array(settings.agentCount * 3)
  const agentsPositionData2 = new Float32Array(settings.agentCount * 3)

  const agentsHeadingData1 = new Float32Array(settings.agentCount * 3)
  const agentsHeadingData2 = new Float32Array(settings.agentCount * 3)

  const agentsRandData = new Float32Array(settings.agentCount)

  let i = settings.agentCount
  while (i--) {
    // position as vec3
    agentsPositionData1[i * 3 + 0] = rand.range(-1, 1)
    agentsPositionData1[i * 3 + 1] = rand.range(-1, 1)
    agentsPositionData1[i * 3 + 2] = rand.range(-1, 1)

    // heading as vec3
    const heading = rand.onSphere()
    agentsHeadingData1[i * 3 + 0] = heading[0]
    agentsHeadingData1[i * 3 + 1] = heading[1]
    agentsHeadingData1[i * 3 + 2] = heading[2]

    // randVal
    agentsRandData[i] = rand.range(0, 1)
  }

  agentsPositionsBuffers = [
    rico.createVertexBuffer(rico.gl.FLOAT, 3, agentsPositionData1),
    rico.createVertexBuffer(rico.gl.FLOAT, 3, agentsPositionData2)
  ]

  agentsHeadingsBuffers = [
    rico.createVertexBuffer(rico.gl.FLOAT, 3, agentsHeadingData1),
    rico.createVertexBuffer(rico.gl.FLOAT, 3, agentsHeadingData2)
  ]

  const agentsRandsBuffer = rico.createVertexBuffer(rico.gl.FLOAT, 1, agentsRandData)

  updateAgents = rico({
    count: settings.agentCount,
    vertexArray: agentsVertexArray
      .vertexAttributeBuffer(0, agentsPositionsBuffers[0])
      .vertexAttributeBuffer(1, agentsHeadingsBuffers[0])
      .vertexAttributeBuffer(2, agentsRandsBuffer),
    transform: {
      vPosition: agentsPositionsBuffers[1],
      vHeading: agentsHeadingsBuffers[1]
    },
    vs: injectGLSL(NOISE_GLSL, `#version 300 es
    precision highp float;
    precision lowp sampler3D;

    layout(location=0) in vec3 p;
    layout(location=1) in vec3 h;
    layout(location=2) in float randVal;

    uniform float stepSize;
    uniform float headingStepSpread;
    uniform float sensorSpread;
    uniform float sensorDist;
    uniform float time;
    uniform sampler3D trailMap;
    uniform vec3 dimensions;
    uniform float wrap;

    out vec3 vPosition;
    out vec3 vHeading;

    #define TWO_PI 6.28318
    // SENSORS_COUNT - not including the front sensor
    #define SENSORS_COUNT 3.0

    vec3 getPoint(mat3 m, float angleSize, float ptIdx, float offset) {
      float rads = ptIdx * TWO_PI;
      vec2 position = vec2(cos(rads), sin(rads));
      vec3 p = m * vec3(position * angleSize, 1.0);
      return normalize(p);
    }

    void main() {
      vec3 position = p;
      vec3 heading = h;

      vec3 a = heading;
      vec3 r = vec3(dot(a, a) / a.x, 0, 0);
      vec3 ar = normalize(r - a);
      r = a + ar;
      vec3 oa = a;
      vec3 an = cross(ar, oa);
      mat3 m = mat3(ar, an, oa);

      float angleOffset = random3((heading.yzx + position) * time * randVal).x * TWO_PI * 0.5;

      vec3 sensor0Vec = heading * sensorDist;
      vec3 sensor1Vec = getPoint(m, sensorSpread, 0.0, angleOffset) * sensorDist;
      vec3 sensor2Vec = getPoint(m, sensorSpread, 1.0 / SENSORS_COUNT, angleOffset) * sensorDist;
      vec3 sensor3Vec = getPoint(m, sensorSpread, 2.0 / SENSORS_COUNT, angleOffset) * sensorDist;

      vec3 uv0 = ((position + sensor0Vec) + 1.0) / 2.0;
      vec3 uv1 = ((position + sensor1Vec) + 1.0) / 2.0;
      vec3 uv2 = ((position + sensor2Vec) + 1.0) / 2.0;
      vec3 uv3 = ((position + sensor3Vec) + 1.0) / 2.0;

      float val0 = texture(trailMap, uv0).x;
      float val1 = texture(trailMap, uv1).x;
      float val2 = texture(trailMap, uv2).x;
      float val3 = texture(trailMap, uv3).x;

      if (val0 > val1 && val0 > val2 && val0 > val3) {
        heading += vec3(0);
      } else if (val0 < val1 && val0 < val2 && val0 < val3) {
        float r = random3((position.yzx + heading) * time * randVal).x + 0.5;
        if (r < 0.33) {
          heading = getPoint(m, headingStepSpread, 0.0, angleOffset);
        } else if (r < 0.66) {
          heading = getPoint(m, headingStepSpread, 1.0 / SENSORS_COUNT, angleOffset);
        } else {
          heading = getPoint(m, headingStepSpread, 2.0 / SENSORS_COUNT, angleOffset);
        }
      } else if (val1 > val2 && val1 > val3) {
        heading = getPoint(m, headingStepSpread, 0.0, angleOffset);
      } else if (val2 > val1 && val2 > val3) {
        heading = getPoint(m, headingStepSpread, 1.0 / SENSORS_COUNT, angleOffset);
      } else if (val3 > val1 && val3 > val2) {
        heading = getPoint(m, headingStepSpread, 2.0 / SENSORS_COUNT, angleOffset);
      }

      vec3 velocity = heading * stepSize * 0.1;
      position += velocity;

      if (wrap == 1.0 && dot(position, position) > 1.0) {
        position *= -1.0;
        position = normalize(position);
        // if (position.x < -1.0) position.x += 2.0;
        // if (position.y < -1.0) position.y += 2.0;
        // if (position.z < -1.0) position.z += 2.0;
        // if (position.x > 1.0) position.x -= 2.0;
        // if (position.y > 1.0) position.y -= 2.0;
        // if (position.z > 1.0) position.z -= 2.0;
      }

      vPosition = position;
      vHeading = heading;
    }
    `)
  })

  const dim = settings.dimensions
  const textureOpts = { magFilter: rico.gl.LINEAR }
  console.log(rico.gl.LINEAR)
  const trailMapTexture1 = rico.createTexture3D(dim, dim, dim, textureOpts)
  const trailMapTexture2 = rico.createTexture3D(dim, dim, dim, textureOpts)

  trailMapFramebuffers = [
    rico.createFramebuffer().colorTarget(0, trailMapTexture1),
    rico.createFramebuffer().colorTarget(0, trailMapTexture2)
  ]

  layTrails = rico({
    vertexArray: agentsVertexArray
      .vertexAttributeBuffer(0, agentsPositionsBuffers[1]),
    count: settings.agentCount,
    viewport: [0, 0, settings.dimensions, settings.dimensions],
    primitive: 'points',
    vs: `#version 300 es
    precision highp float;

    layout(location=0) in vec3 position;

    uniform float pointSize;
    uniform float layerIdx;
    uniform vec3 dimensions;

    out vec4 vColor;

    void main() {
      vColor = vec4(1);
      float layerSize = 2.0 / dimensions.z;
      float curLayer = layerIdx / dimensions.z * 2.0 - 1.0;
      float prevLayer = curLayer - layerSize;
      float nextLayer = curLayer + layerSize;
      bool isInLayer = position.z > prevLayer && position.z < nextLayer;
      if (isInLayer == false || dot(position, position) > 3.0) {
        gl_Position = vec4(0);
        gl_PointSize = 0.0;
      } else {
        gl_Position = vec4(position.xy, 0, 1);
        gl_PointSize = pointSize;
      }
    }
    `,
    fs: `#version 300 es
    precision highp float;
    
    in vec4 vColor;
    out vec4 fragColor;

    uniform float trailIntensity;

    void main() {
      vec2 cxy = 2.0 * gl_PointCoord - 1.0;
      float r = dot(cxy, cxy);
      float delta = fwidth(r);
      float alpha = 1.0 - smoothstep(1.0 - delta, 1.0 + delta, r);
      if (r > 1.0) {
        discard;
      }
      fragColor = vColor;
      fragColor *= alpha * trailIntensity;
    }
    `,
    blend: {
      equation: 'func add',
      src: 'one',
      dest: 'one'
    }
  })

  processTrails = rico({
    vertexArray: rico.createVertexArray()
      .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 2, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]))),
    count: 4,
    viewport: [0, 0, settings.dimensions, settings.dimensions],
    primitive: 'triangle fan',
    vs: `#version 300 es
    precision highp float;
    layout(location=0) in vec2 position;
    out vec3 vUV;
    uniform vec3 dimensions;
    uniform float layerIdx;
    void main() {
      vUV = vec3(0.5 * (1.0 + position), layerIdx / dimensions.z);
      gl_Position = vec4(position, 0, 1);
    }
    `,
    fs: `#version 300 es
    precision highp float;
    precision lowp sampler3D;

    in vec3 vUV;
    out vec4 fragColor;

    uniform sampler3D trailMap;
    uniform float decay;
    uniform float diffuse;
    uniform vec3 dimensions;

    void main() {
      float totalPixels = pow(diffuse * 2.0 + 1.0, 3.0);
      float sum = texture(trailMap, vUV).x / totalPixels;

      int dif = int(diffuse);
      for (int w = -dif; w <= dif; w += 1) {
        for (int h = -dif; h <= dif; h += 1) {
          for (int d = -dif; d <= dif; d += 1) {
            vec3 pixel = vUV + vec3(w, h, d) / dimensions;
            if (pixel == vUV || pixel.x < 0.0 || pixel.x > 1.0 || pixel.y < 0.0 || pixel.y > 1.0 || pixel.z < 0.0 || pixel.z > 1.0) {
              continue;
            }
            sum += texture(trailMap, pixel).x / totalPixels * decay;
          }
        }
      }

      float value = sum;
      fragColor = vec4(value, value, value, 1);
    }
    `,
    blend: false
  })

  // const forward = vec3.normalize([], vec3.sub([], cC, cP))
  // const right = vec3.normalize([], vec3.cross([], forward, up))
  // vec3.normalize(up, vec3.cross([], right, forward))

  // // Calculate how far up, down, left, and right we need to move from the
  // // center of the ray quad to find points a', b', c', and d'.
  // const mu = Math.tan(fov / 2)
  // const md = -mu
  // const mr = aspect * mu
  // const ml = -mr

  // const Z = vec3.add([], cP, forward)

  // const muUp = vec3.scale([], up, mu)
  // const mdUp = vec3.scale([], up, md)
  // const mrRight = vec3.scale([], right, mr)
  // const mlRight = vec3.scale([], right, ml)

  // const a = vec3.add([], Z, vec3.add([], mdUp, mlRight))
  // const b = vec3.add([], Z, vec3.add([], mdUp, mrRight))
  // const c = vec3.add([], Z, vec3.add([], muUp, mrRight))
  // const d = vec3.add([], Z, vec3.add([], muUp, mlRight))

  // // Construct an unindexed vertex attribute array from a', b', c', and d'.
  // const uv = []
  // uv.push(...a)
  // uv.push(...b)
  // uv.push(...c)
  // uv.push(...a)
  // uv.push(...c)
  // uv.push(...d)

  renderTrails = rico({
    vertexArray: rico.createVertexArray()
      .vertexAttributeBuffer(0, rico.createVertexBuffer(rico.gl.FLOAT, 2, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]))),
    count: 6,
    primitive: 'triangles',
    vs: `#version 300 es
    precision highp float;
    layout(location=0) in vec2 position;

    uniform vec3 cameraPosition;
    uniform float aspect;
    uniform float fov;

    out vec3 vRayQuad;

    const vec3 cameraCenter = vec3(0);
    void main() {
      vec3 up = vec3(0, 1, 0);
      vec3 forward = normalize(cameraCenter - cameraPosition);
      vec3 right = normalize(cross(forward, up));
      up = normalize(cross(right, forward));

      vec3 m = forward + cameraPosition;

      float mu = tan(fov / 2.0);
      float mr = aspect * mu;
    
      vec2 p = vec2(mr, mu) * position;

      vRayQuad = m + p.x * right + p.y * up;
      gl_Position = vec4(position, 0, 1);
    }
    `,
    fs: injectGLSL(PALETTE_ANIMATOR_GLSL, `#version 300 es
    precision highp float;
    precision lowp sampler3D;

    in vec3 vRayQuad;
    out vec4 fragColor;

    uniform sampler3D trailMap;
    uniform vec3 cameraPosition;
    uniform float colorCount;
    uniform float shadeIntensity;
    uniform float threshold;
    uniform float pixelSize;
    uniform float sampleCount;
    uniform float rayStepSize;
  
    const vec3 lightDir = normalize(vec3(5, 1, 1));
    const float sphereSize = 0.9;
  
    float getVal (vec3 p, vec3 viewDirection) {
      float dist = length(p);
      vec3 pos = dist > sphereSize ? normalize(p) * sphereSize : p;
      float val = 1.0 - texture(trailMap, (pos + 1.0) * 0.5).x;
      return val + max(dist - sphereSize, 0.0) * sign(dot(viewDirection, pos - p));
    }

    vec3 getNormal (vec3 p, vec3 viewDirection) {
      return normalize(vec3(
        getVal(p + vec3(pixelSize, 0, 0), viewDirection) - getVal(p - vec3(pixelSize, 0, 0), viewDirection),
        getVal(p + vec3(0, pixelSize, 0), viewDirection) - getVal(p - vec3(0, pixelSize, 0), viewDirection),
        getVal(p + vec3(0, 0, pixelSize), viewDirection) - getVal(p - vec3(0, 0, pixelSize), viewDirection)
      ));
    }
  
    vec3 getColor (float t) {
      return getColorFromPalette(floor(t * colorCount) / colorCount);
    }
  
    vec3 ray (vec3 start, vec3 dir, float t) {
      return start + t * dir;
    }
  
    void main() {
      vec3 viewDirection = normalize(vRayQuad - cameraPosition);
      float t = 0.0;
      float dist;
      vec3 position;
      vec3 normal;
      vec3 color = vec3(0.82, 0.83, 0.84);
  
      int count = int(sampleCount);
      for (int i = 0; i < count; i++) {
        position = ray(cameraPosition, viewDirection, t);
        dist = getVal(position, viewDirection);
  
        if (abs(dist) < threshold) {
          normal = getNormal(position, viewDirection);
          float shade = clamp(dot(normal, lightDir), 0.0, 1.0);
          color = getColor(length(position)) + shade * vec3(shadeIntensity);
          break;
        }
        t = t + dist * rayStepSize;
      }
      fragColor = vec4(color, 1);
    }
    `)
  })
}

const sketch = () => {
  setup()
  return ({ width, height, time }) => {
    rico.clear(0, 0, 0, 1)
    camera.tick()

    paletteAnimator.tick(settings.palette)

    const dimensions3d = [settings.dimensions, settings.dimensions, settings.dimensions]

    updateAgents({
      vertexArray: agentsVertexArray
        .vertexAttributeBuffer(0, agentsPositionsBuffers[0])
        .vertexAttributeBuffer(1, agentsHeadingsBuffers[0]),
      transform: {
        vPosition: agentsPositionsBuffers[1],
        vHeading: agentsHeadingsBuffers[1]
      },
      uniforms: {
        stepSize: settings.stepSize,
        headingStepSpread: settings.headingStepSpread,
        sensorSpread: settings.sensorSpread,
        sensorDist: settings.sensorDist,
        time: time,
        trailMap: trailMapFramebuffers[0].colorAttachments[0],
        dimensions: dimensions3d,
        wrap: settings.wrap ? 1 : 0
      }
    })

    agentsVertexArray.vertexAttributeBuffer(0, agentsPositionsBuffers[1])
    for (let i = 0; i < settings.dimensions; i++) {
      trailMapFramebuffers[0].colorTarget(0, trailMapFramebuffers[0].colorAttachments[0], i)
      layTrails({
        framebuffer: trailMapFramebuffers[0],
        vertexArray: agentsVertexArray,
        uniforms: {
          layerIdx: i,
          dimensions: dimensions3d,
          pointSize: settings.pointSize,
          trailIntensity: settings.trailIntensity
        }
      })
    }

    for (let i = 0; i < settings.dimensions; i++) {
      trailMapFramebuffers[1].colorTarget(0, trailMapFramebuffers[1].colorAttachments[0], i)
      processTrails({
        framebuffer: trailMapFramebuffers[1],
        uniforms: {
          layerIdx: i,
          dimensions: dimensions3d,
          decay: settings.decay,
          diffuse: settings.diffuse,
          trailMap: trailMapFramebuffers[0].colorAttachments[0]
        }
      })
    }

    renderTrails({
      uniforms: {
        trailMap: trailMapFramebuffers[0].colorAttachments[0],
        cameraPosition: camera._camera.eye,
        fov: Math.PI / 4,
        aspect: width / height,
        colorCount: settings.colorCount,
        threshold: settings.threshold,
        pixelSize: settings.pixelSize,
        rayStepSize: settings.rayStepSize,
        shadeIntensity: settings.shadeIntensity,
        sampleCount: settings.sampleCount,
        ...paletteAnimator.uniforms()
      }
    })

    rotate(agentsPositionsBuffers)
    rotate(agentsHeadingsBuffers)
    rotate(trailMapFramebuffers)
  }
}

canvasSketch(sketch, {
  canvas: rico.canvas,
  context: 'webgl2',
  pixelRatio: 1,
  animate: true
})

function rotate (arr) {
  arr.push(arr.shift())
  return arr
}
