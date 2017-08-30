// #pragma glslify: snoise2 = require(glsl-noise/simplex/2d)

attribute vec3 position;
attribute vec3 color;
attribute vec3 normal;

varying vec4 fragColor;

uniform mat4 projection;
uniform mat4 view;
// uniform float tick;
uniform vec3 lightSource;
uniform float colorVariance;
uniform vec3 baseColor;
uniform float reflectionMult;
uniform float dotProdMult;
// uniform float noiseMag;
// uniform float noiseSize;

void main() {
  // float z1 = snoise2(position * noiseSize * 0.01 + vec2(tick / 500.0)) * noiseMag / 100.0;
  // float z2 = snoise2(position * noiseSize * 0.01 + vec2(1000.0 + tick / 500.0)) * noiseMag / 40.0;
  vec3 computedPosition = position; // vec3(position, (z1 + z2) / 2.0);
  vec3 computedColor = color * colorVariance + baseColor;
  vec3 currentLightSource = lightSource;
  vec3 lightDirection = normalize(currentLightSource - computedPosition);
  float dotProduct = abs(dot(lightDirection, normal));
  float mult = pow(1.0 - dotProduct, dotProdMult);
  float lightenPerc = pow(max(0.2, mult), 0.95) * reflectionMult;
  fragColor = vec4(computedColor * lightenPerc + 0.1, 1.0);
  gl_Position = projection * view * vec4(computedPosition, 1.0);
}
