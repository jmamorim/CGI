import { buildProgramFromSources, loadShadersFromURLS, setupWebGL } from '../../libs/utils.js';
import { length, flatten, mult, mat4, normalMatrix, perspective, lookAt, vec3, subtract, normalize } from '../../libs/MV.js';

import * as dat from '../../libs/dat.gui.module.js';

import * as CUBE from '../../libs/cube.js';
import * as SPHERE from '../../libs/sphere.js';
import * as CYLINDRE from '../../libs/cylinder.js';
import * as PYRAMID from '../../libs/pyramid.js';
import * as TORUS from '../../libs/torus.js';

import * as STACK from '../../libs/stack.js';

import { startMusic, hasKick, chordOf, isDrop } from './music.js';

const MAX_LIGHTS = 8;
const FLOOR_TOP = -0.55; // floor cube is translated to -0.6 and scaled to 0.1 in y
const SHAPES = {"Sphere": SPHERE, "Cylindre": CYLINDRE, "Pyramid": PYRAMID, "Cube": CUBE, "Torus": TORUS};

// classic OpenGL material table, scaled to the 0-255 range the GUI uses
const m = (Ka, Kd, Ks, shininess) => ({
    Ka: Ka.map(c => c*255), Kd: Kd.map(c => c*255), Ks: Ks.map(c => c*255), shininess
});
const MATERIALS = {
    "Original": {Ka: [25,0,0], Kd: [100,0,0], Ks: [255,255,255], shininess: 50},
    "Ouro": m([.247,.2,.075], [.752,.606,.226], [.628,.556,.366], 51),
    "Prata": m([.192,.192,.192], [.508,.508,.508], [.508,.508,.508], 51),
    "Cobre": m([.191,.074,.023], [.704,.27,.083], [.257,.138,.086], 13),
    "Bronze": m([.213,.128,.054], [.714,.428,.181], [.394,.272,.167], 26),
    "Jade": m([.135,.223,.158], [.54,.89,.63], [.316,.316,.316], 13),
    "Rubi": m([.175,.012,.012], [.614,.041,.041], [.728,.627,.627], 77),
    "Esmeralda": m([.022,.175,.022], [.076,.614,.076], [.633,.728,.633], 77),
    "Obsidiana": m([.054,.05,.066], [.183,.17,.225], [.333,.329,.346], 38),
    "Pérola": m([.25,.207,.207], [1,.829,.829], [.297,.297,.297], 11),
    "Borracha": m([.02,.02,.02], [.01,.01,.01], [.4,.4,.4], 10),
};

// the eight lights exactly as the original project starts
const ORIGINAL_POSITIONS = [[0,2,-2], [0,2,2], [2,2,0], [-2,2,0], [2,-2,0], [-2,-2,0], [0,-2,2], [0,-2,-2]];
const LIGHT_DEFAULTS = {
    Ia: [75,75,75], Id: [175,175,175], Is: [255,255,255],
    isDirectional: true, isActive: false, isSpot: false, aperture: 30, cutoff: 10
};

function hsv(h, s, v) {
    const f = n => { const k = (n + h*6) % 6; return v - v*s*Math.max(0, Math.min(k, 4-k, 1)); };
    return [f(5)*255, f(3)*255, f(1)*255];
}

