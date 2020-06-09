const canvasSketch = require('canvas-sketch')
const { GUI } = require('dat-gui')
const { random } = require('canvas-sketch-util')
const glsl = require('glslify')
const mat4 = require('gl-mat4')
const vec3 = require('gl-vec3')
const createRegl = require('regl')
const createCamera = require('3d-view-controls')
const getNormal = require('triangle-normal')
const geoao = require('geo-ambient-occlusion')
const primitiveIcosphere = require('primitive-icosphere')

const WIDTH = 2048
const HEIGHT = 2048

let nOffset, renderCube, curAO, lastAO, positions, normals, setup

const settings = {
  seed: 1,
  meshCount: 200,
  spreadSize: 25,
  sampleCount: 2048,
  resolution: 512,
  bias: 0.04,
  subdivisions: 0,
  size: 1.6,
  freq: 0.03,
  hueSpread: 0.04,
  hueStart: 0.62,
  saturation: 0.4,
  lightness: 0.5,
  speed: 0.005,
  hideTrisChance: 0.1
}

const onChange = () => setup()

const gui = new GUI()
gui.add(settings, 'seed', 1, 1000).step(1).onChange(onChange)
gui.add(settings, 'meshCount', 1, 1000).step(1).onChange(onChange)
gui.add(settings, 'spreadSize', 1, 100).step(1).onChange(onChange)
gui.add(settings, 'sampleCount', 1, 10000).step(1).onChange(onChange)
gui.add(settings, 'resolution', 1, 2048).step(1).onChange(onChange)
gui.add(settings, 'bias', 0, 0.5).step(0.001).onChange(onChange)
gui.add(settings, 'subdivisions', 0, 4).step(1).onChange(onChange)
gui.add(settings, 'size', 0, 2).step(0.01).onChange(onChange)
gui.add(settings, 'freq', 0, 0.1).step(0.001)
gui.add(settings, 'hueStart', 0, 1).step(0.01)
gui.add(settings, 'hueSpread', 0, 1).step(0.01)
gui.add(settings, 'saturation', 0, 1).step(0.01)
gui.add(settings, 'lightness', 0, 1).step(0.01)
gui.add(settings, 'speed', 0, 0.02).step(0.001)
gui.add(settings, 'hideTrisChance', 0, 1).step(0.01).onChange(onChange)

