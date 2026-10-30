import { buildProgramFromSources, loadShadersFromURLS, setupWebGL } from "../../libs/utils.js";
import { ortho, perspective, lookAt, flatten, vec3, vec4, mat4, mult, translate, rotateY, rotateZ, normalize } from "../../libs/MV.js";
import {modelView, loadMatrix, multRotationY, multScale, multTranslation, popMatrix, pushMatrix, multRotationX, multRotationZ} from "../../libs/stack.js";

import * as SPHERE from '../../libs/sphere.js';
import * as TORUS from '../../libs/torus.js';
import * as CUBE from '../../libs/cube.js';
import * as CYLINDRE from '../../libs/cylinder.js';
import * as PYRAMID from '../../libs/pyramid.js';


/** @type WebGLRenderingContext */
let gl;
let program;
let skyProgram;
let skyBuffer;
let mode;
let canvas = document.getElementById("gl-canvas");
let aspect = canvas.width / canvas.height;
let VP_DISTANCE = 4;
let mProjection;
let Mview;

const g = -9.8; //acelaraçao gravitica
const speed = 7; //velocidade do tiro
const torus_raio = 0.7;
const scalewheel = 1/8;
const arena = 5.6; //the tank and the targets stay inside [-arena, arena]
const floor_top = -0.01;
const floor_half = 6; //60 tiles of 1/5
const bullet_radius = 1/16;
const fire_cooldown = 0.3;
const N_TARGETS = 5;

const sun = normalize(vec3(0.5, 1.0, 0.3));
const horizon = vec3(0.72, 0.8, 0.88);
const zenith = vec3(0.16, 0.33, 0.6);

//the four original views, plus a free orbit camera and a chase camera
const ortho_views = {
    '1': lookAt([0,0,0], [-1,0,0], [0,1,0]),
    '2': lookAt([1,1,0], [0,-1,0], [0,1,0]),
    '3': lookAt([0,0,0], [0,0,-1], [0,1,0]),
    '4': lookAt([-1,1,-1], [2,-1,2], [0,1,0])
};
const camera_names = {'1': "Frente", '2': "Topo", '3': "Lado", '4': "Axonometria", '5': "Órbita", '6': "Perseguição"};
let camera = '5';
const orbit = {yaw: 2.3, pitch: 0.45, dist: 6};
let shake = 0;

const tank = {x: 0, z: 0, heading: 0, turret: 0, elevation: 20, rotL: 0, rotR: 0, recoil: 0, cooldown: 0};
let bullets = [];//{p, v}
let particles = [];//{kind, p, v, life, max, size, color, spin}
let scorches = [];//{x, z, size, life}
let targets = [];//{x, z, phase, alive, respawn, grow}
const score = {hits: 0, shots: 0};
const held = new Set();
let lastTime;
let toastTimer;

function setup(shaders)
{
    gl = setupWebGL(canvas, {stencil: true});

    program = buildProgramFromSources(gl, shaders["shader.vert"], shaders["shader.frag"]);
    skyProgram = buildProgramFromSources(gl, shaders["sky.vert"], shaders["sky.frag"]);
    skyBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    mode = gl.TRIANGLES;

    resize_canvas();
    window.addEventListener("resize", resize_canvas);

    CUBE.init(gl);
    TORUS.init(gl);
    SPHERE.init(gl);
    CYLINDRE.init(gl);
    PYRAMID.init(gl);
    gl.enable(gl.DEPTH_TEST);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    for(let i = 0; i < N_TARGETS; i++) targets.push(newTarget());

    document.onkeydown = function(event) {
        held.add(event.code);
        switch(event.key) {
            case '+':
                VP_DISTANCE = Math.max(VP_DISTANCE - 0.2, 1.1);
                orbit.dist = Math.max(orbit.dist - 0.4, 2.5);
                break;
            case '-':
                VP_DISTANCE = Math.min(VP_DISTANCE + 0.2, 10);
                orbit.dist = Math.min(orbit.dist + 0.4, 18);
                break;
            case 'W':
                mode = gl.LINES;
                break;
            case 'S':
                mode = gl.TRIANGLES;
                break;
            case '1': case '2': case '3': case '4': case '5': case '6':
                camera = event.key;
                toast("Câmara: " + camera_names[camera]);
                break;
            case 'h':
                document.getElementById("hud").classList.toggle("hidden");
                break;
        }
        if(event.code == "Space" || event.code.startsWith("Arrow")) event.preventDefault();
        updateHud();
    }
    document.onkeyup = event => held.delete(event.code);
    window.addEventListener("blur", () => held.clear());

    //drag to orbit, wheel to zoom
    let dragging = false;
    canvas.addEventListener("mousedown", () => dragging = true);
    window.addEventListener("mouseup", () => dragging = false);
    window.addEventListener("mousemove", function(event) {
        if(!dragging || camera != '5') return;
        orbit.yaw += event.movementX * 0.008;
        orbit.pitch = Math.min(Math.max(orbit.pitch + event.movementY * 0.006, 0.08), 1.45);
    });
    canvas.addEventListener("wheel", function(event) {
        event.preventDefault();
        const f = Math.exp(event.deltaY * 0.001);
        orbit.dist = Math.min(Math.max(orbit.dist * f, 2.5), 18);
        VP_DISTANCE = Math.min(Math.max(VP_DISTANCE * f, 1.1), 10);
    }, {passive: false});

    updateHud();
    window.requestAnimationFrame(render);
}

