module.exports = `
precision highp float;

float hue2rgb(float f1, float f2, float hue) {
  if (hue < 0.0)
    hue += 1.0;
  else if (hue > 1.0)
    hue -= 1.0;
  float res;
  if ((6.0 * hue) < 1.0)
    res = f1 + (f2 - f1) * 6.0 * hue;
  else if ((2.0 * hue) < 1.0)
    res = f2;
  else if ((3.0 * hue) < 2.0)
    res = f1 + (f2 - f1) * ((2.0 / 3.0) - hue) * 6.0;
  else
    res = f1;
  return res;
}

vec3 hsl2rgb(vec3 hsl) {
  vec3 rgb;
  if (hsl.y == 0.0) {
    rgb = vec3(hsl.z); // Luminance
  } else {
    float f2;
    if (hsl.z < 0.5) {
      f2 = hsl.z * (1.0 + hsl.y);
    } else {
      f2 = hsl.z + hsl.y - hsl.y * hsl.z;
    }
    float f1 = 2.0 * hsl.z - f2;
    rgb.r = hue2rgb(f1, f2, hsl.x + (1.0/3.0));
    rgb.g = hue2rgb(f1, f2, hsl.x);
    rgb.b = hue2rgb(f1, f2, hsl.x - (1.0/3.0));
  }
  return rgb;
}

vec3 rgb2hsl( in vec3 c ){
  float h = 0.0;
  float s = 0.0;
  float l = 0.0;
  float r = c.r;
  float g = c.g;
  float b = c.b;
  float cMin = min( r, min( g, b ) );
  float cMax = max( r, max( g, b ) );

  l = ( cMax + cMin ) / 2.0;
  if ( cMax > cMin ) {
    float cDelta = cMax - cMin;
        
        //s = l < .05 ? cDelta / ( cMax + cMin ) : cDelta / ( 2.0 - ( cMax + cMin ) ); Original
    s = l < .0 ? cDelta / ( cMax + cMin ) : cDelta / ( 2.0 - ( cMax + cMin ) );
        
    if ( r == cMax ) {
      h = ( g - b ) / cDelta;
    } else if ( g == cMax ) {
      h = 2.0 + ( b - r ) / cDelta;
    } else {
      h = 4.0 + ( r - g ) / cDelta;
    }

    if ( h < 0.0) {
      h += 6.0;
    }
    h = h / 6.0;
  }
  return vec3( h, s, l );
}
`
