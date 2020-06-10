/* global requestAnimationFrame */

import createEncoder from 'encode-object'
import createResizableCanvas from './resizable-canvas'
import includeFont from './include-font'
import addTitle from './add-title'
import addTray from './add-tray'

export default function createProject (opts) {
  const { aspectRatio, settingsConfig, defaultSettings, tiles, main, animate } = opts
  const { encodeObject, decodeObject } = createEncoder(settingsConfig)

  let settings = { ...defaultSettings }

  const curHash = window.location.hash.slice(1)
  if (curHash) {
    try {
      settings = decodeObject(curHash)
    } catch (e) {
      console.error(e)
      window.location.hash = ''
    }
  }

  let hash = encodeObject(settings)
  let title

  const container = document.createElement('div')
  document.body.appendChild(container)

  includeFont({
    fontFamily: '"Space Mono", sans-serif',
    url: 'https://fonts.googleapis.com/css?family=Space+Mono:700'
  })

  if (tiles) {
    const tileConfigs = tiles.map((tileHash) => {
      const tileSettings = decodeObject(tileHash)
      return {
        settings: tileSettings,
        hash: tileHash,
        main: main,
        aspectRatio: aspectRatio || 1,
        onClick: () => {
          hash = tileHash
          settings = tileSettings
          mainWrapper(canvas, settings)
        }
      }
    })
    addTray(tileConfigs, container)
  }

  const canvas = createResizableCanvas(container, () => mainWrapper(canvas, settings), {
    margin: 90,
    aspectRatio: aspectRatio
  })
  canvas.style.opacity = 0
  setTimeout(() => {
    canvas.style.opacity = 1
    canvas.style.transition = 'opacity 400ms ease'
  }, 200)

  mainWrapper(canvas, settings)

  function mainWrapper (cvs, settings) {
    if (title) title.remove()
    title = addTitle(hash)
    title.style.opacity = 0
    container.appendChild(title)
    setTimeout(() => {
      title.style.opacity = 1
      title.style.transition = 'opacity 400ms ease'
    }, 400)

    const ctx = window.ctx = cvs.getContext('2d')
    ctx.clearRect(0, 0, cvs.width, cvs.height)

    if (!animate) {
      main(cvs, settings, 1)
      return
    }

    function frame (t) {
      requestAnimationFrame(frame)
      main(cvs, settings, 1, t)
    }
    requestAnimationFrame(frame)
  }
}
