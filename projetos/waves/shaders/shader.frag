precision highp float;

uniform mat4 mView;
uniform mat4 mViewNormals;
uniform bool uUseNormals;
uniform bool uUseRandom;
uniform vec3 color;

varying vec3 fNormal;
varying vec3 fViewer;
varying vec3 p;

struct LightInfo {
    vec4 pos;
    vec3 Ia;
    vec3 Id;
    vec3 Is;
    bool isDirectional;
};

struct MaterialInfo {
    vec3 Ka;
    vec3 Kd;
    vec3 Ks;
    float shininess;
};

uniform LightInfo ulight; // The array of lights present in the scene
uniform MaterialInfo umaterial;  // The material of the object being drawn

void main() {
    vec3 c = vec3(1.0, 1.0, 1.0);
    
    if(uUseNormals){ 
        c = 0.5 *(fNormal + vec3(1.0, 1.0, 1.0));
        gl_FragColor = vec4(c, 1.0);
    }

    else if(uUseRandom){
        gl_FragColor = vec4(color, 1.0);
    }

    else{
            vec4 I = vec4(0,0,0,1.0);

            vec3 ambientColor = ulight.Ia/255.0 * umaterial.Ka/255.0;
            vec3 diffuseColor = ulight.Id/255.0 * umaterial.Kd/255.0;
            vec3 specularColor = ulight.Is/255.0 * umaterial.Ks/255.0;
            vec3 N = normalize(fNormal);
            vec3 V = normalize(fViewer);
            vec3 L;

            if(ulight.isDirectional){
                L = normalize((mViewNormals*ulight.pos).xyz);
            }
            else{
                L = normalize((mView*ulight.pos).xyz - p);
            }
            vec3 R = reflect(-L,N);

            float diffuseFactor = max( dot(N,L), 0.0 );
            vec3 diffuse = diffuseFactor * diffuseColor;

            float specularFactor = pow(max(dot(R,V), 0.0), umaterial.shininess);
            vec3 specular = specularFactor * specularColor;
            if( dot(R,V) < 0.0 ) {
                specular = vec3(0.0, 0.0, 0.0);
            }
            gl_FragColor =  vec4(ambientColor + diffuse + specular, 1.0);
    }

}