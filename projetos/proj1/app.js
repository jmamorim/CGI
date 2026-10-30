import * as UTILS from '../../libs/utils.js';
import * as MV from '../../libs/MV.js'

/** @type {WebGLRenderingContext} */
let gl;
var canvas;
let table_height;
let pixel_ratio;
var program;//field segments
var cprogram;//charges
var vprogram;//equipotential background
var pprogram;//flow particles
var fadeprogram;//fades the trail texture
var compprogram;//draws the trail texture on screen
var gridBuffer;
var chargeBuffer;
var quadBuffer;
var particleBuffer;
var trailTexture;
var trailFramebuffer;
const points = [];//vertices of the grid segments: (x, y, 0) origin and (x, y, 1) field end
const charges = [];//{x, y, q}: world position and signed magnitude
const MAX_CHARGES = 20;
const MIN_MAGNITUDE = 0.5;
const MAX_MAGNITUDE = 5.0;
const grid_spacing = 0.05;
const table_width = 3.0;
const k = 8.988*Math.pow(10,9);
const charge_magnitude = Math.pow(10,-11);//coulombs, keeps segments readable at this scale
const angular_speed = 0.01;//radians per frame
const N_PARTICLES = 5000;
const trail_fade = 0.012;//subtracted from the trail texture every frame
const view = { charges: true, grid: true, flow: true, potential: true, rotate: true, help: true };

//particle state: current and previous position, age and lifetime in frames
const px = new Float32Array(N_PARTICLES);
const py = new Float32Array(N_PARTICLES);
const ox = new Float32Array(N_PARTICLES);
const oy = new Float32Array(N_PARTICLES);
const age = new Float32Array(N_PARTICLES);
const life = new Float32Array(N_PARTICLES);
const particleData = new Float32Array(N_PARTICLES * 8);//two vertices of (x, y, dx, dy) each

let drag = null;//{charge, moved} while the mouse button is down
let hover = null;
let toastTimer;

const presets = {
    Digit1: ["Dipolo", () => [[-0.5, 0, 1], [0.5, 0, -1]]],
    Digit2: ["Quadrupolo", () => [[-0.4, 0.4, 1], [0.4, 0.4, -1], [0.4, -0.4, 1], [-0.4, -0.4, -1]]],
    Digit3: ["Anel", () => Array.from({length: 8}, (_, i) => {
        const a = i * Math.PI / 4;
        return [0.7*Math.cos(a), 0.7*Math.sin(a), i % 2 ? -1 : 1];
    })],
    Digit4: ["Condensador", () => Array.from({length: 14}, (_, i) => {
        const x = -0.6 + 0.2 * (i % 7);
        return i < 7 ? [x, 0.35, 1] : [x, -0.35, -1];
    })],
    Digit5: ["Aleatório", () => Array.from({length: 6}, () => [
        (Math.random() - 0.5) * table_width * 0.7,
        (Math.random() - 0.5) * table_height * 0.7,
        (Math.random() < 0.5 ? -1 : 1) * (MIN_MAGNITUDE + Math.random() * 2)
    ])]
};

function chargeValue(c)
{
    return c.q*k*charge_magnitude;
}

//same field as shader1.vert, used to move the particles
function fieldAt(x, y)
{
    let ex = 0, ey = 0;
    for(const c of charges) {
        const dx = x - c.x;
        const dy = y - c.y;
        const r2 = dx*dx + dy*dy;
        if(r2 < 1e-8) continue;
        const s = chargeValue(c) / (r2*Math.sqrt(r2));
        ex += s*dx;
        ey += s*dy;
    }
    return [ex, ey];
}

//a third of the particles start next to a positive charge so lines visibly leave it
function spawnParticle(i)
{
    const positives = charges.filter(c => c.q > 0);
    if(positives.length && Math.random() < 0.33) {
        const c = positives[Math.floor(Math.random() * positives.length)];
        const a = Math.random() * 2 * Math.PI;
        px[i] = c.x + 0.05*Math.cos(a);
        py[i] = c.y + 0.05*Math.sin(a);
    }
    else {
        px[i] = (Math.random() - 0.5) * table_width;
        py[i] = (Math.random() - 0.5) * table_height;
    }
    ox[i] = px[i];
    oy[i] = py[i];
    age[i] = 0;
    life[i] = 80 + Math.random()*220;
}