const sketch = ({ canvas }) => {
  const camera = createCamera(canvas, { zoomSpeed: 4 })
  const regl = createRegl({
    extensions: ['OES_texture_float'],
    canvas: canvas
  })

  camera.lookAt(
    [50, 50, 50],
    [0, 0, 0],
    [0, 0, 1]
  )

  // const mesh = primitiveIcosphere(1, { subdivisions: 1 })
  // const mesh = require('primitive-cube')()
  // window.mesh = mesh

  setup = function () {
    updatePositions(settings.spreadSize)
    nOffset = random.insideSphere(500)
    updateAO()
    renderCube = regl({
      vert: glsl`
        precision highp float;
    
        attribute vec3 position;
        attribute float curAO;
        attribute float lastAO;
        varying vec4 fragColor;

        uniform mat4 projection;
        uniform mat4 view;
        uniform float frame;
        uniform vec3 nOffset;
        uniform float saturation;
        uniform float lightness;
        uniform float hueStart;
        uniform float hueSpread;
        uniform float nFreq;
        uniform float speed;
  
        float hue2rgb(float f1, float f2, float hue) {
          if (hue < 0.0)
            hue += 1.0;
          else if (hue > 1.0)
            hue -= 1.0;
          float res;
          if ((6.0 * hue) < 1.0)
            res = f1 + (f2 - f1) * 6.0 * hue;
          else if ((2.0 * hue) < 1.0)
            res = f2;
          else if ((3.0 * hue) < 2.0)
            res = f1 + (f2 - f1) * ((2.0 / 3.0) - hue) * 6.0;
          else
            res = f1;
          return res;
        }

        vec3 hsl2rgb(vec3 hsl) {
          vec3 rgb;
          if (hsl.y == 0.0) {
            rgb = vec3(hsl.z); // Luminance
          } else {
            float f2;
            if (hsl.z < 0.5) {
              f2 = hsl.z * (1.0 + hsl.y);
            } else {
              f2 = hsl.z + hsl.y - hsl.y * hsl.z;
            }
            float f1 = 2.0 * hsl.z - f2;
            rgb.r = hue2rgb(f1, f2, hsl.x + (1.0/3.0));
            rgb.g = hue2rgb(f1, f2, hsl.x);
            rgb.b = hue2rgb(f1, f2, hsl.x - (1.0/3.0));
          }
          return rgb;
        }

        vec4 mod289(vec4 x) {
          return x - floor(x * (1.0 / 289.0)) * 289.0; }
        
        float mod289(float x) {
          return x - floor(x * (1.0 / 289.0)) * 289.0; }
        
        vec4 permute(vec4 x) {
             return mod289(((x*34.0)+1.0)*x);
        }
        
        float permute(float x) {
             return mod289(((x*34.0)+1.0)*x);
        }
        
        vec4 taylorInvSqrt(vec4 r)
        {
          return 1.79284291400159 - 0.85373472095314 * r;
        }
        
        float taylorInvSqrt(float r)
        {
          return 1.79284291400159 - 0.85373472095314 * r;
        }
        
        vec4 grad4(float j, vec4 ip)
          {
          const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
          vec4 p,s;
        
          p.xyz = floor( fract (vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
          p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
          s = vec4(lessThan(p, vec4(0.0)));
          p.xyz = p.xyz + (s.xyz*2.0 - 1.0) * s.www;
        
          return p;
          }
        
        // (sqrt(5) - 1)/4 = F4, used once below
        #define F4 0.309016994374947451
        
        float snoise(vec4 v)
          {
          const vec4  C = vec4( 0.138196601125011,  // (5 - sqrt(5))/20  G4
                                0.276393202250021,  // 2 * G4
                                0.414589803375032,  // 3 * G4
                               -0.447213595499958); // -1 + 4 * G4
        
        // First corner
          vec4 i  = floor(v + dot(v, vec4(F4)) );
          vec4 x0 = v -   i + dot(i, C.xxxx);
        
        // Other corners
        
        // Rank sorting originally contributed by Bill Licea-Kane, AMD (formerly ATI)
          vec4 i0;
          vec3 isX = step( x0.yzw, x0.xxx );
          vec3 isYZ = step( x0.zww, x0.yyz );
        //  i0.x = dot( isX, vec3( 1.0 ) );
          i0.x = isX.x + isX.y + isX.z;
          i0.yzw = 1.0 - isX;
        //  i0.y += dot( isYZ.xy, vec2( 1.0 ) );
          i0.y += isYZ.x + isYZ.y;
          i0.zw += 1.0 - isYZ.xy;
          i0.z += isYZ.z;
          i0.w += 1.0 - isYZ.z;
        
          // i0 now contains the unique values 0,1,2,3 in each channel
          vec4 i3 = clamp( i0, 0.0, 1.0 );
          vec4 i2 = clamp( i0-1.0, 0.0, 1.0 );
          vec4 i1 = clamp( i0-2.0, 0.0, 1.0 );
        
          //  x0 = x0 - 0.0 + 0.0 * C.xxxx
          //  x1 = x0 - i1  + 1.0 * C.xxxx
          //  x2 = x0 - i2  + 2.0 * C.xxxx
          //  x3 = x0 - i3  + 3.0 * C.xxxx
          //  x4 = x0 - 1.0 + 4.0 * C.xxxx
          vec4 x1 = x0 - i1 + C.xxxx;
          vec4 x2 = x0 - i2 + C.yyyy;
          vec4 x3 = x0 - i3 + C.zzzz;
          vec4 x4 = x0 + C.wwww;
        
        // Permutations
          i = mod289(i);
          float j0 = permute( permute( permute( permute(i.w) + i.z) + i.y) + i.x);
          vec4 j1 = permute( permute( permute( permute (
                     i.w + vec4(i1.w, i2.w, i3.w, 1.0 ))
                   + i.z + vec4(i1.z, i2.z, i3.z, 1.0 ))
                   + i.y + vec4(i1.y, i2.y, i3.y, 1.0 ))
                   + i.x + vec4(i1.x, i2.x, i3.x, 1.0 ));
        
        // Gradients: 7x7x6 points over a cube, mapped onto a 4-cross polytope
        // 7*7*6 = 294, which is close to the ring size 17*17 = 289.
          vec4 ip = vec4(1.0/294.0, 1.0/49.0, 1.0/7.0, 0.0) ;
        
          vec4 p0 = grad4(j0,   ip);
          vec4 p1 = grad4(j1.x, ip);
          vec4 p2 = grad4(j1.y, ip);
          vec4 p3 = grad4(j1.z, ip);
          vec4 p4 = grad4(j1.w, ip);
        
        // Normalise gradients
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
          p0 *= norm.x;
          p1 *= norm.y;
          p2 *= norm.z;
          p3 *= norm.w;
          p4 *= taylorInvSqrt(dot(p4,p4));
        
        // Mix contributions from the five corners
          vec3 m0 = max(0.6 - vec3(dot(x0,x0), dot(x1,x1), dot(x2,x2)), 0.0);
          vec2 m1 = max(0.6 - vec2(dot(x3,x3), dot(x4,x4)            ), 0.0);
          m0 = m0 * m0;
          m1 = m1 * m1;
          return 49.0 * ( dot(m0*m0, vec3( dot( p0, x0 ), dot( p1, x1 ), dot( p2, x2 )))
                       + dot(m1*m1, vec2( dot( p3, x3 ), dot( p4, x4 ) ) ) ) ;
        
        }

        void main (void) {
          float h = snoise(vec4((position + nOffset) * nFreq, frame * speed));

          float l = snoise(vec4((position + nOffset.zxy) * nFreq, frame * speed));
          float lightnessOffset = 0.25 * l;

          float sat = snoise(vec4((position + nOffset.xzy) * nFreq, frame * speed));
          float saturationOffset = 0.1 * sat;

          float hue = h * hueSpread + hueStart;

          float ao = (curAO + lastAO) / 2.0;
          fragColor = vec4(hsl2rgb(vec3(hue, saturation + saturationOffset, lightness + lightnessOffset)), 1.0);
          fragColor.rgb *= pow(1.0 - ao + 0.1, 0.8);
          gl_Position = projection * view * vec4(position, 1.0);
        }
      `,
      frag: glsl`
        precision highp float;

        varying vec4 fragColor;
  
        void main() {
          gl_FragColor = fragColor;
        }
      `,
      attributes: {
        position: () => positions,
        normal: () => normals,
        curAO: () => curAO,
        lastAO: () => lastAO
      },
      uniforms: {
        projection: mat4.perspective(
          [],
          Math.PI / 4,
          WIDTH / HEIGHT,
          10,
          1000
        ),
        view: () => camera.matrix,
        saturation: () => settings.saturation,
        lightness: () => settings.lightness,
        hueStart: () => settings.hueStart,
        hueSpread: () => settings.hueSpread,
        nOffset: () => nOffset,
        frame: regl.prop('frame'),
        nFreq: () => settings.freq,
        speed: () => settings.speed
      },
      count: () => positions.length / 3,
      primitive: 'triangles'
    })
  }

  function updatePositions (spreadSize) {
    random.setSeed(settings.seed)
    const mesh = primitiveIcosphere(settings.size, { subdivisions: settings.subdivisions })
    const geometry = getGeometry(mesh, settings.meshCount, spreadSize)

    positions = geometry.positions
    normals = geometry.normals
  }

  function updateAO () {
    const aoSampler = geoao(positions, {
      resolution: settings.resolution,
      bias: settings.bias,
      normals: normals,
      regl: regl
    })

    for (let i = 0; i < settings.sampleCount; i++) {
      aoSampler.sample()
    }

    const ao = aoSampler.report()
    lastAO = curAO || ao
    curAO = ao

    aoSampler.dispose()
  }

  setup()
  let frame = 0
  return () => {
    frame += 1
    const time = frame / 30
    regl.poll()
    camera.tick()
    camera.center = [
      Math.sin(time * 0.3) * 100,
      Math.cos(time * 0.4) * 90,
      Math.sin((time + 10) * 0.5) * 85
    ]

    regl.clear({
      color: [0.99, 0.98, 0.97, 1],
      depth: 1
    })
    renderCube({
      frame: frame
    })
  }
}

