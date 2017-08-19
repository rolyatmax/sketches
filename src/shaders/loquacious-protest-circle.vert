attribute float angle;

varying vec4 fragColor;

uniform mat4 projection;
uniform mat4 view;
uniform vec3 center;

void main() {
  float size = 0.2;
  float radians = 3.1415 * angle * 2.0;
  vec3 position = vec3(cos(radians), sin(radians), 0.0) * size + center;
  fragColor = vec4(5.0, 3.0, 8.0, 0.9);
  gl_Position = projection * view * vec4(position, 1.0);
}
