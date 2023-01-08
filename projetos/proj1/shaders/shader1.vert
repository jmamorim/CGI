precision highp float;
attribute vec4 vPosition;
uniform float table_height, table_width;
varying vec4 fcolor;
const int MAX_CHARGES=20;
uniform vec2 uPosition[MAX_CHARGES];
uniform float values[MAX_CHARGES];

#define TWOPI 6.28318530718

// convert angle to hue; returns RGB
// colors corresponding to (angle mod TWOPI):
// 0=red, PI/2=yellow-green, PI=cyan, -PI/2=purple
vec3 angle_to_hue(float angle) {
  angle /= TWOPI;
  return clamp((abs(fract(angle+vec3(3.0, 2.0, 1.0)/3.0)*6.0-3.0)-1.0), 0.0, 1.0);
}

vec3 hsv2rgb(vec3 c)
{
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec4 colorize(vec2 f)
{
    float a = atan(f.y, f.x);
    return vec4(angle_to_hue(a-TWOPI), 1.);
}

void main()
{
    gl_PointSize = 4.0;
    gl_Position = vPosition / vec4(vec2(table_width/2.0, table_height/2.0), 1.0, 1.0);
    fcolor = colorize(vec2(vPosition.x, vPosition.y));
}