function resize_canvas(event)
{
    const ratio = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * ratio;
    canvas.height = window.innerHeight * ratio;
    aspect = canvas.width / canvas.height;
    gl.viewport(0,0,canvas.width, canvas.height);
}

function toast(message)
{
    const el = document.getElementById("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1200);
}

function updateHud()
{
    document.getElementById("score").textContent = score.hits;
    document.getElementById("shots").textContent = score.shots;
    document.getElementById("accuracy").textContent = score.shots ? Math.round(100*score.hits/score.shots) + "%" : "–";
    document.getElementById("camera").textContent = camera_names[camera];
}

//---------------------------------------------------------------- simulation

function newTarget()
{
    let x, z;
    do {
        const a = Math.random() * 2 * Math.PI;
        const r = 2 + Math.random() * 3.2;
        x = r * Math.cos(a);
        z = r * Math.sin(a);
    } while(Math.hypot(x - tank.x, z - tank.z) < 1.5);
    return {x, z, phase: Math.random() * 6, alive: true, respawn: 0, grow: 0};
}

//world transform of the barrel, built with the same chain tankbody() uses
function barrelMatrix()
{
    let m = translate(tank.x, 0, tank.z);
    m = mult(m, rotateY(tank.heading));
    m = mult(m, translate(-0.2, 0.5, 0));
    m = mult(m, rotateY(tank.turret));
    m = mult(m, translate(0.25, 0, 0));
    return mult(m, rotateZ(-90 + tank.elevation));
}

function fire()
{
    const m = barrelMatrix();
    const tip = mult(m, vec4(0, 1.03, 0, 1));
    const dir = normalize(vec3(mult(m, vec4(0, 1, 0, 0))));
    const p = [tip[0], tip[1], tip[2]];
    bullets.push({p, v: dir.map(c => c * speed)});
    tank.recoil = 1;
    tank.cooldown = fire_cooldown;
    shake = Math.max(shake, 0.04);
    score.shots++;
    spawn('flash', p, [0, 0, 0], 0.12, 0.35, [1.0, 0.75, 0.3]);
    for(let i = 0; i < 6; i++) {
        spawn('smoke', p, dir.map(c => c * (0.3 + Math.random()) + (Math.random() - 0.5) * 0.4), 0.9, 0.12, [0.75, 0.75, 0.75]);
    }
    updateHud();
}

function spawn(kind, p, v, life, size, color)
{
    particles.push({kind, p: [...p], v: [...v], life, max: life, size, color, spin: Math.random() * 360});
}

function explode(p, big)
{
    const n = big ? 40 : 18;
    spawn('flash', p, [0, 0, 0], 0.25, big ? 1.2 : 0.6, [1.0, 0.6, 0.2]);
    spawn('ring', [p[0], floor_top + 0.02, p[2]], [0, 0, 0], 0.5, big ? 2.4 : 1.2, [1.0, 0.85, 0.6]);
    for(let i = 0; i < n; i++) {
        const a = Math.random() * 2 * Math.PI;
        const s = 1 + Math.random() * (big ? 4 : 2.5);
        spawn('debris', p, [Math.cos(a)*s, 2 + Math.random() * (big ? 5 : 3), Math.sin(a)*s], 0.8 + Math.random() * 0.8, 0.04 + Math.random() * 0.05, [1.0, 0.5 + Math.random() * 0.3, 0.1]);
    }
    for(let i = 0; i < n/2; i++) {
        spawn('smoke', p, [(Math.random() - 0.5), 0.6 + Math.random() * 0.8, (Math.random() - 0.5)], 1.5 + Math.random(), 0.25, [0.35, 0.33, 0.3]);
    }
    scorches.push({x: p[0], z: p[2], size: big ? 0.9 : 0.5, life: 10});
    shake = Math.max(shake, big ? 0.15 : 0.07);
}

function update(dt)
{
    //driving: arrows move and turn the hull, a/d turn the turret, w/s raise the cannon
    const drive = (held.has("ArrowUp") ? 1 : 0) - (held.has("ArrowDown") ? 1 : 0);
    const turn = (held.has("ArrowLeft") ? 1 : 0) - (held.has("ArrowRight") ? 1 : 0);
    const shift = held.has("ShiftLeft") || held.has("ShiftRight");
    const h = tank.heading * Math.PI / 180;
    tank.heading += turn * 70 * dt;
    tank.x = Math.min(Math.max(tank.x + Math.cos(h) * drive * 1.6 * dt, -arena), arena);
    tank.z = Math.min(Math.max(tank.z - Math.sin(h) * drive * 1.6 * dt, -arena), arena);
    tank.rotL -= (drive - turn * 0.5) * 100 * dt;
    tank.rotR -= (drive + turn * 0.5) * 100 * dt;
    if(held.has("KeyA")) tank.turret += 80 * dt;
    if(held.has("KeyD")) tank.turret -= 80 * dt;
    if(held.has("KeyW") && !shift) tank.elevation = Math.min(tank.elevation + 40 * dt, 45);
    if(held.has("KeyS") && !shift) tank.elevation = Math.max(tank.elevation - 40 * dt, 0);

    if((drive || turn) && Math.random() < 0.5) {
        const side = Math.random() < 0.5 ? 1 : -1;
        const back = -0.5 * drive;
        spawn('smoke', [tank.x + Math.cos(h)*back - Math.sin(h)*0.55*side, 0.03, tank.z - Math.sin(h)*back - Math.cos(h)*0.55*side],
              [0, 0.25, 0], 0.7, 0.08, [0.55, 0.48, 0.36]);
    }

    tank.cooldown -= dt;
    if(held.has("Space") && tank.cooldown <= 0) fire();
    tank.recoil = Math.max(tank.recoil - dt * 4, 0);
    shake = Math.max(shake - dt * 0.4, 0);

    //bullets fly in world space, so turning the tank after the shot doesn't bend them
    for(let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.v[1] += g * dt;
        for(let c = 0; c < 3; c++) b.p[c] += b.v[c] * dt;
        if(Math.random() < 0.7) spawn('smoke', b.p, [0, 0.1, 0], 0.5, 0.05, [0.85, 0.85, 0.85]);

        const hit = targets.find(t => t.alive && t.grow > 0.9 && Math.hypot(b.p[0] - t.x, b.p[1] - 0.65, b.p[2] - t.z) < 0.35);
        if(hit) {
            hit.alive = false;
            hit.respawn = 1.5;
            score.hits++;
            toast("Acertou! +1");
            explode([hit.x, 0.6, hit.z], true);
            bullets.splice(i, 1);
            updateHud();
        }
        else if(b.p[1] <= floor_top + bullet_radius) {
            //past the floor's edge the shell keeps falling instead of exploding in the air
            const onFloor = Math.abs(b.p[0]) < floor_half && Math.abs(b.p[2]) < floor_half;
            if(onFloor) explode([b.p[0], floor_top + bullet_radius, b.p[2]], false);
            if(onFloor || b.p[1] < -5) bullets.splice(i, 1);
        }
    }

    for(const t of targets) {
        t.phase += dt;
        if(t.alive) {
            t.grow = Math.min(t.grow + dt * 2, 1);
        }
        else if((t.respawn -= dt) <= 0) {
            Object.assign(t, newTarget());
        }
    }

    for(let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if(p.life <= 0) {
            particles.splice(i, 1);
            continue;
        }
        if(p.kind == 'debris') {
            p.v[1] += g * dt;
            p.spin += 400 * dt;
            if(p.p[1] < floor_top + p.size && p.v[1] < 0) {
                p.v[1] *= -0.35;
                p.v[0] *= 0.6;
                p.v[2] *= 0.6;
            }
        }
        else if(p.kind == 'smoke') {
            p.v = p.v.map(c => c * (1 - dt * 1.5));
        }
        for(let c = 0; c < 3; c++) p.p[c] += p.v[c] * dt;
    }

    scorches = scorches.filter(s => (s.life -= dt) > 0);
}

//---------------------------------------------------------------- drawing

//inverse transpose of the model-view's 3x3 part, up to a scale the shader normalizes away
function normalMatrix3(m)
{
    const [a, b, c] = m;
    return new Float32Array([
        b[1]*c[2] - b[2]*c[1], -(a[1]*c[2] - a[2]*c[1]), a[1]*b[2] - a[2]*b[1],
        -(b[0]*c[2] - b[2]*c[0]), a[0]*c[2] - a[2]*c[0], -(a[0]*b[2] - a[2]*b[0]),
        b[0]*c[1] - b[1]*c[0], -(a[0]*c[1] - a[1]*c[0]), a[0]*b[1] - a[1]*b[0]
    ]);
}

function uploadModelView()
{
    const m = modelView();
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "mModelView"), false, flatten(m));
    gl.uniformMatrix3fv(gl.getUniformLocation(program, "mNormals"), false, normalMatrix3(m));
}

