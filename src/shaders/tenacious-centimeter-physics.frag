precision mediump float;

uniform sampler2D currParticleState;
uniform sampler2D prevParticleState;
uniform float tick;
uniform float speed;
uniform float pullStrength;

varying vec2 particleTextureIndex;

float rand(vec2 co){
  return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453);
}

void main() {
  vec4 currState = texture2D(currParticleState, particleTextureIndex);
  vec3 currPosition = currState.xyz;
  vec3 prevPosition = texture2D(prevParticleState, particleTextureIndex).xyz;

  if (prevPosition == currPosition || prevPosition == vec3(0.0, 0.0, 0.0)) {
    vec3 randVelocity = vec3(rand(currPosition.xy), rand(currPosition.yz * 3.0), rand(currPosition.zx * 2.0)) * speed;
    prevPosition = randVelocity + currPosition;
  }

  vec3 velocity = currPosition - prevPosition;

  vec3 center = vec3(0.0, 0.0, 0.0) + vec3(cos(tick / 145.0 + 20.0), sin(tick / 300.0), sin(tick / 300.0 + 10.0));
  float dist = distance(center, currPosition);
  vec3 pull = (center - currPosition) * pow(1.0 - dist, pullStrength) * speed;

  vec3 center2 = vec3(0.0, 0.0, 0.0) + 0.2 * vec3(sin(tick / 145.0 + 200.0), -cos(tick / 100.0 + 20.0), sin(tick / 200.0 + 1.0));
  float dist2 = distance(center2, currPosition);
  vec3 pull2 = (center2 - currPosition) * pow(1.0 - dist2, pullStrength) * speed;

  vec3 center3 = vec3(0.0, 0.0, 0.0) + 0.5 * vec3(cos(tick / 55.0 + 300.0), -cos(tick / 10.0 + 50.0), sin(tick / 230.0) + 2.0);
  float dist3 = distance(center3, currPosition);
  vec3 pull3 = (center3 - currPosition) * pow(1.0 - dist3, pullStrength) * speed;

  vec3 pull4 = vec3(0.0, -0.00002, 0.0);

  velocity = velocity + pull + pull2 + pull3 + pull4;
  velocity = velocity * 0.998;

  vec3 position = currPosition + velocity;

  // we store the new position as the color in this frame buffer
  gl_FragColor = vec4(position, 0.0);
}
