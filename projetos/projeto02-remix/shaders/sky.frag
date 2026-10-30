precision highp float;
uniform vec3 horizon;
uniform vec3 zenith;
varying float height;

void main() {
    gl_FragColor = vec4(mix(horizon, zenith, pow(height, 0.8)), 1.0);
}
