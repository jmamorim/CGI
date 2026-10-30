precision highp float;
// xy = charge position in world coordinates, z = signed magnitude, w = 1 when hovered
attribute vec4 vPosition;
uniform float table_height, table_width;
uniform float pixel_ratio;
varying float charge;
varying float highlight;

void main()
{
    // the core takes the inner third of the sprite, the rest is glow
    gl_PointSize = (14.0 + 5.0 * abs(vPosition.z)) * 3.0 * pixel_ratio;
    gl_Position = vec4(vPosition.xy / vec2(table_width/2.0, table_height/2.0), 0.0, 1.0);
    charge = vPosition.z;
    highlight = vPosition.w;
}
