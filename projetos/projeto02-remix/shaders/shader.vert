uniform mat4 mModelView;
uniform mat4 mProjection;
uniform mat3 mNormals;

attribute vec4 vPosition;
attribute vec3 vNormal;

varying vec3 fNormal;
varying vec3 fPosition;
varying vec3 oPos; // object space, for the green hills checker pattern

void main() {
    vec4 p = mModelView * vPosition;
    fPosition = p.xyz;
    oPos = vPosition.xyz;
    fNormal = mNormals * vNormal;
    gl_Position = mProjection * p;
}
