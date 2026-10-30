precision mediump float;

uniform vec3 uInner;
uniform vec3 uOuter;
uniform float uAspect;
varying vec2 uv;

void main()
{
    float d = length(uv * vec2(uAspect, 1.0)) / length(vec2(uAspect, 1.0));
    gl_FragColor = vec4(mix(uInner, uOuter, smoothstep(0.0, 1.0, d)), 1.0);
}
