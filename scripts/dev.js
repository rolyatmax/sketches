const budo = require('budo')
const argv = require('minimist')(process.argv.slice(2))
const path = require('path')
const babelify = require('babelify')

var entryFilename = argv._[0]

if (!entryFilename) {
  process.stdout.write('\nYou must pass in a filename.\nPerhaps like this?: npm run start FILENAME\n')
  process.exit(1)
}

const entryFile = path.resolve(process.cwd(), entryFilename)
budo(entryFile, {
  live: true,
  verbose: true,
  dir: process.cwd(),
  stream: process.stdout,
  open: true,
  css: path.join('static', 'css', 'reset.css'),
  browserify: {
    debug: false,
    transform: [
      babelify.configure({
        presets: ['es2015'],
        plugins: ['transform-object-rest-spread']
      })
    ]
  }
})
