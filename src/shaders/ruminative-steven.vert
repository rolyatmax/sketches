attribute vec3 position;
attribute vec3 color;
attribute vec3 normal;

varying vec4 fragColor;

uniform mat4 projection;
uniform mat4 view;
uniform float tick;
uniform vec3 lightSource;
uniform float speed;
uniform float colorVariance;
uniform vec3 baseColor;
uniform float reflectionMult;
uniform float size;
uniform float dotProdMult;

void main() {
  vec3 computedColor = color * colorVariance + baseColor;
  vec3 currentLightSource = sin(tick * speed / 1000.0) * lightSource;
  vec3 lightDirection = currentLightSource - position;
  lightDirection = normalize(lightDirection);
  float dotProduct = abs(dot(lightDirection, normal));
  float mult = pow(1.0 - dotProduct, dotProdMult);
  float lightenPerc = pow(max(0.2, mult), 0.95) * reflectionMult;
  fragColor = vec4(computedColor * lightenPerc + 0.1, 1.0);
  gl_Position = projection * view * vec4(position * size, 1.0);
}
