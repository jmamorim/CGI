
attribute vec4 vPosition;
attribute vec4 vNormal;

uniform mat4 mProjection;
uniform mat4 mModelView;
uniform mat4 mNormals;
uniform mat4 mView;

varying vec3 fNormal;
varying vec3 fLight; 
varying vec3 fViewer;
varying vec3 p;

void main()
{
    p = (mModelView * vPosition).xyz;

    fViewer = -p;

    fNormal = (mNormals * vNormal).xyz;

    gl_Position = mProjection * mModelView * vPosition;
}