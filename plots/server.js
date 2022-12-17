const http = require('http')
const fs = require('fs')
const path = require('path')

const HOSTNAME = '0.0.0.0'
const PORT = 8080

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.url !== '/save-plot') {
    res.statusCode = 400
    res.end()
    return
  }
  let data = ''
  req.on('data', d => { data += d })
  req.on('close', () => {
    let body
    try {
      body = JSON.parse(data)
    } catch (e) {
      res.statusCode = 400
      res.statusMessage = 'Failed to parse request body'
      res.end()
      return
    }
    const { filename, svg } = body
    if (!filename || !svg) {
      res.statusCode = 400
      res.statusMessage = 'Expected filename and svg properties in body'
      res.end()
      return
    }

    fs.writeFileSync(path.resolve(process.cwd(), filename), svg)
    console.log(`Saved to cwd: ${filename}`)
    res.statusCode = 200
    res.end()
  })
})

server.listen(PORT, HOSTNAME, () => {
  console.log(`Server running at http://${HOSTNAME}:${PORT}/`)
})
