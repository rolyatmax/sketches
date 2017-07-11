attribute vec3 position;
attribute vec4 color;
attribute float randSeed;
attribute float pointSize;

varying vec4 fragColor;

uniform mat4 projection;
uniform mat4 view;

// uniform float pointSize;
uniform float tick;

void main() {
  vec3 newPosition = vec3(position.xy, sin((randSeed * 10000.0 + tick) / 150.0) * 30.0);
  // vec3 newPosition = position.xyz;
  fragColor = color;
  gl_PointSize = pointSize;
  gl_Position = projection * view * vec4(newPosition, 1.0);
}
