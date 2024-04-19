import { buildProgramFromSources, loadShadersFromURLS, setupWebGL } from "../../libs/utils.js";
import { ortho, lookAt, flatten, rotateX, vec4,vec2, translate, normalMatrix , vec3, perspective,rotate, length,subtract,mult,inverse} from "../../libs/MV.js";
import {modelView, loadMatrix, multRotationY, multScale, multTranslation, popMatrix, pushMatrix, multRotationX, multRotationZ} from "../../libs/stack.js";
import * as dat from '../../libs/dat.gui.module.js';

import * as SPHERE from '../../libs/sphere.js';
import * as TORUS from '../../libs/torus.js';
import * as CUBE from '../../libs/cube.js';
import * as CYLINDRE from '../../libs/cylinder.js';
import * as PYRAMID from '../../libs/pyramid.js';

import * as STACK from '../../libs/stack.js';


/** @type WebGLRenderingContext */
let gl;   
let mode;
let mView; //lookat(eye, at, up)
let canvas = document.getElementById("gl-canvas");
let mProjection;
let time;

let camera = {
    eye: vec3(30,20,30),
    at: vec3(0,0,0),
    up: vec3(0,1,0),
    fovy: 30,
    aspect: 1, // Updated further down
    near: 0.1,
    far: 100
}

let options = {
    Number: 5,
    background: vec3([0.0, 0.0, 55.0]), 
    speed: 0.5,
    intensity: 3,
    normals: false,
    wireframe: false,
    random: false,
    wave: false
}

let object = {
        Ka: vec3([25,0,0]),
        Kd: vec3([100,0,0]),
        Ks: vec3([255,255,255]),
        shininess: 50
}

let light = {
    pos: vec4([0,10,0]),
    Ia: vec3([75,75,75]),
    Id: vec3([175,175,175]),
    Is: vec3([255,255,255]),
    isDirectional: false
}

