const { createSpring } = require('spring-animator')
const createCamera = require('3d-view-controls')

module.exports = function createRoamingCamera (opts) {
  const { canvas, zoomSpeed, center, eye, getCameraPosition, damping, stiffness, moveEveryNFrames } = opts
  const roamOnEveryNFrames = moveEveryNFrames || 600
  let isRoaming = true
  let frameCount = 0

  canvas.addEventListener('mousedown', stopRoaming)

  const camera = createCamera(canvas, {
    zoomSpeed: zoomSpeed
  })

  const cameraX = createSpring(stiffness, damping, center[0])
  const cameraY = createSpring(stiffness, damping, center[1])
  const cameraZ = createSpring(stiffness, damping, center[2])

  camera.lookAt(
    center,
    eye,
    [1, 1, 1]
  )

  setRandomCameraPosition()

  function setRandomCameraPosition () {
    const [x, y, z] = getCameraPosition()
    cameraX.updateValue(x)
    cameraY.updateValue(y)
    cameraZ.updateValue(z)
    frameCount = 0
  }

  function tick () {
    frameCount += 1
    camera.tick()
    if (isRoaming) {
      camera.center = [cameraX.tick(), cameraY.tick(), cameraZ.tick()]
    }
    if (frameCount >= roamOnEveryNFrames) {
      setRandomCameraPosition()
    }
  }
  function getMatrix () {
    return camera.matrix
  }
  function getCenter () {
    return camera.center
  }
  function stopRoaming () {
    isRoaming = false
    frameCount = 0
  }
  function startRoaming () {
    setSpringsToCurrentCameraValues()
    setRandomCameraPosition()
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
    _camera: camera,
    moveToNextPosition: () => {
      if (isRoaming) setRandomCameraPosition()
      else startRoaming()
    }
  }
}
