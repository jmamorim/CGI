precision mediump float;

uniform mat4 mView;
uniform mat4 mViewNormals;

varying vec3 fNormal;
varying vec3 fViewer;
varying vec3 p;
varying vec3 oPos;


const int MAX_LIGHTS = 8;

struct LightInfo {
    vec4 pos;
    vec3 Ia;
    vec3 Id;
    vec3 Is;
    bool isDirectional;
    bool isActive;
    bool isSpot;
    vec3 axis;       // world space, where the spotlight points
    float aperture;  // degrees
    float cutoff;    // how fast the light fades towards the cone's edge
};

struct MaterialInfo {
    vec3 Ka;
    vec3 Kd;
    vec3 Ks;
    float shininess;
};

uniform LightInfo uLight[MAX_LIGHTS]; // The array of lights present in the scene
uniform MaterialInfo uMaterial;  // The material of the object being drawn

uniform int uShading;     // 0 Phong, 1 Blinn-Phong, 2 toon, 3 normals
uniform bool uRim;        // fresnel rim light
uniform bool uChecker;    // checker pattern (floor)
uniform bool uEmissive;   // draw with uColor and no lighting (light gizmos)
uniform vec3 uColor;
uniform bool uShadow;     // projected shadow pass
uniform float uShadowAlpha;
uniform float uFloorFade;  // how much of the mirror image shows through the floor

void main()
{
    if(uShadow) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, uShadowAlpha);
        return;
    }
    if(uEmissive) {
        gl_FragColor = vec4(uColor/255.0, 1.0);
        return;
    }

    vec3 N = normalize(fNormal);
    vec3 V = normalize(fViewer);

    if(uShading == 3) {
        gl_FragColor = vec4(N*0.5 + 0.5, 1.0);
        return;
    }

    vec3 Kd = uMaterial.Kd;
    if(uChecker) {
        float c = mod(floor(oPos.x*12.0) + floor(oPos.z*12.0), 2.0);
        Kd *= mix(0.7, 1.0, c);
    }

    vec3 I = vec3(0.0);
    vec3 rimLight = vec3(0.0);
    for(int i = 0 ; i < MAX_LIGHTS ; i++){
        if(uLight[i].isActive){
            vec3 ambientColor = uLight[i].Ia/255.0 * uMaterial.Ka/255.0;
            vec3 diffuseColor = uLight[i].Id/255.0 * Kd/255.0;
            vec3 specularColor = uLight[i].Is/255.0 * uMaterial.Ks/255.0;
            vec3 L;

            if(uLight[i].isDirectional){
                L = normalize((mViewNormals*vec4(uLight[i].pos.xyz, 0.0)).xyz);
            }
            else{
                L = normalize((mView*vec4(uLight[i].pos.xyz, 1.0)).xyz - p);
            }

            float spot = 1.0;
            if(uLight[i].isSpot && !uLight[i].isDirectional) {
                vec3 A = normalize((mViewNormals*vec4(uLight[i].axis, 0.0)).xyz);
                float c = dot(-L, A);
                spot = c < cos(radians(uLight[i].aperture)) ? 0.0 : pow(c, uLight[i].cutoff);
            }

            float diffuseFactor = max( dot(N,L), 0.0 );
            float specularFactor;
            if(uShading == 1) {
                vec3 H = normalize(L + V);
                specularFactor = pow(max(dot(N,H), 0.0), uMaterial.shininess);
            }
            else {
                vec3 R = reflect(-L,N);
                specularFactor = pow(max(dot(R,V), 0.0), uMaterial.shininess);
            }
            // a light behind the surface can't make a highlight on it
            if(diffuseFactor <= 0.0) specularFactor = 0.0;

            if(uShading == 2) {
                diffuseFactor = ceil(diffuseFactor*3.0)/3.0;
                specularFactor = step(0.5, specularFactor);
            }

            I += ambientColor + spot*(diffuseFactor*diffuseColor + specularFactor*specularColor);
            rimLight += spot*uLight[i].Id/255.0;
        }
    }

    if(uRim) {
        I += pow(1.0 - max(dot(N,V), 0.0), 3.0) * 0.6 * min(rimLight, vec3(1.0));
    }
    // dark outline where the surface turns away from the viewer
    if(uShading == 2 && dot(N,V) < 0.25) {
        I *= 0.15;
    }
    gl_FragColor = vec4(I, 1.0 - uFloorFade);
}
