const fit = require('canvas-fit')
const Alea = require('alea')
const glsl = require('glslify')
const mat4 = require('gl-mat4')
const createRegl = require('regl')
const createCamera = require('3d-view-controls')
const createPerspectiveCamera = require('perspective-camera')
const getNormal = require('triangle-normal')
// const primitiveIcosphere = require('primitive-icosphere')
const { GUI } = require('dat-gui')

const canvas = document.body.appendChild(document.createElement('canvas'))
window.addEventListener('resize', fit(canvas), false)
const camera = createCamera(canvas, { zoomSpeed: 4 })
const regl = createRegl({
  extensions: 'OES_texture_float',
  canvas: canvas
})

camera.lookAt(
  [50, 50, 50],
  [0, 0, 0],
  [0, 0, 1]
)

const settings = {
  meshCount: 100,
  spreadSize: 20,
  shadowBufferSize: 1024,
  lightPosX: 100,
  lightPosY: 50,
  lightPosZ: 80,
  toggleDebug: false
}

const gui = new GUI()
gui.add(settings, 'meshCount', 1, 1000).step(1).onChange(setup)
gui.add(settings, 'spreadSize', 1, 100).step(1).onChange(setup)
gui.add(settings, 'shadowBufferSize', 256, 4096).step(1).onChange(setup)
gui.add(settings, 'lightPosX', -600, 600).step(1)
gui.add(settings, 'lightPosY', -600, 600).step(1)
gui.add(settings, 'lightPosZ', -600, 600).step(1)
gui.add(settings, 'toggleDebug')

// const mesh = primitiveIcosphere(1, { subdivisions: 1 })
const mesh = require('primitive-cube')()
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
      data: new Float32Array(settings.shadowBufferSize * settings.shadowBufferSize * 4),
      // mag: 'linear',
      // min: 'linear',
      wrap: ['clamp', 'clamp'],
      type: 'float'
    }),
    depth: true,
    stencil: false
  })

  lightCamera = createPerspectiveCamera({
    fov: Math.PI / 16,
    near: 10,
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
      varying float vDepth;
      uniform mat4 projection;
      uniform mat4 view;
      void main() {
        gl_Position = projection * view * vec4(position, 1);
        vDepth = (view * vec4(position, 1)).z;
      }
    `,
    frag: glsl`
      precision highp float;
      varying float vDepth;
      void main() {
        gl_FragColor = vec4(vec3(vDepth), 1);
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
      varying vec4 vShadowCoord;
      varying float vBias;
      uniform mat4 projection;
      uniform mat4 view;
      uniform vec3 lightDirection;
      uniform mat4 lightProjection;
      uniform mat4 lightView;
      
      const mat4 biasMatrix = mat4(
        0.5, 0.0, 0.0, 0.0,
        0.0, 0.5, 0.0, 0.0,
        0.0, 0.0, 0.5, 0.0,
        0.5, 0.5, 0.5, 1.0
      );

      void main (void) {
        vBias = max(.002 * (1.0 - dot(normalize(normal), normalize(lightDirection))), .002);
        vNormal = normal;
        vShadowCoord = biasMatrix * lightView * vec4(position, 1.0);
        gl_Position = projection * view * vec4(position, 1.0);
      }
    `,
    frag: glsl`
      precision highp float;
  
      varying vec3 vNormal;
      varying vec4 vShadowCoord;
      varying float vBias;
      uniform vec4 color;
      uniform vec3 lightDirection;
      uniform sampler2D shadowMap;

      float random(vec3 seed, int i){
        vec4 seed4 = vec4(seed,i);
        float dot_product = dot(seed4, vec4(12.9898,78.233,45.164,94.673));
        return fract(sin(dot_product) * 43758.5453);
      }

      float sampleVisibility( vec3 coord, float bias ) {
        float depth = texture2D(shadowMap, coord.xy * 0.5 + vec2(0.5)).r;
        float visibility  = (coord.z - depth > bias) ? 0. : 1.;
        return visibility;
      }

      void main() { 
        const int NUM_TAPS = 12;
        vec2 poissonDisk[12];
        poissonDisk[0 ] = vec2( -0.94201624, -0.39906216 );
        poissonDisk[1 ] = vec2( 0.94558609, -0.76890725 );
        poissonDisk[2 ] = vec2( -0.094184101, -0.92938870 );
        poissonDisk[3 ] = vec2( 0.34495938, 0.29387760 );
        poissonDisk[4 ] = vec2( -0.91588581, 0.45771432 );
        poissonDisk[5 ] = vec2( -0.81544232, -0.87912464 );
        poissonDisk[6 ] = vec2( -0.38277543, 0.27676845 );
        poissonDisk[7 ] = vec2( 0.97484398, 0.75648379 );
        poissonDisk[8 ] = vec2( 0.44323325, -0.97511554 );
        poissonDisk[9 ] = vec2( 0.53742981, -0.47373420 );
        poissonDisk[10] = vec2( -0.26496911, -0.41893023 );
        poissonDisk[11] = vec2( 0.79197514, 0.19090188 );
        float occlusion = 0.;
        vec3 shadowCoord = vShadowCoord.xyz / vShadowCoord.w;
        for (int i=0; i < NUM_TAPS; i++) {
          vec2 r = .0005 * vec2(random(gl_FragCoord.xyz,1), random(gl_FragCoord.zxy,1));
          occlusion += sampleVisibility( shadowCoord + vec3(poissonDisk[i] / 700. + 0.*r, 0. ), vBias );
        }
        occlusion /= float( NUM_TAPS );
  
        vec3 normal = normalize(vNormal);
        vec3 direction = normalize(lightDirection * -1.0);
        float light = dot(normal, direction);
        gl_FragColor = color;
        gl_FragColor.rgb *= occlusion;
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
        10,
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
  lightCamera.position = [
    settings.lightPosX,
    settings.lightPosY,
    settings.lightPosZ
  ]

  // lightCamera.position = [
  //   Math.sin(time * 0.5 + 4) * 50 + 100,
  //   Math.cos(time * 1 + 9) * 50 + 100,
  //   Math.sin(time * 2 + 5) * 50 + 100
  // ]

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