// each scene: lights (missing ones are switched off), floor material, background and light animation
const SCENES = {
    "Original": () => ({
        lights: ORIGINAL_POSITIONS.map((pos, i) => ({pos, isActive: i == 0})),
        floor: {Ka: [0,25,0], Kd: [0,50,0], Ks: [255,255,255], shininess: 50},
        bg: [[0.05,0.05,0.3], [0,0,0.1]],
        animate: false
    }),
    "Estúdio": () => ({
        lights: [
            {pos: [2.5,3,2], isDirectional: false, isActive: true, Ia: [30,30,30], Id: [255,236,210], Is: [255,245,230]},
            {pos: [-3,1.5,1.5], isDirectional: false, isActive: true, Ia: [0,0,0], Id: [80,95,130], Is: [40,40,60]},
            {pos: [0,1.8,-3], isActive: true, Ia: [0,0,0], Id: [170,190,255], Is: [255,255,255]},
        ],
        floor: {Ka: [20,20,22], Kd: [150,150,155], Ks: [60,60,60], shininess: 20},
        bg: [[0.32,0.33,0.36], [0.08,0.08,0.1]],
        animate: false
    }),
    "Pôr do sol": () => ({
        lights: [
            {pos: [3,0.7,-1.5], isActive: true, Ia: [45,25,30], Id: [255,140,60], Is: [255,190,120]},
            {pos: [-1,3,1], isActive: true, Ia: [15,15,35], Id: [50,60,130], Is: [0,0,0]},
        ],
        floor: {Ka: [30,20,10], Kd: [170,120,70], Ks: [80,60,40], shininess: 10},
        bg: [[0.98,0.55,0.3], [0.25,0.1,0.3]],
        animate: false
    }),
    "Discoteca": () => ({
        lights: Array.from({length: MAX_LIGHTS}, (_, i) => {
            const a = i / MAX_LIGHTS * 2 * Math.PI;
            const color = hsv(i / MAX_LIGHTS, 0.85, 1);
            return {pos: [2.2*Math.cos(a), 2.4, 2.2*Math.sin(a)], isDirectional: false, isActive: true, isSpot: true,
                    aperture: 16, cutoff: 30, Ia: [6,6,6], Id: color, Is: color};
        }),
        floor: {Ka: [10,10,12], Kd: [40,40,45], Ks: [255,255,255], shininess: 120},
        bg: [[0.07,0.02,0.12], [0,0,0]],
        reflect: 0.5,
        animate: true
    }),
    "Noite": () => ({
        lights: [
            {pos: [1,3.2,1], isDirectional: false, isActive: true, isSpot: true, aperture: 22, cutoff: 8,
             Ia: [10,12,20], Id: [200,210,255], Is: [255,255,255]},
            {pos: [-1.5,0.3,-1], isDirectional: false, isActive: true, Ia: [0,0,0], Id: [255,150,50], Is: [255,180,90]},
        ],
        floor: {Ka: [5,8,12], Kd: [40,60,80], Ks: [120,140,170], shininess: 60},
        bg: [[0.03,0.05,0.12], [0,0,0.02]],
        reflect: 0.4,
        animate: false
    }),
    // the lights, object, camera and background are driven by the music in animateShow
    "Espetáculo": () => ({
        lights: Array.from({length: MAX_LIGHTS}, () => ({pos: [0,2.4,0], isDirectional: false, isActive: true, isSpot: true,
                                                        aperture: 18, cutoff: 25, Ia: [4,4,4]})),
        floor: {Ka: [5,5,8], Kd: [25,25,30], Ks: [255,255,255], shininess: 200},
        bg: [[0.1,0,0.15], [0,0,0]],
        reflect: 0.6,
        animate: false
    }),
};

const SHOW = "Espetáculo";
const SHOW_SHAPES = ["Sphere", "Torus", "Cube", "Gallery", "Cylindre", "Pyramid"];
const SHOW_MATERIALS = ["Prata", "Ouro", "Pérola", "Rubi", "Prata", "Esmeralda"];
const SHOW_HUES = [0.83, 0.6, 0.08, 0.45]; // one per chord

// reflection in the floor's top plane
const MIRROR = (() => {
    const M = mat4();
    M[1][1] = -1;
    M[1][3] = 2 * FLOOR_TOP;
    return M;
})();

