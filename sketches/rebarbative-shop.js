import Alea from 'alea'
import * as THREE from 'three'
import Sketch from 'sketch-js'
import tinycolor from 'tinycolor2'
import colorPalettes from './common/color-palettes'

// settingsConfig: {
//   seed: [0, 999],
//   trianglesCount: [0, 1000],
//   circleRadius: [0, 800],
//   colorAlpha: [0, 100],
//   circleMargin: [0, 500]
// },

const settings = {
  seed: Math.random() * 1000 | 0,
  trianglesCount: 200,
  circleRadius: 200,
  colorAlpha: 60,
  circleMargin: 0,
  startingRad: 1.5 * Math.PI,
  spinSpeed: 2,
  growthSpeed: 1,
  radPower: -0.8
}

window.THREE = THREE
window.ctx = Sketch.create({
  setup: setup,
  update: update,
  draw: draw,
  type: Sketch.WEB_GL
})

function setup () {
  const { height, width } = this.canvas
  this.center = [width / 2 | 0, height / 2 | 0]
  const { trianglesCount, circleRadius, circleMargin, seed, colorAlpha } = settings

  this.scene = new THREE.Scene()
  this.camera = new THREE.PerspectiveCamera(35, width / height, 1, 4000)
  this.renderer = new THREE.WebGLRenderer({
    antialias: true,
    canvas: this.canvas
  })

  this.renderer.setSize(width, height)
  this.renderer.setClearColor(0xfefefe, 1)

  const rand = new Alea(seed)
  const palette = colorPalettes[rand() * colorPalettes.length | 0]

  const boxSize = (circleMargin + circleRadius) * 2
  const canvasSquareSize = Math.min(height, width)
  const boxCount = canvasSquareSize / boxSize | 0
  const canvasMargin = [
    (width - (boxSize * boxCount)) / 2 | 0,
    (height - (boxSize * boxCount)) / 2 | 0
  ]

  this.triangles = []

  for (let j = 0; j < boxCount; j++) {
    for (let k = 0; k < boxCount; k++) {
      const boxCenter = [
        canvasMargin[0] + circleMargin + circleRadius + j * boxSize,
        canvasMargin[1] + circleMargin + circleRadius + k * boxSize
      ]
      this.triangles = this.triangles.concat(createShapes(boxCenter))
    }
  }

  this.triangles.forEach(({ mesh }) => { this.scene.add(mesh) })
  this.camera.position.x = this.center[0] // + Math.cos(this.rads) * cameraDistance
  this.camera.position.z = 2000
  this.camera.position.y = this.center[1] // + Math.sin(this.rads) * cameraDistance

  function createShapes (cent) {
    const tris = []
    for (let i = 0; i < trianglesCount; i++) {
      const vecs = generateTriangle(cent, circleRadius)
      const color = tinycolor(palette[rand() * palette.length | 0])
      const shape = new THREE.Shape(vecs)

      const geometry = new THREE.ShapeGeometry(shape)
      const material = new THREE.MeshBasicMaterial({
        color: color.toRgbString(), // .setAlpha(colorAlpha / 100).toRgbString()
        transparent: true,
        opacity: colorAlpha / 100
      })
      tris.push({
        mesh: new THREE.Mesh(geometry, material)
      })
    }
    return tris
  }

  function generateTriangle (cent, circleRadius) {
    const points = [randomPointOnCircle(cent, circleRadius)]
    while (points.length < 3) {
      let point = randomPointOnCircle(cent, circleRadius)
      for (let i = 0; i < points.length; i++) {
        if (points[i][0] === point[0] && points[i][1] === point[1]) {
          point = null
          break
        }
      }
      if (point) {
        points.push(point)
      }
    }
    return points.map(pt => new THREE.Vector2(...pt))
  }

  function randomPointOnCircle (center, radius) {
    const angle = rand() * Math.PI * 2
    radius *= Math.pow(rand(), settings.radPower)
    return [
      center[0] + Math.cos(angle) * radius | 0,
      center[1] + Math.sin(angle) * radius | 0
    ]
  }
}

function update () {
  this.rads = this.rads || settings.startingRad
  this.rads += 0.002 * settings.spinSpeed
  const cameraDistance = 1000 + (Math.sin(this.rads * 1.05) + 1) * 700
  this.camera.position.x = this.center[0] + Math.cos(this.rads) * cameraDistance
  this.camera.position.z = this.center[1] + Math.sin(this.rads) * cameraDistance
  this.camera.position.y = this.center[1] + Math.sin(this.rads * 3) * 250
  this.camera.lookAt(new THREE.Vector3(this.center[0], this.center[1], 0))

  this.triangles.forEach(({ mesh }) => {
    mesh.geometry.vertices[0].z += settings.growthSpeed
    mesh.geometry.vertices.forEach(vertex => {
      vertex.y -= 0.008
    })
    mesh.geometry.verticesNeedUpdate = true
  })
}

function draw () {
  this.renderer.render(this.scene, this.camera)
}

// [{"circleMargin":10,"circleRadius":20,"colorAlpha":50,"seed":757,"trianglesCount":10},{"circleMargin":10,"circleRadius":10,"colorAlpha":50,"seed":490,"trianglesCount":10},{"circleMargin":10,"circleRadius":5,"colorAlpha":50,"seed":817,"trianglesCount":1},{"circleMargin":25,"circleRadius":20,"colorAlpha":40,"seed":569,"trianglesCount":10},{"circleMargin":0,"circleRadius":25,"colorAlpha":50,"seed":990,"trianglesCount":3},{"circleMargin":0,"circleRadius":25,"colorAlpha":20,"seed":779,"trianglesCount":50},{"circleMargin":10,"circleRadius":180,"colorAlpha":20,"seed":523,"trianglesCount":40},{"circleMargin":0,"circleRadius":2,"colorAlpha":20,"seed":688,"trianglesCount":10},{"circleMargin":0,"circleRadius":5,"colorAlpha":70,"seed":24,"trianglesCount":2},{"circleMargin":25,"circleRadius":12,"colorAlpha":50,"seed":411,"trianglesCount":3}]
