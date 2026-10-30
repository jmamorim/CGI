precision highp float;
// xy = grid point, z = 0 for the segment origin, 1 for the end displaced by the field
attribute vec3 vPosition;
uniform float table_height, table_width;
varying vec4 fcolor;
const int MAX_CHARGES=20;
uniform vec2 uPosition[MAX_CHARGES];
uniform float values[MAX_CHARGES];
uniform int nCharges;
uniform float alpha;

#define TWOPI 6.28318530718
#define MAX_LENGTH 0.25

// convert angle to hue; returns RGB
// colors corresponding to (angle mod TWOPI):
// 0=red, PI/2=yellow-green, PI=cyan, -PI/2=purple
vec3 angle_to_hue(float angle) {
  angle /= TWOPI;
  return clamp((abs(fract(angle+vec3(3.0, 2.0, 1.0)/3.0)*6.0-3.0)-1.0), 0.0, 1.0);
}

vec4 colorize(vec2 f)
{
    float a = atan(f.y, f.x);
    return vec4(angle_to_hue(a-TWOPI), 1.);
}

// E = sum k*q*(p-c)/|p-c|^3, with k*q folded into values[i]
vec2 field(vec2 p)
{
    vec2 e = vec2(0.0);
    for(int i = 0; i < MAX_CHARGES; i++) {
        if(i >= nCharges) break;
        vec2 d = p - uPosition[i];
        float r = length(d);
        if(r > 0.0)
            e += values[i] * d / (r*r*r);
    }
    return e;
}

void main()
{
    vec2 p = vPosition.xy;
    vec2 e = field(p);
    float len = length(e);
    if(len > MAX_LENGTH)
        e *= MAX_LENGTH / len;

    p += vPosition.z * e;
    gl_Position = vec4(p / vec2(table_width/2.0, table_height/2.0), 0.0, 1.0);
    // dim tail, bright tip, so each segment reads as an arrow
    fcolor = colorize(e) * vec4(1.0, 1.0, 1.0, alpha * mix(0.15, 1.0, vPosition.z));
}
