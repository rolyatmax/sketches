const canvasSketch = require('canvas-sketch')
const Alea = require('alea')
const vec3 = require('gl-vec3')
const project = require('camera-project')
const mat4 = require('gl-mat4')
const memoize = require('memoizee')
const normal = require('get-plane-normal')
const { createSpring } = require('spring-animator')

const settings = {
  dimensions: [800, 800],
  animate: true,
  fps: 24
}

const SEED = 952
const ZOOM = 500
const BACKGROUND_COLOR = [55, 55, 55] // [255, 255, 255]
const BLEND_MODE = 'lighten'
const LINE_COLOR = [240, 235, 248] // [50, 50, 50]
const LINE_OPACITY = 0.5
const SPACE_COLOR = [210, 225, 248]
const SPACE_OPACITY = 0
const LINE_THICKNESS = 1
const DAMPENING = 0.1
const STIFFNESS = 0.35
const EQUAL_THRESHOLD = 0.001
const MAX_SUBDIVISION_DEPTH = 10

const rootLine = {
  type: 'root',
  parent: null,
  origin: [-150, -150, 0],
  dir: [0, 300, 0],
  drawOffset: 0,
  children: [],
  spaces: [],
  drawOffsetSpring: createSpring(DAMPENING, STIFFNESS, 0)
}

const lines = window.lines = [rootLine]
const spaces = window.spaces = []

let getLineCoords, getSpaceCornerCoords, isDrawn, getSubdivisionDepth, rand

const sketch = () => {
  rand = new Alea(SEED)

  extrudeLine(rootLine, [300, 0, 0])

  let n = 6
  while (n--) {
    const s = spaces.filter(sp => sp.subdivider === null && !sp.killed)
    subdivideSpace(s[rand() * s.length | 0], rand() * 2 | 0, rand() * 0.6 + 0.2)
  }

  return ({ context, width, height, frame }) => {
    context.globalCompositeOperation = BLEND_MODE
    context.clearRect(0, 0, width, height)
    context.fillStyle = `rgb(${BACKGROUND_COLOR.join(', ')})`
    context.fillRect(0, 0, width, height)

    getLineCoords = window.getLineCoords = memoize(_getLineCoords)
    getSpaceCornerCoords = memoize(_getSpaceCornerCoords)
    isDrawn = memoize(_isDrawn)
    getSubdivisionDepth = memoize(_getSubdivisionDepth)

    const linesToRemove = []
    lines.forEach((l, i) => {
      if (rand() < 0.0001 && i > 4) {
        killLine(l)
      }

      const startAnimating = l.parent === null || isDrawn(l.parent)
      l.drawOffsetSpring.updateValue(startAnimating ? 1 : 0)
      l.drawOffset = l.type === 'extender' && !l.killed ? 1 : l.drawOffsetSpring.tick()

      if (l.killed) {
        l.velocity = l.velocity || 0
        l.velocity += 0.5

        l.coords.forEach(pt => { pt[1] += l.velocity })
        if (l.velocity > 30) linesToRemove.push(l)
      }

      if (l.type === 'subdivider') {
        if (rand() < 0.005) {
          l.subdivisionOffsetSpring.updateValue(rand() * 0.5 + 0.25)
        }
        l.subdivisionOffset = l.subdivisionOffsetSpring.tick()
      }
    })

    for (const line of linesToRemove) {
      lines.splice(lines.indexOf(line), 1)
    }

    if (rand() < 0.5) {
      const s = spaces.filter(sp => sp.subdivider === null && !sp.killed && getSubdivisionDepth(sp) < MAX_SUBDIVISION_DEPTH)
      if (s.length) subdivideSpace(s[rand() * s.length | 0], rand() * 2 | 0, rand() * 0.5 + 0.25)
      if (rand() < 0.5) {
        const ls = lines.filter(ln => ln.children.length === 0 && !ln.killed && isDrawn(ln.spaces[0]))
        if (ls.length) {
          const l = ls[rand() * ls.length | 0]
          const space = l.spaces[0]
          const oppositeLine = space.bounds[(space.bounds.indexOf(l) + 2) % 4]
          const dir = normal([], getLineCoords(l)[0], getLineCoords(l)[1], getLineCoords(oppositeLine)[0])
          vec3.scale(dir, dir, 600 * (rand() - 0.5))
          extrudeLine(l, dir)
        }
      }
    }

    const viewport = [0, 0, width, height]

    const proj = mat4.create()
    const view = mat4.create()
    const timeValue = (frame + 150) / 160
    const position = [Math.sin(timeValue) * 20, Math.sin(timeValue) * 30, Math.cos(timeValue) * 60]
    const up = [0, 1, 0]

    mat4.ortho(proj, -ZOOM, ZOOM, -ZOOM, ZOOM, -ZOOM, ZOOM)
    const center = [0, 0, 0]
    mat4.lookAt(view, position, center, up)

    const combined = mat4.multiply([], proj, view)

    // render
    for (const line of lines) {
      if (isEqual(line.drawOffset, 0)) continue
      const opacity = (line.type === 'subdivider') ? ((LINE_OPACITY - 0.1) / (getSubdivisionDepth(line.parent) + 1) + 0.1) : LINE_OPACITY
      const coords = getLineCoords(line)
      const [pt1, pt2] = coords.map(pt => project([], pt, viewport, combined))

      line.gradientOffset = line.gradientOffset || rand() * 0.8 + 0.1
      const gradient = context.createLinearGradient(pt1[0], pt1[1], pt2[0], pt2[1])
      gradient.addColorStop(0, `rgba(${LINE_COLOR.join(', ')}, ${opacity})`)
      gradient.addColorStop(line.gradientOffset, `rgba(${LINE_COLOR.join(', ')}, 0)`)
      gradient.addColorStop(1, `rgba(${LINE_COLOR.join(', ')}, ${opacity})`)

      context.beginPath()
      context.strokeStyle = gradient
      context.lineWidth = LINE_THICKNESS
      context.moveTo(pt1[0], pt1[1])
      context.lineTo(pt2[0], pt2[1])
      context.stroke()
    }

    for (const space of spaces) {
      if (space.killed || space.parent) continue
      const pts = getSpaceCornerCoords(space).map(pt => project([], pt, viewport, combined))

      space.color = space.color || SPACE_COLOR.map(v => v * rand())

      const gradient = context.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1])
      gradient.addColorStop(0, `rgba(${space.color.join(', ')}, ${SPACE_OPACITY})`)
      gradient.addColorStop(0.5, `rgba(${LINE_COLOR.join(', ')}, ${Math.max(SPACE_OPACITY - 0.1, 0)})`)
      gradient.addColorStop(1, `rgba(${space.color.join(', ')}, ${SPACE_OPACITY})`)

      context.beginPath()
      context.fillStyle = gradient
      context.moveTo(pts[0][0], pts[0][1])
      context.lineTo(pts[1][0], pts[1][1])
      context.lineTo(pts[2][0], pts[2][1])
      context.lineTo(pts[3][0], pts[3][1])
      context.lineTo(pts[0][0], pts[0][1])
      context.fill()
    }
  }
}