function stepSize(e)
{
    return Math.min(Math.max(e*0.05, 0.001), 0.012);
}

function nearNegativeCharge(x, y)
{
    return charges.some(c => c.q < 0 && Math.hypot(x - c.x, y - c.y) < 0.03);
}

function updateParticles()
{
    const hw = table_width/2 + 0.1;
    const hh = table_height/2 + 0.1;
    for(let i = 0; i < N_PARTICLES; i++) {
        ox[i] = px[i];
        oy[i] = py[i];
        age[i]++;
        const [ex, ey] = fieldAt(px[i], py[i]);
        const e = Math.hypot(ex, ey);
        if(age[i] > life[i] || e == 0 || Math.abs(px[i]) > hw || Math.abs(py[i]) > hh || nearNegativeCharge(px[i], py[i])) {
            spawnParticle(i);
        }
        else {
            //midpoint step keeps the paths on the field lines around tight curves
            const h = stepSize(e);
            const [mx, my] = fieldAt(px[i] + ex/e*h/2, py[i] + ey/e*h/2);
            const m = Math.hypot(mx, my) || 1;
            px[i] += mx/m*h;
            py[i] += my/m*h;
        }
        const dx = px[i] - ox[i];
        const dy = py[i] - oy[i];
        particleData.set([ox[i], oy[i], dx, dy, px[i], py[i], dx, dy], i*8);
    }
}

function buildGrid()
{
    points.length = 0;
    for(let x = -(table_width/2.0) + grid_spacing; x <= (table_width/2.0); x += grid_spacing) {
        for(let y = -(table_height/2.0); y <= (table_height/2.0) ; y += grid_spacing) {
            //small jitter so the grid doesn't look perfectly regular
            const jx = x + (Math.random() - 0.5) * grid_spacing * 0.5;
            const jy = y + (Math.random() - 0.5) * grid_spacing * 0.5;
            points.push(MV.vec3(jx, jy, 0.0));
            points.push(MV.vec3(jx, jy, 1.0));
        }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, MV.flatten(points), gl.STATIC_DRAW);
}

function buildTrail()
{
    gl.deleteTexture(trailTexture);
    gl.deleteFramebuffer(trailFramebuffer);
    trailTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, trailTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    trailFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, trailFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, trailTexture, 0);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
}

function resize()
{
    pixel_ratio = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * pixel_ratio;
    canvas.height = window.innerHeight * pixel_ratio;
    table_height = (canvas.height*table_width)/canvas.width;
    gl.viewport(0, 0, canvas.width, canvas.height);
    buildGrid();
    buildTrail();
}

//positive charges rotate counter-clockwise around the origin, negative ones clockwise
function moveCharges()
{
    for(const c of charges) {
        if(drag && drag.charge == c) continue;
        const a = angular_speed * Math.sign(c.q);
        const s = Math.sin(a);
        const co = Math.cos(a);
        [c.x, c.y] = [co*c.x - s*c.y, s*c.x + co*c.y];
    }
}

function toWorld(event)
{
    return [(event.offsetX/canvas.clientWidth - 0.5) * table_width,
            (0.5 - event.offsetY/canvas.clientHeight) * table_height];
}

//the charge whose disc is under the mouse, if any
function chargeAt(x, y)
{
    const units_per_pixel = table_width / canvas.clientWidth;
    let best = null, bestDist = Infinity;
    for(const c of charges) {
        const d = Math.hypot(x - c.x, y - c.y);
        const radius = (7 + 2.5*Math.abs(c.q) + 4) * units_per_pixel;
        if(d < radius && d < bestDist) {
            best = c;
            bestDist = d;
        }
    }
    return best;
}

