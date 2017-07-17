precision highp float;

uniform mat4 projection;
uniform mat4 view;
uniform vec2 thing;

float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void main() {
  float r = rand(gl_FragCoord.xy);
  float g = rand(gl_FragCoord.xx);
  float b = rand(gl_FragCoord.yx);
  vec3 rgb = vec3(r, g, b);
  float alpha = smoothstep(0.0, 1.5, distance(gl_FragCoord.xy, vec2(0.0, 0.0))) / 2.0 + 0.2;
  if (distance(gl_FragCoord.xy, thing) < 500.5) {
    rgb = vec3(0.0, 0.0, 1.0);
  }
  gl_FragColor = vec4(rgb, pow(alpha, 0.1));
}
