export default function addTray (list, container) {
  const tray = document.createElement('div')
  container.appendChild(tray)
  container.style.top = 0 // this is dumb

  container.addEventListener('click', closeTray)

  const height = 150
  applyStylesToElement(tray, {
    position: 'fixed',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    alignContent: 'center',
    bottom: `-${height}px`,
    right: 0,
    left: 0,
    width: '100vw',
    height: `${height}px`,
    background: 'rgba(245, 246, 248, 1.0)',
    zIndex: 2
  })

  const tileCount = Math.min(8, list.length)
  const tiles = list.map(({ onClick, config, main }) => {
    return renderTile({ onClick, config, main }, tray, {
      height: `${height - 15}px`,
      width: `${100 / tileCount - 1}vw`,
      maxWidth: `${height * 2}px`
    })
  })

  const button = buildButton()
  button.addEventListener('click', openTray)
  tray.appendChild(button)
  tiles.forEach((tile) => tray.appendChild(tile))

  function openTray (e) {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }

    const transition = '200ms cubic-bezier(0.25, 0.69, 0.37, 0.91)'
    applyStylesToElement(tray, {
      transition: `bottom ${transition}`,
      bottom: 0
    })

    tiles.forEach((tile, i) => {
      const canvas = tile.querySelector('canvas')
      setTimeout(() => {
        applyStylesToElement(canvas, {
          transition: `opacity 300ms linear ${i * 100 + 100}ms`,
          opacity: 1
        })
      }, 100)
    })

    applyStylesToElement(container, {
      transition: `top ${transition}`,
      top: `-${height}px`
    })

    applyStylesToElement(button, {
      transition: `opacity ${transition}, visibility ${transition}`,
      opacity: 0,
      visibility: 'hidden'
    })
  }

  function closeTray () {
    const transition = '200ms cubic-bezier(0.25, 0.69, 0.37, 0.91)'
    applyStylesToElement(tray, {
      transition: `bottom ${transition}`,
      bottom: `-${height}px`
    })

    tiles.forEach((tile, i) => {
      tray.appendChild(tile)
      const canvas = tile.querySelector('canvas')
      setTimeout(() => {
        applyStylesToElement(canvas, {
          transition: '',
          opacity: 0
        })
      }, 100)
    })

    applyStylesToElement(container, {
      transition: `top ${transition}`,
      top: 0
    })

    applyStylesToElement(button, {
      transition: `opacity ${transition}, visibility ${transition}`,
      opacity: 1,
      visibility: 'visible'
    })
  }

  setTimeout(openTray, 1000)

  return tray
}

function renderTile ({ onClick, config, main }, tray, styles) {
  const tile = document.createElement('div')
  applyStylesToElement(tile, {
    ...styles,
    display: 'inline-block',
    background: 'rgba(255, 255, 255, 1)',
    position: 'relative'
  })
  tray.appendChild(tile)
  const { height, width } = tile.getBoundingClientRect()
  const canvas = document.createElement('canvas')
  canvas.width = width * 2
  canvas.height = height * 2
  applyStylesToElement(canvas, {
    width: '100%',
    height: '100%',
    opacity: 0,
    position: 'absolute'
  })
  tile.addEventListener('click', onClick)
  tile.appendChild(canvas)
  main(canvas, config)
  return tile
}

function applyStylesToElement (element, styles = {}) {
  for (let s in styles) {
    element.style[s] = styles[s]
  }
}

function buildButton () {
  const buttonWidth = 40
  const button = document.createElement('div')
  applyStylesToElement(button, {
    position: 'absolute',
    top: '-70px',
    height: `${buttonWidth}px`,
    width: `${buttonWidth}px`,
    left: '50%',
    marginLeft: `-${buttonWidth / 2}px`,
    border: '1px solid rgb(221, 221, 221)',
    borderRadius: '50%',
    cursor: 'pointer',
    opacity: 1,
    transition: 'opacity 200ms linear'
  })

  const arrowSize = 10
  const arrow = document.createElement('div')
  applyStylesToElement(arrow, {
    height: `${arrowSize}px`,
    width: `${arrowSize}px`,
    borderLeft: '1px solid rgb(221, 221, 221)',
    borderBottom: '1px solid rgb(221, 221, 221)',
    transform: 'rotate(-45deg)',
    margin: '13px 14px'
  })

  button.appendChild(arrow)
  return button
}
