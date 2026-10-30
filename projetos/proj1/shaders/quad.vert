precision highp float;
attribute vec2 vPosition;
varying vec2 uv;

void main()
{
    uv = vPosition * 0.5 + 0.5;
    gl_Position = vec4(vPosition, 0.0, 1.0);
}