function setColor(r, g, b, a = 1, emissive = 0)
{
    gl.uniform4f(gl.getUniformLocation(program, "color"), r, g, b, a);
    gl.uniform1f(gl.getUniformLocation(program, "emissive"), emissive);
}

function draw(shape)
{
    uploadModelView();
    shape.draw(gl, program, mode);
}

//draws the floor
function Tile()
{
    for(let z = -30; z < 30 ; z++){
        for(let x = -30; x < 30 ; x++){
            if((z%2 == 0 && x%2 != 0) || (z%2 != 0 && x%2 == 0)){
                setColor(0.22, 0.42, 0.18);
            }
            else{
                setColor(0.28, 0.52, 0.22);
            }
            pushMatrix();
                multTranslation([x,0,z]);
                draw(CUBE);
            popMatrix();
        }
    }
}

function wheels(z, rot){
    for(let x = -3; x < 4; x++){
        pushMatrix();
            multScale([1/8,1/8,1/8]);
            multTranslation([x,0,z]);
            multRotationX(90);
            multRotationY(2*Math.PI*torus_raio*scalewheel*rot);
            setColor(0.08, 0.08, 0.08);
            draw(TORUS);
            setColor(0.45, 0.12, 0.08);
            multScale([1,1/2,1]);
            draw(SPHERE);
        popMatrix();
    }
}

