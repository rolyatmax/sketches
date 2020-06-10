import applyAspectRatio from './apply-aspect-ratio'
import { rIC } from './request-idle-callback'

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
  const tiles = list.map((config) => {
    return renderTile(config, tray, {
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
          transition: `opacity 300ms linear ${i * 30 + 200}ms`,
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

  return tray
}

function renderTile ({ onClick, settings, main, aspectRatio }, tray, styles) {
  const tile = document.createElement('div')
  applyStylesToElement(tile, {
    ...styles,
    display: 'inline-flex',
    background: 'rgba(255, 255, 255, 1)',
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    alignContent: 'center'
  })
  tray.appendChild(tile)
  rIC(() => {
    const parent = tile.getBoundingClientRect()
    const canvasAspectRatio = aspectRatio || parent.width / parent.height
    const { height, width } = applyAspectRatio(parent, canvasAspectRatio)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    applyStylesToElement(canvas, {
      height: `${height}px`,
      width: `${width}px`,
      opacity: 0
    })
    tile.addEventListener('click', onClick)
    tile.appendChild(canvas)
    main(canvas, settings, 1 / 6)
  })
  return tile
}

function applyStylesToElement (element, styles = {}) {
  for (const s in styles) {
    element.style[s] = styles[s]
  }
}

function buildButton () {
  const color = 'rgb(190, 190, 190)'
  const buttonWidth = 40
  const button = document.createElement('div')
  applyStylesToElement(button, {
    position: 'absolute',
    top: '-65px',
    height: `${buttonWidth}px`,
    width: `${buttonWidth}px`,
    left: '50%',
    marginLeft: `-${buttonWidth / 2}px`,
    border: `1px solid ${color}`,
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
    borderLeft: `1px solid ${color}`,
    borderBottom: `1px solid ${color}`,
    transform: 'rotate(-45deg)',
    margin: '13px 14px'
  })

  button.appendChild(arrow)
  return button
}
