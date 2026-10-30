precision highp float;
varying float charge;
varying float highlight;
uniform float time;

#define CORE (1.0/3.0)

void main()
{
    // gl_PointCoord in [0,1]^2 -> centered in [-1,1]^2
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    p.y = -p.y;
    float r = length(p);
    if(r > 1.0) discard;

    vec3 base = charge > 0.0 ? vec3(1.0, 0.15, 0.2) : vec3(0.1, 1.0, 0.45);

    // output is premultiplied: glow adds light, the core is opaque
    if(r > CORE) {
        float g = 1.0 - (r - CORE) / (1.0 - CORE);
        g = g * g * (0.45 + 0.15 * sin(time * 0.003 + charge) + 0.3 * highlight);
        gl_FragColor = vec4(base * g, g);
        return;
    }

    vec2 q = p / CORE;
    // "+" for positive charges, "-" for negative ones, drawn in white on the disc
    bool horizontal = abs(q.y) < 0.15 && abs(q.x) < 0.6;
    bool vertical = abs(q.x) < 0.15 && abs(q.y) < 0.6;
    bool sign = horizontal || (charge > 0.0 && vertical);
    float rim = smoothstep(0.8, 1.0, length(q)) * highlight;

    vec3 col = sign ? vec3(1.0) : base * (1.1 - 0.4 * length(q));
    gl_FragColor = vec4(mix(col, vec3(1.0), rim), 1.0);
}
