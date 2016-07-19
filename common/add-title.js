export default function addTitle (titleText, container, style = {}) {
  const title = document.createElement('div')
  container.appendChild(title)
  title.innerHTML = titleText

  style = {
    position: 'absolute',
    bottom: '-40px',
    right: 0,
    color: 'rgba(0, 0, 0, 0.08)',
    fontSize: '20px',
    WebkitFontSmoothing: 'antialiased',
    ...style
  }

  for (let s in style) {
    title.style[s] = style[s]
  }

  return title
}
