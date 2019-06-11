const readline = require('readline')
const { csvParseRows } = require('d3-dsv')

const rl = readline.createInterface({ input: process.stdin })

let isFirstLine = true
rl.on('line', (input) => {
  // prepare the columns map with the first line
  if (isFirstLine) {
    process.stdout.write(input)
    process.stdout.write('\n')
    isFirstLine = false
    return
  }

  const [lon, lat, elevation, intensity] = csvParseRows(input)[0]

  if (Number(elevation) > 0) {
    process.stdout.write(input)
    process.stdout.write('\n')
  }
})