function rightwheels(){
    wheels(4.5, tank.rotR);
}

function leftwheels(){
    wheels(-4.5, tank.rotL);
}

function axis(){
    setColor(0.5, 0.5, 0.5);
    for(let x = -3; x < 4; x++){
        pushMatrix();
            multScale([1/8,1/8,1.1]);
            multTranslation([x,0,0]);
            multRotationX(90);
            draw(CYLINDRE);
        popMatrix();
    }
}

function tankbody(){
    setColor(0.24, 0.3, 0.16);
    pushMatrix();
        multTranslation([0.0,0.21,0.0]);
        multScale([1, 1/10,1.2]);
        draw(CUBE);
    popMatrix();

    setColor(0.3, 0.36, 0.2);
    pushMatrix();
        multTranslation([0,0.32,0]);
        multScale([1,1/8,1]);
        draw(CUBE);
    popMatrix();

    setColor(0.34, 0.4, 0.22);
    pushMatrix();
        multTranslation([0.66,0.2,0]);
        multRotationZ(-90);
        multScale([1/2.5,1/3,1]);
        draw(PYRAMID);
    popMatrix();

    pushMatrix();
        multTranslation([-0.66,0.2,0]);
        multRotationZ(90);
        multScale([1/2.5,1/3,1]);
        draw(PYRAMID);
    popMatrix();

    setColor(0.36, 0.42, 0.24);
    pushMatrix();
        multTranslation([-0.2,0.5,0]);
        multRotationY(tank.turret);
        pushMatrix();
            multScale([1/2,1/4,1/2]);
            draw(CYLINDRE);
        popMatrix();
        multTranslation([0.25,0,0]);
        pushMatrix();
            multRotationZ(-90+tank.elevation);
            //recoil slides the barrel back along its own axis
            multTranslation([0,0.53 - 0.18*tank.recoil,0]);
            setColor(0.2, 0.24, 0.14);
            multScale([1/8,1,1/8]);
            draw(CYLINDRE);
        popMatrix();
        setColor(0.3, 0.36, 0.2);
        multScale([1/6,1/6,1/6]);
        draw(CUBE);
    popMatrix();
}

