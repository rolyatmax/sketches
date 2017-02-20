/* global requestAnimationFrame */

import Color from 'color'
import lerp from 'lerp'
import * as THREE from 'three'
import {GUI} from 'dat-gui'

const settings = {
  size: 8,
  cameraDistance: 400,
  separation: 10,
  speed: 4
}

const gui = new GUI()
gui.add(settings, 'cameraDistance', 50, 1000)
gui.add(settings, 'speed', 1, 15)

const container = document.createElement('div')
document.body.appendChild(container)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 1, 4000)
const geometry = new THREE.TetrahedronGeometry(1)

const cubes = []

let x = settings.size
while (x--) {
  let y = settings.size
  while (y--) {
    let z = settings.size
    while (z--) {
      const r = lerp(0, 255, x / settings.size)
      const g = lerp(0, 255, y / settings.size)
      const b = lerp(0, 255, z / settings.size)
      const color = Color.rgb(r, g, b).hex().toString()
      const material = new THREE.MeshBasicMaterial({ color: color })
      const mesh = new THREE.Mesh(geometry, material)
      const halfway = settings.size / 2
      const start = [
        (x - halfway) * settings.separation,
        (y - halfway) * settings.separation,
        (z - halfway) * settings.separation
      ]
      mesh.position.x = start[0]
      mesh.position.y = start[1]
      mesh.position.z = start[2]
      scene.add(mesh)
      cubes.push({
        mesh,
        start,
        wander: false
      })
    }
  }
}

camera.position.z = settings.cameraDistance

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setClearColor(0x13233f, 1)
container.appendChild(renderer.domElement)

animate()

let rads = 0

function animate (t) {
  requestAnimationFrame(animate)
  cubes.forEach((cube) => {
    cube.mesh.rotation.x += 0.02
    cube.mesh.rotation.y += 0.04
  })
  rads += 0.002 * settings.speed

  camera.position.x = Math.cos(rads) * settings.cameraDistance
  camera.position.z = Math.sin(rads) * settings.cameraDistance
  camera.position.y = Math.sin(t / 10000 * settings.speed) * settings.cameraDistance
  camera.lookAt(new THREE.Vector3(0, 0, 0))
  renderer.render(scene, camera)
}