function setup(shaders) {
    const canvas = document.getElementById('gl-canvas');
    const gl = setupWebGL(canvas, {stencil: true});

    CUBE.init(gl);
    SPHERE.init(gl);
    CYLINDRE.init(gl);
    PYRAMID.init(gl);
    TORUS.init(gl);

    const program = buildProgramFromSources(gl, shaders['shader.vert'], shaders['shader.frag']);
    const bgProgram = buildProgramFromSources(gl, shaders['bg.vert'], shaders['bg.frag']);
    const postProgram = buildProgramFromSources(gl, shaders['post.vert'], shaders['post.frag']);
    let targets = null; // offscreen buffers for bloom, rebuilt on resize
    const bgBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bgBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

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
        shadows: true,
        animate_lights: false,
        turntable: false,
        reflections: true,
        bloom: true
    }

    let object = {
        shape: "Sphere"
    }

    let shading = {
        model: 0,
        rim: false
    }

    let state = {
        scene: "Original",
        material: "Original"
    }

    let floormaterial = {...SCENES["Original"]().floor};
    let material = structuredClone(MATERIALS["Original"]);
    let background = SCENES["Original"]().bg;
    let reflectivity = 0.25;

    const lights = ORIGINAL_POSITIONS.map(() => ({...structuredClone(LIGHT_DEFAULTS), pos: [0,0,0,1], axis: [0,-1,0]}));
    let lightTime = 0;
    let turntableAngle = 0;

    // show mode: the music, what it changed (restored on exit) and the beat-driven effects
    let show = null;
    let currentScene = "Original"; // the dropdown changes state.scene before telling us
    let objectScale = 1;
    let bloomStrength = 0.9;
    let aberration = 0;

    function startShow(previous) {
        show = {
            music: startMusic(),
            previous,
            saved: {eye: [...camera.eye], fovy: camera.fovy, shape: object.shape, material: state.material,
                    turntable: options.turntable},
            bar: -1
        };
        options.turntable = true;
        toast("♪ Modo Espetáculo — X para sair");
    }

    function stopShow() {
        const {saved} = show;
        show.music.stop();
        show = null;
        camera.eye.splice(0, 3, ...saved.eye);
        camera.fovy = saved.fovy;
        object.shape = saved.shape;
        options.turntable = saved.turntable;
        state.material = saved.material;
        applyMaterial(saved.material);
        objectScale = 1;
        bloomStrength = 0.9;
        aberration = 0;
    }

    let toastTimer;
    function toast(text) {
        const el = document.getElementById("toast");
        el.textContent = text;
        el.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
    }

    function applyScene(name) {
        if(show && name != SHOW) stopShow();
        else if(!show && name == SHOW) startShow(currentScene);
        currentScene = name;
        const scene = SCENES[name]();
        lights.forEach((light, i) => {
            const cfg = scene.lights[i] ?? {pos: ORIGINAL_POSITIONS[i]};
            const {pos, ...rest} = structuredClone({...LIGHT_DEFAULTS, ...cfg});
            Object.assign(light, rest);
            // the GUI holds on to the pos array itself, so it has to be changed in place
            light.pos.splice(0, 3, ...pos);
        });
        Object.assign(floormaterial, scene.floor);
        background = scene.bg;
        reflectivity = scene.reflect ?? 0.25;
        options.animate_lights = scene.animate;
        refreshGUI();
    }

    function applyMaterial(name) {
        Object.assign(material, structuredClone(MATERIALS[name]));
        refreshGUI();
    }

    //GUI----

    const gui2 = new dat.GUI();

    const optionsGui = gui2.addFolder("options");
    optionsGui.add(options, "backface_culling").name("Backface Culling");
    optionsGui.add(options, "depth_test").name("Depth Test");
    optionsGui.add(options, "show_lights").name("Show Lights");
    optionsGui.add(options, "shadows").name("Shadows");
    optionsGui.add(options, "animate_lights").name("Animate Lights");
    optionsGui.add(options, "turntable").name("Turntable");
    optionsGui.add(options, "reflections").name("Reflections");
    optionsGui.add(options, "bloom").name("Bloom");

    const cameraGui = gui2.addFolder("camera");

    cameraGui.add(camera, "fovy").min(1).max(100).step(1).listen();

    cameraGui.add(camera, "near").min(0.1).max(20).onChange( function(v) {
        camera.near = Math.min(camera.far-0.5, v);
    });

    cameraGui.add(camera, "far").min(0.1).max(20).listen().onChange( function(v) {
        camera.far = Math.max(camera.near+0.5, v);
    });

    const eye = cameraGui.addFolder("eye");
    eye.add(camera.eye, 0).step(0.05).name("x").listen();
    eye.add(camera.eye, 1).step(0.05).name("y").listen();
    eye.add(camera.eye, 2).step(0.05).name("z").listen();

    const at = cameraGui.addFolder("at");
    at.add(camera.at, 0).step(0.05).name("x");
    at.add(camera.at, 1).step(0.05).name("y");
    at.add(camera.at, 2).step(0.05).name("z");

    const up = cameraGui.addFolder("up");
    up.add(camera.up, 0).step(0.05).name("x");
    up.add(camera.up, 1).step(0.05).name("y");
    up.add(camera.up, 2).step(0.05).name("z");

    const GUIlights = gui2.addFolder("lights");
    lights.forEach((light, i) => {
        const folder = GUIlights.addFolder("light" + (i+1));
        folder.add(light.pos, 0).step(0.05).name("x").listen();
        folder.add(light.pos, 1).step(0.05).name("y").listen();
        folder.add(light.pos, 2).step(0.05).name("z").listen();
        folder.addColor(light, "Ia").name("Ambient");
        folder.addColor(light, "Id").name("Diffuse");
        folder.addColor(light, "Is").name("Specular");
        folder.add(light, "isDirectional").name("Directional");
        folder.add(light, "isActive").name("Active");
        folder.add(light, "isSpot").name("Spotlight");
        folder.add(light, "aperture").min(1).max(90).step(1).name("Aperture");
        folder.add(light, "cutoff").min(0).max(100).step(1).name("Cutoff");
    });

    const gui1 = new dat.GUI();

    gui1.add(state, "scene", Object.keys(SCENES)).name("Scene").onChange(applyScene);

    const objectGUI = gui1.addFolder("object");
    objectGUI.add(object, "shape", [...Object.keys(SHAPES), "Gallery"]);

    const shadingGUI = gui1.addFolder("shading");
    shadingGUI.add(shading, "model", {"Phong": 0, "Blinn-Phong": 1, "Toon": 2, "Normals": 3}).name("Model");
    shadingGUI.add(shading, "rim").name("Rim light");

    const materialGUI = gui1.addFolder("material");
    materialGUI.add(state, "material", Object.keys(MATERIALS)).name("Preset").onChange(applyMaterial);
    materialGUI.addColor(material,"Ka").name("Ambient");
    materialGUI.addColor(material,"Kd").name("Diffuse");
    materialGUI.addColor(material,"Ks").name("Specular");
    materialGUI.add(material, "shininess").min(1).max(500).step(1).listen().name("Shininess");

    const floorGUI = gui1.addFolder("floor");
    floorGUI.addColor(floormaterial,"Ka").name("Ambient");
    floorGUI.addColor(floormaterial,"Kd").name("Diffuse");
    floorGUI.addColor(floormaterial,"Ks").name("Specular");
    floorGUI.add(floormaterial, "shininess").min(1).max(500).step(1).name("Shininess");

    function refreshGUI(gui = gui1) {
        gui.__controllers.forEach(c => c.updateDisplay());
        Object.values(gui.__folders).forEach(f => refreshGUI(f));
        if(gui == gui1) refreshGUI(gui2);
    }

    applyScene("Original");

    //----

    // matrices
    let mView, mProjection;

    resizeCanvasToFullWindow();

    window.addEventListener('resize', resizeCanvasToFullWindow);

    canvas.addEventListener('wheel', function(event) {
        event.preventDefault();
        const factor = 1 - event.deltaY/1000;
        camera.fovy = Math.max(1, Math.min(100, camera.fovy * factor));
    }, {passive: false});

    // drag orbits the eye around the point the camera looks at
    let dragging = false;
    canvas.addEventListener('mousedown', () => dragging = true);
    window.addEventListener('mouseup', () => dragging = false);
    window.addEventListener('mousemove', function(event) {
        if(!dragging) return;
        const off = subtract(camera.eye, camera.at);
        const r = length(off);
        const yaw = Math.atan2(off[0], off[2]) - event.movementX * 0.01;
        const pitch = Math.max(-1.5, Math.min(1.5, Math.asin(off[1] / r) + event.movementY * 0.01));
        camera.eye[0] = camera.at[0] + r * Math.cos(pitch) * Math.sin(yaw);
        camera.eye[1] = camera.at[1] + r * Math.sin(pitch);
        camera.eye[2] = camera.at[2] + r * Math.cos(pitch) * Math.cos(yaw);
    });

    const sceneNames = Object.keys(SCENES);
    const shapeNames = [...Object.keys(SHAPES), "Gallery"];
    document.addEventListener('keydown', function(event) {
        if(event.target.tagName == "INPUT") return;
        if(event.key >= '1' && event.key <= '6') object.shape = shapeNames[event.key - 1];
        switch(event.key.toLowerCase()) {
            case ' ': options.turntable = !options.turntable; event.preventDefault(); break;
            case 'l': options.animate_lights = !options.animate_lights; break;
            case 's': options.shadows = !options.shadows; break;
            case 'r': options.reflections = !options.reflections; break;
            case 'b': options.bloom = !options.bloom; break;
            case 'x':
                state.scene = show ? show.previous : SHOW;
                applyScene(state.scene);
                break;
            case 'm': shading.model = (Number(shading.model) + 1) % 4; break;
            case 'p':
                state.scene = sceneNames[(sceneNames.indexOf(state.scene) + 1) % sceneNames.length];
                applyScene(state.scene);
                break;
            case 'h': document.getElementById("help").classList.toggle("hidden"); break;
        }
        refreshGUI();
    });

    const uKa = gl.getUniformLocation(program, "uMaterial.Ka");
    const uKd = gl.getUniformLocation(program, "uMaterial.Kd");
    const uKs = gl.getUniformLocation(program, "uMaterial.Ks");
    const uShininess = gl.getUniformLocation(program, "uMaterial.shininess");

    const uLights = lights.map((_, i) => {
        const loc = name => gl.getUniformLocation(program, `uLight[${i}].${name}`);
        return {
            pos: loc("pos"), Ia: loc("Ia"), Id: loc("Id"), Is: loc("Is"),
            isDirectional: loc("isDirectional"), isActive: loc("isActive"),
            isSpot: loc("isSpot"), axis: loc("axis"), aperture: loc("aperture"), cutoff: loc("cutoff")
        };
    });

    let lastTime;
    window.requestAnimationFrame(render);

    function resizeCanvasToFullWindow()
    {
        const ratio = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * ratio;
        canvas.height = window.innerHeight * ratio;

        camera.aspect = canvas.width / canvas.height;

        gl.viewport(0,0,canvas.width, canvas.height);

        if(targets) Object.values(targets).forEach(deleteTarget);
        const w = Math.max(1, canvas.width >> 1), h = Math.max(1, canvas.height >> 1);
        targets = {
            scene: makeTarget(canvas.width, canvas.height, true),
            a: makeTarget(w, h, false),
            b: makeTarget(w, h, false)
        };
    }

    function makeTarget(w, h, depth)
    {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        // non power of two sizes need clamping and no mipmaps in WebGL1
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        let rb = null;
        if(depth) {
            rb = gl.createRenderbuffer();
            gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, w, h);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, rb);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return {tex, fb, rb, w, h};
    }

    function deleteTarget(t)
    {
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fb);
        if(t.rb) gl.deleteRenderbuffer(t.rb);
    }

    // the shadow pass's modelview flattens everything onto the floor, so it has no normal matrix
    function uploadModelView(normals = true)
    {
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mModelView"), false, flatten(STACK.modelView()));
        if(normals) gl.uniformMatrix4fv(gl.getUniformLocation(program, "mNormals"), false, flatten(normalMatrix(STACK.modelView())));
    }

    function uploadMaterial(mat)
    {
        gl.uniform3fv(uKa, mat.Ka);
        gl.uniform3fv(uKd, mat.Kd);
        gl.uniform3fv(uKs, mat.Ks);
        gl.uniform1f(uShininess, mat.shininess);
    }

    function setFlag(name, value)
    {
        gl.uniform1i(gl.getUniformLocation(program, name), value);
    }

    function drawfloor(fade = 0){
        uploadMaterial(floormaterial);
        setFlag("uChecker", true);
        gl.uniform1f(gl.getUniformLocation(program, "uFloorFade"), fade);
        if(fade > 0) {
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
        }
        STACK.pushMatrix();
        STACK.multTranslation([0,-0.6,0])
        STACK.multScale([3,0.1,3]);
        uploadModelView();
        CUBE.draw(gl, program, gl.TRIANGLES);
        STACK.popMatrix();
        gl.disable(gl.BLEND);
        gl.uniform1f(gl.getUniformLocation(program, "uFloorFade"), 0);
        setFlag("uChecker", false);
    }

    function uploadView(view)
    {
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mView"), false, flatten(view));
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mViewNormals"), false, flatten(normalMatrix(view)));
    }

    // the scene seen in the floor: drawn mirrored, only where the floor's stencil bit is set.
    // the lights go through the mirrored view matrix too, so they light the reflection from below
    function drawReflection(){
        // mark the floor without drawing it
        gl.colorMask(false, false, false, false);
        gl.depthMask(false);
        gl.stencilFunc(gl.ALWAYS, 0x80, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        drawfloor();
        gl.colorMask(true, true, true, true);
        gl.depthMask(true);

        const mirrored = mult(mView, MIRROR);
        uploadView(mirrored);
        STACK.loadMatrix(mirrored);
        gl.stencilFunc(gl.EQUAL, 0x80, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        // a mirror flips the winding of every triangle
        gl.cullFace(gl.FRONT);
        uploadMaterial(material);
        drawObjects();
        if(options.show_lights) drawlight();
        gl.cullFace(gl.BACK);
        uploadView(mView);
        STACK.loadMatrix(mView);
    }

    function drawObjects(normals = true){
        STACK.pushMatrix();
        STACK.multRotationY(turntableAngle);
        STACK.multScale([objectScale, objectScale, objectScale]);
        if(object.shape == "Gallery") {
            Object.values(SHAPES).forEach((shape, i) => {
                const a = i / 5 * 2 * Math.PI;
                STACK.pushMatrix();
                STACK.multTranslation([1.4*Math.cos(a), FLOOR_TOP + 0.35, 1.4*Math.sin(a)]);
                STACK.multScale([0.7,0.7,0.7]);
                uploadModelView(normals);
                shape.draw(gl, program, gl.TRIANGLES);
                STACK.popMatrix();
            });
        }
        else {
            uploadModelView(normals);
            SHAPES[object.shape].draw(gl, program, gl.TRIANGLES);
        }
        STACK.popMatrix();
    }

    // projects onto the floor plane from the light (w = 0 for a directional light)
    function shadowMatrix(L)
    {
        const P = [0, 1, 0, -(FLOOR_TOP + 0.002)];
        const d = P[0]*L[0] + P[1]*L[1] + P[2]*L[2] + P[3]*L[3];
        const S = mat4();
        for(let i = 0; i < 4; i++)
            for(let j = 0; j < 4; j++)
                S[i][j] = (i == j ? d : 0) - L[i]*P[j];
        return S;
    }

    function drawShadows(){
        const casters = lights.filter(l => l.isActive && l.pos[1] > (l.isDirectional ? 0 : FLOOR_TOP + 0.1));
        if(casters.length == 0) return;

        gl.enable(gl.BLEND);
        // keep the destination alpha at 1 so the page never shows through the canvas
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
        gl.disable(gl.CULL_FACE);
        gl.depthMask(false);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(-1, -1);
        setFlag("uShadow", true);
        for(const light of casters) {
            // bit 0x80 marks the floor; the low bits stop one light's shadow from darkening a pixel twice
            gl.stencilMask(0x7f);
            gl.clear(gl.STENCIL_BUFFER_BIT);
            gl.stencilFunc(gl.EQUAL, 0x80, 0xff);
            gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
            const strength = (0.3*light.Id[0] + 0.59*light.Id[1] + 0.11*light.Id[2]) / 255;
            gl.uniform1f(gl.getUniformLocation(program, "uShadowAlpha"), Math.min(0.6, 0.55 * strength / Math.sqrt(casters.length)));
            STACK.pushMatrix();
            STACK.loadMatrix(mult(mView, shadowMatrix([light.pos[0], light.pos[1], light.pos[2], light.isDirectional ? 0 : 1])));
            drawObjects(false);
            STACK.popMatrix();
        }
        setFlag("uShadow", false);
        gl.stencilMask(0xff);
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }

    function drawlight(){
        setFlag("uEmissive", true);
        for(const light of lights) {
            gl.uniform3fv(gl.getUniformLocation(program, "uColor"), light.isActive ? light.Id : [60,60,60]);
            STACK.pushMatrix();
            STACK.multTranslation(vec3(light.pos));
            if(light.isActive) {
                STACK.pushMatrix();
                STACK.multScale([0.06,0.06,0.06]);
                uploadModelView(false);
                SPHERE.draw(gl, program, gl.TRIANGLES);
                STACK.popMatrix();
            }
            STACK.multScale([0.1,0.1,0.1]);
            uploadModelView(false);
            SPHERE.draw(gl, program, gl.LINES);
            STACK.popMatrix();
        }
        setFlag("uEmissive", false);
    }

    function drawBackground(){
        gl.useProgram(bgProgram);
        gl.disable(gl.DEPTH_TEST);
        gl.bindBuffer(gl.ARRAY_BUFFER, bgBuffer);
        const loc = gl.getAttribLocation(bgProgram, "vPosition");
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(loc);
        gl.uniform3fv(gl.getUniformLocation(bgProgram, "uInner"), background[0]);
        gl.uniform3fv(gl.getUniformLocation(bgProgram, "uOuter"), background[1]);
        gl.uniform1f(gl.getUniformLocation(bgProgram, "uAspect"), camera.aspect);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disableVertexAttribArray(loc);
    }

    function postPass(target, pass, uniforms)
    {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
        if(target) gl.viewport(0, 0, target.w, target.h);
        else gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform1i(gl.getUniformLocation(postProgram, "uPass"), pass);
        for(const [name, value] of Object.entries(uniforms)) {
            const loc = gl.getUniformLocation(postProgram, name);
            if(Array.isArray(value)) gl.uniform2fv(loc, value);
            else gl.uniform1f(loc, value);
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // bloom: keep what is bright, blur it at half resolution, add it back over the scene
    function postProcess()
    {
        const {scene, a, b} = targets;
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.STENCIL_TEST);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
        gl.useProgram(postProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, bgBuffer);
        const loc = gl.getAttribLocation(postProgram, "vPosition");
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(loc);
        gl.uniform1i(gl.getUniformLocation(postProgram, "uTex"), 0);
        gl.uniform1i(gl.getUniformLocation(postProgram, "uBloom"), 1);
        gl.activeTexture(gl.TEXTURE0);

        gl.bindTexture(gl.TEXTURE_2D, scene.tex);
        postPass(a, 0, {uThreshold: 0.72});
        // two rounds, the second one twice as wide
        for(const spread of [1, 2]) {
            gl.bindTexture(gl.TEXTURE_2D, a.tex);
            postPass(b, 1, {uDir: [spread / a.w, 0]});
            gl.bindTexture(gl.TEXTURE_2D, b.tex);
            postPass(a, 1, {uDir: [0, spread / a.h]});
        }

        gl.bindTexture(gl.TEXTURE_2D, scene.tex);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, a.tex);
        postPass(null, 2, {uStrength: bloomStrength, uAberration: aberration});

        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.disableVertexAttribArray(loc);
    }

    // everything in show mode follows the music's beat clock
    function animateShow()
    {
        const beat = show.music.beat();
        const step = Math.floor(beat * 4);
        const bar = Math.floor(beat / 4);
        const kick = hasKick(Math.floor(beat) * 4) ? Math.exp(-(beat % 1) * 5) : 0;
        const hue = SHOW_HUES[chordOf(bar)];
        const drop = isDrop(bar);

        if(bar != show.bar) {
            show.bar = bar;
            object.shape = SHOW_SHAPES[Math.floor(bar / 2) % SHOW_SHAPES.length];
            state.material = SHOW_MATERIALS[bar % SHOW_MATERIALS.length];
            Object.assign(material, structuredClone(MATERIALS[state.material]));
        }

        lights.forEach((light, i) => {
            const a = i / MAX_LIGHTS * 2 * Math.PI + beat * Math.PI / 8;
            const r = 2.2 + 0.4 * Math.sin(beat * Math.PI / 4);
            light.pos[0] = r * Math.cos(a);
            light.pos[1] = 2.4 + 0.3 * Math.sin(beat * Math.PI / 2 + i);
            light.pos[2] = r * Math.sin(a);
            // the drop strobes the ring in alternating halves on every eighth note
            const level = drop ? ((Math.floor(step / 2) + i) % 2 ? 1 : 0.08) : 0.25 + 0.75 * kick;
            const color = hsv((hue + i / MAX_LIGHTS * 0.25) % 1, 0.9, level);
            light.Id = color;
            light.Is = color;
            light.aperture = 14 + 10 * kick;
            const target = [0.8 * Math.cos(beat * Math.PI / 2 + i), FLOOR_TOP, 0.8 * Math.sin(beat * Math.PI / 2 + i * 1.3)];
            light.axis = normalize(subtract(target, light.pos.slice(0, 3)));
        });

        objectScale = 1 + 0.06 * kick;
        bloomStrength = 1.1 + (drop ? 1.2 : 0.6) * kick;
        aberration = 0.012 * kick;

        const orbit = beat * Math.PI / 16;
        camera.eye[0] = 6.4 * Math.sin(orbit);
        camera.eye[1] = 1.5 + 0.7 * Math.sin(beat * Math.PI / 16);
        camera.eye[2] = 6.4 * Math.cos(orbit);
        camera.fovy = 45 - 2.5 * kick;

        const glow = hsv(hue, 0.85, 0.18 + 0.2 * kick).map(c => c / 255);
        background = [glow, [0, 0, 0]];
    }

    function animate(dt)
    {
        if(options.turntable) turntableAngle += 30 * dt;
        if(options.animate_lights) {
            lightTime += dt;
            // spin every light around the vertical axis, in place so the GUI follows
            const a = 0.6 * dt, c = Math.cos(a), s = Math.sin(a);
            for(const light of lights) {
                const [x, , z] = light.pos;
                light.pos[0] = x*c - z*s;
                light.pos[2] = x*s + z*c;
            }
        }
        if(show) {
            animateShow();
            return;
        }
        // spotlights aim at the object; while animated they sweep around it
        lights.forEach((light, i) => {
            const wobble = options.animate_lights ? 0.7 : 0;
            const target = [wobble*Math.cos(lightTime*1.7 + i*0.8), 0, wobble*Math.sin(lightTime*1.1 + i*1.3)];
            light.axis = normalize(subtract(target, light.pos.slice(0, 3)));
        });
    }

    function render(time)
    {
        window.requestAnimationFrame(render);

        const dt = lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, 0.1);
        lastTime = time;
        animate(dt);

        gl.bindFramebuffer(gl.FRAMEBUFFER, options.bloom ? targets.scene.fb : null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.stencilMask(0xff);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
        drawBackground();

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

        gl.useProgram(program);

        mView = lookAt(camera.eye, camera.at, camera.up);
        STACK.loadMatrix(mView);

        mProjection = perspective(camera.fovy, camera.aspect, camera.near, camera.far);

        gl.uniformMatrix4fv(gl.getUniformLocation(program, "mProjection"), false, flatten(mProjection));
        uploadView(mView);
        gl.uniform1i(gl.getUniformLocation(program, "uShading"), Number(shading.model));
        setFlag("uRim", shading.rim);

        lights.forEach((light, i) => {
            const u = uLights[i];
            gl.uniform4fv(u.pos, light.pos);
            gl.uniform3fv(u.Ia, light.Ia);
            gl.uniform3fv(u.Id, light.Id);
            gl.uniform3fv(u.Is, light.Is);
            gl.uniform1i(u.isDirectional, light.isDirectional);
            gl.uniform1i(u.isActive, light.isActive);
            gl.uniform1i(u.isSpot, light.isSpot);
            gl.uniform3fv(u.axis, light.axis);
            gl.uniform1f(u.aperture, light.aperture);
            gl.uniform1f(u.cutoff, light.cutoff);
        });

        // the floor marks its pixels in the stencil so shadows stay on it
        gl.enable(gl.STENCIL_TEST);
        const mirror = options.reflections && camera.eye[1] > FLOOR_TOP;
        if(mirror) drawReflection();
        gl.stencilFunc(gl.ALWAYS, 0x80, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        drawfloor(mirror ? reflectivity : 0);
        if(options.shadows) drawShadows();
        gl.disable(gl.STENCIL_TEST);
        if(options.backface_culling) gl.enable(gl.CULL_FACE);

        uploadMaterial(material);
        drawObjects();

        //show lights
        if(options.show_lights){
            drawlight();
        }

        if(options.bloom) postProcess();
    }
}

const urls = ['shader.vert', 'shader.frag', 'bg.vert', 'bg.frag', 'post.vert', 'post.frag'];

loadShadersFromURLS(urls).then( shaders => setup(shaders));
