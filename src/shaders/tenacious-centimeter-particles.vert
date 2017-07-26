precision mediump float;

attribute vec2 particleTextureIndex;
uniform sampler2D particleState;
uniform sampler2D prevState;
uniform mat4 projection;
uniform mat4 view;
uniform float excitability;

varying vec3 fragColor;

uniform float pointWidth;

void main() {
  vec3 position = texture2D(particleState, particleTextureIndex).xyz;
  vec3 prev = texture2D(prevState, particleTextureIndex).xyz;

  vec3 velocity = position - prev;
  float velLeng = length(velocity);

  fragColor = vec3(abs(particleTextureIndex) * velLeng / excitability / 10.0, 1.0);

  gl_PointSize = max(0.5, pointWidth * velLeng * 10.0);
  gl_Position = projection * view * vec4(position, 1.0);
}