canvasSketch(sketch, {
  dimensions: [WIDTH, HEIGHT],
  context: 'webgl',
  attributes: { antialias: true },
  animate: true
})

// -------------

function getGeometry (mesh, meshCount, spreadSize) {
  const positions = []
  const normals = []

  const r = () => random.range(-spreadSize, spreadSize)
  const maxLen = vec3.length([spreadSize, spreadSize, spreadSize])

  let j = meshCount
  while (j--) {
    const offset = [r(), r(), r()]
    mesh.cells.forEach((tri) => {
      const size = (1 - (vec3.length(offset) / maxLen)) * 5
      // if (random.chance(settings.hideTrisChance)) return
      for (let i = 0; i < 3; i++) {
        positions.push(
          mesh.positions[tri[i]][0] * size + offset[0],
          mesh.positions[tri[i]][1] * size + offset[1],
          mesh.positions[tri[i]][2] * size + offset[2]
        )
      }
    })
  }

  for (let i = 0; i < positions.length; i += 9) {
    const curNormal = getNormal(
      positions[i + 0], positions[i + 1], positions[i + 2],
      positions[i + 3], positions[i + 4], positions[i + 5],
      positions[i + 6], positions[i + 7], positions[i + 8],
      []
    )

    normals.push(
      curNormal[0], curNormal[1], curNormal[2],
      curNormal[0], curNormal[1], curNormal[2],
      curNormal[0], curNormal[1], curNormal[2]
    )
  }
  return { positions, normals }
}

function hslToRgb (h, s, l) {
  let r, g, b

  function hue2rgb (p, q, t) {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  if (s === 0) {
    r = g = b = l
  } else {
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s
    var p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  return [r, g, b]
}
