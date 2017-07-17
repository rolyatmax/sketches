attribute vec2 position;

uniform mat4 projection;
uniform mat4 view;

void main() {
  // gl_Position = vec4(position, 0.0, 1.0);
  gl_Position = projection * view * vec4(position, 0.0, 1.0);
}
