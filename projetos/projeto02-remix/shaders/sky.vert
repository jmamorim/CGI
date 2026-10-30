attribute vec2 vPosition;
varying float height;

void main() {
    height = vPosition.y * 0.5 + 0.5;
    gl_Position = vec4(vPosition, 0.999, 1.0);
}
