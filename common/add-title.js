export default function addTitle (titleText, style = {}) {
  const title = document.createElement('div')
  title.innerHTML = titleText

  style = {
    position: 'absolute',
    bottom: '-40px',
    right: 0,
    color: 'rgba(190, 190, 190, 0.5)',
    fontSize: '20px',
    WebkitFontSmoothing: 'antialiased',
    ...style
  }

  for (let s in style) {
    title.style[s] = style[s]
  }

  return title
}