canvasSketch(sketch, settings)

// ----------------------

function _isDrawn (lineOrSpace) {
  if (lineOrSpace.bounds) {
    return lineOrSpace.bounds.every(isDrawn)
  }
  return isEqual(lineOrSpace.drawOffset, 1)
}

function _getSubdivisionDepth (space) {
  let depth = 0
  let cur = space
  while (cur.parent) {
    depth += 1
    cur = cur.parent
  }
  return depth
}

function killLine (line) {
  if (line.killed) return
  line.coords = getLineCoords(line)
  line.killed = true
  line.spaces.forEach(killSpace)
  line.children.forEach(killLine)
  if (line.type === 'subdivider') {
    line.parent.subdivider = null
  }
}

function killSpace (space) {
  // TODO: clean up all the spaces lists this space appears in
  if (space.killed) return
  space.cornerCoords = getSpaceCornerCoords(space)
  space.killed = true
  space.children.forEach(killSpace)
  space.bounds.forEach(l => {
    if (l.spaces.every(s => s.killed)) {
      killLine(l)
    }
  })
  if (space.subdivider) killLine(space.subdivider)
}

function _getLineCoords (line) {
  if (line.coords) return line.coords
  if (line.type === 'root') {
    const end = vec3.scaleAndAdd([], line.origin, line.dir, line.drawOffset)
    return [line.origin.slice(), end]
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
    return [start, end]
  }
  if (line.type === 'extruder') {
    const parentCoords = getLineCoords(line.parent)
    const start = vec3.scaleAndAdd([], parentCoords[0], line.dir, line.drawOffset)
    const end = vec3.scaleAndAdd([], parentCoords[1], line.dir, line.drawOffset)
    return [start, end]
  }
  if (line.type === 'subdivider') {
    // We should be able to determine space boundaries by looking recursively
    // at the space's parents. The top-level space is bounded by lines which DO NOT extend
    // beyond the space, so their start/end points should BE the four corners of the space
    const spaceCornerCoords = getSpaceCornerCoords(line.parent)
    if (line.orientation === 0) {
      const start = vec3.lerp([], spaceCornerCoords[0], spaceCornerCoords[3], line.subdivisionOffset)
      const end = vec3.lerp([], spaceCornerCoords[1], spaceCornerCoords[2], line.subdivisionOffset)
      vec3.lerp(end, start, end, line.drawOffset)
      return [start, end]
    } else {
      const start = vec3.lerp([], spaceCornerCoords[0], spaceCornerCoords[1], line.subdivisionOffset)
      const end = vec3.lerp([], spaceCornerCoords[3], spaceCornerCoords[2], line.subdivisionOffset)
      vec3.lerp(end, start, end, line.drawOffset)
      return [start, end]
    }
  }
  throw new Error(`line type not recognized: ${line.type}`)
}

