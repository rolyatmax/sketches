#pragma glslify: snoise2 = require(glsl-noise/simplex/2d)

attribute vec2 position;
attribute vec3 color;
attribute vec2 adjacentPositionA;
attribute vec2 adjacentPositionB;

varying vec4 fragColor;

uniform mat4 projection;
uniform mat4 view;
uniform float tick;
uniform vec3 lightSource;
uniform float colorVariance;
uniform vec3 baseColor;
uniform float reflectionMult;
uniform float dotProdMult;
uniform float noiseMag;
uniform float noiseSize;
uniform float speed;

vec3 get3DPosition(vec2 position) {
  float z1 = snoise2(position * noiseSize * 0.01 + vec2(speed * tick / 500.0)) * noiseMag / 100.0;
  float z2 = snoise2(position * noiseSize * 0.01 + vec2(1000.0 + speed * tick / 500.0)) * noiseMag / 40.0;
  return vec3(position, (z1 + z2) / 2.0);
}

vec3 getNormal(vec3 pt1, vec3 pt2, vec3 pt3) {
  vec3 normal = cross(pt1 - pt2, pt2 - pt3);
  return normalize(normal);
}

void main() {
  vec3 computedPosition = get3DPosition(position);
  vec3 normal = getNormal(computedPosition, get3DPosition(adjacentPositionA), get3DPosition(adjacentPositionB));
  vec3 computedColor = color * colorVariance + baseColor;
  vec3 currentLightSource = lightSource;
  vec3 lightDirection = normalize(currentLightSource - computedPosition);
  float dotProduct = max(dot(normal, lightDirection * -1.0), 0.0);
  float mult = pow(1.0 - dotProduct, dotProdMult);
  float lightenPerc = pow(max(0.2, mult), 0.95) * reflectionMult;
  fragColor = vec4(computedColor * lightenPerc + 0.1, 1.0);
  gl_Position = projection * view * vec4(computedPosition, 1.0);
}
