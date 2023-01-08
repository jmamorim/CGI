import { buildProgramFromSources, loadShadersFromURLS, setupWebGL } from "../../libs/utils.js";
import { ortho, lookAt, flatten, rotateX, vec4, translate } from "../../libs/MV.js";
import {modelView, loadMatrix, multRotationY, multScale, multTranslation, popMatrix, pushMatrix, multRotationX, multRotationZ} from "../../libs/stack.js";

import * as SPHERE from '../../libs/sphere.js';
import * as TORUS from '../../libs/torus.js';
import * as CUBE from '../../libs/cube.js';
import * as CYLINDRE from '../../libs/cylinder.js';
import * as PYRAMID from '../../libs/pyramid.js';


/** @type WebGLRenderingContext */
let gl;   
let speed = 2;
let mode;
let color;
let pos;
let rotcanoz;
let rotcanoy;
let rotroda;
let Mview; //lookat(eye, at, up)
let VP_DISTANCE = 4;    
let canvas = document.getElementById("gl-canvas");
let aspect = canvas.width / canvas.height;
let mProjection = ortho(-VP_DISTANCE*aspect,VP_DISTANCE*aspect, -VP_DISTANCE, VP_DISTANCE,-3*VP_DISTANCE,3*VP_DISTANCE);
let balas = [];
let balaspos = [];
let balarotz = [];
let balaroty = [];
let times = [];

const g = -9.8; //acelaraçao gravitica
const torus_raio = 0.7;
const scalewheel = 1/8;
const maxpos = 5.3;
const minpos = -5.6;

