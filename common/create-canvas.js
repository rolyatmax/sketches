export default function createCanvas (dimensions, border = 0) {
  const { height, width } = dimensions
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.style.position = 'absolute'
  return canvas
}
