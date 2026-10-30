precision highp float;

uniform vec4 color;
uniform float emissive;     // 0 = lit normally, 1 = glows with its own color
uniform float shadowPass;   // 1 while drawing the projected shadows
uniform float orthographic; // view direction is constant in the ortho views
uniform vec3 lightDir;      // view space, pointing towards the sun
uniform vec3 upDir;         // world up in view space, for the sky/ground ambient
uniform vec3 fogColor;
uniform float fogDensity;
uniform float pattern;      // 1 = checkered soil with a grass cap above grassLine
uniform vec3 checkFreq;     // checks per object-space unit, per axis
uniform float grassLine;

varying vec3 fNormal;
varying vec3 fPosition;
varying vec3 oPos;

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

    vec3 base = color.rgb;
    if(pattern > 0.5) {
        vec3 cell = floor(oPos * checkFreq);
        float c = mod(cell.x + cell.y + cell.z, 2.0);
        base = oPos.y > grassLine ? mix(vec3(0.2, 0.62, 0.14), vec3(0.3, 0.75, 0.2), c)
                                  : mix(vec3(0.5, 0.27, 0.1), vec3(0.72, 0.43, 0.17), c);
    }

    vec3 lit = base * (ambient + diffuse * sun) + specular * sun;
    vec3 col = mix(lit, base * 1.6, emissive);

    float d = length(fPosition) * fogDensity;
    col = mix(col, fogColor, (1.0 - exp(-d * d)) * (1.0 - emissive * 0.5));

    gl_FragColor = vec4(col, color.a);
}