function setup(shaders)
{
    gl = setupWebGL(canvas);

    let program = buildProgramFromSources(gl, shaders["shader.vert"], shaders["shader.frag"]);

    color = gl.getUniformLocation(program, "color");

    mode = gl.TRIANGLES; 

    resize_canvas();
    window.addEventListener("resize", resize_canvas);

    gl.clearColor(0.0, 0.5, 1.0, 1.0); 
    CUBE.init(gl);
    TORUS.init(gl);
    SPHERE.init(gl);
    CYLINDRE.init(gl);
    PYRAMID.init(gl);
    gl.enable(gl.DEPTH_TEST); 
   
    
    window.requestAnimationFrame(render);

    pos = 0;
    rotcanoz = 0;
    Mview = lookAt([-1,1,-1], [2,-1,2], [0,1,0]);
    rotcanoy = 0;
    rotroda = 0;

    document.onkeydown = function(event) {
        switch(event.key) {
            case 'ArrowUp':
                if(pos<maxpos){
                    pos += 0.01;
                    rotroda -= 1;
                }
                break;
            case 'ArrowDown':
                if(pos>minpos){
                    pos -= 0.01;
                    rotroda += 1;
                }
                break;
            case '+':
                if(VP_DISTANCE > 1.1){
                    VP_DISTANCE -= 0.1;
                }
                break;
            case '-':
                if(VP_DISTANCE > 1){
                VP_DISTANCE += 0.1;
                }
                break;
            case 'w':
                if(rotcanoz!=45){
                    rotcanoz += 1;
                }
                break;
            case 'W':
                mode = gl.LINES;
                break;
            case 's':
                if(rotcanoz!=0){
                    rotcanoz -= 1;
                }
                break;
            case 'S':
                mode = gl.TRIANGLES;
                break;
            case 'a':
                rotcanoy += 1;
                break;
            case 'd':
                rotcanoy -= 1;
                break;
            case '1':
                Mview = lookAt([0,0,0], [-1,0,0], [0,1,0]);
                break;
            case '2':
                Mview = lookAt([1,1,0], [0,-1,0], [0,1,0]);
                break;
            case '3':
                Mview = lookAt([0,0,0], [0,0,-1], [0,1,0]);
                break;
            case '4':
                Mview = lookAt([-1,1,-1], [2,-1,2], [0,1,0]);
                break;                
            case ' ':
                balas.push(SPHERE);
                balaspos.push(pos);
                balarotz.push(rotcanoz) ;
                balaroty.push(rotcanoy);
                times.push(0.0);
                break;
        }
    }


    function resize_canvas(event)
    {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        aspect = canvas.width / canvas.height;

        gl.viewport(0,0,canvas.width, canvas.height);
        mProjection = ortho(-VP_DISTANCE*aspect,VP_DISTANCE*aspect, -VP_DISTANCE, VP_DISTANCE,-3*VP_DISTANCE,3*VP_DISTANCE);
    }

    function uploadModelView()
    {
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mModelView"), false, flatten(modelView()));
    }

    //draws the floor
    function Tile()
    {
        gl.uniform4fv(color,vec4(0.0,0.5,0.0,1.0));
        for(let z = -30; z < 30 ; z++){
            for(let x = -30; x < 30 ; x++){
                if((z%2 == 0 && x%2 != 0) || (z%2 != 0 && x%2 == 0)){
                    gl.uniform4fv(color,vec4(0.0,0.5,0.0,1.0));
                    pushMatrix();
                        multTranslation([x,0,z]);
                        uploadModelView();
                        CUBE.draw(gl, program, mode);
                    popMatrix();
                }
                else{
                    gl.uniform4fv(color,vec4(0.0,0.7,0.0,1.0));
                    pushMatrix();
                        multTranslation([x,0,z]);
                        uploadModelView();
                        CUBE.draw(gl, program, mode);
                    popMatrix();
                }
            }
        }
    }

    function rightwheels(){     
        for(let x = -3; x < 4; x++){ 
            pushMatrix();
                multScale([1/8,1/8,1/8]);
                multTranslation([x,0,4.5]);
                multRotationX(90);
                multRotationY(2*Math.PI*torus_raio*scalewheel*rotroda);
                uploadModelView();
                gl.uniform4fv(color,vec4(0.0,0.0,0.0,1.0));
                TORUS.draw(gl,program,mode);
                gl.uniform4fv(color,vec4(0.3,0.0,0.0,1.0));
                multScale([1,1/2,1]);
                uploadModelView();
                SPHERE.draw(gl,program,mode);
            popMatrix();
        }
    }

    function leftwheels(){
        for(let x = -3; x < 4; x++){
            pushMatrix();
                multScale([1/8,1/8,1/8]);
                multTranslation([x,0,-4.5]);
                multRotationX(90);
                multRotationY(2*Math.PI*torus_raio*scalewheel*rotroda);
                uploadModelView();
                gl.uniform4fv(color,vec4(0.0,0.0,0.0,1.0));
                TORUS.draw(gl,program,mode);
                gl.uniform4fv(color,vec4(0.3,0.0,0.0,1.0));
                multScale([1,1/2,1]);
                uploadModelView();
                SPHERE.draw(gl,program,mode);
            popMatrix();
        }
    }

    function axis(){
        gl.uniform4fv(color,vec4(0.5,0.5,0.5,1.0)); 
        for(let x = -3; x < 4; x++){
            pushMatrix();
            multScale([1/8,1/8,1.1]);
            multTranslation([x,0,0]);
            multRotationX(90);
            uploadModelView();
            CYLINDRE.draw(gl,program,mode);
            popMatrix();
        }
    }

    function tankbody(){
        gl.uniform4fv(color,vec4(0.0,0.15,0.0,1.0)); 
        pushMatrix();
            multTranslation([0.0,0.21,0.0]);
            multScale([1, 1/10,1.2]);
            uploadModelView();
            CUBE.draw(gl,program,mode);
        popMatrix();

        gl.uniform4fv(color,vec4(0.0,0.2,0.0,1.0)); 
        pushMatrix();
            multTranslation([0,0.32,0]);
            multScale([1,1/8,1]);
            uploadModelView();
            CUBE.draw(gl,program,mode);
        popMatrix();

        gl.uniform4fv(color,vec4(0.0,0.25,0.0,1.0)); 
        pushMatrix();
        multTranslation([0.66,0.2,0]);
        multRotationZ(-90);
        multScale([1/2.5,1/3,1]);
        uploadModelView();
        PYRAMID.draw(gl,program,mode);
        popMatrix();

        gl.uniform4fv(color,vec4(0.0,0.25,0.0,1.0)); 
        pushMatrix();
        multTranslation([-0.66,0.2,0]);
        multRotationZ(90);
        multScale([1/2.5,1/3,1]);
        uploadModelView();
        PYRAMID.draw(gl,program,mode);
        popMatrix();

        gl.uniform4fv(color,vec4(0.0,0.3,0.0,1.0)); 
        pushMatrix();
            multTranslation([-0.2,0.5,0]);
            multRotationY(rotcanoy);
            pushMatrix();
                multScale([1/2,1/4,1/2]);
                uploadModelView();
                CYLINDRE.draw(gl,program,mode);
            popMatrix();
                gl.uniform4fv(color,vec4(0.0,0.4,0.0,1.0));  
                multTranslation([0.25,0,0]);
                pushMatrix();
                multRotationZ(-90+rotcanoz);
                multTranslation([0,0.53,0]);
                multScale([1/8,1,1/8]);
                uploadModelView();
                CYLINDRE.draw(gl,program,mode);
                popMatrix();
                gl.uniform4fv(color,vec4(0.0,0.35,0.0,1.0)); 
                multScale([1/6,1/6,1/6]);
                uploadModelView();
                CUBE.draw(gl,program,mode);
        popMatrix();
    }

    function bullet(){
        gl.uniform4fv(color,vec4(0.0,0.0,0.0,1.0));   
        for(let i = 0; i < balas.length; i++){
            times[i] += 1/60.0
            pushMatrix();
                multTranslation([balaspos[i],0,0]);
                multTranslation([-0.2,0.5,0]);
                pushMatrix();
                    multRotationY(balaroty[i]);
                    multTranslation([0.25,0,0]);
                    multRotationZ(-90+balarotz[i]);
                    multTranslation([-g*times[i]*times[i]/2,1.1+speed*times[i],0]);
                    multScale([1/8,1/8,1/8]); 
                    uploadModelView(); 
                        SPHERE.draw(gl,program,mode);
                popMatrix();
        popMatrix();
        }
    }
    
    function render()
    {
        window.requestAnimationFrame(render);

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        mProjection = ortho(-VP_DISTANCE*aspect,VP_DISTANCE*aspect, -VP_DISTANCE, VP_DISTANCE,-5*VP_DISTANCE,5*VP_DISTANCE);
        
        gl.useProgram(program);
        
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mProjection"), false, flatten(mProjection));
    
        loadMatrix(Mview);
        pushMatrix();
            multTranslation([0,-1/50,0]);
            multScale([1/5, 1/50, 1/5]);
            uploadModelView();
            Tile();
        popMatrix();
        pushMatrix();
            multTranslation([pos,0.0,0.0])
            tankbody();
            pushMatrix();
                multTranslation([0,0.08,0]);
                rightwheels();
                leftwheels();
                axis();
            popMatrix();
        popMatrix();
        bullet();
    }
}

const urls = ["shader.vert", "shader.frag"];
loadShadersFromURLS(urls).then(shaders => setup(shaders))