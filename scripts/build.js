const childProcess = require('child_process')
const mkdirpSync = require('mkdirp').sync
const rimrafSync = require('rimraf').sync

const config = require('../config')
const files = ['index'].concat(config.include)

mkdirpSync('docs')

const err = rimrafSync('docs/*.html')
if (err) throw new Error(err)

// - follow-up: support --force flag to skip the hash checks
// - follow-up: support --sketch flag to run the update only for a specific sketch (+ index.html)

const copyResourcesPromise = new Promise((resolve, reject) => {
  childProcess.exec('cp -r resources docs/', (err) => {
    if (err) return reject(err)
    resolve()
  })
})

Promise.all([copyResourcesPromise].concat(files.map(buildSketches)))
  .catch((e) => console.error(e))
  .then(() => console.log('Finished'))

function buildSketches (filename) {
  return new Promise((resolve, reject) => {
    console.log('Building', filename)
    childProcess.exec(`canvas-sketch sketches/${filename}.js --dir docs --build --inline`, (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}