function _getSpaceCornerCoords (space) {
  if (space.cornerCoords) return space.cornerCoords
  if (!space.parent) {
    const extruder = space.bounds.filter(l => l.type === 'extruder')[0]
    const base = space.bounds[(space.bounds.indexOf(extruder) + 2) % 4]
    const nonExtenderCoords = [base, extruder].map(getLineCoords)
    const ptA = nonExtenderCoords[0][0]
    const ptB = nonExtenderCoords[1][0]
    const ptC = nonExtenderCoords[1][1]
    const ptD = nonExtenderCoords[0][1]
    return [ptA, ptB, ptC, ptD]
  }
  const parentCornerCoords = getSpaceCornerCoords(space.parent)
  // the parent's subdivider is one of the space's bounding lines
  // so let's find that one, so we know which points we need to
  // calculate
  const subdividerIndex = space.bounds.indexOf(space.parent.subdivider)
  const subdividerCoords = getLineCoords(space.parent.subdivider)
  const cornerCoords = parentCornerCoords.slice()
  if (subdividerIndex === 0) {
    cornerCoords[0] = subdividerCoords[0]
    cornerCoords[1] = subdividerCoords[1]
  } else if (subdividerIndex === 1) {
    cornerCoords[1] = subdividerCoords[0]
    cornerCoords[2] = subdividerCoords[1]
  } else if (subdividerIndex === 2) {
    cornerCoords[2] = subdividerCoords[1]
    cornerCoords[3] = subdividerCoords[0]
  } else if (subdividerIndex === 3) {
    cornerCoords[3] = subdividerCoords[1]
    cornerCoords[0] = subdividerCoords[0]
  } else {
    throw new Error('parents subdivider not found in bounds list - something is wrong')
  }
  return cornerCoords
}

function isEqual (a, b) {
  return Math.abs(a - b) < EQUAL_THRESHOLD
}

function extrudeLine (line, dir) {
  const extender1 = {
    type: 'extender',
    children: [],
    connection: 0,
    drawOffset: 0,
    spaces: [],
    drawOffsetSpring: createSpring(DAMPENING, STIFFNESS, 0)
  }

  const extender2 = {
    type: 'extender',
    children: [],
    connection: 1,
    drawOffset: 0,
    spaces: [],
    drawOffsetSpring: createSpring(DAMPENING, STIFFNESS, 0)
  }

  const extruder = {
    type: 'extruder',
    parent: line,
    children: [extender1, extender2],
    dir: dir,
    drawOffset: 0,
    spaces: [],
    drawOffsetSpring: createSpring(DAMPENING, STIFFNESS, 0)
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

function subdivideSpace (space, orientation, subdivisionOffset) {
  const subdivider = {
    type: 'subdivider',
    parent: space,
    children: [],
    orientation: orientation,
    drawOffset: 0,
    subdivisionOffset: subdivisionOffset,
    spaces: [],
    drawOffsetSpring: createSpring(DAMPENING, STIFFNESS, 0),
    subdivisionOffsetSpring: createSpring(DAMPENING, STIFFNESS, subdivisionOffset)
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

  bounds1.forEach(l => { if (!l.spaces.includes(space1)) l.spaces.push(space1) })
  bounds2.forEach(l => { if (!l.spaces.includes(space2)) l.spaces.push(space2) })

  space.subdivider = subdivider
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
