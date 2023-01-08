uniform mat4 mModelView;
uniform mat4 mProjection;
uniform vec4 color;

attribute vec4 vPosition;

varying vec4 fcolor;

void main() {
    gl_Position = mProjection * mModelView * vPosition;
    fcolor = color;
}