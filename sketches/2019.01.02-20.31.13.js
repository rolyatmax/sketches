const canvasSketch = require('canvas-sketch')
const random = require('canvas-sketch-util/random')
const vec2 = require('gl-vec2')
const { GUI } = require('dat-gui')

const SIZE = 2048
const HALF_SIZE = SIZE / 2

const sketch = ({ render }) => {
  const settings = {
    seed: 1,
    holeCount: 40,
    holeMinSize: 55,
    holeSizeRange: 250,
    pointCount: 60000,
    pointSize: 6,
    noiseFreq: 0.001,
    noiseAmp: 2,
    triesCount: 100,
    margin: 150,
    opacity: 0.1,
    lines: true
  }

  function onChange () {
    setup()
    render()
  }

  const gui = new GUI()
  gui.add(settings, 'seed', 0, 9999).step(1).onChange(onChange)
  gui.add(settings, 'holeCount', 0, 1000).step(1).onChange(onChange)
  gui.add(settings, 'holeMinSize', 0, 100).onChange(onChange)
  gui.add(settings, 'holeSizeRange', 0, 400).onChange(onChange)
  gui.add(settings, 'pointCount', 0, 100000).step(1).onChange(onChange)
  gui.add(settings, 'pointSize', 1, 20).onChange(onChange)
  gui.add(settings, 'noiseFreq', 0, 0.01).step(0.00001).onChange(onChange)
  gui.add(settings, 'noiseAmp', 0, 5).onChange(onChange)
  gui.add(settings, 'triesCount', 0, 10000).step(1).onChange(onChange)
  gui.add(settings, 'margin', 0, 500).onChange(onChange)
  gui.add(settings, 'opacity', 0, 1).step(0.01).onChange(onChange)
  gui.add(settings, 'lines').onChange(onChange)

  let rand, points

  function setup () {
    rand = random.createRandom(settings.seed)
    const holes = (new Array(settings.holeCount)).fill().map(() => ({
      position: vec2.add([], rand.insideCircle(HALF_SIZE - settings.margin), [HALF_SIZE, HALF_SIZE]),
      size: Math.pow(rand.value(), 5) * settings.holeSizeRange + settings.holeMinSize
    }))
    points = []
    let tries = 0
    while (points.length < settings.pointCount && tries < settings.triesCount) {
      const position = vec2.add([], rand.insideCircle(HALF_SIZE - settings.margin), [HALF_SIZE, HALF_SIZE])
      let isInsideHole = false
      for (let h of holes) {
        if (vec2.distance(h.position, position) < h.size) {
          isInsideHole = true
          break
        }
      }
      if (isInsideHole) {
        tries += 1
      } else {
        points.push({
          position: position,
          angle: (rand.noise2D(position[0], position[1], settings.noiseFreq, settings.noiseAmp) + 1) * Math.PI,
          opacity: (rand.noise2D(position[0], position[1], settings.noiseFreq, settings.noiseAmp + 1) + 1) * 0.5
        })
        tries = 0
      }
    }
    console.log('points count:', points.length)
  }

  setup()
  return ({ context, width, height }) => {
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)

    for (let pt of points) {
      const color = pt.opacity * 255
      if (settings.lines) {
        const vec = vec2.scale([], [Math.cos(pt.angle), Math.sin(pt.angle)], settings.pointSize)
        const pt1 = vec2.add([], pt.position, vec)
        const pt2 = vec2.subtract([], pt.position, vec)
        context.beginPath()
        context.moveTo(pt1[0], pt1[1])
        context.lineTo(pt2[0], pt2[1])
        // context.strokeStyle = `rgba(10, 10, 10, ${pt.opacity * settings.opacity})`
        context.strokeStyle = `rgba(${color}, ${color}, ${color}, ${settings.opacity})`
        context.stroke()
      } else {
        context.beginPath()
        context.arc(pt.position[0], pt.position[1], settings.pointSize, 0, Math.PI * 2)
        // context.fillStyle = `rgba(10, 10, 10, ${pt.opacity * settings.opacity})`
        context.fillStyle = `rgba(${color}, ${color}, ${color}, ${settings.opacity})`
        context.fill()
      }
    }
    console.log('rendered')
  }
}

canvasSketch(sketch, {
  dimensions: [ SIZE, SIZE ]
})
