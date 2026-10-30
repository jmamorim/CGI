#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec2 uv;
uniform float table_height, table_width;
const int MAX_CHARGES=20;
uniform vec2 uPosition[MAX_CHARGES];
uniform float values[MAX_CHARGES];
uniform int nCharges;

void main()
{
    vec2 p = (uv - 0.5) * vec2(table_width, table_height);
    float v = 0.0;
    for(int i = 0; i < MAX_CHARGES; i++) {
        if(i >= nCharges) break;
        v += values[i] / max(length(p - uPosition[i]), 0.01);
    }

    // log scale so the contours don't pile up around the charges
    float t = sign(v) * log(1.0 + abs(v) * 20.0);
    float s = 1.0 - exp(-abs(t) * 0.6);
    vec3 col = (v > 0.0 ? vec3(0.45, 0.05, 0.14) : vec3(0.03, 0.22, 0.42)) * s;

    float c = t * 3.0;
    float d = abs(fract(c - 0.5) - 0.5) / max(fwidth(c), 1e-4);
    col += (1.0 - min(d, 1.0)) * (0.06 + 0.2 * s);

    gl_FragColor = vec4(col, 1.0);
}
