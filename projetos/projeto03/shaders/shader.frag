precision mediump float;

uniform mat4 mView;
uniform mat4 mViewNormals;

varying vec3 fNormal;
varying vec3 fViewer;
varying vec3 p;


const int MAX_LIGHTS = 8;

struct LightInfo {
    vec4 pos;
    vec3 Ia;
    vec3 Id;
    vec3 Is;
    bool isDirectional;
    bool isActive;
};

struct MaterialInfo {
    vec3 Ka;
    vec3 Kd;
    vec3 Ks;
    float shininess;
};

//uniform int uNLights; // Effective number of lights used

uniform LightInfo uLight[MAX_LIGHTS]; // The array of lights present in the scene
uniform MaterialInfo uMaterial;  // The material of the object being drawn

void main()
{        
    vec4 I = vec4(0,0,0,1.0);
    for(int i = 0 ; i < MAX_LIGHTS ; i++){            
        if(uLight[i].isActive){
            vec3 ambientColor = uLight[i].Ia/255.0 * uMaterial.Ka/255.0;
            vec3 diffuseColor = uLight[i].Id/255.0 * uMaterial.Kd/255.0;
            vec3 specularColor = uLight[i].Is/255.0 * uMaterial.Ks/255.0;
            vec3 N = normalize(fNormal);
            vec3 V = normalize(fViewer);
            vec3 L;

            if(uLight[i].isDirectional){
                L = normalize((mViewNormals*uLight[i].pos).xyz);
            }
            else{
                L = normalize((mView*uLight[i].pos).xyz - p);
            }
            vec3 R = reflect(-L,N);

            float diffuseFactor = max( dot(N,L), 0.0 );
            vec3 diffuse = diffuseFactor * diffuseColor;

            float specularFactor = pow(max(dot(R,V), 0.0), uMaterial.shininess);
            vec3 specular = specularFactor * specularColor;
            if( dot(R,V) < 0.0 ) {
                specular = vec3(0.0, 0.0, 0.0);
            }
            I +=  vec4(ambientColor + diffuse + specular, 1.0);
        }
        else{
            I += vec4(0,0,0,1.0);
        }
    }
    gl_FragColor = I;
}