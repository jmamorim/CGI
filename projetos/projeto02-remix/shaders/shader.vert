uniform mat4 mModelView;
uniform mat4 mProjection;
uniform mat3 mNormals;

attribute vec4 vPosition;
attribute vec3 vNormal;

varying vec3 fNormal;
varying vec3 fPosition;

void main() {
    vec4 p = mModelView * vPosition;
    fPosition = p.xyz;
    fNormal = mNormals * vNormal;
    gl_Position = mProjection * p;
}
