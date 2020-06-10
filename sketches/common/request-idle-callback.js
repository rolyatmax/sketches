const w = window

function requestShim (cb) {
  return setTimeout(cb, 0)
}

function cancelShim (token) {
  return clearTimeout(token)
}

export function rIC (cb) {
  return w.requestIdleCallback ? w.requestIdleCallback(cb) : requestShim(cb)
}

export function cIC (token) {
  return w.cancelIdleCallback ? w.cancelIdleCallback(token) : cancelShim(token)
}
