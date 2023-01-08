precision highp float;
attribute vec4 vPosition;
uniform float theta;
varying vec4 fcolor;
attribute float charge;


void main()
{
    gl_PointSize = 10.0; 
    float s = sin( theta );
    float c = cos( theta );
    if(charge == 1.0)
     {
    gl_Position.x = -s * vPosition.y + c * vPosition.x;
    gl_Position.y = s * vPosition.x + c * vPosition.y;
    gl_Position.z = 0.0;
    gl_Position.w = 1.0;
    fcolor =  vec4(1.0, 0.0, 0.0, 1.0);
    }
    else{
    gl_Position.x = s * vPosition.y + c * vPosition.x;
    gl_Position.y = -s * vPosition.x + c * vPosition.y;
    gl_Position.z = 0.0;
    gl_Position.w = 1.0;
    fcolor =  vec4(0.0, 1.0, 0.0, 1.0);
    }
}
