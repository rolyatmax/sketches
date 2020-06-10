import * as luma from 'luma.gl'
const canvasSketch = require('canvas-sketch')
const { GUI } = require('dat-gui')
const { random } = require('canvas-sketch-util')
const createRoamingCamera = require('./common/create-roaming-camera')
const mat4 = require('gl-mat4')
const { createSpring } = require('spring-animator')

const SIZE = 1024

const onChange = () => setup()

const settings = {
  seed: 0,
  pointCount: 300000,
  pointSize: 5,
  noiseMag: 25,
  freq: 0.7,
  hueSpread: 0.1,
  hueStart: 0.56,
  saturation: 0.35,
  lightness: 0.35,
  cameraDist: 5,
  dampening: 0.01,
  stiffness: 1.5
}

let drawCirclesModel, nOffset, frame, setup, noiseSpring, hueSpreadSpring, hueStartSpring, sizeSpring
let moveToNextPosition = () => {}
let rand = random.createRandom(settings.seed)

const gui = new GUI()
gui.add(settings, 'seed', 0, 9999).step(1).onChange(onChange)
gui.add(settings, 'pointCount', 0, 1000000).step(1).onChange(onChange)
gui.add(settings, 'pointSize', 1, 100)
gui.add(settings, 'noiseMag', 0, 100)
gui.add(settings, 'freq', 0, 3)
// gui.add(settings, 'hueStart', 0, 1).step(0.01)
gui.add(settings, 'hueSpread', 0, 1).step(0.01)
gui.add(settings, 'saturation', 0, 1).step(0.01)
gui.add(settings, 'lightness', 0, 1).step(0.01)
gui.add(settings, 'dampening', 0, 1).onChange(onChange)
gui.add(settings, 'stiffness', 0, 2).onChange(onChange)

gui.add(settings, 'cameraDist', 0, 10)
gui.add({ next: () => moveToNextPosition() }, 'next')
gui.add({ changeNoise: changeNoise }, 'changeNoise')

function changeNoise () {
  noiseSpring.updateValue(rand.range(settings.noiseMag / 50))
  hueSpreadSpring.updateValue(rand.range(settings.hueSpread))
  hueStartSpring.updateValue(rand.value())
  sizeSpring.updateValue(rand.range(0.5, 1) * settings.pointSize)
}

const sketch = ({ gl }) => {
  const camera = createRoamingCamera({
    canvas: gl.canvas,
    zoomSpeed: 4,
    center: [1, 1, 1],
    eye: [0, 0, 0],
    dampening: 0.01,
    stiffness: 1.5,
    getCameraPosition: () => rand.onSphere(settings.cameraDist)
  })

  moveToNextPosition = camera.moveToNextPosition

  const projection = mat4.perspective(
    [],
    Math.PI / 4,
    gl.canvas.width / gl.canvas.height,
    0.01,
    1000
  )

  setup = function setup () {
    luma.setParameters(gl, {
      clearColor: [1, 1, 1, 1],
      clearDepth: 1,
      depthTest: true,
      depthFunc: gl.LEQUAL
    })

    rand = random.createRandom(settings.seed)
    noiseSpring = createSpring(settings.dampening, settings.stiffness, 0)
    hueSpreadSpring = createSpring(settings.dampening, settings.stiffness, 0)
    hueStartSpring = createSpring(settings.dampening, settings.stiffness, 0)
    sizeSpring = createSpring(settings.dampening, settings.stiffness, 1)
    nOffset = rand.insideSphere(500)
    frame = 0

    changeNoise()

    const points = new Array(settings.pointCount).fill(null).map(() => ({
      position: rand.onSphere()
    }))

    drawCirclesModel = new luma.Model(gl, {
      vs: `#version 300 es
        precision highp float;
        in vec3 position;

        uniform mat4 projection;
        uniform mat4 view;
        uniform float frame;
        uniform vec3 nOffset;
        uniform float sizeMultiplier;
        uniform float noiseMultiplier;
        uniform float saturation;
        uniform float lightness;
        uniform float hueStart;
        uniform float hueSpread;
        uniform float nFreq;

        out vec3 pointColor;

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

        void main() {
          float n = snoise(vec4(position * nFreq, frame / 500.0));
          float phi = (n + 1.0) * 3.1415;

          float v = snoise(vec4((position + nOffset) * nFreq, frame / 500.0));
          float theta = cos(v);

          float l = snoise(vec4((position + nOffset.zxy) * nFreq, frame / 500.0));
          float lightnessOffset = 0.2 * l;

          vec3 dir = vec3(
            sin(theta) * cos(phi),
            sin(theta) * sin(phi),
            cos(theta)
          );

          float s = snoise(vec4((position + nOffset.yxz) * nFreq / 3.0, frame / 1000.0));
          float size = s * 0.5 + 0.5;
                
          vec3 pos = position + dir * noiseMultiplier;
          gl_Position = projection * view * vec4(pos, 1);
          gl_PointSize = size * size * sizeMultiplier;
          float hue = v * hueSpread + hueStart;
          pointColor = hsl2rgb(vec3(hue, saturation, lightness + lightnessOffset));
        }
      `,
      fs: `#version 300 es
        precision highp float;
        in vec3 pointColor;
        out vec4 fragColor;
        void main() {
          vec2 cxy = 2.0 * gl_PointCoord - 1.0;
          float r = dot(cxy, cxy);
          float delta = fwidth(r);
          float alpha = 1.0 - smoothstep(1.0 - delta, 1.0 + delta, r);
          if (r > 0.9) {
            discard;
          }
          fragColor = vec4(pointColor * alpha, alpha);
        }
      `,
      attributes: {
        position: new luma.Buffer(gl, {
          data: new Float32Array(points.map(p => p.position).flat()),
          size: 3,
          type: gl.FLOAT
        }),
        size: new luma.Buffer(gl, {
          data: new Float32Array(points.map(p => p.size).flat()),
          size: 1,
          type: gl.FLOAT
        })
      },
      drawMode: gl.POINTS,
      vertexCount: points.length
    })
  }

  setup()

  return () => {
    frame += 1
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    camera.tick()
    drawCirclesModel.draw({
      uniforms: {
        view: camera.getMatrix(),
        projection: projection,
        sizeMultiplier: sizeSpring.tick(),
        noiseMultiplier: noiseSpring.tick(),
        saturation: settings.saturation,
        lightness: settings.lightness,
        hueStart: hueStartSpring.tick(),
        hueSpread: hueSpreadSpring.tick(),
        nOffset: nOffset,
        frame: frame,
        nFreq: settings.freq
      }
    })
  }
}

canvasSketch(sketch, {
  animate: true,
  context: 'webgl2',
  attributes: { antialias: true },
  dimensions: [SIZE, SIZE]
})
