const browserify = require('browserify')
const fs = require('fs')
const html = require('simple-html-index')
const mkdirpSync = require('mkdirp').sync
const rimrafSync = require('rimraf').sync
const UglifyJS = require('uglify-js')

const config = require('../config')
const files = ['index'].concat(config.include)

var err

err = rimrafSync('docs/js')
if (err) throw new Error(err)

err = rimrafSync('docs/*.html')
if (err) throw new Error(err)

mkdirpSync('docs/js')

Promise.all(files.map(buildJs).concat(files.map(buildHtml)))
  .catch((e) => console.error(e))
  .then(() => console.log('Finished'))

function buildJs (filename) {
  return new Promise((resolve, reject) => {
    console.log('Bundling', filename)
    var b = browserify(`src/${filename}.js`, { debug: false })
    b.transform(require('glslify'))
    b.transform(require('babelify').configure({
      presets: ['es2015'],
      plugins: ['transform-object-rest-spread']
    }))
    b.plugin(require('bundle-collapser/plugin'))
    b.bundle((err, src) => {
      if (err) return reject(err)
      console.log('Compressing', filename)
      var result = UglifyJS.minify(src.toString(), { fromString: true })
      console.log('Writing', filename)
      fs.writeFile(`docs/${getJsFilename(filename)}`, result.code, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })
  })
}

function buildHtml (filename) {
  return new Promise((resolve, reject) => {
    var markup = html({
      title: filename,
      entry: getJsFilename(filename),
      css: 'css/main.css'
    }).read()
    fs.writeFile(`docs/${filename}.html`, markup, (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

function getJsFilename (filename) {
  return `js/${filename}.js`
}
