import * as UTILS from '../../libs/utils.js';
import * as MV from '../../libs/MV.js'

/** @type {WebGLRenderingContext} */
let gl;
var canvas;
let table_height;
var program;
var cprogram;
var twidht;
var theight;
var lenght;//lenght of points
var lenghtc;//lenght of charges
var theta;
var thetaLoc;
const points = [];//position of the points in the grid
const charges = [];//position of the charges
const chargevalues = [];//values of the charges
const MAX_CHARGES = 20;
const grid_spacing = 0.05;
const table_width = 3.0;
const k = 8.988*Math.pow(10,9);

function animate(time)
{
    window.requestAnimationFrame(animate);
    
    gl.clear(gl.COLOR_BUFFER_BIT);

    lenght = points.length;
    lenghtc = charges.length;
    
    //code to draw grid
    gl.useProgram(program);
    const abuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, abuffer);
    gl.bufferData(gl.ARRAY_BUFFER, MV.flatten(points), gl.STATIC_DRAW);
  
    const vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    gl.uniform1f(theight, table_height);
    gl.uniform1f(twidht, table_width);

    if(lenghtc != 0){
      gl.drawArrays(gl.POINTS, 0, lenght);
    }
    
    //code to draw charges
    gl.useProgram(cprogram);
    const cbuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cbuffer);
    gl.bufferData(gl.ARRAY_BUFFER, MV.flatten(charges), gl.STATIC_DRAW);
    
    const cPosition = gl.getAttribLocation(cprogram, "vPosition");
    gl.vertexAttribPointer(cPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(cPosition);

    const cvbuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cvbuffer);
    gl.bufferData(gl.ARRAY_BUFFER, MV.flatten(chargevalues), gl.STATIC_DRAW);
    
    const cvalue = gl.getAttribLocation(cprogram, "charge");
    gl.vertexAttribPointer(cvalue, 1, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(cvalue);

    theta += 0.01;

    gl.uniform1f(thetaLoc, theta);

    gl.drawArrays(gl.POINTS, 0, lenghtc);

}

function setup(shaders)
{
    canvas = document.getElementById("gl-canvas");
    gl = UTILS.setupWebGL(canvas);
    
    program = UTILS.buildProgramFromSources(gl, shaders["shader1.vert"], shaders["shader1.frag"]);
    cprogram = UTILS.buildProgramFromSources(gl, shaders["shader2.vert"], shaders["shader2.frag"]);

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    table_height = (canvas.height*table_width)/canvas.width;


    for(let x = -(table_width/2.0) + grid_spacing; x <= (table_width/2.0); x += grid_spacing) {
        for(let y = -(table_height/2.0); y <= (table_height/2.0) ; y += grid_spacing) {
            points.push(MV.vec2(x, y));
            points.push(MV.vec2(x, y));
        }
    }



    theta = 0;
    theight = gl.getUniformLocation(program, "table_height");
    twidht = gl.getUniformLocation(program, "table_width");
    thetaLoc = gl.getUniformLocation(cprogram, "theta");

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    
    //events
    window.addEventListener("resize", function (event) {
         canvas.width = window.innerWidth;
         canvas.height = window.innerHeight;
         table_height = (canvas.height*table_width)/canvas.width;
         gl.viewport(0, 0, canvas.width, canvas.height);
        }    
    );
    
    canvas.addEventListener("click", function(event){
        if(!event.shiftKey){
          if(lenghtc == MAX_CHARGES){
            alert("Chegou ao maximo de cargas que pode colocar")
          }
          else{
          const x = (-1 + 2*(event.offsetX)/canvas.width);
          const y = -1 + 2*(canvas.height-event.offsetY)/canvas.height;
          charges.push(MV.vec2(x,y));
          chargevalues.push(1.0);
        }
    }
    } 
);

       canvas.addEventListener("click", function(event){
        if(event.shiftKey){
            if(lenghtc == MAX_CHARGES){
                alert("Chegou ao maximo de cargas que pode colocar") 
            }
            else{
                const x = (-1 + 2*(event.offsetX)/canvas.width);
                const y = -1 + 2*(canvas.height-event.offsetY)/canvas.height;
                charges.push(MV.vec2(x,y));
                chargevalues.push(-1.0);
            }
        } 
    }
);
    window.requestAnimationFrame(animate);
}

UTILS.loadShadersFromURLS(["shader1.vert", "shader1.frag", "shader2.vert", "shader2.frag"]).then(s => setup(s));