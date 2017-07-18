attribute vec2 position;

varying vec4 glPosition;

void main() {
  glPosition = vec4(position, 0.0, 1.0);
  gl_Position = glPosition;
}