function target(t){
    const s = t.grow * t.grow * (3 - 2*t.grow);
    pushMatrix();
        multTranslation([t.x, 0, t.z]);
        multScale([s, s, s]);
        setColor(0.5, 0.42, 0.3);
        pushMatrix();
            multTranslation([0, 0.3, 0]);
            multScale([0.05, 0.6, 0.05]);
            draw(CYLINDRE);
        popMatrix();
        multTranslation([0, 0.65 + 0.05*Math.sin(t.phase), 0]);
        multRotationY(t.phase * 40);
        multRotationX(90);
        //smaller rings are thicker so every ring shows on both faces
        const rings = [[0.6, 0.04, [0.85, 0.1, 0.1]], [0.42, 0.06, [0.95, 0.95, 0.92]], [0.24, 0.08, [0.85, 0.1, 0.1]]];
        for(const [r, h, c] of rings) {
            pushMatrix();
                multScale([r, h, r]);
                setColor(...c);
                draw(CYLINDRE);
            popMatrix();
        }
    popMatrix();
}

function bullet(b){
    pushMatrix();
        multTranslation(b.p);
        multScale([2*bullet_radius, 2*bullet_radius, 2*bullet_radius]);
        setColor(1.0, 0.8, 0.4, 1, 0.8);
        draw(SPHERE);
    popMatrix();
}

function debris(p){
    const t = p.life / p.max;
    pushMatrix();
        multTranslation(p.p);
        multRotationX(p.spin);
        multRotationY(p.spin * 0.7);
        multScale([p.size, p.size, p.size]);
        //glowing hot at first, cooling down to dark
        setColor(p.color[0] * t + 0.15, p.color[1] * t * t + 0.12, p.color[2] * t + 0.1, 1, t);
        draw(CUBE);
    popMatrix();
}

//everything that casts a shadow
function casters(){
    pushMatrix();
        multTranslation([tank.x,0.0,tank.z]);
        multRotationY(tank.heading);
        multTranslation([-0.03*tank.recoil, 0, 0]);
        tankbody();
        pushMatrix();
            multTranslation([0,0.08,0]);
            rightwheels();
            leftwheels();
            axis();
        popMatrix();
    popMatrix();
    for(const t of targets) if(t.alive) target(t);
    for(const b of bullets) bullet(b);
    for(const p of particles) if(p.kind == 'debris') debris(p);
}

//transparent effects, drawn last without writing depth
function effects(){
    for(const p of particles) {
        if(p.kind == 'debris') continue;
        const t = p.life / p.max;
        pushMatrix();
            multTranslation(p.p);
            if(p.kind == 'smoke') {
                const s = p.size * (1 + 2.5 * (1 - t));
                multScale([s, s, s]);
                setColor(...p.color, 0.45 * t);
                draw(SPHERE);
            }
            else if(p.kind == 'flash') {
                const s = p.size * (0.4 + 0.6 * Math.sqrt(1 - t));
                multScale([s, s, s]);
                setColor(...p.color, t, 1);
                draw(SPHERE);
            }
            else if(p.kind == 'ring') {
                const s = p.size * (1 - t * t);
                multScale([s, s * 0.6, s]);
                setColor(...p.color, 0.6 * t, 1);
                draw(TORUS);
            }
        popMatrix();
    }
}

function scorchMarks(){
    for(const s of scorches) {
        pushMatrix();
            multTranslation([s.x, floor_top + 0.001, s.z]);
            multScale([s.size, 0.001, s.size]);
            setColor(0.05, 0.04, 0.03, 0.7 * Math.min(s.life / 3, 1));
            draw(CYLINDRE);
        popMatrix();
    }
}

