import { debounce } from 'underscore'
import applyAspectRatio from './apply-aspect-ratio'

export default function createResizableCanvas (container, onResize, opts) {
  const { margin = 0, aspectRatio } = opts
  const canvas = document.createElement('canvas')
  container.appendChild(canvas)
  const getMargin = (typeof margin === 'function') ? margin : () => margin

  window.addEventListener('resize', debounce(() => {
    size()
    onResize()
  }, 50))

  function size () {
    container.style.position = 'relative'
    container.style.height = `calc(100vh - ${getMargin() * 2}px)`
    container.style.width = `calc(100vw - ${getMargin() * 2}px)`
    container.style.margin = `${getMargin()}px auto`
    container.style.display = 'flex'
    container.style.justifyContent = 'center'
    container.style.alignItems = 'center'

    const parent = container.getBoundingClientRect()
    const canvasAspectRatio = aspectRatio || parent.width / parent.height
    const { height, width } = applyAspectRatio(parent, canvasAspectRatio)
    canvas.width = width
    canvas.height = height
  }

  size()

  return canvas
}
