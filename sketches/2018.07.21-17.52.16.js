const canvasSketch = require('canvas-sketch')
const vec3 = require('gl-vec3')

const settings = {
  dimensions: [ 2048, 2048 ]
}

const rootLine = {
  type: 'root',
  origin: [0, 0, 0],
  dir: [0, 10, 0],
  drawOffset: 0,
  children: [],
  spaces: []
}

const lines = [rootLine]
const spaces = []

const sketch = () => {
  return ({ context, width, height }) => {
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)
  }
}

canvasSketch(sketch, settings)

// ----------------------

// TODO: memoize this
function getLineCoords (line) {
  if (line.type === 'root') {
    const end = vec3.scaleAndAdd([], line.origin, line.dir, line.drawOffset)
    return [ line.origin, end ]
  }
  // THOUGHT: maybe extenders should only be tied to their spaces?
  // and spaces should be, simply, extruders and their origins??
  if (line.type === 'extender') {
    // the parent's parent is the extrudED line
    const extruderOriginCoords = getLineCoords(line.parent.parent)
    // the parent is the extruder
    const parentCoords = getLineCoords(line.parent)
    const start = extruderOriginCoords[line.connection]
    const dir = vec3.subtract([], parentCoords[line.connection], start)
    const end = vec3.scaleAndAdd([], start, dir, line.drawOffset)
    return [ start, end ]
  }
  if (line.type === 'extruder') {
    const parentCoords = getLineCoords(line.parent)
    const start = vec3.scaleAndAdd([], parentCoords[0], line.dir, line.drawOffset)
    const end = vec3.scaleAndAdd([], parentCoords[1], line.dir, line.drawOffset)
    return [ start, end ]
  }
  if (line.type === 'subdivider') {
    // We should be able to determine space boundaries by looking recursively
    // at the space's parents. The top-level space is bounded by lines which DO NOT extend
    // beyond the space, so their start/end points should BE the four corners of the space
    const spaceCornerCoords = getSpaceCornerCoords(line.parent)
    if (line.orientation === 0) {
      const start = vec3.lerp([], spaceCornerCoords[0], spaceCornerCoords[3], line.subdivisionOffset)
      const end = vec3.lerp([], spaceCornerCoords[1], spaceCornerCoords[2], line.subdivisionOffset)
      return [ start, end ]
    } else {
      const start = vec3.lerp([], spaceCornerCoords[0], spaceCornerCoords[1], line.subdivisionOffset)
      const end = vec3.lerp([], spaceCornerCoords[3], spaceCornerCoords[2], line.subdivisionOffset)
      return [ start, end ]
    }
  }
}

// TODO: memoize this
function getSpaceCornerCoords (space) {
  if (!space.parent) {
    const boundsCoords = space.bounds.map(getLineCoords)
    const ptA = getSharedPoint(boundsCoords[0], boundsCoords[3])
    const ptB = getSharedPoint(boundsCoords[0], boundsCoords[1])
    const ptC = getSharedPoint(boundsCoords[1], boundsCoords[2])
    const ptD = getSharedPoint(boundsCoords[2], boundsCoords[3])
    return [ptA, ptB, ptC, ptD]
  }
  const parentCornerCoords = getSpaceCornerCoords(space.parent)
  // the parent's subdivider is one of the space's bounding lines
  // so let's find that one, so we know which points we need to
  // calculate
  const subdividerIndex = space.bounds.indexOf(space.parent.subdivider)
  if (subdividerIndex === 0) {

  }
}

// TODO: memoize this
function getSharedPoint (line1, line2) {
  if (line1 === line2) {
    throw new Error('lines passed to getSharedPoint are the same line')
  }

  let match = null

  for (let pt of line1) {
    for (let p of line2) {
      if (pt[0] === p[0] && pt[1] === p[1] && pt[2] === p[2]) {
        if (match) {
          throw new Error('lines passed to getSharedPoint are the same line')
        }
        match = p
      }
    }
  }

  if (!match) {
    throw new Error('lines passed to getSharedPoint do not share a point')
  }

  return match
}

