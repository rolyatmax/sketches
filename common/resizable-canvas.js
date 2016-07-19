import { debounce } from 'underscore'

export default function createResizableCanvas (container, onResize, { margin = 0 }) {
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

    const { height, width } = container.getBoundingClientRect()
    canvas.width = width
    canvas.height = height
    canvas.style.position = 'absolute'
  }

  size()

  return canvas
}
