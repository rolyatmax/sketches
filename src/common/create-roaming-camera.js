const { createSpring } = require('spring-animator')
const createCamera = require('3d-view-controls')

module.exports = function createRoamingCamera (opts) {
  const { canvas, zoomSpeed, center, eye, getCameraPosition, dampening, stiffness, moveEveryNFrames } = opts
  const roamOnEveryNFrames = moveEveryNFrames || 600
  let isRoaming = true
  let frameCount = 0

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
    [1, 1, 1]
  )

  setRandomCameraPosition()

  function setRandomCameraPosition () {
    const [x, y, z] = getCameraPosition()
    cameraX.updateValue(x)
    cameraY.updateValue(y)
    cameraZ.updateValue(z)
  }

  function tick () {
    frameCount += 1
    camera.tick()
    if (isRoaming) {
      camera.center = [cameraX.tick(), cameraY.tick(), cameraZ.tick()]
    }
    if (frameCount >= roamOnEveryNFrames) {
      setRandomCameraPosition()
      frameCount = 0
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
    frameCount = 0
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
    moveToNextPosition: startRoaming
  }
}
