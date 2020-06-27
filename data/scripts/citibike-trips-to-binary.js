/*
Expects CSV with headers:

tripduration, starttime,
"start station id", "start station name", "start station latitude", "start station longitude"
"end station id", "end station name", "end station latitude", "end station longitude"
usertype

BINARY OUTPUT:

first output a "binary header"

    * tripsCount - Uint32
    * firstStartTime - Uint32 - epoch timestamp in seconds

then output each row as follows:
7 bytes * 1483680 trips = 10.385 MB (much less after gzip?)
(1487890 - 4209 (0.28%) trips over 256*60 seconds of duration = 1483680 trips)

    * startTime (minute granularity - delta from previous trip's startTime) - 1 byte
    * duration - 1 byte
    * isSubscriber - 1 byte
    * startStationID - 2 bytes
    * endStationID - 2 bytes

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

let totalTrips = 0
let filteredOutTrips = 0
const usertypes = new Set()
const maxDurations = []
const stations = new Set()
const bikeids = new Set()
const startDiffExtent = [Infinity, -Infinity]

const trips = []

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
  const tripduration = parseInt(getVal(values, 'tripduration'), 10)
  const starttime = getVal(values, 'starttime')
  const startStationId = parseInt(getVal(values, 'start station id'), 10)
  // const startStationLng = parseFloat(getVal(values, 'start station longitude'))
  // const startStationLat = parseFloat(getVal(values, 'start station latitude'))
  // const startStationName = getVal(values, 'start station name')
  const endStationId = parseInt(getVal(values, 'end station id'), 10)
  // const endStationLng = parseFloat(getVal(values, 'end station longitude'))
  // const endStationLat = parseFloat(getVal(values, 'end station latitude'))
  // const endStationName = getVal(values, 'end station name')
  const bikeid = parseInt(getVal(values, 'bikeid'), 10)
  const usertype = getVal(values, 'usertype')

  usertypes.add(usertype)
  maxDurations.push(tripduration)
  stations.add(startStationId)
  stations.add(endStationId)
  bikeids.add(bikeid)
  totalTrips += 1

  const tripDurationMins = tripduration / 60 | 0
  if (tripDurationMins >= 256) {
    filteredOutTrips += 1
    return
  }

  const startTime = Number(new Date(starttime)) / 60000 | 0
  const isSubscriber = usertype === 'Subscriber'
  trips.push([startTime, tripDurationMins, isSubscriber, startStationId, endStationId])
})

rl.on('close', () => {
  // first output a "binary header"
  // tripsCount - Uint32
  // firstStartTime - Uint32 - epoch timestamp in seconds
  const tripsCount = totalTrips - filteredOutTrips
  const firstStartTime = trips[0][0] * 60 // epoch timestamp (seconds)
  const uint32s = new Uint32Array([tripsCount, firstStartTime])
  if (uint32s[0] !== tripsCount || uint32s[1] !== firstStartTime) {
    console.error(`WARNING: tripsCount ${tripsCount} or firstStartTime ${firstStartTime} too large for Uint32`)
  }
  process.stdout.write(Buffer.from(uint32s.buffer))

  // then output each row as follows:
  // 7 bytes * 1483680 trips = 10.385 MB (much less after gzip?)
  // (1487890 - 4209 (0.28%) trips over 256*60 seconds of duration = 1483680 trips)
  // startTime (minute granularity - delta from previous trip's startTime) - 1 byte
  // duration - 1 byte
  // isSubscriber - 1 byte
  // startStationID - 2 bytes
  // endStationID - 2 bytes
  let prevStartTime = trips[0][0]
  for (const [startTime, tripDurationMins, isSubscriber, startStationId, endStationId] of trips) {
    const startTimeDiff = startTime - prevStartTime
    prevStartTime = startTime
    if (startTimeDiff < startDiffExtent[0]) startDiffExtent[0] = startTimeDiff
    if (startTimeDiff > startDiffExtent[1]) startDiffExtent[1] = startTimeDiff

    const uint8s = new Uint8Array([startTimeDiff, tripDurationMins, isSubscriber])
    if (uint8s[0] !== startTimeDiff || uint8s[1] !== tripDurationMins) {
      console.error(`WARNING: startTimeDiff ${startTimeDiff} or tripDurationMins ${tripDurationMins} too large for Uint8`)
    }
    process.stdout.write(Buffer.from(uint8s))

    const uint16s = new Uint16Array([startStationId, endStationId])
    if (uint16s[0] !== startStationId || uint16s[1] !== endStationId) {
      console.error(`WARNING: startStationId ${startStationId} or endStationId ${endStationId} too large for Uint16`)
    }
    process.stdout.write(Buffer.from(uint16s.buffer))
  }

  const bikeIds = Array.from(bikeids)
  bikeIds.sort((a, b) => a - b)
  const stationIds = Array.from(stations)
  stationIds.sort((a, b) => a - b)
  maxDurations.sort((a, b) => a - b)
  const getPercentile = (arry, perc) => arry[arry.length * perc | 0]
  console.error({
    totalTrips: totalTrips,
    userTypes: Array.from(usertypes),
    maxDurationsExtent: [maxDurations[0], maxDurations[maxDurations.length - 1]],
    startDiffExtent: startDiffExtent,
    filteredOutTrips: filteredOutTrips,
    filteredOutTripsPerc: filteredOutTrips / totalTrips * 100,
    maxDurationPercentiles: {
      p50: getPercentile(maxDurations, 0.5) / 60,
      p90: getPercentile(maxDurations, 0.90) / 60,
      p95: getPercentile(maxDurations, 0.95) / 60,
      p99: getPercentile(maxDurations, 0.99) / 60,
      p995: getPercentile(maxDurations, 0.995) / 60,
      p999: getPercentile(maxDurations, 0.999) / 60
    },
    bikeIdExtent: [bikeIds[0], bikeIds[bikeIds.length - 1]],
    bikeCount: bikeIds.length,
    stationIdExtent: [stationIds[0], stationIds[stationIds.length - 1]],
    stationCount: stationIds.length
  })
})

function createValueGetter (columnNames) {
  const columns = {}
  columnNames.forEach((name, i) => {
    columns[name] = i
  })
  return (values, key) => values[columns[key]]
}
