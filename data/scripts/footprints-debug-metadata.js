// expects CSV with headers: BIN,the_geom, BASE_BBL

// outputs binary float32s:
/*
  bin, // the building's BIN number
  centroid[0], // the footprint's centroid longitude
  centroid[1], // the footprint's centroid latitude
  vertices.length / 2, // the number of vertices (vec2s) to follow
  ...vertices, // the vertices: lng1, lat1, lng2, lat2, ...
  triIdxs.length / 3, // the number of triangles in the footprint
  ...triIdxs // the triangle indices into the vertex list: tri1A, tri1B, tri1C, tri2A, tri2B, tri2C, etc
*/

// BIN first digit corresponds with the borough:
// 1 - Manhattan, 2 - Bronx, 3 - Brooklyn, 4 - Queens, 5 - Staten Island

// let's skip everything outside of this bbox:
const NORTH = 40.879548
const EAST = -73.866673
const SOUTH = 40.643768

const path = require('path')
const argv = require('minimist')(process.argv.slice(2))
const readline = require('readline')
const { csvParseRows } = require('d3-dsv')
const { polygonHull, polygonCentroid } = require('d3-polygon')
const earcut = require('earcut')

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

const maxExtentRange = [-Infinity, -Infinity]
const maxVertexCounts = []
const maxTriangleCounts = []
const maxHoleCount = []
let totalTriangleCount = 0
let buildingsWithHoles = 0
let buildingCount = 0

let getVal
let isFirstLine = true
rl.on('line', input => {
  // prepare the columns map with the first line
  if (isFirstLine) {
    getVal = createValueGetter(input.split(','))
    isFirstLine = false
    return
  }
  const values = csvParseRows(input)[0]
  const binStr = getVal(values, 'BIN')
  // skip Staten Island footprints
  if (binStr[0] === '5') return
  const bin = parseInt(binStr, 10)
  const bbl = getVal(values, 'BASE_BBL')
  const geoString = getVal(values, 'the_geom')
  const polygons = parseMultiPolygonGeo(geoString)
  for (const p of polygons) {
    const vertices = p[0].slice()
    const holes = []
    for (const hole of p.slice(1)) {
      const idx = vertices.length / 2
      holes.push(idx)
      vertices.push(...hole)
    }

    const hullPoints = polygonHull(flatToTuples(vertices))
    // lets just average out the hull points to get the centroid?
    // using d3-polygon's centroid gives some weird centroids that are not contained in the polygon
    const centroid = hullPoints.reduce((avg, pt) => [avg[0] + pt[0] / hullPoints.length, avg[1] + pt[1] / hullPoints.length], [0, 0])

    // let's skip everything outside of this bbox:
    if (centroid[0] > EAST || centroid[1] > NORTH || centroid[1] < SOUTH) {
      continue
    }

    // FOR TESTING: what is the min and max of the vertex->centroid deltas
    // Maybe we could use delta encoding?
    const lngExtent = [Infinity, -Infinity]
    const latExtent = [Infinity, -Infinity]
    for (let i = 0; i < vertices.length; i += 2) {
      const dLng = (vertices[i] - centroid[0]) * 1000000 | 0
      const dLat = (vertices[i + 1] - centroid[1]) * 1000000 | 0
      if (dLng < lngExtent[0]) lngExtent[0] = dLng
      if (dLng > lngExtent[1]) lngExtent[1] = dLng
      if (dLat < latExtent[0]) latExtent[0] = dLat
      if (dLat > latExtent[1]) latExtent[1] = dLat
    }
    const lngExtentRange = lngExtent[1] - lngExtent[0]
    const latExtentRange = latExtent[1] - latExtent[0]
    if (lngExtentRange > maxExtentRange[0]) maxExtentRange[0] = lngExtentRange
    if (latExtentRange > maxExtentRange[1]) maxExtentRange[1] = latExtentRange

    const triIdxs = earcut(vertices, holes, 2)

    const vertexCount = vertices.length / 2
    maxVertexCounts.push(vertexCount)
    maxVertexCounts.sort((a, b) => b - a)
    maxVertexCounts.length = 50

    const triangleCount = triIdxs.length / 3
    maxTriangleCounts.push(triangleCount)
    maxTriangleCounts.sort((a, b) => b - a)
    maxTriangleCounts.length = 50

    const holeCount = holes.length
    maxHoleCount.push(holeCount)
    maxHoleCount.sort((a, b) => b - a)
    maxHoleCount.length = 10

    if (holes.length > 0) buildingsWithHoles += 1
    buildingCount += 1
    totalTriangleCount += triangleCount

    const data = [
      bbl, // bin, // the building's BIN number
      centroid[0], // the footprint's centroid longitude
      centroid[1], // the footprint's centroid latitude
      // vertices.length / 2, // the number of vertices (vec2s) to follow
      // ...vertices, // the vertices: lng1, lat1, lng2, lat2, ...
      // triIdxs.length / 3, // the number of triangles in the footprint
      // ...triIdxs // the triangle indices into the vertex list: tri1A, tri1B, tri1C, tri2A, tri2B, tri2C, etc
    ]

    if (triangleCount > 255 || vertexCount > 255) {
      console.log(JSON.stringify(data))
    }
  }
})

rl.on('close', () => {
  console.error({ maxExtentRange, maxVertexCounts, maxTriangleCounts, totalTriangleCount, maxHoleCount, buildingsWithHoles, buildingCount })
})

function createValueGetter (columnNames) {
  const columns = {}
  columnNames.forEach((name, i) => {
    columns[name] = i
  })
  return (values, key) => values[columns[key]]
}

function parseMultiPolygonGeo (geoStr) {
  const prefix = 'MULTIPOLYGON '
  geoStr = geoStr.slice(prefix.length)
  let newStr = ''
  let i = 0
  while (i < geoStr.length) {
    if (geoStr[i] === '(') newStr += '['
    else if (geoStr[i] === ')') newStr += ']'
    else if (geoStr[i] === ' ') newStr += ','
    else if (geoStr[i] !== ',') newStr += geoStr[i]
    i++
  }
  const geometry = JSON.parse(newStr)
  return geometry
}

function flatToTuples (array) {
  const output = []
  for (let i = 0; i < array.length; i += 2) {
    output.push([array[i], array[i + 1]])
  }
  return output
}
