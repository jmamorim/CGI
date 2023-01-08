import { buildProgramFromSources, loadShadersFromURLS, setupWebGL } from '../../libs/utils.js';
import { length, flatten, inverse, mult, normalMatrix, perspective, lookAt, vec4, vec3, vec2, subtract, add, scale, rotate, normalize } from '../../libs/MV.js';

import * as dat from '../../libs/dat.gui.module.js';

import * as CUBE from '../../libs/cube.js';
import * as SPHERE from '../../libs/sphere.js';
import * as CYLINDRE from '../../libs/cylinder.js';
import * as PYRAMID from '../../libs/pyramid.js';
import * as TORUS from '../../libs/torus.js';

import * as STACK from '../../libs/stack.js';


function setup(shaders) {
    const canvas = document.getElementById('gl-canvas');
    const gl = setupWebGL(canvas);

    CUBE.init(gl);
    SPHERE.init(gl);
    CYLINDRE.init(gl);
    PYRAMID.init(gl);
    TORUS.init(gl);

    const program = buildProgramFromSources(gl, shaders['shader.vert'], shaders['shader.frag']);

    // Camera  
    let camera = {
        eye: vec3(3,3,5),
        at: vec3(0,0,0),
        up: vec3(0,1,0),
        fovy: 45,
        aspect: 1, // Updated further down
        near: 0.1,
        far: 20
    }

    let options = {
        backface_culling: true,
        depth_test: true,
        show_lights: true,
    }

    let object = {
        shape: "Sphere"
    }

    let floormaterial = {
        Ka: vec3([0,25.0,0]),
        Kd: vec3([0,50,0]),
        Ks: vec3([255,255,255]),
        shininess: 50
    }

    let material = {
        Ka: vec3([25,0,0]),
        Kd: vec3([100,0,0]),
        Ks: vec3([255,255,255]),
        shininess: 50
    }

    let light0 = {
        pos: vec4([0,2 ,-2]),
        Ia: vec3([75,75,75]),
        Id: vec3([175,175,175]),
        Is: vec3([255,255,255]),
        isDirectional: true,
        isActive: true
    }

    let light1 = {
        pos: vec4([0,2,2]),
        Ia: vec3([75,75,75]),
        Id: vec3([175,175,175]),
        Is: vec3([255,255,255]),
        isDirectional: true,
        isActive: false
    }

    let light2 = {
        pos: vec4([2,2,0]),
        Ia: vec3([75,75,75]),
        Id: vec3([175,175,175]),
        Is: vec3([255,255,255]),
        isDirectional: true,
        isActive: false
    }

    let light3 = {
        pos: vec4([-2,2,0]),
        Ia: vec3([75,75,75]),
        Id: vec3([175,175,175]),
        Is: vec3([255,255,255]),
        isDirectional: true,
        isActive: false
    }

    let light4 = {
        pos: vec4([2,-2,0]),
        Ia: vec3([75,75,75]),
        Id: vec3([175,175,175]),
        Is: vec3([255,255,255]),
        isDirectional: true,
        isActive: false
    }

    let light5 = {
        pos: vec4([-2,-2,0]),
        Ia: vec3([75,75,75]),
        Id: vec3([175,175,175]),
        Is: vec3([255,255,255]),
        isDirectional: true,
        isActive: false
    }

    let light6 = {
        pos: vec4([0,-2,2]),
        Ia: vec3([75,75,75]),
        Id: vec3([175,175,175]),
        Is: vec3([255,255,255]),
        isDirectional: true,
        isActive: false
    }

    let light7 = {
        pos: vec4([0,-2,-2]),
        Ia: vec3([75,75,75]),
        Id: vec3([175,175,175]),
        Is: vec3([255,255,255]),
        isDirectional: true,
        isActive: false
    }

    //GUI----

    const gui2 = new dat.GUI();
    
    const optionsGui = gui2.addFolder("options");
    optionsGui.add(options, "backface_culling").name("Backface Culling");
    optionsGui.add(options, "depth_test").name("Depth Test");
    optionsGui.add(options, "show_lights").name("Show Lights");
    
    const cameraGui = gui2.addFolder("camera");

    cameraGui.add(camera, "fovy").min(1).max(100).step(1).listen();
    
    cameraGui.add(camera, "near").min(0.1).max(20).onChange( function(v) {
        camera.near = Math.min(camera.far-0.5, v);
    });

    cameraGui.add(camera, "far").min(0.1).max(20).listen().onChange( function(v) {
        camera.far = Math.max(camera.near+0.5, v);
    });

    const eye = cameraGui.addFolder("eye");
    eye.add(camera.eye, 0).step(0.05).name("x");//.domElement.style.pointerEvents = "none";;
    eye.add(camera.eye, 1).step(0.05).name("y");//.domElement.style.pointerEvents = "none";;
    eye.add(camera.eye, 2).step(0.05).name("z");//.domElement.style.pointerEvents = "none";;

    const at = cameraGui.addFolder("at");
    at.add(camera.at, 0).step(0.05).name("x");//.domElement.style.pointerEvents = "none";;
    at.add(camera.at, 1).step(0.05).name("y");//.domElement.style.pointerEvents = "none";;
    at.add(camera.at, 2).step(0.05).name("z");//.domElement.style.pointerEvents = "none";;

    const up = cameraGui.addFolder("up");
    up.add(camera.up, 0).step(0.05).name("x");//.domElement.style.pointerEvents = "none";;
    up.add(camera.up, 1).step(0.05).name("y");//.domElement.style.pointerEvents = "none";;
    up.add(camera.up, 2).step(0.05).name("z");//.domElement.style.pointerEvents = "none";;

    const GUIlights = gui2.addFolder("lights");
    const GUIlight1 = GUIlights.addFolder("light1")
    GUIlight1.add(light0.pos,0).name("x");
    GUIlight1.add(light0.pos,1).name("y");
    GUIlight1.add(light0.pos,2).name("z");
    GUIlight1.addColor(light0,"Ia").name("Ambient");
    GUIlight1.addColor(light0,"Id").name("Diffuse");
    GUIlight1.addColor(light0,"Is").name("Specular");
    GUIlight1.add(light0,"isDirectional").name("Directional");
    GUIlight1.add(light0,"isActive").name("Active");
    const GUIlight2 = GUIlights.addFolder("light2");
    GUIlight2.add(light1.pos,0).name("x");
    GUIlight2.add(light1.pos,1).name("y");
    GUIlight2.add(light1.pos,2).name("z");
    GUIlight2.addColor(light1,"Ia").name("Ambient");
    GUIlight2.addColor(light1,"Id").name("Diffuse");
    GUIlight2.addColor(light1,"Is").name("Specular");
    GUIlight2.add(light1,"isDirectional").name("Directional");
    GUIlight2.add(light1,"isActive").name("Active");
    const GUIlight3= GUIlights.addFolder("light3");
    GUIlight3.add(light2.pos,0).name("x");
    GUIlight3.add(light2.pos,1).name("y");
    GUIlight3.add(light2.pos,2).name("z");
    GUIlight3.addColor(light2,"Ia").name("Ambient");
    GUIlight3.addColor(light2,"Id").name("Diffuse");
    GUIlight3.addColor(light2,"Is").name("Specular");
    GUIlight3.add(light2,"isDirectional").name("Directional");
    GUIlight3.add(light2,"isActive").name("Active");
    const GUIlight4= GUIlights.addFolder("light4");
    GUIlight4.add(light3.pos,0).name("x");
    GUIlight4.add(light3.pos,1).name("y");
    GUIlight4.add(light3.pos,2).name("z");
    GUIlight4.addColor(light3,"Ia").name("Ambient");
    GUIlight4.addColor(light3,"Id").name("Diffuse");
    GUIlight4.addColor(light3,"Is").name("Specular");
    GUIlight4.add(light3,"isDirectional").name("Directional");
    GUIlight4.add(light3,"isActive").name("Active");
    const GUIlight5= GUIlights.addFolder("light5");
    GUIlight5.add(light4.pos,0).name("x");
    GUIlight5.add(light4.pos,1).name("y");
    GUIlight5.add(light4.pos,2).name("z");
    GUIlight5.addColor(light4,"Ia").name("Ambient");
    GUIlight5.addColor(light4,"Id").name("Diffuse");
    GUIlight5.addColor(light4,"Is").name("Specular");
    GUIlight5.add(light4,"isDirectional").name("Directional");
    GUIlight5.add(light4,"isActive").name("Active");
    const GUIlight6= GUIlights.addFolder("light6");
    GUIlight6.add(light5.pos,0).name("x");
    GUIlight6.add(light5.pos,1).name("y");
    GUIlight6.add(light5.pos,2).name("z");
    GUIlight6.addColor(light5,"Ia").name("Ambient");
    GUIlight6.addColor(light5,"Id").name("Diffuse");
    GUIlight6.addColor(light5,"Is").name("Specular");
    GUIlight6.add(light5,"isDirectional").name("Directional");
    GUIlight6.add(light5,"isActive").name("Active");
    const GUIlight7= GUIlights.addFolder("light7");
    GUIlight7.add(light6.pos,0).name("x");
    GUIlight7.add(light6.pos,1).name("y");
    GUIlight7.add(light6.pos,2).name("z");
    GUIlight7.addColor(light6,"Ia").name("Ambient");
    GUIlight7.addColor(light6,"Id").name("Diffuse");
    GUIlight7.addColor(light6,"Is").name("Specular");
    GUIlight7.add(light6,"isDirectional").name("Directional");
    GUIlight7.add(light6,"isActive").name("Active");
    const GUIlight8= GUIlights.addFolder("light8");
    GUIlight8.add(light7.pos,0).name("x");
    GUIlight8.add(light7.pos,1).name("y");
    GUIlight8.add(light7.pos,2).name("z");
    GUIlight8.addColor(light7,"Ia").name("Ambient");
    GUIlight8.addColor(light7,"Id").name("Diffuse");
    GUIlight8.addColor(light7,"Is").name("Specular");
    GUIlight8.add(light7,"isDirectional").name("Directional");
    GUIlight8.add(light7,"isActive").name("Active");
    
    const gui1 = new dat.GUI();

    const objectGUI = gui1.addFolder("object");
    objectGUI.add(object, "shape", ["Sphere","Cylindre","Pyramid","Cube","Torus"]);

    const materialGUI = gui1.addFolder("material");
    materialGUI.addColor(material,"Ka").name("Ambient");
    materialGUI.addColor(material,"Kd").name("Diffuse");
    materialGUI.addColor(material,"Ks").name("Specular");
    materialGUI.add(material, "shininess").min(1).max(500).step(1).listen().name("Shininess");

    //----    

    // matrices
    let mView, mProjection;

    gl.clearColor(0.0, 0.0, 0.2, 1.0);

    resizeCanvasToFullWindow();

    window.addEventListener('resize', resizeCanvasToFullWindow);

    window.addEventListener('wheel', function(event) {

        
        const factor = 1 - event.deltaY/1000;
        camera.fovy = Math.max(1, Math.min(100, camera.fovy * factor)); 
    });

    const uKa = gl.getUniformLocation(program, "uMaterial.Ka");
    const uKd = gl.getUniformLocation(program, "uMaterial.Kd");
    const uKs = gl.getUniformLocation(program, "uMaterial.Ks");
    const uShininess = gl.getUniformLocation(program, "uMaterial.shininess");

    const ul0pos = gl.getUniformLocation(program, "uLight[0].pos");
    const ul0Ia = gl.getUniformLocation(program, "uLight[0].Ia");
    const ul0Id = gl.getUniformLocation(program, "uLight[0].Id");
    const ul0Is = gl.getUniformLocation(program, "uLight[0].Is");
    const ul0isDirectional = gl.getUniformLocation(program, "uLight[0].isDirectional");
    const ul0isActive = gl.getUniformLocation(program, "uLight[0].isActive");

    const ul1pos = gl.getUniformLocation(program, "uLight[1].pos");
    const ul1Ia = gl.getUniformLocation(program, "uLight[1].Ia");
    const ul1Id = gl.getUniformLocation(program, "uLight[1].Id");
    const ul1Is = gl.getUniformLocation(program, "uLight[1].Is");
    const ul1isDirectional = gl.getUniformLocation(program, "uLight[1].isDirectional");
    const ul1isActive = gl.getUniformLocation(program, "uLight[1].isActive");
    
    const ul2pos = gl.getUniformLocation(program, "uLight[2].pos");
    const ul2Ia = gl.getUniformLocation(program, "uLight[2].Ia");
    const ul2Id = gl.getUniformLocation(program, "uLight[2].Id");
    const ul2Is = gl.getUniformLocation(program, "uLight[2].Is");
    const ul2isDirectional = gl.getUniformLocation(program, "uLight[2].isDirectional");
    const ul2isActive = gl.getUniformLocation(program, "uLight[2].isActive");
    
    const ul3pos = gl.getUniformLocation(program, "uLight[3].pos");
    const ul3Ia = gl.getUniformLocation(program, "uLight[3].Ia");
    const ul3Id = gl.getUniformLocation(program, "uLight[3].Id");
    const ul3Is = gl.getUniformLocation(program, "uLight[3].Is");
    const ul3isDirectional = gl.getUniformLocation(program, "uLight[3].isDirectional");
    const ul3isActive = gl.getUniformLocation(program, "uLight[3].isActive");
    
    const ul4pos = gl.getUniformLocation(program, "uLight[4].pos");
    const ul4Ia = gl.getUniformLocation(program, "uLight[4].Ia");
    const ul4Id = gl.getUniformLocation(program, "uLight[4].Id");
    const ul4Is = gl.getUniformLocation(program, "uLight[4].Is");
    const ul4isDirectional = gl.getUniformLocation(program, "uLight[4].isDirectional");
    const ul4isActive = gl.getUniformLocation(program, "uLight[4].isActive");
    
    const ul5pos = gl.getUniformLocation(program, "uLight[5].pos");
    const ul5Ia = gl.getUniformLocation(program, "uLight[5].Ia");
    const ul5Id = gl.getUniformLocation(program, "uLight[5].Id");
    const ul5Is = gl.getUniformLocation(program, "uLight[5].Is");
    const ul5isDirectional = gl.getUniformLocation(program, "uLight[5].isDirectional");
    const ul5isActive = gl.getUniformLocation(program, "uLight[5].isActive");
    
    const ul6pos = gl.getUniformLocation(program, "uLight[6].pos");
    const ul6Ia = gl.getUniformLocation(program, "uLight[6].Ia");
    const ul6Id = gl.getUniformLocation(program, "uLight[6].Id");
    const ul6Is = gl.getUniformLocation(program, "uLight[6].Is");
    const ul6isDirectional = gl.getUniformLocation(program, "uLight[6].isDirectional");
    const ul6isActive = gl.getUniformLocation(program, "uLight[6].isActive");
    
    const ul7pos = gl.getUniformLocation(program, "uLight[7].pos");
    const ul7Ia = gl.getUniformLocation(program, "uLight[7].Ia");
    const ul7Id = gl.getUniformLocation(program, "uLight[7].Id");
    const ul7Is = gl.getUniformLocation(program, "uLight[7].Is");
    const ul7isDirectional = gl.getUniformLocation(program, "uLight[7].isDirectional");
    const ul7isActive = gl.getUniformLocation(program, "uLight[7].isActive");

    window.requestAnimationFrame(render);

    function resizeCanvasToFullWindow()
    {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        camera.aspect = canvas.width / canvas.height;

        gl.viewport(0,0,canvas.width, canvas.height);
    }

    function uploadModelView()
    {
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mModelView"), false, flatten(STACK.modelView()));
    }

    function drawfloor(){
        gl.uniform3fv(uKa, floormaterial.Ka);
        gl.uniform3fv(uKd, floormaterial.Kd);
        gl.uniform3fv(uKs, floormaterial.Ks);
        gl.uniform1f(uShininess, floormaterial.shininess);
        STACK.pushMatrix();
        STACK.multTranslation([0,-0.6,0])
        STACK.multScale([3,0.1,3]);
        uploadModelView();
        CUBE.draw(gl, program, gl.TRIANGLES);
        STACK.popMatrix();
    }

    function drawlight(){
        gl.uniform3fv(uKa, light0.Is);
        gl.uniform3fv(uKd, light0.Is);
        gl.uniform3fv(uKs, light0.Is);
        STACK.pushMatrix();        
        STACK.multTranslation(vec3(light0.pos));        
        STACK.multScale([0.1,0.1,0.1]);
        uploadModelView();
        SPHERE.draw(gl, program, gl.LINES);
        STACK.popMatrix();
        
        gl.uniform3fv(uKa, light1.Is);
        gl.uniform3fv(uKd, light1.Is);
        gl.uniform3fv(uKs, light1.Is);
        STACK.pushMatrix();        
        STACK.multTranslation(vec3(light1.pos));
        STACK.multScale([0.1,0.1,0.1]);
        uploadModelView();
        SPHERE.draw(gl, program, gl.LINES);
        STACK.popMatrix();
        
        gl.uniform3fv(uKa, light2.Is);
        gl.uniform3fv(uKd, light2.Is);
        gl.uniform3fv(uKs, light2.Is);
        STACK.pushMatrix();        
        STACK.multTranslation(vec3(light2.pos));
        STACK.multScale([0.1,0.1,0.1]);
        uploadModelView();
        SPHERE.draw(gl, program, gl.LINES);
        STACK.popMatrix();

        gl.uniform3fv(uKa, light3.Is);
        gl.uniform3fv(uKd, light3.Is);
        gl.uniform3fv(uKs, light3.Is);
        STACK.pushMatrix();        
        STACK.multTranslation(vec3(light3.pos));
        STACK.multScale([0.1,0.1,0.1]);
        uploadModelView();
        SPHERE.draw(gl, program, gl.LINES);
        STACK.popMatrix();
        
        gl.uniform3fv(uKa, light4.Is);
        gl.uniform3fv(uKd, light4.Is);
        gl.uniform3fv(uKs, light4.Is);
        STACK.pushMatrix();        
        STACK.multTranslation(vec3(light4.pos));
        STACK.multScale([0.1,0.1,0.1]);
        uploadModelView();
        SPHERE.draw(gl, program, gl.LINES);
        STACK.popMatrix();
        
        gl.uniform3fv(uKa, light5.Is);
        gl.uniform3fv(uKd, light5.Is);
        gl.uniform3fv(uKs, light5.Is);
        STACK.pushMatrix();        
        STACK.multTranslation(vec3(light5.pos));
        STACK.multScale([0.1,0.1,0.1]);
        uploadModelView();
        SPHERE.draw(gl, program, gl.LINES);
        STACK.popMatrix();
        
        gl.uniform3fv(uKa, light6.Is);
        gl.uniform3fv(uKd, light6.Is);
        gl.uniform3fv(uKs, light6.Is);
        STACK.pushMatrix();        
        STACK.multTranslation(vec3(light6.pos));
        STACK.multScale([0.1,0.1,0.1]);
        uploadModelView();
        SPHERE.draw(gl, program, gl.LINES);
        STACK.popMatrix();
        
        gl.uniform3fv(uKa, light7.Is);
        gl.uniform3fv(uKd, light7.Is);
        gl.uniform3fv(uKs, light7.Is);
        STACK.pushMatrix();        
        STACK.multTranslation(vec3(light7.pos));
        STACK.multScale([0.1,0.1,0.1]);
        uploadModelView();
        SPHERE.draw(gl, program, gl.LINES);
        STACK.popMatrix();
    }

    function render(time)
    {
        //back-face culling
        if(options.backface_culling){
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.BACK);
        }
        else{
            gl.disable(gl.CULL_FACE);
        }

        //z-buffer
        if(options.depth_test){
            gl.enable(gl.DEPTH_TEST);
        }
        else{
            gl.disable(gl.DEPTH_TEST)
        }

        window.requestAnimationFrame(render);

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(program);

        mView = lookAt(camera.eye, camera.at, camera.up);
        STACK.loadMatrix(mView);

        mProjection = perspective(camera.fovy, camera.aspect, camera.near, camera.far);

        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mModelView"), false, flatten(STACK.modelView()));
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mProjection"), false, flatten(mProjection));
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mNormals"), false, flatten(normalMatrix(STACK.modelView())));
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mView"), false, flatten(mView));
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mViewNormals"), false, flatten(normalMatrix(mView)));

        gl.uniform4fv(ul0pos, light0.pos);
        gl.uniform3fv(ul0Ia, light0.Ia);
        gl.uniform3fv(ul0Id, light0.Id);
        gl.uniform3fv(ul0Is, light0.Is);
        gl.uniform1i(ul0isDirectional, light0.isDirectional);
        gl.uniform1i(ul0isActive, light0.isActive);

        gl.uniform4fv(ul1pos, light1.pos);
        gl.uniform3fv(ul1Ia, light1.Ia);
        gl.uniform3fv(ul1Id, light1.Id);
        gl.uniform3fv(ul1Is, light1.Is);
        gl.uniform1i(ul1isDirectional, light1.isDirectional);
        gl.uniform1i(ul1isActive, light1.isActive);
        
        gl.uniform4fv(ul2pos, light2.pos);
        gl.uniform3fv(ul2Ia, light2.Ia);
        gl.uniform3fv(ul2Id, light2.Id);
        gl.uniform3fv(ul2Is, light2.Is);
        gl.uniform1i(ul2isDirectional, light2.isDirectional);
        gl.uniform1i(ul2isActive, light2.isActive);

        gl.uniform4fv(ul3pos, light3.pos);
        gl.uniform3fv(ul3Ia, light3.Ia);
        gl.uniform3fv(ul3Id, light3.Id);
        gl.uniform3fv(ul3Is, light3.Is);
        gl.uniform1i(ul3isDirectional, light3.isDirectional);
        gl.uniform1i(ul3isActive, light3.isActive);

        gl.uniform4fv(ul4pos, light4.pos);
        gl.uniform3fv(ul4Ia, light4.Ia);
        gl.uniform3fv(ul4Id, light4.Id);
        gl.uniform3fv(ul4Is, light4.Is);
        gl.uniform1i(ul4isDirectional, light4.isDirectional);
        gl.uniform1i(ul4isActive, light4.isActive);

        gl.uniform4fv(ul5pos, light5.pos);
        gl.uniform3fv(ul5Ia, light5.Ia);
        gl.uniform3fv(ul5Id, light5.Id);
        gl.uniform3fv(ul5Is, light5.Is);
        gl.uniform1i(ul5isDirectional, light5.isDirectional);
        gl.uniform1i(ul5isActive, light5.isActive);

        gl.uniform4fv(ul6pos, light6.pos);
        gl.uniform3fv(ul6Ia, light6.Ia);
        gl.uniform3fv(ul6Id, light6.Id);
        gl.uniform3fv(ul6Is, light6.Is);
        gl.uniform1i(ul6isDirectional, light6.isDirectional);
        gl.uniform1i(ul6isActive, light6.isActive);

        gl.uniform4fv(ul7pos, light7.pos);
        gl.uniform3fv(ul7Ia, light7.Ia);
        gl.uniform3fv(ul7Id, light7.Id);
        gl.uniform3fv(ul7Is, light7.Is);
        gl.uniform1i(ul7isDirectional, light7.isDirectional);
        gl.uniform1i(ul7isActive, light7.isActive);

        gl.uniform3fv(uKa, material.Ka);
        gl.uniform3fv(uKd, material.Kd);
        gl.uniform3fv(uKs, material.Ks);
        gl.uniform1f(uShininess, material.shininess);

        switch(object.shape){
            case "Cube":
                CUBE.draw(gl, program, gl.TRIANGLES);
                break;
            case "Sphere":
                SPHERE.draw(gl, program, gl.TRIANGLES);
                break;
            case "Torus":
                TORUS.draw(gl, program, gl.TRIANGLES);
                break;
            case "Pyramid":
                PYRAMID.draw(gl, program, gl.TRIANGLES);
                break;
            case "Cylindre":
                CYLINDRE.draw(gl, program, gl.TRIANGLES);
                break;
        }
        drawfloor();

        //show lights
        if(options.show_lights){
            drawlight();
        }
    }
}

const urls = ['shader.vert', 'shader.frag'];

loadShadersFromURLS(urls).then( shaders => setup(shaders));