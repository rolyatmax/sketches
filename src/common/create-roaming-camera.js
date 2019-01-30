const { createSpring } = require('spring-animator')
const createCamera = require('3d-view-controls')

module.exports = function createRoamingCamera (opts) {
  const {canvas, zoomSpeed, center, eye, getCameraPosition, dampening, stiffness} = opts
  let isRoaming = true
  let timeout

  canvas.addEventListener('mousedown', stopRoaming)

  const camera = createCamera(canvas, {
    zoomSpeed: zoomSpeed
  })

  const cameraX = createSpring(dampening, stiffness, center[0])
  const cameraY = createSpring(dampening, stiffness, center[1])
  const cameraZ = createSpring(dampening, stiffness, center[2])

  camera.lookAt(
    center,
    eye,
    [0.52, -0.11, -99]
  )

  function setRandomCameraPosition () {
    const [x, y, z] = getCameraPosition()
    cameraX.updateValue(x)
    cameraY.updateValue(y)
    cameraZ.updateValue(z)
  }

  cameraRoamLoop()
  function cameraRoamLoop () {
    clearTimeout(timeout)
    timeout = setTimeout(cameraRoamLoop, 10000)
    setRandomCameraPosition()
  }

  function tick () {
    camera.tick()
    if (isRoaming) {
      camera.center = [cameraX.tick(), cameraY.tick(), cameraZ.tick()]
    }
  }
  function getMatrix () {
    return camera.matrix
  }
  function getCenter () {
    return camera.center
  }
  function stopRoaming () {
    clearTimeout(timeout)
    timeout = null
    isRoaming = false
  }
  function startRoaming () {
    setSpringsToCurrentCameraValues()
    cameraRoamLoop()
    isRoaming = true
  }

  function setSpringsToCurrentCameraValues () {
    cameraX.updateValue(camera.eye[0], false)
    cameraY.updateValue(camera.eye[1], false)
    cameraZ.updateValue(camera.eye[2], false)
  }

  window.camera = camera
  return {
    tick,
    getMatrix,
    getCenter,
    startRoaming,
    stopRoaming,
    moveToNextPosition: () => {
      if (!isRoaming) {
        startRoaming()
      } else {
        cameraRoamLoop()
      }
    }
  }
}