function setup(shaders)
{   
    time = 0;
    
    const gui = new dat.GUI();

    const optionsGui = gui.addFolder("Options");
    optionsGui.add(options, "normals");
    optionsGui.add(options, 'random');
    optionsGui.add(options, "wireframe");    
    optionsGui.add(options, "wave");
    optionsGui.add(options, "Number").min(1).max(30).step(1).listen();
    optionsGui.add(options, "speed").min(0).max(1).step(0.1).listen();
    optionsGui.add(options, "intensity").min(0).max(10).step(0.1).listen();

    const cameraGui = gui.addFolder("camera");

    cameraGui.add(camera, "fovy").min(1).max(100).step(1).listen();
    cameraGui.add(camera, "aspect").min(0).max(10).domElement.style.pointerEvents = "none";
    
    cameraGui.add(camera, "near").min(0.1).max(100).onChange( function(v) {
        camera.near = Math.min(camera.far-0.5, v);
    });

    cameraGui.add(camera, "far").min(0.1).max(100).listen().onChange( function(v) {
        camera.far = Math.max(camera.near+0.5, v);
    });

    const eye = cameraGui.addFolder("eye");
    eye.add(camera.eye, 0).step(0.05).listen();//.domElement.style.pointerEvents = "none";;
    eye.add(camera.eye, 1).step(0.05).listen();//.domElement.style.pointerEvents = "none";;
    eye.add(camera.eye, 2).step(0.05).listen();//.domElement.style.pointerEvents = "none";;

    const at = cameraGui.addFolder("at");
    at.add(camera.at, 0).step(0.05).listen();//.domElement.style.pointerEvents = "none";;
    at.add(camera.at, 1).step(0.05).listen();//.domElement.style.pointerEvents = "none";;
    at.add(camera.at, 2).step(0.05).listen();//.domElement.style.pointerEvents = "none";;

    const up = cameraGui.addFolder("up");
    up.add(camera.up, 0).step(0.05).listen();//.domElement.style.pointerEvents = "none";;
    up.add(camera.up, 1).step(0.05).listen();//.domElement.style.pointerEvents = "none";;
    up.add(camera.up, 2).step(0.05).listen();//.domElement.style.pointerEvents = "none";;

    const objectGUI = gui.addFolder("Object");
    objectGUI.addColor(object,"Ka").name("Ambient");
    objectGUI.addColor(object,"Kd").name("Diffuse");
    objectGUI.addColor(object,"Ks").name("Specular");
    objectGUI.add(object, "shininess").min(1).max(500).step(1).listen().name("Shininess");

    const GUIlight = gui.addFolder("Light");
    GUIlight.add(light.pos,0).name("x");
    GUIlight.add(light.pos,1).name("y");
    GUIlight.add(light.pos,2).name("z");
    GUIlight.addColor(light,"Ia").name("Ambient");
    GUIlight.addColor(light,"Id").name("Diffuse");
    GUIlight.addColor(light,"Is").name("Specular");
    GUIlight.add(light,"isDirectional").name("Directional");

    gl = setupWebGL(canvas);

    let program = buildProgramFromSources(gl, shaders["shader.vert"], shaders["shader.frag"]);

    mode = gl.TRIANGLES; 

    gl.clearColor(options.background[0]/255.0, options.background[1]/255.0, options.background[2]/255.0, 1.0); 
    CUBE.init(gl);
    TORUS.init(gl);
    SPHERE.init(gl);
    CYLINDRE.init(gl);
    PYRAMID.init(gl);
    gl.enable(gl.DEPTH_TEST); 
   
    window.requestAnimationFrame(render);

    let down = false;
    let lastX, lastY;

    resizeCanvasToFullWindow();

    window.addEventListener('resize', resizeCanvasToFullWindow);

    window.addEventListener('wheel', function(event) {

        
        if(!event.altKey && !event.metaKey && !event.ctrlKey) { // Change fovy
            const factor = 1 - event.deltaY/1000;
            camera.fovy = Math.max(1, Math.min(100, camera.fovy * factor)); 
        }
        else if(event.metaKey || event.ctrlKey) {
            // move camera forward and backwards (shift)

            const offset = event.deltaY / 1000;

            const dir = normalize(subtract(camera.at, camera.eye));

            const ce = add(camera.eye, scale(offset, dir));
            const ca = add(camera.at, scale(offset, dir));
            
            // Can't replace the objects that are being listened by dat.gui, only their properties.
            camera.eye[0] = ce[0];
            camera.eye[1] = ce[1];
            camera.eye[2] = ce[2];

            if(event.ctrlKey) {
                camera.at[0] = ca[0];
                camera.at[1] = ca[1];
                camera.at[2] = ca[2];
            }
        }
    });

    function inCameraSpace(m) {
        const mInvView = inverse(mView);

        return mult(mInvView, mult(m, mView));
    }
    
        canvas.addEventListener('mousemove', function(event) {
            if(down) {
                const dx = event.offsetX - lastX;
                const dy = event.offsetY - lastY;
    
                if(dx != 0 || dy != 0) {
                    // Do something here...
    
                    const d = vec2(dx, dy);
                    const axis = vec3(-dy, -dx, 0);
    
                    const rotation = rotate(0.5*length(d), axis);
    
                    let eyeAt = subtract(camera.eye, camera.at);                
                    eyeAt = vec4(eyeAt[0], eyeAt[1], eyeAt[2], 0);
                    let newUp = vec4(camera.up[0], camera.up[1], camera.up[2], 0);
    
                    eyeAt = mult(inCameraSpace(rotation), eyeAt);
                    newUp = mult(inCameraSpace(rotation), newUp);
                    
                    camera.eye[0] = camera.at[0] + eyeAt[0];
                    camera.eye[1] = camera.at[1] + eyeAt[1];
                    camera.eye[2] = camera.at[2] + eyeAt[2];
    
                    camera.up[0] = newUp[0];
                    camera.up[1] = newUp[1];
                    camera.up[2] = newUp[2];
    
                    lastX = event.offsetX;
                    lastY = event.offsetY;
                }
    
            }
        }); 

        canvas.addEventListener('mousedown', function(event) {
            down=true;
            lastX = event.offsetX;
            lastY = event.offsetY;
            gl.clearColor(0.0, 0.0, 0.2, 1.0);
        });
    
        canvas.addEventListener('mouseup', function(event) {
            down = false;
            gl.clearColor(options.background[0]/255.0, options.background[1]/255.0, options.background[2]/255.0, 1.0);
        });

    function resizeCanvasToFullWindow()
    {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        camera.aspect = canvas.width / canvas.height;

        gl.viewport(0,0,canvas.width, canvas.height);
    }

    function uploadModelView()
    {
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mModelView"), false, flatten(modelView()));
    }

    function distcenter(x,z){
        return Math.sqrt(Math.pow(x,2) + Math.pow(z,2)) + 10;
    }

    const uKa = gl.getUniformLocation(program, "umaterial.Ka");
    const uKd = gl.getUniformLocation(program, "umaterial.Kd");
    const uKs = gl.getUniformLocation(program, "umaterial.Ks");
    const uShininess = gl.getUniformLocation(program, "umaterial.shininess");

    const ulpos = gl.getUniformLocation(program, "ulight.pos");
    const ulIa = gl.getUniformLocation(program, "ulight.Ia");
    const ulId = gl.getUniformLocation(program, "ulight.Id");
    const ulIs = gl.getUniformLocation(program, "ulight.Is");
    const ulisDirectional = gl.getUniformLocation(program, "ulight.isDirectional"); 

    function render(){

        gl.useProgram(program);

        gl.uniform4fv(ulpos, light.pos);
        gl.uniform3fv(ulIa, light.Ia);
        gl.uniform3fv(ulId, light.Id);
        gl.uniform3fv(ulIs, light.Is);
        gl.uniform1i(ulisDirectional, light.isDirectional);
        
        gl.uniform3fv(uKa, object.Ka);
        gl.uniform3fv(uKd, object.Kd);
        gl.uniform3fv(uKs, object.Ks);
        gl.uniform1f(uShininess, object.shininess);
        
        if(options.wireframe){
            mode = gl.LINES;
        }
        else{
            mode = gl.TRIANGLES;
        }

        time += options.speed/10;
        
        window.requestAnimationFrame(render);

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        mProjection = perspective(camera.fovy, camera.aspect, camera.near, camera.far);
        
        gl.useProgram(program);
        
        mView = lookAt(camera.eye, camera.at, camera.up);

        loadMatrix(mView);

        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mModelView"), false, flatten(STACK.modelView()));
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mProjection"), false, flatten(mProjection));
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mNormals"), false, flatten(normalMatrix(STACK.modelView())));
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mView"), false, flatten(mView));
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mViewNormals"), false, flatten(normalMatrix(mView)));

        gl.uniform1i(gl.getUniformLocation(program, "uUseNormals"), options.normals);
        gl.uniform1i(gl.getUniformLocation(program, "uUseRandom"), options.random);
    
        if(options.wave){
            for(let z = -options.Number; z <= options.Number ; z++){
                pushMatrix();
                let distance = distcenter(0,z);
                multTranslation([0.0,Math.sin(time-distance)*options.intensity, 0.0]);
                for(let x = -options.Number; x <= options.Number ; x++){
                    if (options.random) {
                        // Calculate rainbow color based on distance from center
                        let rainbowColor = rainbowColorForDistance(distance);
                    
                        gl.uniform3fv(gl.getUniformLocation(program, "color"), rainbowColor);
                    }
                        pushMatrix();
                            multTranslation([x,0,z]);  
                            uploadModelView();
                            CUBE.draw(gl, program, mode);
                        popMatrix();
                    }             
                popMatrix();
            }  
        }
        else{
            for(let z = -options.Number; z <= options.Number ; z++){
                pushMatrix();
                for(let x = -options.Number; x <= options.Number ; x++){
                    let distance = distcenter(x,z)
                    if (options.random) {
                        let rainbowColor = rainbowColorForDistance(distance);
                    
                        gl.uniform3fv(gl.getUniformLocation(program, "color"), rainbowColor);
                    };
                        pushMatrix();
                            multScale([1,2 + Math.abs(Math.sin(time-distance)*options.intensity),1]);
                            multTranslation([x,0,z]);  
                            uploadModelView();
                            CUBE.draw(gl, program, mode);
                        popMatrix();
                    }             
                popMatrix();
            }            
        }  
    }   
}

function rainbowColorForDistance(distance) {
    // Calculate hue based on distance
    let hue = (distance * 25) % 360;

    // Convert hue to RGB color
    let rgb = hsvToRgb(hue, 1, 1);

    return vec3(rgb[0], rgb[1], rgb[2]);
}


function hsvToRgb(h, s, v) {
    let c = v * s;
    let hp = Math.floor(h / 60); // Integer part of h / 60
    let x = c * (1 - Math.abs((h / 60) % 2 - 1)); // Fractional part of h / 60
    let rgb = [];

    if (isNaN(h)) rgb = [0, 0, 0];
    else if (hp === 0) rgb = [c, x, 0];
    else if (hp === 1) rgb = [x, c, 0];
    else if (hp === 2) rgb = [0, c, x];
    else if (hp === 3) rgb = [0, x, c];
    else if (hp === 4) rgb = [x, 0, c];
    else if (hp === 5) rgb = [c, 0, x];

    let m = v - c;
    rgb[0] += m;
    rgb[1] += m;
    rgb[2] += m;

    return rgb;
}


const urls = ["shader.vert", "shader.frag"];
loadShadersFromURLS(urls).then(shaders => setup(shaders));