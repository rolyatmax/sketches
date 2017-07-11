precision highp float;

varying vec3 fragColor;
varying float distanceFromCamera;

void main() {
  gl_FragColor = vec4(fragColor, 1.0);
}
