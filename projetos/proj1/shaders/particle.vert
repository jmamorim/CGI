precision highp float;
// xy = position, zw = step taken this frame
attribute vec4 vPosition;
uniform float table_height, table_width;
varying vec4 fcolor;

#define TWOPI 6.28318530718

vec3 angle_to_hue(float angle) {
  angle /= TWOPI;
  return clamp((abs(fract(angle+vec3(3.0, 2.0, 1.0)/3.0)*6.0-3.0)-1.0), 0.0, 1.0);
}

void main()
{
    gl_Position = vec4(vPosition.xy / vec2(table_width/2.0, table_height/2.0), 0.0, 1.0);
    float speed = min(length(vPosition.zw) * 120.0, 1.0);
    vec3 hue = angle_to_hue(atan(vPosition.w, vPosition.z) - TWOPI);
    fcolor = vec4(mix(hue, vec3(1.0), 0.25) * (0.15 + 0.45 * speed), 1.0);
}
