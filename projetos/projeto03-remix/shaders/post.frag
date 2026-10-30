precision mediump float;

varying vec2 uv;

uniform sampler2D uTex;
uniform sampler2D uBloom;
uniform int uPass;          // 0 bright pass, 1 blur, 2 composite
uniform vec2 uDir;          // blur step in texture space
uniform float uThreshold;
uniform float uStrength;
uniform float uAberration;

void main()
{
    if(uPass == 0) {
        vec3 c = texture2D(uTex, uv).rgb;
        float b = max(c.r, max(c.g, c.b));
        gl_FragColor = vec4(c * smoothstep(uThreshold, 1.0, b), 1.0);
    }
    else if(uPass == 1) {
        // 9-tap gaussian folded into 5 linear samples
        vec3 s = texture2D(uTex, uv).rgb * 0.2270270;
        s += (texture2D(uTex, uv + uDir*1.3846154).rgb + texture2D(uTex, uv - uDir*1.3846154).rgb) * 0.3162162;
        s += (texture2D(uTex, uv + uDir*3.2307692).rgb + texture2D(uTex, uv - uDir*3.2307692).rgb) * 0.0702703;
        gl_FragColor = vec4(s, 1.0);
    }
    else {
        vec2 o = (uv - 0.5) * uAberration;
        vec3 c = vec3(texture2D(uTex, uv + o).r, texture2D(uTex, uv).g, texture2D(uTex, uv - o).b);
        gl_FragColor = vec4(c + texture2D(uBloom, uv).rgb * uStrength, 1.0);
    }
}
