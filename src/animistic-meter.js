/* global requestAnimationFrame cancelAnimationFrame */

import Color from 'color'
import lerp from 'lerp'
import shuffle from 'shuffle-array'
import * as THREE from 'three'
import {GUI} from 'dat-gui'

const settings = {
  dotCount: 1200,
  cameraDistance: 600,
  radius: 80,
  speed: 4,
  distribPowerFunc: -10,
  edgeConnections: 10,
  edgeAlpha: 4,
  nodeAlpha: 50
}

const gui = new GUI()
gui.add(settings, 'dotCount', 1, 3500).step(1).onFinishChange(start)
gui.add(settings, 'cameraDistance', 50, 1000).step(1)
gui.add(settings, 'speed', 1, 15).step(1)
gui.add(settings, 'radius', 1, 500).step(1).onFinishChange(start)
gui.add(settings, 'edgeConnections', 2, 100).step(1).onFinishChange(start)
gui.add(settings, 'edgeAlpha', 0, 100).step(1).onFinishChange(start)
gui.add(settings, 'nodeAlpha', 0, 100).step(1).onFinishChange(start)
gui.add(settings, 'distribPowerFunc', -100, 200).step(1).onFinishChange(start)
gui.add({ startStop }, 'startStop')

const container = document.createElement('div')
document.body.appendChild(container)

let scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 1, 4000)
const nodeGeometry = new THREE.TetrahedronGeometry(1)

const materialCache = {}

let nodes = []
let edges = []
function start () {
  scene = new THREE.Scene()
  nodes = []
  let j = settings.dotCount
  while (j-- >= 0) {
    const h = lerp(0, Math.PI * 2, Math.random())
    const s = lerp(0, 100, Math.random())
    const l = lerp(70, 95, Math.random())
    const color = Color.hsl(h, s, l).hex().toString()
    const material = materialCache[color] || new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: settings.nodeAlpha / 100,
      blending: THREE.AdditiveBlending
    })
    materialCache[color] = material
    const mesh = new THREE.Mesh(nodeGeometry, material)

    const phi = Math.random() * Math.PI * 2
    const theta = Math.random() * Math.PI * 2
    const magnitude = Math.pow(Math.random(), settings.distribPowerFunc / 100) * settings.radius

    mesh.position.x = Math.cos(theta) * Math.sin(phi) * magnitude
    mesh.position.y = Math.sin(theta) * Math.sin(phi) * magnitude
    mesh.position.z = Math.cos(phi) * magnitude
    if (settings.nodeAlpha) scene.add(mesh)
    nodes.push({ mesh })
  }

  const lineMaterial = new THREE.LineBasicMaterial({
    color: 'rgb(240, 240, 240)',
    linewidth: 1,
    transparent: true,
    opacity: settings.edgeAlpha / 100,
    blending: THREE.AdditiveBlending
  })

  edges = []
  nodes = shuffle(nodes)
  for (let i = 0; i < nodes.length; i += settings.edgeConnections) {
    const edgeGeometry = new THREE.Geometry()
    const points = []
    for (let q = 0; q < settings.edgeConnections; q++) {
      const node = nodes[i + q]
      if (!node) continue
      const pos = node.mesh.position
      points.push(new THREE.Vector3(pos.x, pos.y, pos.z))
    }

    edgeGeometry.vertices.push(...points)
    const mesh = new THREE.Line(edgeGeometry, lineMaterial)
    if (settings.edgeAlpha) scene.add(mesh)
    edges.push({ mesh })
  }
}

start()

camera.position.z = settings.cameraDistance

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setClearColor(0x13233f, 1)
container.appendChild(renderer.domElement)

animate()

let rads = 0
let timeout = null
let t = 0

function startStop () {
  if (timeout) {
    cancelAnimationFrame(timeout)
    timeout = null
  } else {
    animate()
  }
}

function animate () {
  t += 1
  timeout = requestAnimationFrame(animate)
  // nodes.forEach((cube) => {
  //   cube.mesh.rotation.x += 0.02
  //   cube.mesh.rotation.y += 0.04
  // })
  rads += 0.002 * settings.speed

  camera.position.x = Math.cos(rads) * settings.cameraDistance
  camera.position.z = Math.sin(rads) * settings.cameraDistance
  camera.position.y = Math.sin(t / 200 * settings.speed) * settings.cameraDistance
  camera.lookAt(new THREE.Vector3(0, 0, 0))
  renderer.render(scene, camera)
}
