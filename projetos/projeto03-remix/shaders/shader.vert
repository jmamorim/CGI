attribute vec4 vPosition;
attribute vec4 vNormal;

uniform mat4 mProjection;
uniform mat4 mModelView;
uniform mat4 mNormals;

varying vec3 fNormal;
varying vec3 fViewer;
varying vec3 p;
varying vec3 oPos; // object space position, for the floor's checker pattern

void main()
{
    p = (mModelView * vPosition).xyz;

    fViewer = -p;

    fNormal = (mNormals * vec4(vNormal.xyz, 0.0)).xyz;

    oPos = vPosition.xyz;

    gl_Position = mProjection * vec4(p, 1.0);
}
