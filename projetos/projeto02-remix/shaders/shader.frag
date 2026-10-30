precision highp float;

uniform vec4 color;
uniform float emissive;     // 0 = lit normally, 1 = glows with its own color
uniform float shadowPass;   // 1 while drawing the projected shadows
uniform float orthographic; // view direction is constant in the ortho views
uniform vec3 lightDir;      // view space, pointing towards the sun
uniform vec3 upDir;         // world up in view space, for the sky/ground ambient
uniform vec3 fogColor;
uniform float fogDensity;

varying vec3 fNormal;
varying vec3 fPosition;

void main() {
    if(shadowPass > 0.5) {
        gl_FragColor = vec4(0.0, 0.02, 0.05, 0.4);
        return;
    }

    vec3 N = normalize(fNormal);
    vec3 L = normalize(lightDir);
    vec3 V = orthographic > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(-fPosition);

    vec3 sun = vec3(1.0, 0.95, 0.85);
    vec3 ambient = mix(vec3(0.18, 0.16, 0.12), vec3(0.32, 0.38, 0.5), dot(N, upDir) * 0.5 + 0.5);
    float diffuse = max(dot(N, L), 0.0);
    float specular = pow(max(dot(N, normalize(L + V)), 0.0), 48.0) * 0.35 * step(0.0, diffuse);

    vec3 lit = color.rgb * (ambient + diffuse * sun) + specular * sun;
    vec3 col = mix(lit, color.rgb * 1.6, emissive);

    float d = length(fPosition) * fogDensity;
    col = mix(col, fogColor, (1.0 - exp(-d * d)) * (1.0 - emissive * 0.5));

    gl_FragColor = vec4(col, color.a);
}
