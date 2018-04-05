const fit = require('canvas-fit')
const Alea = require('alea')
const glsl = require('glslify')
const mat4 = require('gl-mat4')
const createRegl = require('regl')
const createCamera = require('3d-view-controls')
const createPerspectiveCamera = require('perspective-camera')
const getNormal = require('triangle-normal')
const primitiveIcosphere = require('primitive-icosphere')
const { GUI } = require('dat-gui')

const canvas = document.body.appendChild(document.createElement('canvas'))
window.addEventListener('resize', fit(canvas), false)
const camera = createCamera(canvas, { zoomSpeed: 4 })
const regl = createRegl(canvas)

camera.lookAt(
  [50, 50, 50],
  [0, 0, 0],
  [0, 0, 1]
)

const settings = {
  meshCount: 100,
  spreadSize: 20,
  shadowBufferSize: 512,
  lightPosX: 100,
  lightPosY: 50,
  lightPosZ: 80,
  toggleDebug: false
}

const gui = new GUI()
gui.add(settings, 'meshCount', 1, 1000).step(1).onChange(setup)
gui.add(settings, 'spreadSize', 1, 100).step(1).onChange(setup)
gui.add(settings, 'shadowBufferSize', 256, 4096).step(1).onChange(setup)
gui.add(settings, 'lightPosX', 0, 200).step(1)
gui.add(settings, 'lightPosY', 0, 200).step(1)
gui.add(settings, 'lightPosZ', 0, 200).step(1)
gui.add(settings, 'toggleDebug')

const mesh = primitiveIcosphere(1, { subdivisions: 1 })
// const mesh = require('primitive-cube')()
window.mesh = mesh

let renderShadowMap, renderCube, shadowFbo, lightCamera, random

setup()

