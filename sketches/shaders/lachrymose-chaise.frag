precision highp float;

varying vec4 glPosition;

uniform float elapsed;

void main() {
  float alpha = smoothstep(0.0, 1.0, distance(glPosition.xy, vec2(0.0, 0.0))) / 2.0 - 0.2;
  float power = abs(sin(elapsed / 3000.0) / 4.0) + 0.05;
  gl_FragColor = vec4(0.08, 0.08, 0.08, pow(alpha, power));
}
