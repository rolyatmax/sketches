attribute vec2 position;

varying vec4 fragColor;

uniform vec2 center;
uniform float radius;
uniform vec4 color;
uniform float start;
uniform float duration;
uniform float areaSize;
uniform mat4 projection;
uniform mat4 view;
uniform float time;

void main() {
  float alpha = 0.0;
  float end = start + duration;
  vec4 glPosition = vec4(0.0, 0.0, 0.0, 0.0);
  if (time > start && time < end) {
    float middle = start + duration / 2.0;
    if (time < middle) {
      alpha = smoothstep(start, middle, time);
    } else {
      alpha = (1.0 - smoothstep(middle, end, time));
    }
    float radiusMultiplier = smoothstep(start, end, time) * 40.0;
    vec2 c = center * areaSize;
    vec2 p = vec2(
      position.x * radius * radiusMultiplier + c.x,
      position.y * radius * radiusMultiplier + c.y
    );
    glPosition = projection * view * vec4(p, 0.0, 1.0);
    float z = 1.0 - smoothstep(start, end, time);
    glPosition = vec4(glPosition.xy, z, glPosition.w);
  }
  fragColor = vec4(color.rgb, alpha);
  gl_Position = glPosition;
}