function toast(message)
{
    const el = document.getElementById("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
}

function updateHud()
{
    for(const el of document.querySelectorAll("[data-view]")) {
        el.classList.toggle("off", !view[el.dataset.view]);
    }
    document.getElementById("hud").classList.toggle("hidden", !view.help);
    document.getElementById("count").textContent = charges.length + "/" + MAX_CHARGES;
}

function addCharge(x, y, q)
{
    if(charges.length == MAX_CHARGES){
        toast("Chegou ao máximo de cargas que pode colocar");
        return;
    }
    charges.push({x, y, q});
    updateHud();
}

function loadPreset(code)
{
    const [name, build] = presets[code];
    charges.length = 0;
    for(const [x, y, q] of build()) charges.push({x, y, q});
    for(let i = 0; i < N_PARTICLES; i++) spawnParticle(i);
    toast(name);
    updateHud();
}

function setChargeUniforms(p)
{
    gl.uniform1f(gl.getUniformLocation(p, "table_height"), table_height);
    gl.uniform1f(gl.getUniformLocation(p, "table_width"), table_width);
    gl.uniform1i(gl.getUniformLocation(p, "nCharges"), charges.length);
    if(charges.length != 0){
        gl.uniform2fv(gl.getUniformLocation(p, "uPosition"), charges.flatMap(c => [c.x, c.y]));
        gl.uniform1fv(gl.getUniformLocation(p, "values"), charges.map(chargeValue));
    }
}

function bindAttribute(p, buffer, size)
{
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const loc = gl.getAttribLocation(p, "vPosition");
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(loc);
}

function drawQuad(p)
{
    bindAttribute(p, quadBuffer, 2);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function animate(time)
{
    window.requestAnimationFrame(animate);

    if(view.rotate) moveCharges();
    const hasCharges = charges.length != 0;

    //trails: fade what is in the texture, then add this frame's particle steps
    gl.bindFramebuffer(gl.FRAMEBUFFER, trailFramebuffer);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(fadeprogram);
    gl.uniform4f(gl.getUniformLocation(fadeprogram, "color"), trail_fade, trail_fade, trail_fade, trail_fade);
    drawQuad(fadeprogram);
    gl.blendEquation(gl.FUNC_ADD);

    if(view.flow && hasCharges) {
        updateParticles();
        gl.useProgram(pprogram);
        gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, particleData, gl.DYNAMIC_DRAW);
        bindAttribute(pprogram, particleBuffer, 4);
        gl.uniform1f(gl.getUniformLocation(pprogram, "table_height"), table_height);
        gl.uniform1f(gl.getUniformLocation(pprogram, "table_width"), table_width);
        gl.drawArrays(gl.LINES, 0, N_PARTICLES * 2);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.clear(gl.COLOR_BUFFER_BIT);

    if(view.potential && hasCharges) {
        gl.disable(gl.BLEND);
        gl.useProgram(vprogram);
        setChargeUniforms(vprogram);
        drawQuad(vprogram);
        gl.enable(gl.BLEND);
    }

    //composited even with flow off, so the trails fade out instead of vanishing
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(compprogram);
    gl.bindTexture(gl.TEXTURE_2D, trailTexture);
    gl.uniform1i(gl.getUniformLocation(compprogram, "tex"), 0);
    drawQuad(compprogram);

    //code to draw the field segments
    if(view.grid && hasCharges) {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(program);
        bindAttribute(program, gridBuffer, 3);
        setChargeUniforms(program);
        gl.uniform1f(gl.getUniformLocation(program, "alpha"), view.flow || view.potential ? 0.6 : 1.0);
        gl.drawArrays(gl.LINES, 0, points.length);
    }

    //code to draw charges
    if(view.charges && hasCharges) {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(cprogram);
        gl.bindBuffer(gl.ARRAY_BUFFER, chargeBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(charges.flatMap(c => [c.x, c.y, c.q, c == hover ? 1 : 0])), gl.DYNAMIC_DRAW);
        bindAttribute(cprogram, chargeBuffer, 4);
        gl.uniform1f(gl.getUniformLocation(cprogram, "table_height"), table_height);
        gl.uniform1f(gl.getUniformLocation(cprogram, "table_width"), table_width);
        gl.uniform1f(gl.getUniformLocation(cprogram, "pixel_ratio"), pixel_ratio);
        gl.uniform1f(gl.getUniformLocation(cprogram, "time"), time);
        gl.drawArrays(gl.POINTS, 0, charges.length);
    }
}

function setup(shaders)
{
    canvas = document.getElementById("gl-canvas");
    gl = UTILS.setupWebGL(canvas);
    gl.getExtension("OES_standard_derivatives");

    program = UTILS.buildProgramFromSources(gl, shaders["shader1.vert"], shaders["shader1.frag"]);
    cprogram = UTILS.buildProgramFromSources(gl, shaders["shader2.vert"], shaders["shader2.frag"]);
    vprogram = UTILS.buildProgramFromSources(gl, shaders["quad.vert"], shaders["potential.frag"]);
    pprogram = UTILS.buildProgramFromSources(gl, shaders["particle.vert"], shaders["particle.frag"]);
    fadeprogram = UTILS.buildProgramFromSources(gl, shaders["quad.vert"], shaders["fade.frag"]);
    compprogram = UTILS.buildProgramFromSources(gl, shaders["quad.vert"], shaders["composite.frag"]);

    gridBuffer = gl.createBuffer();
    chargeBuffer = gl.createBuffer();
    particleBuffer = gl.createBuffer();
    quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    resize();
    loadPreset("Digit1");

    //events
    window.addEventListener("resize", resize);

    //click = positive charge, shift + click = negative charge, dragging a charge moves it
    canvas.addEventListener("mousedown", function(event){
        if(event.button != 0) return;
        drag = {charge: chargeAt(...toWorld(event)), moved: false};
    });

    canvas.addEventListener("mousemove", function(event){
        const [x, y] = toWorld(event);
        hover = chargeAt(x, y);
        if(drag && drag.charge) {
            drag.charge.x = x;
            drag.charge.y = y;
            drag.moved = true;
        }
        canvas.style.cursor = drag && drag.charge ? "grabbing" : hover ? "grab" : "crosshair";
    });

    window.addEventListener("mouseup", function(event){
        if(drag && !drag.charge && event.target == canvas) {
            addCharge(...toWorld(event), event.shiftKey ? -1.0 : 1.0);
        }
        drag = null;
    });

    //right click removes a charge
    canvas.addEventListener("contextmenu", function(event){
        event.preventDefault();
        const c = chargeAt(...toWorld(event));
        if(c) {
            charges.splice(charges.indexOf(c), 1);
            hover = null;
            updateHud();
        }
    });

    //mouse wheel over a charge changes its magnitude
    canvas.addEventListener("wheel", function(event){
        const c = chargeAt(...toWorld(event));
        if(!c) return;
        event.preventDefault();
        const m = Math.min(Math.max(Math.abs(c.q) - Math.sign(event.deltaY) * 0.25, MIN_MAGNITUDE), MAX_MAGNITUDE);
        c.q = Math.sign(c.q) * m;
        toast("Carga " + (c.q > 0 ? "+" : "−") + m.toFixed(2));
    }, {passive: false});

    const keys = {Space: "charges", KeyG: "grid", KeyF: "flow", KeyE: "potential", KeyR: "rotate", KeyH: "help"};
    window.addEventListener("keydown", function(event){
        if(keys[event.code]) {
            event.preventDefault();
            view[keys[event.code]] = !view[keys[event.code]];
        }
        else if(presets[event.code]) {
            loadPreset(event.code);
        }
        else if(event.code == "KeyC") {
            charges.length = 0;
        }
        updateHud();
    });

    updateHud();
    window.requestAnimationFrame(animate);
}

UTILS.loadShadersFromURLS(["shader1.vert", "shader1.frag", "shader2.vert", "shader2.frag",
    "quad.vert", "potential.frag", "particle.vert", "particle.frag", "fade.frag", "composite.frag"]).then(s => setup(s));
