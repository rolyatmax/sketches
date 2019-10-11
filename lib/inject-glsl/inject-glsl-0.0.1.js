module.exports = function injectGLSL (...args) {
  const RETURN = `
`
  const glsl = args.pop()
  const codeChunks = args
  const splitAt = glsl.startsWith('#version 300 es') ? glsl.indexOf(RETURN) + 1 : 0
  const head = glsl.slice(0, splitAt)
  const body = glsl.slice(splitAt)
  codeChunks.unshift(head)
  codeChunks.push(body)
  return codeChunks.join(RETURN)
}
