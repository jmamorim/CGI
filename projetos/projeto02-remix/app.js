import { buildProgramFromSources, loadShadersFromURLS, setupWebGL } from "../../libs/utils.js";
import { ortho, perspective, lookAt, flatten, vec3, vec4, mat4, mult, translate, rotateX, rotateY, rotateZ, normalize } from "../../libs/MV.js";
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
const skies = {
    normal: {horizon: vec3(0.72, 0.8, 0.88), zenith: vec3(0.16, 0.33, 0.6)},
    hills: {horizon: vec3(0.65, 0.85, 1.0), zenith: vec3(0.2, 0.45, 0.9)}
};

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

function newTank(x, z, heading)
{
    return {x, z, heading, turret: 0, elevation: 20, rotL: 0, rotR: 0, speed: 0, pitch: 0, pitchV: 0, roll: 0, rollV: 0, recoil: 0, cooldown: 0, hp: 5, flash: 0, dead: 0};
}

const tank = newTank(0, 0, 0);
const PLAYER_HP = 5;
const palettes = {
    player: {hull: [0.24, 0.3, 0.16], deck: [0.3, 0.36, 0.2], nose: [0.34, 0.4, 0.22], turret: [0.36, 0.42, 0.24], barrel: [0.2, 0.24, 0.14]},
    enemy: {hull: [0.42, 0.12, 0.1], deck: [0.52, 0.16, 0.12], nose: [0.58, 0.2, 0.14], turret: [0.6, 0.22, 0.16], barrel: [0.25, 0.08, 0.07]}
};
const battle = {on: false, wave: 0, next: 0, kills: 0};
let enemies = [];
let hurt = 0;
let radar = true;
let hills = false;
let ringsCollected = 0;
let clock = 0;
let bullets = [];//{p, v, owner}
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
        if(event.code == "KeyB") toggleBattle();
        if(event.code == "KeyG") toggleHills();
        if(event.code == "KeyM") radar = !radar;
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

    for(const [id, action] of [["btn-battle", toggleBattle], ["btn-hills", toggleHills]]) {
        const button = document.getElementById(id);
        //blur so Space fires the cannon instead of pressing the button again
        button.addEventListener("click", () => { action(); button.blur(); updateHud(); });
    }

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
    const frame = document.getElementById("radar");
    frame.style.width = frame.style.height = radarSize() + "px";
}

//radar side, in css pixels
function radarSize()
{
    return Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.28);
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
    document.getElementById("battle-box").classList.toggle("off", !battle.on);
    document.getElementById("hearts").textContent = "♥".repeat(tank.hp) + "♡".repeat(PLAYER_HP - tank.hp);
    document.getElementById("wave").textContent = battle.wave;
    document.getElementById("kills").textContent = battle.kills;
    document.getElementById("rings-box").classList.toggle("off", !hills);
    document.getElementById("rings").textContent = ringsCollected;
    document.getElementById("btn-battle").classList.toggle("active", battle.on);
    document.getElementById("btn-hills").classList.toggle("active", hills);
    document.getElementById("radar").classList.toggle("off", !radar);
}

function toggleBattle()
{
    battle.on = !battle.on;
    battle.wave = 0;
    battle.kills = 0;
    battle.next = 1;
    enemies = [];
    bullets = bullets.filter(b => b.owner == 'player');
    tank.hp = PLAYER_HP;
    toast(battle.on ? "Batalha! Sobrevive às vagas" : "Batalha terminada");
}

function toggleHills()
{
    hills = !hills;
    hills ? startMusic() : stopMusic();
    toast(hills ? "Green Hills" : "Arena normal");
}

//---------------------------------------------------------------- music

//drop your own track at music/green-hills.mp3; without it an original chiptune loop plays instead
const music = {track: null, failed: false, ctx: null, timer: null, step: 0, time: 0};

function startMusic()
{
    if(!music.track) {
        music.track = new Audio("music/green-hills.mp3");
        music.track.loop = true;
        music.track.volume = 0.5;
        music.track.onerror = () => { music.failed = true; if(hills) startChiptune(); };
    }
    if(music.failed) return startChiptune();
    music.track.play().catch(() => { if(hills) startChiptune(); });
}

