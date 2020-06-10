const childProcess = require('child_process')
const mkdirpSync = require('mkdirp').sync
const rimrafSync = require('rimraf').sync

const config = require('../config')
const files = ['index'].concat(config.include)

const err = rimrafSync('docs')
if (err) throw new Error(err)

mkdirpSync('docs')

// - follow-up: support --force flag to skip the hash checks
// - follow-up: support --sketch flag to run the update only for a specific sketch (+ index.html)

console.log('Copying resources dir')
exec('cp -r resources docs/')
  .then(() => {
    console.log('Building sketches & resizing images')
    return Promise.all([
      // loop through with imagemagick and resize all the screenshots
      ...config.include.map(name => exec(`convert docs/resources/screenshots/${name}.png -resize 800 docs/resources/screenshots/${name}.png`)),
      // build all the sketches
      ...files.map(name => exec(`canvas-sketch sketches/${name}.js --dir docs --build --inline`))
    ])
  })
  .catch((e) => console.error(e))
  .then(() => console.log('Finished!'))

function exec (cmd) {
  return new Promise((resolve, reject) => {
    childProcess.exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error('exec error:', err)
        reject(err)
        return
      }
      if (stdout) {
        console.error('stdout:', stdout)
      }
      if (stderr) {
        console.error('stderr:', stderr)
      }
      resolve()
    })
  })
}
