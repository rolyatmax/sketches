const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const { GUI } = require('dat-gui')
const vec2 = require('gl-vec2')

const WIDTH = 1024
const HEIGHT = 1024

const settings = {
  seed: 3576,
  polygonCount: 50,
  polySize: 30,
  polySides: 3,
  polyPtOffset: 25,
  shadowPassCount: 150,
  shadowPassOpacity: 10,
  lightJigger: 25,
  lightTravel: 250,
  margin: 200,
  showPolys: false
}

const sketch = ({ render }) => {
  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(setup)
  gui.add(settings, 'polygonCount', 0, 100).step(1).onChange(setup)
  gui.add(settings, 'polySize', 1, 500).onChange(setup)
  gui.add(settings, 'polySides', 3, 30).step(1).onChange(setup)
  gui.add(settings, 'polyPtOffset', 0, 200).onChange(setup)
  gui.add(settings, 'shadowPassCount', 1, 2000).step(1).onChange(setup)
  gui.add(settings, 'shadowPassOpacity', 0, 100)
  gui.add(settings, 'lightJigger', 0, 600).onChange(setup)
  gui.add(settings, 'lightTravel', 0, 300)
  gui.add(settings, 'margin', 0, WIDTH / 2).onChange(setup)
  gui.add(settings, 'showPolys')

  let rand, polys, shadowPasses

  function setup (lightSource) {
    rand = random.createRandom(settings.seed)

    polys = (new Array(settings.polygonCount)).fill().map(() => {
      const center = [
        rand.range(settings.margin, WIDTH - settings.margin),
        rand.range(settings.margin, HEIGHT - settings.margin)
      ]
      const points = (new Array(settings.polySides)).fill().map((_, i) => {
        const rads = i / settings.polySides * Math.PI * 2
        const offset = rand.insideCircle(settings.polyPtOffset)
        const pt = [
          Math.cos(rads) * settings.polySize + center[0] + offset[0],
          Math.sin(rads) * settings.polySize + center[1] + offset[1]
        ]
        return pt
      })
      return { points }
    })

    shadowPasses = (new Array(settings.shadowPassCount)).fill().map(() => {
      const source = vec2.add([], lightSource, rand.insideCircle(settings.lightJigger))
      return getRays(source, polys)
    })
  }
  return ({ context, width, height, time, frame }) => {
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    const lightSource = [WIDTH / 2, HEIGHT / 2]
    const offset = vec2.scale([], angleToVec2(time), settings.lightTravel)
    vec2.add(lightSource, lightSource, offset)
    setup(lightSource)

    // context.beginPath()
    // context.arc(lightSource[0], lightSource[1], 10, 0, Math.PI * 2)
    // context.fillStyle = 'green'
    // context.fill()

    if (settings.showPolys) {
      polys.forEach(poly => {
        context.beginPath()
        drawLine(context, poly.points)
        context.fillStyle = 'red'
        context.fill()
      })
    }

    // rays.forEach(ray => {
    //   context.beginPath()
    //   drawLine(context, ray)
    //   context.strokeStyle = 'blue'
    //   context.stroke()

    //   context.beginPath()
    //   context.arc(ray[1][0], ray[1][1], 12, 0, Math.PI * 2)
    //   context.strokeStyle = 'blue'
    //   context.stroke()
    // })

    for (const rays of shadowPasses) {
      context.beginPath()
      drawLine(context, rays.map(r => r[1]))
      context.fillStyle = `rgba(30, 30, 30, ${settings.shadowPassOpacity / 1000})`
      context.fill()
    }
  }
}

canvasSketch(sketch, {
  dimensions: [WIDTH, HEIGHT],
  animate: true,
  fps: 24
})

function drawLine (ctx, pts) {
  ctx.moveTo(pts[0][0], pts[0][1])
  for (const p of pts.slice(1)) {
    ctx.lineTo(p[0], p[1])
  }
}

function getRays (lightSource, polys) {
  const m = settings.margin
  const canvasEdgePoints = [[m, m], [m, HEIGHT - m], [WIDTH - m, HEIGHT - m], [WIDTH - m, m]]
  polys = [...polys, { points: canvasEdgePoints }]
  let rays = []
  polys.forEach(p => (
    p.points.forEach(pt => {
      const angle = Math.atan2(pt[1] - lightSource[1], pt[0] - lightSource[0])
      const offsets = [-0.0001, 0, 0.0001]
      for (const offset of offsets) {
        const rayEnd = vec2.add([], lightSource, angleToVec2(angle + offset))
        const intersect = getClosestIntersection([lightSource, rayEnd], polys)
        rays.push({ intersect, angle: angle + offset })
      }
    })
  ), [])
  rays = rays.sort((a, b) => a.angle - b.angle)
  return rays.map(r => ([lightSource, r.intersect]))
}

function getClosestIntersection (ray, polys) {
  let closest = null
  let closestDistance = Infinity
  for (const poly of polys) {
    for (let i = 0; i < poly.points.length; i++) {
      const segment = [
        poly.points[i],
        poly.points[(i + 1) % poly.points.length]
      ]
      const result = getIntersection(ray, segment)
      if (result && result.dist < closestDistance) {
        closestDistance = result.dist
        closest = result.intersect
      }
    }
  }
  return closest
}

// adapted from Nicky Case!
// https://github.com/ncase/sight-and-light
function getIntersection (ray, segment) {
  // RAY in parametric: Point + Delta*t1
  const rP = ray[0]
  const rD = [ray[1][0] - rP[0], ray[1][1] - rP[1]]

  // SEGMENT in parametric: Point + Delta*t2
  const sP = segment[0]
  const sD = [segment[1][0] - sP[0], segment[1][1] - sP[1]]

  // Are they parallel? If so, no intersect
  const rMag = Math.sqrt(rD[0] * rD[0] + rD[1] * rD[1])
  const sMag = Math.sqrt(sD[0] * sD[0] + sD[1] * sD[1])
  if (rD[0] / rMag === sD[0] / sMag && rD[1] / rMag === sD[1] / sMag) {
    // Unit vectors are the same.
    return null
  }

  // SOLVE FOR t1 & t2
  // rP[0]+rD[0]*t1 = sP[0]+sD[0]*t2 && rP[1]+rD[1]*t1 = sP[1]+sD[1]*t2
  // ==> t1 = (sP[0]+sD[0]*t2-rP[0])/rD[0] = (sP[1]+sD[1]*t2-rP[1])/rD[1]
  // ==> sP[0]*rD[1] + sD[0]*t2*rD[1] - rP[0]*rD[1] = sP[1]*rD[0] + sD[1]*t2*rD[0] - rP[1]*rD[0]
  // ==> t2 = (rD[0]*(sP[1]-rP[1]) + rD[1]*(rP[0]-sP[0]))/(sD[0]*rD[1] - sD[1]*rD[0])
  const t2 = (rD[0] * (sP[1] - rP[1]) + rD[1] * (rP[0] - sP[0])) / (sD[0] * rD[1] - sD[1] * rD[0])
  const t1 = (sP[0] + sD[0] * t2 - rP[0]) / rD[0]

  // Must be within parametic whatevers for RAY/SEGMENT
  if (t1 < 0) return null
  if (t2 < 0 || t2 > 1) return null

  // Return the POINT OF INTERSECTION
  return {
    intersect: [rP[0] + rD[0] * t1, rP[1] + rD[1] * t1],
    dist: t1
  }
}

function angleToVec2 (rads) {
  return [Math.cos(rads), Math.sin(rads)]
}