function stopMusic()
{
    if(music.track) music.track.pause();
    clearInterval(music.timer);
    music.timer = null;
    if(music.ctx) music.ctx.suspend();
}

//16 steps per bar, MIDI notes, 0 = rest
const tune = {
    bpm: 150,
    lead: [
        72, 0, 76, 0, 79, 0, 76, 72,  74, 0, 76, 0, 72, 0, 0, 0,
        69, 0, 72, 0, 76, 0, 74, 72,  71, 0, 72, 0, 69, 0, 0, 0,
        69, 0, 72, 0, 77, 0, 76, 74,  72, 0, 74, 0, 76, 0, 77, 0,
        79, 0, 0, 74, 0, 79, 0, 77,   76, 0, 74, 0, 71, 0, 74, 0
    ],
    chords: [48, 45, 41, 43]//C Am F G roots, one per bar
};

function startChiptune()
{
    if(music.timer) return;
    if(!music.ctx) music.ctx = new AudioContext();
    music.ctx.resume();
    music.time = music.ctx.currentTime + 0.05;
    music.timer = setInterval(scheduleChiptune, 25);
}

function scheduleChiptune()
{
    const ctx = music.ctx, dt = 60 / tune.bpm / 4;
    while(music.time < ctx.currentTime + 0.12) {
        const s = music.step % tune.lead.length, beat = s % 16, t = music.time;
        const root = tune.chords[Math.floor(s / 16)];
        if(tune.lead[s]) blip("square", tune.lead[s], t, dt * 1.6, 0.07);
        if(beat % 2 == 0) blip("triangle", root + (beat % 4 ? 12 : 0), t, dt * 1.8, 0.18);
        if(beat % 8 == 0) blip("sine", 36, t, dt * 2, 0.35, 0.3);//kick
        if(beat % 8 == 4) noise(t, 0.12, 0.12);//snare
        if(beat % 2 == 1) noise(t, 0.03, 0.03);//hat
        music.time += dt;
        music.step++;
    }
}

function blip(type, midi, t, len, vol, drop = 1)
{
    const ctx = music.ctx, osc = ctx.createOscillator(), amp = ctx.createGain();
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    osc.type = type;
    osc.frequency.setValueAtTime(f * (drop < 1 ? 3 : 1), t);
    osc.frequency.exponentialRampToValueAtTime(f, t + len * drop);
    amp.gain.setValueAtTime(vol, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + len);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + len);
}

