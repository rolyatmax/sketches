attribute vec3 position;
attribute vec3 adjacentPositionA;
attribute vec3 adjacentPositionB;
attribute float isBase;
attribute float adjacentIsBaseA;
attribute float adjacentIsBaseB;

varying vec4 fragColor;

uniform mat4 projection;
uniform mat4 view;
uniform vec3 lightSource;
uniform float tick;
uniform float tileHeight;

vec3 getNormal(vec3 pt1, vec3 pt2, vec3 pt3) {
  vec3 normal = cross(pt1 - pt2, pt2 - pt3);
  return normalize(normal);
}

vec3 getPosition(vec3 position, float isBase) {
  float z;
  if (isBase == 0.0) {
    z = sin(position.z * tileHeight + tick / 200.0) * 0.1 + 0.02;
    z = clamp(z, 0.0, 1.0);
  } else {
    z = 0.0;
  }
  return vec3(position.xy, z);
}

void main() {
  vec3 computedPosition = getPosition(position, isBase);
  vec3 computedAdjacentA = getPosition(adjacentPositionA, adjacentIsBaseA);
  vec3 computedAdjacentB = getPosition(adjacentPositionB, adjacentIsBaseB);
  // if all zs are 0, let's throw this triangle away
  if (computedPosition.z == 0.0 && computedAdjacentA.z == 0.0 && computedAdjacentB.z == 0.0) {
    computedPosition = vec3(0);
  }

  vec3 normal = getNormal(computedPosition, computedAdjacentA, computedAdjacentB);
  vec3 lightDirection = normalize(lightSource - position);

  // do something with the dotProduct to figure out shading
  vec3 color = vec3(0.95, 0.95, 0.95);
  if (abs(normal.z) < 0.0001) {
    vec3 blue = vec3(0.67, 0.76, 0.9);
    // vec3 green = vec3(0.52, 0.8, 0.56);
    vec3 purple = vec3(0.55, 0.51, 0.8);
    vec3 white = vec3(0.95);
    float a = smoothstep(0.0, 1.0, abs(dot(vec2(0, 1), normal.xy)));
    color = mix(purple, blue, a);
    color = mix(color, white, computedPosition.z / 0.5);
  }
  fragColor = vec4(color, 1.0);
  gl_Position = projection * view * vec4(computedPosition, 1.0);
}
