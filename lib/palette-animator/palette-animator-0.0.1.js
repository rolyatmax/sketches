const inject = require('../inject-glsl/inject-glsl-0.0.1')
const { createSpring } = require('spring-animator-2')

// takes stiffness, damping, and initialColor which may be a vec3 color OR an index into palettes
module.exports = function createPaletteAnimator (palettes, stiffness = 0.001, damping = 0.1, initialColor = [1, 1, 1]) {
  palettes = palettes.map(palette => palette.map(hexToRgb))
  const initialPalette = Number.isInteger(initialColor) ? palettes[initialColor] : new Array(5).fill().map(() => initialColor)
  const paletteSpring = createPaletteSpring(stiffness, damping, initialPalette)

  return { injectGLSL, tick, uniforms, palettes, PALETTE_ANIMATOR_GLSL }

  // takes a palette index
  function tick (palette) {
    if (!Number.isInteger(palette)) {
      console.warn(`paletteAnimator tick() expects an integer index into the provided palettes. received ${palette}. using palette 0`)
      palette = 0
    }
    paletteSpring.setDestination(palettes[palette])
    paletteSpring.tick()
  }

  function uniforms () {
    const palette = paletteSpring.getCurrentValue()
    return {
      animator_color1: palette[0],
      animator_color2: palette[1],
      animator_color3: palette[2],
      animator_color4: palette[3],
      animator_color5: palette[4]
    }
  }

  function injectGLSL (vs) {
    return inject(PALETTE_ANIMATOR_GLSL, vs)
  }
}

function createPaletteSpring (stiffness, damping, initialPalette) {
  const color1Spring = createSpring(stiffness, damping, initialPalette[0])
  const color2Spring = createSpring(stiffness, damping, initialPalette[1])
  const color3Spring = createSpring(stiffness, damping, initialPalette[2])
  const color4Spring = createSpring(stiffness, damping, initialPalette[3])
  const color5Spring = createSpring(stiffness, damping, initialPalette[4])

  function setDestination (palette) {
    color1Spring.setDestination(palette[0])
    color2Spring.setDestination(palette[1])
    color3Spring.setDestination(palette[2])
    color4Spring.setDestination(palette[3])
    color5Spring.setDestination(palette[4])
  }

  function tick (s, d) {
    color1Spring.tick(s, d)
    color2Spring.tick(s, d)
    color3Spring.tick(s, d)
    color4Spring.tick(s, d)
    color5Spring.tick(s, d)
  }

  function getCurrentValue () {
    return [
      color1Spring.getCurrentValue(),
      color2Spring.getCurrentValue(),
      color3Spring.getCurrentValue(),
      color4Spring.getCurrentValue(),
      color5Spring.getCurrentValue()
    ]
  }

  return { setDestination, tick, getCurrentValue }
}

function hexToRgb (hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255
  ]
}

const PALETTE_ANIMATOR_GLSL = `
uniform vec3 animator_color1;
uniform vec3 animator_color2;
uniform vec3 animator_color3;
uniform vec3 animator_color4;
uniform vec3 animator_color5;

// stretch is how much to stretch or compress the t scale from the center
// in order to encompass more or fewer colors
vec3 getColorFromPalette(float t) {
  if (t < 0.25) {
    return mix(animator_color1, animator_color2, smoothstep(0.0, 0.25, t));
  }
  if (t < 0.5) {
    return mix(animator_color2, animator_color3, smoothstep(0.25, 0.5, t));
  }
  if (t < 0.75) {
    return mix(animator_color3, animator_color4, smoothstep(0.5, 0.75, t));
  }
  return mix(animator_color4, animator_color5, smoothstep(0.75, 1.0, t));
}
`
