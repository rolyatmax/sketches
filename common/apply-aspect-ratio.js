export default function applyAspectRatio (containerDimensions, aspectRatio) {
  let { width, height } = containerDimensions
  const containerAspectRatio = width / height
  if (containerAspectRatio < aspectRatio) height = width / aspectRatio
  if (containerAspectRatio > aspectRatio) width = height * aspectRatio
  return { width, height }
}