function noise(t, len, vol)
{
    const ctx = music.ctx;
    if(!music.noise) {
        music.noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
        const d = music.noise.getChannelData(0);
        for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource(), amp = ctx.createGain();
    src.buffer = music.noise;
    amp.gain.setValueAtTime(vol, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(amp).connect(ctx.destination);
    src.start(t);
    src.stop(t + len);
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

//engine rumble, stronger while the tank is moving
const hullBob = t => 0.004 * Math.sin(clock * 55 + t.x * 3) * (0.5 + Math.abs(t.speed));

//world transform of the barrel, built with the same chain tankbody() uses
function barrelMatrix(t)
{
    let m = translate(t.x, 0, t.z);
    m = mult(m, rotateY(t.heading));
    m = mult(m, translate(0, hullBob(t) + 0.2, 0));
    m = mult(m, rotateZ(t.pitch));
    m = mult(m, rotateX(t.roll));
    m = mult(m, translate(0, -0.2, 0));
    m = mult(m, translate(-0.2, 0.5, 0));
    m = mult(m, rotateY(t.turret));
    m = mult(m, translate(0.25, 0, 0));
    return mult(m, rotateZ(-90 + t.elevation));
}

function fire(t)
{
    const m = barrelMatrix(t);
    const tip = mult(m, vec4(0, 1.03, 0, 1));
    const dir = normalize(vec3(mult(m, vec4(0, 1, 0, 0))));
    const p = [tip[0], tip[1], tip[2]];
    const owner = t == tank ? 'player' : 'enemy';
    bullets.push({p, v: dir.map(c => c * speed), owner});
    t.recoil = 1;
    t.cooldown = fire_cooldown;
    shake = Math.max(shake, owner == 'player' ? 0.04 : 0.015);
    if(owner == 'player') score.shots++;
    spawn('flash', p, [0, 0, 0], 0.12, 0.35, [1.0, 0.75, 0.3]);
    for(let i = 0; i < 6; i++) {
        spawn('smoke', p, dir.map(c => c * (0.3 + Math.random()) + (Math.random() - 0.5) * 0.4), 0.9, 0.12, [0.75, 0.75, 0.75]);
    }
    updateHud();
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const wrapAngle = a => ((a + 180) % 360 + 360) % 360 - 180;
//forward is (cos h, -sin h), so this is the heading that points along (dx, dz)
const angleTo = (dx, dz) => Math.atan2(-dz, dx) * 180 / Math.PI;

//moves a hull forward (-1..1) while turning at turnRate degrees per second
function driveTank(t, forward, turnRate, maxSpeed, dt)
{
    const h = t.heading * Math.PI / 180;
    //speed eases toward the throttle, braking harder than it accelerates
    const want = forward * maxSpeed, before = t.speed;
    const rate = (Math.abs(want) < Math.abs(t.speed) || want * t.speed < 0 ? 4 : 2.2) * maxSpeed;
    t.speed += clamp(want - t.speed, -rate * dt, rate * dt);
    const accel = dt > 0 ? (t.speed - before) / dt : 0;

    t.heading += turnRate * dt;
    t.x = clamp(t.x + Math.cos(h) * t.speed * dt, -arena, arena);
    t.z = clamp(t.z - Math.sin(h) * t.speed * dt, -arena, arena);
    const roll = t.speed / maxSpeed;
    t.rotL -= (roll - turnRate / 140) * 100 * dt;
    t.rotR -= (roll + turnRate / 140) * 100 * dt;

    //suspension: damped springs, the nose lifts under acceleration, dips when braking, the hull leans out of turns
    t.pitchV += (-120 * t.pitch - 9 * t.pitchV + 70 * accel) * dt;
    t.pitch += t.pitchV * dt;
    t.rollV += (-120 * t.roll - 9 * t.rollV + 2 * turnRate * (Math.abs(t.speed) + 0.4)) * dt;
    t.roll += t.rollV * dt;

    //kicked-up dirt when launching or skidding to a halt
    if(Math.abs(accel) > maxSpeed * 1.5 && Math.random() < 0.6) {
        const braking = accel * t.speed < 0;
        const along = braking ? 0.6 * Math.sign(t.speed) : -0.5 * Math.sign(accel);
        const side = Math.random() < 0.5 ? 1 : -1;
        spawn('smoke', [t.x + Math.cos(h)*along - Math.sin(h)*0.55*side, 0.05, t.z - Math.sin(h)*along - Math.cos(h)*0.55*side],
              [Math.cos(h)*along*0.8 + (Math.random()-0.5)*0.4, 0.4 + Math.random()*0.4, -Math.sin(h)*along*0.8 + (Math.random()-0.5)*0.4],
              0.9, 0.12, [0.6, 0.52, 0.38]);
    }

    if((forward || turnRate) && Math.random() < 0.5) {
        const side = Math.random() < 0.5 ? 1 : -1;
        const back = -0.5 * Math.sign(forward);
        spawn('smoke', [t.x + Math.cos(h)*back - Math.sin(h)*0.55*side, 0.03, t.z - Math.sin(h)*back - Math.cos(h)*0.55*side],
              [0, 0.25, 0], 0.7, 0.08, [0.55, 0.48, 0.36]);
    }
}

function startWave()
{
    battle.wave++;
    for(let i = 0; i < Math.min(battle.wave, 4); i++) {
        let x, z;
        do {
            const s = (Math.random() * 2 - 1) * 5.2;
            const edge = Math.floor(Math.random() * 4);
            [x, z] = [[5.2, s], [-5.2, s], [s, 5.2], [s, -5.2]][edge];
        } while(Math.hypot(x - tank.x, z - tank.z) < 3.5);
        const e = newTank(x, z, angleTo(tank.x - x, tank.z - z));
        Object.assign(e, {hp: 2, side: Math.random() < 0.5 ? 1 : -1, wander: Math.random() * 6, cooldown: 1.5 + Math.random(), aimError: 0});
        enemies.push(e);
    }
    toast("Vaga " + battle.wave);
    updateHud();
}

//circles the player at mid range, aiming with the ballistic angle for the distance
function enemyAI(e, dt)
{
    const dx = tank.x - e.x, dz = tank.z - e.z;
    const dist = Math.hypot(dx, dz);
    const toPlayer = angleTo(dx, dz);
    e.wander += dt * 0.7;
    const offset = dist > 4.5 ? 0 : dist < 2.5 ? 150 : 90 * e.side;
    const diff = wrapAngle(toPlayer + offset + 25 * Math.sin(e.wander) - e.heading);
    driveTank(e, Math.abs(diff) < 70 ? 1 : 0.35, clamp(diff * 4, -50, 50), 1.1, dt);

    const aim = wrapAngle(toPlayer - e.heading - e.turret);
    e.turret += clamp(aim * 5, -60, 60) * dt;
    const range = Math.max(dist - 1.1, 0.3);
    const ballistic = 0.5 * Math.asin(Math.min(-g * range / (speed * speed), 1)) * 180 / Math.PI;
    e.elevation = clamp(e.elevation + clamp((ballistic + e.aimError - e.elevation) * 4, -40, 40) * dt, 0, 45);

    e.cooldown -= dt;
    if(!tank.dead && Math.abs(aim) < 4 && e.cooldown <= 0) {
        fire(e);
        e.cooldown = (2.2 + 1.5 * Math.random()) * Math.max(0.5, 1 - 0.08 * (battle.wave - 1));
        e.aimError = (Math.random() - 0.5) * 5;
    }
    if(e.hp == 1 && Math.random() < 0.3) spawn('smoke', [e.x, 0.5, e.z], [0, 0.6, 0], 1.2, 0.12, [0.2, 0.19, 0.18]);
}

const hitsTank = (b, t) => Math.hypot(b.p[0] - t.x, b.p[1] - 0.35, b.p[2] - t.z) < 0.55;

function damagePlayer(p)
{
    tank.hp--;
    tank.flash = 0.15;
    hurt = 1;
    explode(p, false);
    shake = Math.max(shake, 0.12);
    if(tank.hp <= 0) {
        tank.dead = 3;
        explode([tank.x, 0.4, tank.z], true);
        explode([tank.x + 0.3, 0.7, tank.z - 0.2], true);
        toast("Destruído! Vaga " + battle.wave);
    }
    updateHud();
}

function damageEnemy(e, p)
{
    e.hp--;
    e.flash = 0.15;
    score.hits++;
    explode(p, false);
    if(e.hp <= 0) {
        enemies.splice(enemies.indexOf(e), 1);
        battle.kills++;
        explode([e.x, 0.4, e.z], true);
        toast("Abatido!");
    }
    updateHud();
}

//tanks push each other apart, and the player also bumps into palm trunks
function separate()
{
    const bodies = tank.dead ? [...enemies] : [tank, ...enemies];
    for(let i = 0; i < bodies.length; i++) {
        for(let j = i + 1; j < bodies.length; j++) {
            const a = bodies[i], b = bodies[j];
            const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1e-3;
            if(d < 1.2) {
                const push = (1.2 - d) / 2 / d;
                a.x -= dx * push; a.z -= dz * push;
                b.x += dx * push; b.z += dz * push;
            }
        }
    }
    if(hills) {
        for(const t of bodies) {
            for(const p of palms) {
                const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz) || 1e-3;
                if(d < 0.75) { t.x = p.x + dx / d * 0.75; t.z = p.z + dz / d * 0.75; }
            }
        }
    }
    for(const t of bodies) { t.x = clamp(t.x, -arena, arena); t.z = clamp(t.z, -arena, arena); }
}

function newRing()
{
    let x, z;
    do {
        x = (Math.random() * 2 - 1) * 5;
        z = (Math.random() * 2 - 1) * 5;
    } while(Math.hypot(x - tank.x, z - tank.z) < 1.5);
    return {x, z, phase: Math.random() * 6};
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
    clock += dt;
    if(!tank.dead) {
        //driving: arrows move and turn the hull, a/d turn the turret, w/s raise the cannon
        const drive = (held.has("ArrowUp") ? 1 : 0) - (held.has("ArrowDown") ? 1 : 0);
        const turn = (held.has("ArrowLeft") ? 1 : 0) - (held.has("ArrowRight") ? 1 : 0);
        const shift = held.has("ShiftLeft") || held.has("ShiftRight");
        driveTank(tank, drive, turn * 70, 1.6, dt);
        if(held.has("KeyA")) tank.turret += 80 * dt;
        if(held.has("KeyD")) tank.turret -= 80 * dt;
        if(held.has("KeyW") && !shift) tank.elevation = Math.min(tank.elevation + 40 * dt, 45);
        if(held.has("KeyS") && !shift) tank.elevation = Math.max(tank.elevation - 40 * dt, 0);

        tank.cooldown -= dt;
        if(held.has("Space") && tank.cooldown <= 0) fire(tank);
    }
    else if((tank.dead -= dt) <= 0) {
        Object.assign(tank, newTank(0, 0, tank.heading));
        if(battle.on) {
            enemies = [];
            battle.wave = 0;
            battle.next = 1.5;
        }
        toast("De volta!");
        updateHud();
    }

    if(battle.on && !enemies.length && !tank.dead && (battle.next -= dt) <= 0) {
        startWave();
        battle.next = 2.5;
    }
    for(const e of enemies) enemyAI(e, dt);
    separate();

    for(const t of [tank, ...enemies]) {
        t.recoil = Math.max(t.recoil - dt * 4, 0);
        t.flash = Math.max(t.flash - dt, 0);
    }
    shake = Math.max(shake - dt * 0.4, 0);
    hurt = Math.max(hurt - dt * 1.5, 0);
    document.getElementById("damage").style.opacity = hurt;

    if(hills && !tank.dead) {
        for(const r of rings) {
            r.phase += dt;
            if(Math.hypot(tank.x - r.x, tank.z - r.z) < 0.6) {
                ringsCollected++;
                spawn('flash', [r.x, 0.45, r.z], [0, 0, 0], 0.3, 0.6, [1.0, 0.85, 0.3]);
                for(let i = 0; i < 10; i++) {
                    const a = Math.random() * 2 * Math.PI;
                    spawn('debris', [r.x, 0.45, r.z], [Math.cos(a) * 1.5, 2 + Math.random() * 2, Math.sin(a) * 1.5], 0.7, 0.04, [1.0, 0.85, 0.2]);
                }
                Object.assign(r, newRing());
                updateHud();
            }
        }
    }

    //bullets fly in world space, so turning the tank after the shot doesn't bend them
    for(let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.v[1] += g * dt;
        for(let c = 0; c < 3; c++) b.p[c] += b.v[c] * dt;
        if(Math.random() < 0.7) spawn('smoke', b.p, [0, 0.1, 0], 0.5, 0.05, [0.85, 0.85, 0.85]);

        const enemyHit = b.owner == 'player' && enemies.find(e => hitsTank(b, e));
        const hit = !battle.on && b.owner == 'player' && targets.find(t => t.alive && t.grow > 0.9 && Math.hypot(b.p[0] - t.x, b.p[1] - 0.65, b.p[2] - t.z) < 0.35);
        if(enemyHit) {
            damageEnemy(enemyHit, [...b.p]);
            bullets.splice(i, 1);
        }
        else if(b.owner == 'enemy' && !tank.dead && hitsTank(b, tank)) {
            damagePlayer([...b.p]);
            bullets.splice(i, 1);
        }
        else if(hit) {
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
    gl.uniform1f(gl.getUniformLocation(program, "pattern"), 0);
}

//checkered soil with grass above grassLine, both in object space; call after setColor
function setPattern(freq, grassLine)
{
    gl.uniform1f(gl.getUniformLocation(program, "pattern"), 1);
    gl.uniform3fv(gl.getUniformLocation(program, "checkFreq"), flatten(vec3(...freq)));
    gl.uniform1f(gl.getUniformLocation(program, "grassLine"), grassLine);
}

function draw(shape)
{
    uploadModelView();
    shape.draw(gl, program, mode);
}

//draws the floor
function Tile()
{
    const [dark, light] = hills ? [[0.3, 0.66, 0.2], [0.38, 0.78, 0.26]] : [[0.22, 0.42, 0.18], [0.28, 0.52, 0.22]];
    for(let z = -30; z < 30 ; z++){
        for(let x = -30; x < 30 ; x++){
            if((z%2 == 0 && x%2 != 0) || (z%2 != 0 && x%2 == 0)){
                setColor(...dark);
            }
            else{
                setColor(...light);
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

function tankbody(t, palette){
    //a hit makes the whole tank flash
    const glow = t.flash > 0 ? 0.7 : 0;
    const paint = c => setColor(...c, 1, glow);
    paint(palette.hull);
    pushMatrix();
        multTranslation([0.0,0.21,0.0]);
        multScale([1, 1/10,1.2]);
        draw(CUBE);
    popMatrix();

    paint(palette.deck);
    pushMatrix();
        multTranslation([0,0.32,0]);
        multScale([1,1/8,1]);
        draw(CUBE);
    popMatrix();

    paint(palette.nose);
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

    paint(palette.turret);
    pushMatrix();
        multTranslation([-0.2,0.5,0]);
        multRotationY(t.turret);
        pushMatrix();
            multScale([1/2,1/4,1/2]);
            draw(CYLINDRE);
        popMatrix();
        multTranslation([0.25,0,0]);
        pushMatrix();
            multRotationZ(-90+t.elevation);
            //recoil slides the barrel back along its own axis
            multTranslation([0,0.53 - 0.18*t.recoil,0]);
            paint(palette.barrel);
            multScale([1/8,1,1/8]);
            draw(CYLINDRE);
        popMatrix();
        paint(palette.deck);
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
        if(b.owner == 'enemy') setColor(1.0, 0.35, 0.25, 1, 0.8);
        else setColor(1.0, 0.8, 0.4, 1, 0.8);
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

function drawTank(t, palette){
    pushMatrix();
        multTranslation([t.x,0.0,t.z]);
        multRotationY(t.heading);
        multTranslation([-0.03*t.recoil, 0, 0]);
        //the hull tilts on its suspension, the tracks stay on the ground
        pushMatrix();
            multTranslation([0, hullBob(t) + 0.2, 0]);
            multRotationZ(t.pitch);
            multRotationX(t.roll);
            multTranslation([0, -0.2, 0]);
            tankbody(t, palette);
        popMatrix();
        pushMatrix();
            multTranslation([0,0.08,0]);
            wheels(4.5, t.rotR);
            wheels(-4.5, t.rotL);
            axis();
        popMatrix();
    popMatrix();
}

//------------------------------------------------ green hills scenery

//fixed pseudo-random numbers, so the scenery is the same on every load
let seed = 7;
const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
//heading that points away from the centre, so local -x points at it
const facingCentre = (x, z) => angleTo(x, z);

const palms = [[-5.6, -5.6], [5.6, -5.6], [-5.6, 5.6], [5.6, 5.6], [0.4, -5.7]].map(([x, z]) => ({x, z}));
const flowers = [[5.7, 2.6], [5.7, -2.4], [-5.7, 2.4], [-5.7, -2.6], [2.6, 5.7], [-2.4, 5.7], [2.8, -5.7], [-2.6, -5.7]].map(([x, z]) => ({x, z}));
const hillsAround = Array.from({length: 11}, (_, i) => {
    const a = (i + rnd() * 0.5) / 11 * 2 * Math.PI, r = 15 + rnd() * 9;
    return {x: r * Math.cos(a), z: r * Math.sin(a), w: 7 + rnd() * 6, h: 6 + rnd() * 6};
});
const clouds = Array.from({length: 8}, (_, i) => ({a: i / 8 * 2 * Math.PI + rnd(), r: 12 + rnd() * 10, y: 6 + rnd() * 3, s: 0.8 + rnd() * 0.6}));
const rings = Array.from({length: 6}, () => newRing());

function palm(p){
    pushMatrix();
        multTranslation([p.x, 0, p.z]);
        //the trunk bends towards the arena, segment by segment
        multRotationY(facingCentre(p.x, p.z));
        for(let i = 0; i < 6; i++) {
            multRotationZ(3 + 0.6 * Math.sin(clock * 1.3 + p.x));
            pushMatrix();
                multTranslation([0, 0.2, 0]);
                multScale([0.17 - 0.012*i, 0.42, 0.17 - 0.012*i]);
                setColor(...(i % 2 ? [0.55, 0.38, 0.18] : [0.45, 0.3, 0.14]));
                draw(CYLINDRE);
            popMatrix();
            multTranslation([0, 0.4, 0]);
        }
        setColor(0.4, 0.22, 0.08);
        for(let k = 0; k < 3; k++) {
            pushMatrix();
                multRotationY(k * 120);
                multTranslation([0.09, -0.06, 0]);
                multScale([0.12, 0.12, 0.12]);
                draw(SPHERE);
            popMatrix();
        }
        setColor(0.16, 0.55, 0.14);
        for(let k = 0; k < 7; k++) {
            pushMatrix();
                multRotationY(k * 360/7);
                multRotationZ(-25 - 8 * Math.sin(clock * 1.7 + k));
                multTranslation([0.55, 0, 0]);
                multScale([1.1, 0.03, 0.26]);
                draw(CUBE);
            popMatrix();
        }
    popMatrix();
}

function flower(f){
    pushMatrix();
        multTranslation([f.x, 0, f.z]);
        setColor(0.2, 0.5, 0.15);
        pushMatrix();
            multTranslation([0, 0.42, 0]);
            multScale([0.05, 0.84, 0.05]);
            draw(CYLINDRE);
        popMatrix();
        //the head faces the arena; after rotating z its local y is the face normal
        multTranslation([0, 0.9, 0]);
        multRotationY(facingCentre(f.x, f.z));
        multRotationZ(90);
        multRotationY(clock * 30);
        setColor(0.4, 0.22, 0.08);
        pushMatrix();
            multScale([0.24, 0.06, 0.24]);
            draw(CYLINDRE);
        popMatrix();
        setColor(1.0, 0.82, 0.1);
        for(let k = 0; k < 10; k++) {
            pushMatrix();
                multRotationY(k * 36);
                multTranslation([0.19, 0, 0]);
                multScale([0.16, 0.03, 0.08]);
                draw(CUBE);
            popMatrix();
        }
    popMatrix();
}

function ring(r){
    pushMatrix();
        multTranslation([r.x, 0.45 + 0.06 * Math.sin(r.phase * 3), r.z]);
        multRotationY(r.phase * 140);
        multRotationX(90);
        multScale([0.5, 0.5, 0.5]);
        setColor(1.0, 0.78, 0.15, 1, 0.25);
        draw(TORUS);
    popMatrix();
}

//backdrop that doesn't cast shadows: the checkered cliff under the arena, then water, hills and clouds
function scenery(persp){
    pushMatrix();
        multTranslation([-0.1, -1.03, -0.1]);
        multScale([12, 2, 12]);
        setColor(1, 1, 1);
        setPattern([24, 4, 24], 0.42);
        draw(CUBE);
    popMatrix();
    //far scenery only fits the perspective cameras' depth range
    if(!persp) return;

    pushMatrix();
        multTranslation([0, -1.6, 0]);
        multScale([90, 0.02, 90]);
        setColor(0.12, 0.42, 0.8);
        draw(CUBE);
    popMatrix();
    for(const h of hillsAround) {
        pushMatrix();
            multTranslation([h.x, -1.6, h.z]);
            multScale([h.w, h.h, h.w]);
            setColor(1, 1, 1);
            setPattern([8, 8, 8], 0.3);
            draw(SPHERE);
        popMatrix();
    }
    setColor(1, 1, 1, 1, 0.45);
    for(const c of clouds) {
        const a = c.a + clock * 0.01;
        pushMatrix();
            multTranslation([c.r * Math.cos(a), c.y, c.r * Math.sin(a)]);
            multRotationY(-a * 180 / Math.PI);
            multScale([c.s, c.s, c.s]);
            for(const [x, y, z, w] of [[0, 0, 0, 2.4], [1.2, -0.2, 0.3, 1.7], [-1.3, -0.25, -0.2, 1.6], [0.3, 0.5, -0.3, 1.5]]) {
                pushMatrix();
                    multTranslation([x, y, z]);
                    multScale([w, w * 0.6, w * 0.8]);
                    draw(SPHERE);
                popMatrix();
            }
        popMatrix();
    }
}

//everything that casts a shadow
function casters(){
    if(!tank.dead) drawTank(tank, palettes.player);
    for(const e of enemies) drawTank(e, palettes.enemy);
    if(hills) {
        for(const p of palms) palm(p);
        for(const f of flowers) flower(f);
        for(const r of rings) ring(r);
    }
    if(!battle.on) for(const t of targets) if(t.alive) target(t);
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
    let projection;
    if(persp) {
        projection = perspective(50, aspect, 0.1, 100);
    }
    else {
        projection = ortho(-VP_DISTANCE*aspect,VP_DISTANCE*aspect, -VP_DISTANCE, VP_DISTANCE,-5*VP_DISTANCE,5*VP_DISTANCE);
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
    applyView(projection, Mview, persp);
    return persp;
}

function applyView(projection, view, persp)
{
    mProjection = projection;
    gl.useProgram(program);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "mProjection"), false, flatten(mProjection));
    //directions only need the rotation part of the view matrix
    const toView = v => normalize(vec3(mult(view, vec4(...v, 0))));
    gl.uniform3fv(gl.getUniformLocation(program, "lightDir"), flatten(toView(sun)));
    gl.uniform3fv(gl.getUniformLocation(program, "upDir"), flatten(toView([0, 1, 0])));
    gl.uniform3fv(gl.getUniformLocation(program, "fogColor"), flatten(sky().horizon));
    gl.uniform1f(gl.getUniformLocation(program, "fogDensity"), persp ? (hills ? 0.025 : 0.06) : 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "orthographic"), persp ? 0.0 : 1.0);
}

const sky = () => hills ? skies.hills : skies.normal;

//top-down map of the arena in the bottom-right corner
function drawRadar()
{
    const ratio = window.devicePixelRatio || 1;
    const size = Math.round(radarSize() * ratio), inset = Math.round(16 * ratio);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(canvas.width - size - inset, inset, size, size);
    gl.viewport(canvas.width - size - inset, inset, size, size);
    gl.clearColor(0.04, 0.07, 0.1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const view = lookAt([0, 5, 0], [0, 0, 0], [0, 0, -1]);
    applyView(ortho(-6.3, 6.3, -6.3, 6.3, 0.1, 20), view, false);
    loadMatrix(view);
    pushMatrix();
        multTranslation([-0.1, -0.02, -0.1]);
        multScale([12, 0.02, 12]);
        setColor(...(hills ? [0.3, 0.66, 0.2] : [0.22, 0.42, 0.18]));
        draw(CUBE);
    popMatrix();
    casters();

    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, canvas.width, canvas.height);
}

function drawSky()
{
    gl.useProgram(skyProgram);
    gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuffer);
    const loc = gl.getAttribLocation(skyProgram, "vPosition");
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(loc);
    gl.uniform3fv(gl.getUniformLocation(skyProgram, "horizon"), flatten(sky().horizon));
    gl.uniform3fv(gl.getUniformLocation(skyProgram, "zenith"), flatten(sky().zenith));
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
    const persp = setupCamera();
    setShadow(false);

    //the floor marks the stencil, so shadows land only on the floor and not in the air past its edge
    loadMatrix(Mview);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    pushMatrix();
        multTranslation([0,-1/50,0]);
        multScale([1/5, 1/50, 1/5]);
        Tile();
    popMatrix();
    gl.disable(gl.STENCIL_TEST);
    if(hills) scenery(persp);

    gl.enable(gl.BLEND);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(false);
    gl.polygonOffset(-1, -1);
    scorchMarks();

    //the stencil makes overlapping shadow parts darken the floor only once
    gl.polygonOffset(-2, -2);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, 1, 0xff);
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

    if(radar) drawRadar();
}

const urls = ["shader.vert", "shader.frag", "sky.vert", "sky.frag"];
loadShadersFromURLS(urls).then(shaders => setup(shaders))
