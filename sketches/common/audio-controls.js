const css = require('dom-css')

module.exports = function createAudioControls (audio) {
  // add pause/play controls

  const controlsContainer = document.createElement('div')
  const seekerEl = controlsContainer.appendChild(document.createElement('div'))
  const progressEl = seekerEl.appendChild(document.createElement('div'))
  const timeEl = seekerEl.appendChild(document.createElement('div'))
  const height = 15
  const width = 200
  css(controlsContainer, { height, width, position: 'relative' })
  css(seekerEl, { height, width, backgroundColor: 'rgba(30, 30, 30, 0.3)', cursor: 'pointer', position: 'absolute' })
  css(progressEl, { height: '100%', position: 'absolute', top: 0, left: 0, backgroundColor: 'rgba(30, 30, 30, 0.6)' })
  css(timeEl, { position: 'absolute', right: -50, fontWeight: 800, fontFamily: 'monospace', fontSize: 16, color: '#777' })

  function tick () {
    const t = audio.currentTime / audio.duration
    css(progressEl, 'width', `${t * 100}%`)
    timeEl.innerText = formatSeconds(audio.currentTime)
  }

  seekerEl.addEventListener('click', e => {
    const { left } = seekerEl.getBoundingClientRect()
    const t = (e.clientX - left) / width
    audio.currentTime = t * audio.duration
  })

  window.addEventListener('keypress', (e) => {
    if (e.key === ' ') {
      togglePlay()
    }
  })

  return {
    el: controlsContainer,
    tick: tick
  }

  function togglePlay () {
    if (audio.paused) {
      audio.play()
    } else {
      audio.pause()
    }
  }
}

function formatSeconds (seconds) {
  const minutes = seconds / 60 | 0
  seconds = '' + (seconds % 60 | 0)
  if (seconds.length === 1) {
    seconds = `0${seconds}`
  }
  return `${minutes}:${seconds}`
}
