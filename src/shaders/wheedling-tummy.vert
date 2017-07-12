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
  vec3 center = vec3(0, 0, 0);
  float horizontalDistanceFromCenter = distance(center.xy, position.xy);
  float amplitude = pow(250.0 / horizontalDistanceFromCenter, 3.0);
  float z = sin((randSeed * 10000.0 + tick) / 150.0) * amplitude;
  vec3 newPosition = vec3(position.xy, z);
  // vec3 newPosition = position.xyz;
  float distanceFromCenter = distance(center, newPosition);
  float alpha = pow(25.0 / distanceFromCenter, 1.5);
  vec4 newColor = vec4(color.xyz, alpha);
  fragColor = newColor;
  gl_PointSize = pointSize;
  gl_Position = projection * view * vec4(newPosition, 1.0);
}