function setup () {
  random = new Alea(1)
  const { positions, normals } = getGeometry(settings.meshCount, settings.spreadSize)

  // FBO for shadows
  shadowFbo = regl.framebuffer({
    color: regl.texture({
      shape: [settings.shadowBufferSize, settings.shadowBufferSize, 4],
      data: new Uint8Array(settings.shadowBufferSize * settings.shadowBufferSize * 4)
    }),
    depth: true,
    stencil: false
  })

  lightCamera = createPerspectiveCamera({
    fov: Math.PI / 4,
    near: 0.01,
    far: 1000,
    viewport: [0, 0, settings.shadowBufferSize, settings.shadowBufferSize]
  })

  lightCamera.translate([settings.lightPosX, settings.lightPosY, settings.lightPosZ])
  lightCamera.lookAt([0, 0, 0])
  lightCamera.update()

  renderShadowMap = regl({
    vert: glsl`
      precision highp float;
      attribute vec3 position;
      uniform mat4 projection;
      uniform mat4 view;
      void main() {
        gl_Position = projection * view * vec4(position, 1);
      }
    `,
    frag: glsl`
      precision highp float;
      vec4 encodeFloat (float depth) {
        const vec4 bitShift = vec4(1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0);
        const vec4 bitMask = vec4(1.0/256.0, 1.0/256.0, 1.0/256.0, 0.0);
        vec4 comp = fract(depth * bitShift);
        comp -= comp.gbaa * bitMask;
        return comp;
      }
      
      void main() {
        gl_FragColor = encodeFloat(gl_FragCoord.z);
      }
    `,
    attributes: {
      position: positions
    },
    uniforms: {
      projection: () => lightCamera.projection,
      view: () => lightCamera.view
    },
    count: positions.length / 3,
    primitive: 'triangles'
  })

  renderCube = regl({
    vert: glsl`
      precision highp float;
  
      attribute vec3 position;
      attribute vec3 normal;
      varying vec3 vNormal;
      varying vec4 vPositionFromLight;
      uniform mat4 projection;
      uniform mat4 view;
      uniform mat4 lightProjection;
      uniform mat4 lightView;
      
      void main (void) {
        vNormal = normal;
        vPositionFromLight = lightProjection * lightView * vec4(position, 1.0);
        gl_Position = projection * view * vec4(position, 1.0);
      }
    `,
    frag: glsl`
      precision highp float;
  
      varying vec3 vNormal;
      varying vec4 vPositionFromLight;
      uniform vec4 color;
      uniform vec3 lightDirection;
      uniform sampler2D shadowMap;
  
      float unpackDepth(const in vec4 rgbaDepth) {
          const vec4 bitShift = vec4(1.0, 1.0/256.0, 1.0/(256.0 * 256.0), 1.0/(256.0*256.0*256.0));
          float depth = dot(rgbaDepth, bitShift);
          return depth;
      }
  
      void main() {
        vec3 shadowPos = (vPositionFromLight.xyz / vPositionFromLight.w);
        vec3 shadowCoords = shadowPos / 2.0 + 0.5;
      
        float texelSize = 1.0 / ${settings.shadowBufferSize}.0;
        float visibility = 0.0;
        for (int x = -1; x <= 1; x++) {
          for (int y = -1; y <= 1; y++) {
            float depth = unpackDepth(texture2D(shadowMap, shadowCoords.xy + vec2(x, y) * texelSize));
            visibility += (shadowPos.z > depth + 0.0015) ? 0.4 : 1.0;
          }
        }
        visibility /= 9.0;
  
        // vec4 rgbaDepth = texture2D(shadowMap, shadowCoords.xy);
        // gl_FragColor = rgbaDepth;
        // float depth = unpackDepth(rgbaDepth);
        // float visibility = (shadowPos.z > depth + 0.0015) ? 0.7 : 1.0;
  
        vec3 normal = normalize(vNormal);
        vec3 direction = normalize(lightDirection * -1.0);
        float light = dot(normal, direction);
        gl_FragColor = color;
        gl_FragColor.rgb *= visibility;
        gl_FragColor.rgb *= (light * 0.35 + 0.65);
      }
    `,
    attributes: {
      position: positions,
      normal: normals
    },
    uniforms: {
      projection: ({ viewportWidth, viewportHeight }) => mat4.perspective(
        [],
        Math.PI / 4,
        viewportWidth / viewportHeight,
        0.01,
        1000
      ),
      view: () => camera.matrix,
      lightProjection: () => lightCamera.projection,
      lightView: () => lightCamera.view,
      shadowMap: regl.prop('shadowMap'),
      lightDirection: () => lightCamera.direction,
      color: regl.prop('color')
    },
    count: positions.length / 3,
    primitive: 'triangles'
  })
}

regl.frame(({ time }) => {
  camera.tick()
  // lightCamera.position = [
  //   settings.lightPosX,
  //   settings.lightPosY,
  //   settings.lightPosZ
  // ]

  lightCamera.position = [
    Math.sin(time * 2 + 4) * 50 + 100,
    Math.cos(time * 3 + 9) * 50 + 100,
    Math.sin(time * 5 + 5) * 50 + 100
  ]

  lightCamera.lookAt([0, 0, 0])
  lightCamera.update()
  regl.clear({
    color: [0.97, 0.96, 0.95, 1],
    depth: 1
  })
  renderCube({
    color: [0.45, 0.57, 0.76, 1],
    shadowMap: shadowFbo
  })
  regl({ framebuffer: settings.toggleDebug ? null : shadowFbo })(() => {
    regl.clear({
      color: [0, 0, 0, 1],
      depth: 1
    })
    renderShadowMap()
  })
})

function getGeometry (meshCount, spreadSize) {
  const positions = []
  const normals = []

  const rand = () => (random() - 0.5) * 2 * spreadSize

  let j = meshCount
  while (j--) {
    const offset = [rand(), rand(), rand()]
    mesh.cells.forEach((tri) => {
      for (let i = 0; i < 3; i++) {
        positions.push(
          mesh.positions[tri[i]][0] * 5 + offset[0],
          mesh.positions[tri[i]][1] * 5 + offset[1],
          mesh.positions[tri[i]][2] * 5 + offset[2]
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
