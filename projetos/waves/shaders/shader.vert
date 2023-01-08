attribute vec4 vPosition;
attribute vec4 vNormal;

uniform mat4 mProjection;
uniform mat4 mModelView;
uniform mat4 mNormals;
uniform mat4 mView;
uniform bool uUseNormals;

varying vec3 fNormal;
varying vec3 fLight; 
varying vec3 fViewer;
varying vec3 p;


void main() {
    if(uUseNormals){
        gl_Position = mProjection * mModelView * vPosition;
        fNormal = (mNormals * vec4(vNormal)).xyz;
    }
    else{
        p = (mModelView * vPosition).xyz;

        fViewer = -p;

        fNormal = (mNormals * vNormal).xyz;

        gl_Position = mProjection * mModelView * vPosition;
    }
}