/*
Expects trip CSV with headers:

"start station id", "start station name", "start station latitude", "start station longitude"
"end station id", "end station name", "end station latitude", "end station longitude"

CSV OUTPUT:

stationID, stationName, stationLongitude, stationLatitude

*/

const path = require('path')
const argv = require('minimist')(process.argv.slice(2))
const readline = require('readline')
const { csvParseRows } = require('d3-dsv')

if (argv.h || argv.help) {
  console.error(
    `Usage: cat FILENAME | ${process.argv0} ${path.basename(process.argv[1])}`
  )
  process.exit(0)
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
})

const uniqueStations = new Set()
const stations = []

let getVal
let isFirstLine = true

rl.on('line', input => {
  // prepare the columns map with the first line
  if (isFirstLine) {
    getVal = createValueGetter(csvParseRows(input)[0])
    isFirstLine = false
    return
  }
  const values = csvParseRows(input)[0]

  const startStationId = parseInt(getVal(values, 'start station id'), 10)
  const startStationLng = parseFloat(getVal(values, 'start station longitude'))
  const startStationLat = parseFloat(getVal(values, 'start station latitude'))
  const startStationName = getVal(values, 'start station name')
  const endStationId = parseInt(getVal(values, 'end station id'), 10)
  const endStationLng = parseFloat(getVal(values, 'end station longitude'))
  const endStationLat = parseFloat(getVal(values, 'end station latitude'))
  const endStationName = getVal(values, 'end station name')

  if (!uniqueStations.has(startStationId)) {
    uniqueStations.add(startStationId)
    stations.push({
      id: startStationId,
      name: startStationName,
      longitude: startStationLng,
      latitude: startStationLat
    })
  }

  if (!uniqueStations.has(endStationId)) {
    uniqueStations.add(endStationId)
    stations.push({
      id: endStationId,
      name: endStationName,
      longitude: endStationLng,
      latitude: endStationLat
    })
  }
})

rl.on('close', () => {
  stations.sort((a, b) => a.longitude - b.longitude)

  const lngExtent = [stations[0].longitude, stations[stations.length - 1].longitude]
  const latExtent = [Infinity, -Infinity]

  console.log('stationID,name,longitude,latitude')
  for (const station of stations) {
    if (station.latitude < latExtent[0]) latExtent[0] = station.latitude
    if (station.latitude > latExtent[1]) latExtent[1] = station.latitude
    console.log([
      station.id,
      `"${station.name}"`,
      station.longitude,
      station.latitude
    ].join(','))
  }

  console.error({
    stationsCount: uniqueStations.size,
    lngExtent: lngExtent,
    latExtent: latExtent
  })
})

function createValueGetter (columnNames) {
  const columns = {}
  columnNames.forEach((name, i) => {
    columns[name] = i
  })
  return (values, key) => values[columns[key]]
}