function extrudeLine (line, dir) {
  const extender1 = {
    type: 'extender',
    children: [],
    connection: 0,
    drawOffset: 0
  }

  const extender2 = {
    type: 'extender',
    children: [],
    connection: 1,
    drawOffset: 0
  }

  const extruder = {
    type: 'extruder',
    parent: line,
    children: [extender1, extender2],
    dir: dir,
    drawOffset: 0,
    spaces: []
  }

  const space = {
    bounds: [line, extender1, extruder, extender2],
    children: [],
    subdivider: null
  }

  extender1.parent = extruder
  extender2.parent = extruder
  line.children.push(extruder)

  extruder.spaces.push(space)
  extender1.spaces.push(space)
  extender2.spaces.push(space)
  line.spaces.push(space)

  lines.push(extruder, extender1, extender2)
  spaces.push(space)
}

function subdivideSpace (space, orientation) {
  const subdivider = {
    type: 'subdivider',
    parent: space,
    children: [],
    orientation: orientation,
    drawOffset: 0,
    spaces: []
  }

  var bounds1 = space.bounds.slice()
  var bounds2 = space.bounds.slice()
  // orientation === 0 is a horizontal subdivision
  // since bounds are listed as top, right, bottom, left, we want to treat the
  // subdivider as parallel with the 0th and 2nd bounds of the space it's subdividing
  if (orientation === 0) {
    bounds1[0] = subdivider
    bounds2[2] = subdivider
  } else {
    bounds1[1] = subdivider
    bounds2[3] = subdivider
  }

  const space1 = {
    parent: space,
    bounds: bounds1,
    children: [],
    subdivider: null
  }

  const space2 = {
    parent: space,
    bounds: bounds2,
    children: [],
    subdivider: null
  }

  space.children.push(space1, space2)
  subdivider.spaces.push(space1, space2)

  lines.push(subdivider)
  spaces.push(space1, space2)
}

// const root = {
//   type: 'root',
//   origin: [0, 0, 0], // starting point for the line
//   dir: [0, 0, 10], // indicates direction & magnitude of the line from origin
//   drawOffset: 0, // 0-1 float indicating % of line drawn
//   children: [extruder], // a list of descendent lines
//   spaces: [space] // a list of spaces which are partly formed by this line
// }

// const extruder = {
//   type: 'extruder',
//   parent: root, // the line that is extruded
//   children: [extender1, extender2], // a list of descendent lines
//   dir: [0, 10, 0], // indicates the direction & magnitude of the extruder
//   drawOffset: 0, // 0-1 float indicating % of line drawn
//   spaces: [space] // a list of spaces which are partly formed by this line
// }

// const extender1 = {
//   type: 'extender',
//   parent: extruder,
//   children: [], // a list of descendent lines
//   connection: 0, // 0|1 depending on which part of the extruder line the extender is attached to
//   drawOffset: 0, // 0-1 float indicating % of line drawn
//   spaces: [space] // a list of spaces which are partly formed by this line
// }

// const extender2 = {
//   type: 'extender',
//   parent: extruder,
//   children: [], // a list of descendent lines
//   connection: 1, // 0|1 depending on which part of the extruder line the extender is attached to
//   drawOffset: 0, // 0-1 float indicating % of line drawn
//   spaces: [space] // a list of spaces which are partly formed by this line
// }

// const subdivider = {
//   type: 'subdivider',
//   parent: space, // space the subdivider is dividing
//   children: [], // a list of descendent lines
//   orientation: 0, // 0|1 depending on whether it subdivides the space vertically or horizontally (0 means it is parallel to a space's bounds[0] and bounds[2] while 1 means it is parallel to bounds[1] and bounds[3])
//   drawOffset: 0, // 0-1 float indicating % of line drawn
//   subdivisionOffset: 0, // 0-1 float indicating % offset from one line to the other
//   spaces: [space2, space3] // a list of spaces which are partly formed by this line
// }

// const space = {
//   parent: null, // a reference to its immediate parent space; null if no parent
//   bounds: [root, extender1, extruder, extender2],
//   children: [], // a list of descendent spaces
//   subdivider: subdivider
// }
