// so much credit to Íñigo Quílez
// http://www.iquilezles.org/www/articles/spherefunctions/spherefunctions.htm

const css = require('dom-css')
const glsl = require('glslify')
const createRegl = require('regl')
import includeFont from './common/include-font'
import addTitle from './common/add-title'

title('strident-jasmine', '#fff')

const regl = createRegl()

const render = regl({
  vert: glsl`
    precision highp float;
    attribute vec2 aPosition;
    void main() {
      gl_Position = vec4(aPosition, 0, 1);
    }
  `,
  frag: glsl`
    precision mediump float;
    uniform vec2 uResolution;
    uniform float uTime;

    float sphIntersect(in vec3 ro, in vec3 rd, in vec4 sph) {
      vec3 oc = ro - sph.xyz;
      float b = dot( oc, rd );
      float c = dot( oc, oc ) - sph.w*sph.w;
      float h = b*b - c;
      if( h<0.0 ) return -1.0;
      return -b - sqrt( h );
    }

    vec3 getColorForSphere(in vec4 spherePos, in vec3 ro, in vec3 rd, in vec2 uv, in vec3 lo) {
      float dToSphere = sphIntersect(ro, rd, spherePos);
      vec3 pos = rd * dToSphere + ro;
      // vec3 color = vec3(
      //   uv * 0.2 + vec2(0.3) * (pos.xy / 2.0 + 0.5),
      //   (sin(uTime / 10.0) / 2.0 + 0.5) * 0.8 + 0.2);
      // color += vec3(0.5);
      vec3 color = vec3(0.9);

      vec3 ld = normalize(pos - lo);
      vec3 normal = normalize(pos - spherePos.xyz);
      float j = 1.0 - dot(ld, normal);
      color *= 0.55 + 0.3 * j;
      return color;
    }

    float sphOcclusion( in vec3 pos, in vec3 nor, in vec4 sph ) {
      vec3  r = sph.xyz - pos;
      float l = length(r);
      float d = dot(nor,r);
      float res = d;
      if( d<sph.w ) res = pow(clamp((d+sph.w)/(2.0*sph.w),0.0,1.0),2.5)*sph.w;
      return clamp( res*(sph.w*sph.w)/(l*l*l), 0.0, 1.0 );
    }

    vec4 processSphere(in vec3 sph, in vec3 ro, in vec3 rd, in vec2 uv, in vec3 lo, vec3 color, float dMin, in vec3 otherSph, in vec3 otherOtherSph, in vec3 otherOtherOtherSph) {
      vec3 p = vec3(1.3, -2, -1.3);
      vec4 spherePos = vec4(cos(uTime + sph) * p, 1);
      vec4 otherSpherePos = vec4(cos(uTime + otherSph) * p, 1);
      vec4 otherOtherSpherePos = vec4(cos(uTime + otherOtherSph) * p, 1);
      vec4 otherOtherOtherSpherePos = vec4(cos(uTime + otherOtherOtherSph) * p, 1);
      float d = sphIntersect(ro, rd, spherePos);
      vec3 c = color;
      if (d > 0.0 && d < dMin) {
        dMin = d;
        vec3 pos = rd * d + ro;
        vec3 ld = normalize(pos - lo);
        vec3 normal = normalize(pos - spherePos.xyz);
        float occ = sphOcclusion(pos, normal, otherSpherePos);
        float occ2 = sphOcclusion(pos, normal, otherOtherSpherePos);
        float occ3 = sphOcclusion(pos, normal, otherOtherOtherSpherePos);
        c = getColorForSphere(spherePos, ro, rd, uv, lo);
        c *= 1.0 - occ;
        c *= 1.0 - occ2;
        c *= 1.0 - occ3;
      }
      return vec4(c, dMin);
    }

    float planeSphOcclusion(in vec3 pos, in vec3 nor, in vec4 sph) {
      vec3  di = sph.xyz - pos;
      float l  = length(di);
      float nl = dot(nor,di/l);
      float h  = l/sph.w;
      float h2 = h*h;
      float k2 = 1.0 - h2*nl*nl;
  
      // above/below horizon: Quilez - http://iquilezles.org/www/articles/sphereao/sphereao.htm
      float res = max(0.0,nl)/h2;
      // intersecting horizon: Lagarde/de Rousiers - http://www.frostbite.com/wp-content/uploads/2014/11/course_notes_moving_frostbite_to_pbr.pdf
      if (k2 > 0.0) {
        #if 1
          res = nl*acos(-nl*sqrt( (h2-1.0)/(1.0-nl*nl) )) - sqrt(k2*(h2-1.0));
          res = res/h2 + atan( sqrt(k2/(h2-1.0)));
          res /= 3.141593;
        #else
          // cheap approximation: Quilez
          res = pow( clamp(0.5*(nl*h+1.0)/h2,0.0,1.0), 1.5 );
        #endif
      }
      return res;
    }

    float planeIntersect(in vec3 ro, in vec3 rd) {
      vec3 normal = vec3(0, 1, 0);
      float dist = 3.0; // -1.0 * dot(normal, vec3(2, 0, 0));
      float denom = dot(rd, normal);
      if (denom != 0.0) {
        float t = -1.0 * (dot(ro, normal) + dist) / denom;
        if (t < 0.0) return -1.0;
        return t;
      } else if (dot(normal, ro) + dist == 0.0) {
        return 0.0;
      } else {
        return -1.0;
      }
    }

    // this doesn't seem to be workinggggg
    vec4 processPlane(in vec3 ro, in vec3 rd, vec3 color, float dMin, in vec3 sph, in vec3 otherSph, in vec3 otherOtherSph, in vec3 otherOtherOtherSph) {
      float d = planeIntersect(ro, rd);
      vec3 c = color;
      if (d > 0.0 && d < dMin) {
        dMin = d;
        vec3 pos = rd * d + ro;

        vec3 p = vec3(1.3, -2, -1.3);
        vec4 spherePos = vec4(cos(uTime + sph) * p, 1);
        vec4 otherSpherePos = vec4(cos(uTime + otherSph) * p, 1);
        vec4 otherOtherSpherePos = vec4(cos(uTime + otherOtherSph) * p, 1);
        vec4 otherOtherOtherSpherePos = vec4(cos(uTime + otherOtherOtherSph) * p, 1);
        vec3 nor = normalize(vec3(3, 3, 0));

        float occ1 = planeSphOcclusion(pos, nor, spherePos);
        float occ2 = planeSphOcclusion(pos, nor, otherSpherePos);
        float occ3 = planeSphOcclusion(pos, nor, otherOtherSpherePos);
        float occ4 = planeSphOcclusion(pos, nor, otherOtherOtherSpherePos);

        c *= 1.0 - occ1;
        c *= 1.0 - occ2;
        c *= 1.0 - occ3;
        c *= 1.0 - occ4;
      }
      return vec4(c, dMin);
    }

    void main () {
      vec3 lo = sin(uTime) * vec3(3.5, 3.2, 3) + vec3(13);

      vec2 uv = gl_FragCoord.xy / uResolution.xy;
      vec2 p = (gl_FragCoord.xy * 2.0 - uResolution.xy) / uResolution.y;
      vec3 ro = vec3(0, 0, 14);
      vec3 rd = normalize(vec3(p, -2));

      vec3 color = vec3(1);
      float dMin = 99999.0;

      vec3 sphere1 = vec3(1, 1, 1);
      vec3 sphere2 = vec3(-1, 2, -1);
      vec3 sphere3 = vec3(4, 4, -4);
      vec3 sphere4 = vec3(7, -19, -15);

      // vec3 sphere1 = vec3(0.5, 0.5, 0.5);
      // vec3 sphere2 = vec3(-1, 0, -1);
      // vec3 sphere3 = vec3(1, 2, -2);
      // vec3 sphere4 = vec3(2, -5, -1);

      vec4 o = processPlane(ro, rd, color, dMin, sphere1, sphere2, sphere3, sphere4);
      color = o.rgb;
      dMin = o.a;

      o = processSphere(sphere1, ro, rd, uv, lo, color, dMin, sphere2, sphere3, sphere4);
      color = o.rgb;
      dMin = o.a;

      o = processSphere(sphere2, ro, rd, uv, lo, color, dMin, sphere1, sphere3, sphere4);
      color = o.rgb;
      dMin = o.a;

      o = processSphere(sphere3, ro, rd, uv, lo, color, dMin, sphere1, sphere2, sphere4);
      color = o.rgb;
      dMin = o.a;

      o = processSphere(sphere4, ro, rd, uv, lo, color, dMin, sphere1, sphere2, sphere3);
      color = o.rgb;
      dMin = o.a;

      float t = distance(uv, vec2(0.5));
      t = pow(t, 1.3);
      t *= 0.8;
      t -= 0.3;
      color = mix(color, vec3(0.15), clamp(t, 0.0, 1.0));
      gl_FragColor = vec4(color, 1.0);
    }
  `,
  primitive: 'triangles',
  count: 3,
  attributes: {
    aPosition: [-1, -1, -1, 4, 4, -1]
  },
  uniforms: {
    uResolution: ({ viewportWidth, viewportHeight }) => ([ viewportWidth, viewportHeight ]),
    uTime: regl.prop('uTime')
  }
})

regl.frame(function draw (context) {
  render({
    uTime: context.time
  })
})

// ---------- HELPERS ----------------

function title (name, color) {
  includeFont({
    fontFamily: '"Space Mono", sans-serif',
    url: 'https://fonts.googleapis.com/css?family=Space+Mono:700'
  })

  const title = addTitle(name)
  css(title, {
    opacity: 0,
    color: color,
    bottom: '5vh',
    right: '5vh',
    transition: 'opacity 800ms linear',
    zIndex: 10
  })

  document.body.appendChild(title)
  setTimeout(() => {
    css(title, 'opacity', 1)
  }, 200)
}
