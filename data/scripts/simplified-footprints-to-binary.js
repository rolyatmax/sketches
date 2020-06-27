// expects CSV with headers: the_geom,BASE_BBL

// outputs binary float32s:
/*
  bbl, // the building's BBL number (as 32b float)
  centroid[0], // the footprint's centroid longitude (as 32b float)
  centroid[1], // the footprint's centroid latitude (as 32b float)
  vertices.length / 2, // the number of vertices (vec2s) to follow (as 2-byte int)
  ...vertices, // the vertices: lng1, lat1, lng2, lat2, (as offsets from centroid - each multiplied by 1000000) (as 2-byte ints)
  triIdxs.length / 3, // the number of triangles in the footprint (as 2-byte int)
  ...triIdxs // the triangle indices into the vertex list: tri1A, tri1B, tri1C, tri2A, tri2B, tri2C, etc (as 1-byte ints when vertexCount < 256, otherwise 2-byte ints)
*/

// BIN first digit corresponds with the borough:
// 1 - Manhattan, 2 - Bronx, 3 - Brooklyn, 4 - Queens, 5 - Staten Island

// let's skip everything outside of this bbox:
const NORTH = 40.879548
const EAST = -73.866673
const SOUTH = 40.643768

const VISVALINGAM_THRESHOLD = 1e-10 // or 1e-6 for max simplification

const path = require('path')
const argv = require('minimist')(process.argv.slice(2))
const readline = require('readline')
const { csvParseRows } = require('d3-dsv')
const { polygonHull } = require('d3-polygon')
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

let totalTriangleCount = 0
let buildingCount = 0
let simplifiedBuildingCount = 0

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
  const bblStr = getVal(values, 'BASE_BBL')

  // skip Staten Island footprints
  if (bblStr[0] === '5') return

  const bbl = parseInt(bblStr, 10)
  const geoString = getVal(values, 'the_geom')
  const polygons = parseMultiPolygonGeo(geoString)
  let vertices = polygons.map(p => p[0]).flat()
  const hullPoints = polygonHull(flatToTuples(vertices))

  const simplified = visvalingamSimplify(hullPoints, VISVALINGAM_THRESHOLD, 4)

  // lets just average out the hull points to get the centroid
  const centroid = simplified.reduce((avg, pt) => [avg[0] + pt[0] / simplified.length, avg[1] + pt[1] / simplified.length], [0, 0])
  vertices = simplified.flat()

  // let's skip everything outside of this bbox:
  if (centroid[0] > EAST || centroid[1] > NORTH || centroid[1] < SOUTH) {
    return
  }

  if (simplified.length < hullPoints.length) {
    simplifiedBuildingCount += 1
    // console.error('Simplified!')
    // console.error({ hullPoints, simplified })
  }
  // return

  const triIdxs = earcut(vertices, null, 2)

  const floats = new Float32Array([
    bbl, // bin, // the building's BIN number
    centroid[0], // the footprint's centroid longitude
    centroid[1] // the footprint's centroid latitude
  ])
  process.stdout.write(Buffer.from(floats.buffer))

  const int16s = new Int16Array(vertices.length + 2)
  const vertexCount = vertices.length / 2
  int16s[0] = vertexCount // the number of vertices (vec2s) to follow
  for (let i = 0; i < vertices.length; i += 2) {
    // use delta encoding
    const dLng = (vertices[i] - centroid[0]) * 1000000 | 0
    const dLat = (vertices[i + 1] - centroid[1]) * 1000000 | 0
    int16s[i + 1] = dLng
    int16s[i + 2] = dLat

    // make sure we aren't overflowing or losing precision:
    if (int16s[i + 1] !== dLng || int16s[i + 2] !== dLat) {
      console.error(`Lost precision converting vertex delta ${dLng} -> ${int16s[i + 1]} or ${dLat} -> ${int16s[i + 2]}`)
    }
  }
  const triangleCount = triIdxs.length / 3
  int16s[int16s.length - 1] = triangleCount // the number of triangles in the footprint
  process.stdout.write(Buffer.from(int16s.buffer))

  // the triangle indices into the vertex list: tri1A, tri1B, tri1C, tri2A, tri2B, tri2C, etc
  // we can use uint8s if we are indexing into a shorter list of vertices (less than 256)
  const ints = vertexCount < 256 ? new Uint8Array(triIdxs) : new Int16Array(triIdxs)
  for (let i = 0; i < triIdxs.length; i++) {
    if (ints[i] !== triIdxs[i]) {
      console.error(`Lost precision converting triangle idx ${triIdxs[i]} -> ${ints[i]}`)
    }
  }
  process.stdout.write(Buffer.from(ints.buffer))

  buildingCount += 1
  totalTriangleCount += triangleCount
})

rl.on('close', () => {
  console.error({ totalTriangleCount, buildingCount, simplifiedBuildingCount })
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

function visvalingamSimplify (line, threshold, minPoints) {
  line = line.slice()
  if (line.length < 3) return line
  const areas = []
  for (let i = 1; i < line.length - 1; i++) {
    const ptA = line[i - 1]
    const ptB = line[i]
    const ptC = line[i + 1]
    areas[i] = getAreaOfTriangle(ptA, ptB, ptC)
  }

  while (true) {
    let smallestArea = Infinity
    let smallestAreaIdx = null

    for (let i = 1; i < line.length - 1; i++) {
      if (areas[i] < smallestArea) {
        smallestArea = areas[i]
        smallestAreaIdx = i
      }
    }

    if (smallestArea > threshold || line.length <= minPoints) break

    line.splice(smallestAreaIdx, 1)
    areas.splice(smallestAreaIdx, 1)
    const recalculateIdxs = [smallestAreaIdx - 1, smallestAreaIdx].filter(i => i > 0 && i < line.length - 1)
    for (const idx of recalculateIdxs) {
      const ptA = line[idx - 1]
      const ptB = line[idx]
      const ptC = line[idx + 1]
      areas[idx] = getAreaOfTriangle(ptA, ptB, ptC)
    }
  }

  return line
}

function getAreaOfTriangle (A, B, C) {
  return Math.abs((A[1] - C[1]) * (B[0] - A[0]) + (C[0] - A[0]) * (B[1] - A[1])) / 2
}