//projects geometry onto the floor along the sun direction
function shadowMatrix()
{
    const y = floor_top + 0.002;
    const [lx, ly, lz] = sun;
    return mat4(
        1, -lx/ly, 0, y*lx/ly,
        0, 0, 0, y,
        0, -lz/ly, 1, y*lz/ly,
        0, 0, 0, 1
    );
}

function setupCamera()
{
    const persp = camera == '5' || camera == '6';
    if(persp) {
        mProjection = perspective(50, aspect, 0.1, 100);
    }
    else {
        mProjection = ortho(-VP_DISTANCE*aspect,VP_DISTANCE*aspect, -VP_DISTANCE, VP_DISTANCE,-5*VP_DISTANCE,5*VP_DISTANCE);
    }

    const jitter = () => (Math.random() - 0.5) * shake;
    if(camera == '5') {
        const at = [tank.x, 0.4, tank.z];
        const eye = [
            at[0] + orbit.dist * Math.cos(orbit.pitch) * Math.cos(orbit.yaw),
            at[1] + orbit.dist * Math.sin(orbit.pitch),
            at[2] + orbit.dist * Math.cos(orbit.pitch) * Math.sin(orbit.yaw)
        ];
        Mview = lookAt(eye.map(c => c + jitter()), at, [0,1,0]);
    }
    else if(camera == '6') {
        const a = (tank.heading + tank.turret) * Math.PI / 180;
        const dx = Math.cos(a), dz = -Math.sin(a);
        const eye = [tank.x - 0.2 - dx*2.2 + jitter(), 1.2 + jitter(), tank.z - dz*2.2];
        Mview = lookAt(eye, [tank.x + dx*3, 0.3, tank.z + dz*3], [0,1,0]);
    }
    else {
        Mview = mult(translate(jitter(), jitter(), 0), ortho_views[camera]);
    }

    gl.useProgram(program);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "mProjection"), false, flatten(mProjection));
    //directions only need the rotation part of the view matrix
    const toView = v => normalize(vec3(mult(Mview, vec4(...v, 0))));
    gl.uniform3fv(gl.getUniformLocation(program, "lightDir"), flatten(toView(sun)));
    gl.uniform3fv(gl.getUniformLocation(program, "upDir"), flatten(toView([0, 1, 0])));
    gl.uniform3fv(gl.getUniformLocation(program, "fogColor"), flatten(horizon));
    gl.uniform1f(gl.getUniformLocation(program, "fogDensity"), persp ? 0.06 : 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "orthographic"), persp ? 0.0 : 1.0);
}

function drawSky()
{
    gl.useProgram(skyProgram);
    gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuffer);
    const loc = gl.getAttribLocation(skyProgram, "vPosition");
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(loc);
    gl.uniform3fv(gl.getUniformLocation(skyProgram, "horizon"), flatten(horizon));
    gl.uniform3fv(gl.getUniformLocation(skyProgram, "zenith"), flatten(zenith));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(loc);
    gl.depthMask(true);
}

function setShadow(on)
{
    gl.uniform1f(gl.getUniformLocation(program, "shadowPass"), on ? 1 : 0);
}

function render(time)
{
    window.requestAnimationFrame(render);

    const dt = lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, 1/30);
    lastTime = time;
    update(dt);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    drawSky();
    setupCamera();
    setShadow(false);

    loadMatrix(Mview);
    pushMatrix();
        multTranslation([0,-1/50,0]);
        multScale([1/5, 1/50, 1/5]);
        Tile();
    popMatrix();

    gl.enable(gl.BLEND);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(false);
    gl.polygonOffset(-1, -1);
    scorchMarks();

    //the stencil makes overlapping shadow parts darken the floor only once
    gl.polygonOffset(-2, -2);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
    setShadow(true);
    loadMatrix(mult(Mview, shadowMatrix()));
    casters();
    setShadow(false);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    loadMatrix(Mview);
    casters();

    gl.enable(gl.BLEND);
    gl.depthMask(false);
    effects();
    gl.depthMask(true);
    gl.disable(gl.BLEND);
}

const urls = ["shader.vert", "shader.frag", "sky.vert", "sky.frag"];
loadShadersFromURLS(urls).then(shaders => setup(shaders))
