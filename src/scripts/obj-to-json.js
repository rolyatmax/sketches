const fs = require('fs')
const path = require('path')
const parseObj = require('parse-obj')
const argv = require('minimist')(process.argv.slice(2))

if (argv.h || argv.help || !argv._.length) {
  console.log(`Usage: ${process.argv0} ${path.basename(process.argv[1])} FILENAME`)
  process.exit(0)
}

const filepath = path.join(__dirname, argv._[0])
parseObj(fs.createReadStream(filepath), (err, result) => {
  if (err) {
    throw new Error('Error parsing OBJ file:', err)
  }
  process.stdout.write(JSON.stringify(result))
})
