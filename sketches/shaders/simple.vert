attribute vec3 position;
attribute vec4 color;

varying vec4 fragColor;

uniform mat4 projection;
uniform mat4 view;

void main() {
  fragColor = color;
  gl_Position = projection * view * vec4(position, 1.0);
}
