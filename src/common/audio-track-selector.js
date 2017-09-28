const css = require('dom-css')

module.exports = function createAudioTrackSelector (audio, tracks) {
  const trackSelectorContainer = document.createElement('div')
  css(trackSelectorContainer, { fontFamily: 'monospace', cursor: 'pointer', fontSize: 16, color: '#555', margin: '10px 0' })

  let currentTrack = 0
  setTrack(tracks[currentTrack])

  trackSelectorContainer.addEventListener('click', () => {
    currentTrack = (currentTrack + 1) % tracks.length
    setTrack(tracks[currentTrack])
  })

  function setTrack (trackPath) {
    audio.src = trackPath
    const trackPathParts = trackPath.split('/')
    trackSelectorContainer.innerText = trackPathParts[trackPathParts.length - 1]
  }

  return {
    el: trackSelectorContainer
  }
}
