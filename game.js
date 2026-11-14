import * as THREE from './vendor/three.module.js';

const $ = (id) => document.getElementById(id);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x172b32);
scene.fog = new THREE.Fog(0x172b32, 90, 260);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .1, 420);
const renderer = new THREE.WebGLRenderer({ canvas: $('world'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
scene.add(new THREE.HemisphereLight(0x96cad1, 0x27342d, 1.25));
const moon = new THREE.DirectionalLight(0xc3e6e5, 1.5);
moon.position.set(-45, 80, 35);
scene.add(moon);
const cityGlow = new THREE.PointLight(0xff9b58, 52, 150, 2);
cityGlow.position.set(-15, 18, -55);
scene.add(cityGlow);
const materials = {};
const mat = (name, color, roughness = .83, metalness = 0) => materials[name] ||= new THREE.MeshStandardMaterial({ color, roughness, metalness });
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const sphereGeometry = new THREE.SphereGeometry(1, 12, 10);
const cylinderGeometry = new THREE.CylinderGeometry(.5, .5, 1, 10);
const world = new THREE.Group(); scene.add(world);
const structures = [], cars = [], suspects = [], effects = [];
const player = { x: 0, z: 15, yaw: 0, speed: 0, vehicle: null, arrested: 0, rank: 0, shooting: false, cooldown: 0, charge: 1 };
const keys = new Set();
let started = false, paused = false, earnedBadge = false, toastTimer = 0, elapsed = 0;
let lastFrame = performance.now(), clockMinutes = 102, mouseDown = null, dragMoved = false, audioCtx = null;
const cityMats = [0x526265,0x596568,0x626963,0x665f58,0x4c5f63,0x6a6b63,0x4a5b5e].map((c,i)=>mat('b'+i,c));
const windowMat = mat('window',0xffd69a,.35,0);
const coolWindow = mat('coolWindow',0x72bcc1,.4,0);
const roadMat = mat('road',0x303a3b,.95), sidewalkMat = mat('sidewalk',0x747972,.95), groundMat = mat('ground',0x35443d,.95);
const darkMat = mat('dark',0x1b2425,.8), treeMat = mat('tree',0x263e38,.96), trunkMat = mat('trunk',0x51483b,.95);

function block(parent, material, x,y,z, sx,sy,sz, opts={}) {
  const mesh = new THREE.Mesh(boxGeometry, material);
  mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz);
  if(opts.ry) mesh.rotation.y=opts.ry;
  mesh.castShadow=false; mesh.receiveShadow=false;
  parent.add(mesh); return mesh;
}
function sphere(parent, material, x,y,z, radius, sy=radius) {
  const mesh=new THREE.Mesh(sphereGeometry,material); mesh.position.set(x,y,z); mesh.scale.set(radius,sy,radius); parent.add(mesh); return mesh;
}
function cylinder(parent, material, x,y,z, radius,height, seg=10) {
  const mesh=new THREE.Mesh(seg===10?cylinderGeometry:new THREE.CylinderGeometry(radius*.76,radius,height,seg),material);
  mesh.position.set(x,y,z); mesh.scale.set(radius*2,height,radius*2); parent.add(mesh); return mesh;
}
function randomFactory(seed=1234){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}}
const rand=randomFactory(817);

function makeCity(){
  block(world,groundMat,0,-.8,0,440,1,440);
  // Broad, connected streets with little reflective lane markings.
  for(let n=-4;n<=4;n++){
    const p=n*48;
    block(world,roadMat,p,.005,0,14,.06,440);
    block(world,roadMat,0,.006,p,440,.06,14);
    for(const side of [-1,1]){
      block(world,sidewalkMat,p+side*8.15,.04,0,2.1,.14,440);
      block(world,sidewalkMat,0,.04,p+side*8.15,440,.14,2.1);
    }
    for(let d=-204;d<=204;d+=12){
      block(world,mat('lane',0x909388),p,.045,d,.13,.025,4.2);
      block(world,mat('lane',0x909388),d,.045,p,4.2,.025,.13);
    }
  }
  // A soft-lit waterfront promenade and harbor beyond the east side of the grid.
  const waterMat=new THREE.MeshStandardMaterial({color:0x173b45,roughness:.3,metalness:.22});
  block(world,waterMat,235,-.28,0,50,.2,440);
  block(world,mat('quay',0x737870),207,-.05,0,5,.65,440);
  for(let z=-190;z<205;z+=27){
    const pier=block(world,mat('pier',0x65594b),220,-.1,z,22,.35,5);
    block(world,mat('pierlight',0xffbc68,.3),225,.6,z, .14,1.3,.14);
    sphere(world,mat('docklamp',0xffc56c,.2),225,1.3,z,.24,.25);
  }
  // Mid-rise blocks, tiny lit windows and rooftop silhouettes make the city feel lived-in.
  for(let ix=-4;ix<4;ix++) for(let iz=-4;iz<4;iz++){
    const cx=ix*48+24, cz=iz*48+24;
    if(cx>185) continue;
    const count=1+(rand()>.42?1:0);
    for(let k=0;k<count;k++){
      const w=12+rand()*12,d=11+rand()*13;
      const bx=cx+(k? (rand()>.5?8:-8):0)+(rand()-.5)*5;
      const bz=cz+(k? (rand()>.5?8:-8):0)+(rand()-.5)*5;
      const h=10+rand()*27;
      const base=block(world,cityMats[Math.floor(rand()*cityMats.length)],bx,h/2,bz,w,h,d);
      structures.push({x:bx,z:bz,w,d});
      block(world,mat('roof'+Math.floor(rand()*3),[0x343d3d,0x424746,0x4d4d47][Math.floor(rand()*3)]),bx,h+.13,bz,w+.35,.3,d+.35);
      // warmly lit shopfronts and restrained grids of windows on the street-facing side
      for(let floor=1;floor<h/3;floor++){
        const y=floor*3.1;
        for(let col=0;col<Math.floor(w/2.7);col++){
          const wx=bx-w/2+1.6+col*2.7;
          if(rand()>.24){const wm=rand()>.18?windowMat:coolWindow;block(world,wm,wx,y,bz+d/2+.018,.8,1.05,.05)}
        }
      }
      if(rand()>.55){
        block(world,darkMat,bx+w*.21,h+.72,bz,w*.25,.9,d*.27);
        if(rand()>.55)cylinder(world,darkMat,bx-w*.17,h+1.05,bz,.8,1.7,8);
      }
      // sidewalk planters & trees hug block corners, leaving the center of each road clear
      if(k===0){
        for(const [tx,tz] of [[cx-12,cz-12],[cx+12,cz+12]]){
          if(rand()>.25){cylinder(world,trunkMat,tx,1.05,tz,.25,2.1,7);sphere(world,treeMat,tx,2.6,tz,1.5,1.9)}
        }
      }
    }
  }
  // Street lights at selected intersections.
  const poleMat=mat('pole',0x3e4a47,.65,.3), glowMat=new THREE.MeshStandardMaterial({color:0xffce81,emissive:0xffa347,emissiveIntensity:2.1});
  for(let x=-144;x<=144;x+=48)for(let z=-144;z<=144;z+=48){
    if(Math.abs(x)<20&&Math.abs(z)<20)continue;
    const lx=x+(x%2?1:-1)*10,lz=z+9;
    cylinder(world,poleMat,lx,3.8,lz,.12,7.6,7);
    block(world,poleMat,lx+.9,7.25,lz,.13,.13,1.8);
    sphere(world,glowMat,lx+1.6,7.12,lz,.21,.13);
  }
  // Subtle distant skyline shapes beyond the playable blocks.
  for(let i=0;i<32;i++){
    const x=-205+rand()*390,z=-210-rand()*45,h=20+rand()*70,w=8+rand()*20;
    const tower=block(world,mat('skyline'+i,0x25373c),x,h/2,z,w,h,10+rand()*13);
    tower.material=mat('skyl'+Math.floor(i/4),0x25373c);
  }
}

function makeCar(x,z,yaw=0,police=false,color=0x9b6551){
  const g=new THREE.Group();
  const bodymat=mat('car'+color,color,.43,.28), black=mat('rubber',0x172020,.8), glass=new THREE.MeshStandardMaterial({color:0x9dc3c5,roughness:.22,metalness:.15,transparent:true,opacity:.77});
  block(g,bodymat,0,.65,0,2.1,.72,4.2);
  block(g,bodymat,0,1.2,-.25,1.72,.72,2.15);
  block(g,glass,0,1.25,-.28,1.62,.52,1.98);
  block(g,mat('bumper',0x252c2c,.45,.4),0,.46,-2.05,2.06,.22,.2);
  for(const s of [-1,1]){
    block(g,mat('lamp',0xffe6a3,.25),s*.73,.72,-2.115,.33,.2,.05);
    block(g,mat('taillamp',0xd34239,.3),s*.75,.74,2.115,.28,.18,.05);
    for(const zz of [-1.3,1.25]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.43,.43,.22,12),black);wheel.rotation.z=Math.PI/2;wheel.position.set(s*1.04,.43,zz);g.add(wheel)}
  }
  if(police){
    block(g,mat('policeWhite',0xe8e8d9,.44),0,.69,0,2.11,.38,1.5);
    block(g,mat('lightbar',0x263339,.3,.2),0,1.62,-.22,.92,.16,.28);
    sphere(g,mat('blueLight',0x45bcec,.25),-.28,1.75,-.22,.15,.13);sphere(g,mat('redLight',0xee5d52,.25),.28,1.75,-.22,.15,.13);
    block(g,mat('policeText',0x1e3238),0,.91,-.91,.56,.05,.22);
  }
  g.position.set(x,.04,z);g.rotation.y=yaw;world.add(g);
  const car={group:g,x,z,yaw,police,speed:0,stolen:false,occupant:null,wheels:[],drive:false};
  cars.push(car);return car;
}

function makePerson(x,z,kind='suspect',name=''){
  const g=new THREE.Group(), criminal=kind==='suspect';
  const coat=mat('coat'+(criminal?'a':'b'),criminal?0x9a5945:0x273c42), pants=mat('pants'+kind,criminal?0x252c32:0x24323a), skin=mat('skin',0xc58b69), hair=mat('hair',0x292a28);
  const torso=block(g,coat,0,1.2,0,.65,.86,.37);block(g,pants,0,.61,0,.52,.45,.32);
  sphere(g,skin,0,1.88,0,.26,.29);sphere(g,hair,0,2.05,-.015,.27,.15);
  block(g,skin,-.39,1.22,0,.19,.57,.2);block(g,skin,.39,1.22,0,.19,.57,.2);
  block(g,pants,-.16,.22,0,.2,.45,.24);block(g,pants,.16,.22,0,.2,.45,.24);
  if(criminal){
    block(g,mat('mask',0x272b2c),0,1.77,.22,.32,.13,.045);
    block(g,mat('bag',0x4e5243),0,1.21,-.27,.45,.4,.19);
  }else{
    block(g,mat('uniformStripe',0xd8c56d),0,1.2,.193,.44,.08,.025);
  }
  g.position.set(x,.06,z);g.rotation.y=Math.PI;
  const labelCanvas=document.createElement('canvas');labelCanvas.width=256;labelCanvas.height=64;
  const cx=labelCanvas.getContext('2d');cx.fillStyle='rgba(12,21,21,.8)';cx.fillRect(8,12,240,40);cx.fillStyle='#d2f36b';cx.font='bold 22px Arial';cx.fillText('✳  '+(name||'SUSPECT'),18,39);
  const tex=new THREE.CanvasTexture(labelCanvas);tex.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));sprite.scale.set(3.2,.8,1);sprite.position.y=2.95;g.add(sprite);
  world.add(g);
  const enemy={group:g,x,z,kind,name:name||'CAR THIEF',state:'looting',timer:rand()*1.5,heading:rand()*Math.PI*2,stun:0,car:null,marker:sprite,bob:rand()*8};
  if(criminal)suspects.push(enemy);return enemy;
}

function makeEffect(start,end,color=0x9bffe4){
  const points=[new THREE.Vector3(start.x,start.y,start.z),new THREE.Vector3((start.x+end.x)/2+(rand()-.5)*.8,(start.y+end.y)/2+(rand()-.5)*.7,(start.z+end.z)/2+(rand()-.5)*.8),new THREE.Vector3(end.x,end.y,end.z)];
  const geo=new THREE.BufferGeometry().setFromPoints(points),line=new THREE.Line(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity:.95}));world.add(line);
  const flash=new THREE.Mesh(sphereGeometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9}));flash.position.copy(points[2]);flash.scale.setScalar(.32);world.add(flash);
  effects.push({line,flash,t:.18});
}

makeCity();
const patrolCar=makeCar(1.5,13.5,0,true,0x26363a);
for(const [x,z,c,y] of [[9,-28,0x7d5140,0],[-10,7,0x477476,Math.PI/2],[36,-2,0xa18b60,0],[-39,47,0x566579,Math.PI/2],[96,50,0x825047,0],[4,100,0x5c6e69,Math.PI/2],[-95,-50,0x886b4c,0],[149,-96,0x4d6c6d,Math.PI/2]])makeCar(x,z,y,false,c);
const spawnPositions=[[0,-19],[22,3],[-26,-3],[47,-18],[-48,22],[69,50],[-95,-50],[140,-90]];
spawnPositions.forEach((p,i)=>{const s=makePerson(p[0],p[1],'suspect',['M. VEGA','R. CROSS','J. MORAN','T. KNOX','A. REED','D. PARK','S. GRAY','L. FROST'][i]);s.timer=.25+rand()*1.1;if(i===2)s.car=cars[2]});
const playerModel=makePerson(player.x,player.z,'officer');playerModel.marker.visible=false;
player.model=playerModel.group;

// Menu framing: the patrol cruiser and a slice of the lit waterfront sit behind the briefing.
const menuCamera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.1,420);
menuCamera.position.set(-18,10,42);menuCamera.lookAt(7,4,-10);

function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();menuCamera.aspect=innerWidth/innerHeight;menuCamera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.65))}
addEventListener('resize',resize);

function playTone(freq=520,duration=.08,type='sine',volume=.035){
  try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(volume,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration)}catch{}
}
function showToast(text,duration=2100){$('toast-text').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),duration)}
function startGame(){
  if(started)return;started=true;paused=false;
  $('title-screen').classList.add('leaving');$('hud').classList.remove('hidden');$('touch-controls').classList.toggle('hidden',!matchMedia('(pointer:coarse)').matches);requestAnimationFrame(()=>$('hud').classList.add('active'));
  showToast('UNIT 07 — CALL ACTIVE',2600);playTone(540,.13,'triangle');
  if(matchMedia('(pointer:fine)').matches)$('world').requestPointerLock?.();
}
$('start-button').addEventListener('click',startGame);
$('continue-button').addEventListener('click',()=>{$('promotion').classList.add('hidden');paused=false;showToast('KEEP THE STREETS SAFE, OFFICER.',2200)});

function nearestSuspect(){let found=null,dist=Infinity;for(const s of suspects){if(s.state==='arrested')continue;const d=Math.hypot(s.x-player.x,s.z-player.z);if(d<dist){dist=d;found=s}}return {found,dist}}
function nearestCar(){let found=null,dist=Infinity;for(const c of cars){if(c.occupant)continue;const d=Math.hypot(c.x-player.x,c.z-player.z);if(d<dist){dist=d;found=c}}return {found,dist}}
function arrest(){
  const {found,dist}=nearestSuspect();if(!found||found.state!=='stunned'||dist>3.1)return false;
  found.state='arrested';found.group.visible=false;found.marker.visible=false;player.arrested++;
  $('arrest-count').textContent=String(player.arrested).padStart(2,'0');$('objective').textContent=`${Math.max(0,3-player.arrested)} more suspect${3-player.arrested===1?'':'s'} to earn your badge`;
  $('dispatch-text').textContent=`SUSPECT ${found.name} IN CUSTODY. NICE WORK, UNIT 07.`;$('map-units').textContent=`${Math.max(0,suspects.filter(s=>s.state!=='arrested').length)} UNITS`;
  playTone(790,.12,'triangle');setTimeout(()=>playTone(970,.2,'triangle'),100);showToast('SUSPECT IN CUSTODY  +100 XP',2100);
  if(player.arrested>=3&&!earnedBadge){earnedBadge=true;player.rank=1;$('rank').textContent='OFFICER';$('rank').style.color='var(--lime)';document.querySelectorAll('.rank-pips i')[1].classList.add('lit');$('promotion').classList.remove('hidden');paused=true;playTone(660,.35,'sine',.055);setTimeout(()=>playTone(880,.4,'sine',.055),180)}
  return true;
}
function interact(){
  if(player.vehicle){exitVehicle();return}
  const {found,dist}=nearestSuspect();
  if(found&&found.state==='stunned'&&dist<3.1){arrest();return}
  const c=nearestCar();if(c.found&&c.dist<3.25){
    player.vehicle=c.found;c.found.occupant='player';c.found.drive=true;player.x=c.found.x;player.z=c.found.z;player.yaw=c.found.yaw;player.model.visible=false;$('vehicle-label').classList.remove('hidden');$('controls-hint').textContent='WASD DRIVE  ·  MOUSE LOOK  ·  E EXIT';showToast('PATROL CRUISER READY',1600);playTone(420,.12,'square',.025);return
  }
  if(found&&dist<3.2){showToast(found.state==='stunned'?'MOVE CLOSER TO MAKE THE ARREST':'STUN THE SUSPECT BEFORE APPROACHING',1400);return}
  showToast('NO ONE CLOSE ENOUGH TO INTERACT',1250);
}
function exitVehicle(){const c=player.vehicle;if(!c)return;c.occupant=null;c.drive=false;player.vehicle=null;player.x=c.x+2.6*Math.cos(player.yaw);player.z=c.z+2.6*Math.sin(player.yaw);player.model.visible=true;player.model.position.set(player.x,.06,player.z);$('vehicle-label').classList.add('hidden');$('controls-hint').textContent='WASD MOVE  ·  MOUSE LOOK  ·  CLICK STUN  ·  E ARREST';showToast('ON FOOT — KEEP YOUR EYES OPEN',1400)}
function fire(){
  if(!started||paused||player.cooldown>0)return;
  if(player.vehicle){showToast('EXIT THE VEHICLE TO USE YOUR STUN DEVICE',1200);return}
  player.cooldown=.64;player.charge=0;playTone(210,.085,'sawtooth',.025);playTone(690,.12,'sine',.02);
  const fwd=new THREE.Vector3(Math.sin(player.yaw),0,-Math.cos(player.yaw));
  const origin=new THREE.Vector3(player.x,player.vehicle?1.05:1.55,player.z).addScaledVector(fwd,player.vehicle?1.8:.35);
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),camera);ray.far=46;
  const intersections=[];
  for(const s of suspects){if(s.state==='arrested'||s.state==='stunned')continue;const target=new THREE.Vector3(s.x,1.25,s.z);const v=target.clone().sub(ray.ray.origin);const along=v.dot(ray.ray.direction);if(along<0||along>46)continue;const miss=v.addScaledVector(ray.ray.direction,-along).length();if(miss<1.45)intersections.push({s,along,miss})}
  intersections.sort((a,b)=>a.along-b.along);const hit=intersections[0]?.s;
  const end=hit?new THREE.Vector3(hit.x,1.3,hit.z):origin.clone().addScaledVector(fwd,24);
  makeEffect(origin,end);
  if(hit){
    hit.state='stunned';hit.stun=8;hit.group.rotation.z=0;hit.group.rotation.x=-.25;
    if(hit.car){hit.car.stolen=false;hit.car.speed=0;hit.car.occupant=null;hit.car=null}
    $('dispatch-text').textContent=`NON-LETHAL TAKEDOWN. ${hit.name} IS DOWN.`;showToast('SUSPECT STUNNED — MOVE IN TO ARREST',2200);playTone(300,.2,'triangle');
  }else{showToast('MISSED — LINE UP YOUR SHOT',950)}
}

// Input: drag to turn, tap/click to fire. The same controls work with a touchscreen.
$('world').addEventListener('pointerdown',e=>{if(!started||paused)return;mouseDown={x:e.clientX,y:e.clientY,id:e.pointerId};dragMoved=false;try{$('world').setPointerCapture?.(e.pointerId)}catch{}});
$('world').addEventListener('pointermove',e=>{if(!mouseDown||mouseDown.id!==e.pointerId)return;const dx=e.clientX-mouseDown.x,dy=e.clientY-mouseDown.y;if(Math.abs(dx)+Math.abs(dy)>4)dragMoved=true;if(dragMoved){player.yaw-=dx*.006;mouseDown.x=e.clientX;mouseDown.y=e.clientY;cameraPitch=THREE.MathUtils.clamp(cameraPitch+dy*.004,-.18,.45)}});
$('world').addEventListener('pointerup',e=>{if(!mouseDown)return;if(!dragMoved&&e.pointerType!=='touch'&&e.button!==0){mouseDown=null;return}if(!dragMoved)fire();mouseDown=null});
let cameraPitch=.12;
addEventListener('keydown',e=>{const key=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))e.preventDefault();keys.add(key);if(key==='e'&&!e.repeat&&started&&!paused)interact();if(key==='escape'&&$('promotion').classList.contains('hidden')&&document.pointerLockElement)document.exitPointerLock()});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
addEventListener('blur',()=>keys.clear());
for(const b of document.querySelectorAll('.touch-pad button')){const k=b.dataset.key;b.addEventListener('pointerdown',e=>{e.preventDefault();keys.add(k);b.setPointerCapture(e.pointerId)});for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>keys.delete(k))}
$('touch-fire').addEventListener('pointerdown',e=>{e.preventDefault();fire()});$('touch-use').addEventListener('pointerdown',e=>{e.preventDefault();if(player.vehicle)exitVehicle();else interact()});

// Pointer lock turns the mouse into a smooth look control; touch uses a short drag.
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement){mouseDown=null}});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement&&started&&!paused){player.yaw-=e.movementX*.0026;cameraPitch=THREE.MathUtils.clamp(cameraPitch+e.movementY*.0018,-.25,.42)}});
document.addEventListener('pointerlockerror',()=>showToast('MOUSE LOOK UNAVAILABLE — DRAG TO TURN',1800));

function blocked(x,z,radius=.65){
  if(Math.abs(x)>196||Math.abs(z)>205)return true;
  for(const b of structures){if(x>b.x-b.w/2-radius&&x<b.x+b.w/2+radius&&z>b.z-b.d/2-radius&&z<b.z+b.d/2+radius)return true}
  return false;
}
function movePlayer(dt){
  const forward=(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0);
  const strafe=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
  if(player.vehicle){
    const c=player.vehicle;
    const input=forward;
    c.speed=THREE.MathUtils.damp(c.speed,input>0?22:input<0?-9:0,input===0?2.3:1.55,dt);
    if(Math.abs(c.speed)>.3)c.yaw-=strafe*dt*(c.speed>0?1:-1)*1.25;
    const nx=c.x+Math.sin(c.yaw)*c.speed*dt,nz=c.z-Math.cos(c.yaw)*c.speed*dt;
    if(Math.abs(nx)<196&&Math.abs(nz)<205){c.x=nx;c.z=nz}else c.speed*= -.15;
    c.group.position.set(c.x,.04,c.z);c.group.rotation.y=c.yaw;
    player.x=c.x;player.z=c.z;player.yaw=c.yaw;
    $('speed').textContent=String(Math.round(Math.abs(c.speed)*2.1)).padStart(2,'0');
  }else{
    const fwd=new THREE.Vector3(Math.sin(player.yaw),0,-Math.cos(player.yaw));
    const right=new THREE.Vector3(Math.cos(player.yaw),0,Math.sin(player.yaw));
    const move=fwd.multiplyScalar(forward).addScaledVector(right,strafe);
    if(move.lengthSq()>1)move.normalize();
    const speed=keys.has('shift')?12:7.5;
    const nx=player.x+move.x*speed*dt,nz=player.z+move.z*speed*dt;
    if(!blocked(nx,player.z))player.x=nx;
    if(!blocked(player.x,nz))player.z=nz;
    player.model.position.set(player.x,.06,player.z);player.model.rotation.y=player.yaw+Math.PI;
    player.model.position.y=.06+((forward||strafe)?Math.sin(elapsed*12)*.035:0);
  }
}
function updateSuspects(dt){
  for(const s of suspects){
    s.timer-=dt;s.bob+=dt*5;
    if(s.state==='stunned'){
      s.stun-=dt;s.group.rotation.x=-1.05;s.group.position.y=-.12;
      if(s.stun<=0){s.state='fleeing';s.group.rotation.x=0;s.group.position.y=.06;s.heading=Math.atan2(s.x-player.x,s.z-player.z);showToast('SUSPECT IS GETTING BACK UP!',1500)}
      continue;
    }
    if(s.state==='arrested')continue;
    const distance=Math.hypot(s.x-player.x,s.z-player.z);
    if(s.state==='looting'&&s.timer<=0){s.state='stealing';s.timer=4;showToast('PROPERTY THEFT IN PROGRESS',1300)}
    if(s.state==='stealing'&&s.timer<=0){s.state='fleeing';s.timer=1.5;s.heading=Math.atan2(s.x-player.x,s.z-player.z);if(Math.hypot(s.x,s.z)<80)showToast('SUSPECT FLEEING ON FOOT',1300)}
    if(s.state==='fleeing'){
      if(distance<18){s.heading=Math.atan2(s.x-player.x,s.z-player.z)}
      const nx=s.x+Math.sin(s.heading)*dt*3.1,nz=s.z+Math.cos(s.heading)*dt*3.1;
      if(!blocked(nx,nz,.55)){s.x=nx;s.z=nz}else{s.heading+=1.3+rand();s.timer=.2}
      s.group.position.set(s.x,.06+Math.abs(Math.sin(s.bob*2))*.08,s.z);s.group.rotation.y=s.heading+Math.PI;
    }else if(s.state==='stealing'){
      // A quick tug at a parked car or a bag of stolen goods gives the call a visible beat.
      s.group.position.set(s.x,.06+Math.sin(s.bob)*.025,s.z);
      s.group.rotation.y=s.heading;
    }else{
      s.group.position.y=.06+Math.sin(s.bob)*.018;
    }
  }
}
function updateCamera(dt){
  const forward=new THREE.Vector3(Math.sin(player.yaw),0,-Math.cos(player.yaw));
  const right=new THREE.Vector3(Math.cos(player.yaw),0,Math.sin(player.yaw));
  const focus=new THREE.Vector3(player.x,player.vehicle?1.4:1.45,player.z).addScaledVector(forward,4.2);
  const desired=new THREE.Vector3(player.x,player.vehicle?2.7:3.3,player.z).addScaledVector(forward,-6.8).addScaledVector(right,1.1);
  const blend=1-Math.exp(-dt*5.5);camera.position.lerp(desired,blend);
  const look=focus.clone().add(new THREE.Vector3(0,-cameraPitch*8,0));camera.lookAt(look);
}
function updateInteraction(){
  const {found,dist}=nearestSuspect(),car=nearestCar();let prompt='';
  if(found&&found.state==='stunned'&&dist<3.8)prompt='ARREST SUSPECT';
  else if(car.found&&car.dist<3.8)prompt=car.found.police?'ENTER PATROL CRUISER':'ENTER VEHICLE';
  else if(found&&dist<3.8)prompt=found.state==='stealing'?'STOP THE THEFT':'SUSPECT — STUN TO ARREST';
  $('interaction').classList.toggle('hidden',!started||!prompt||paused);if(prompt)$('interaction-text').textContent=prompt;
}
function drawMinimap(){
  const canvas=$('minimap'),ctx=canvas.getContext('2d');if(!ctx)return;const w=canvas.width,h=canvas.height,scale=.48;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#192725';ctx.fillRect(0,0,w,h);
  ctx.save();ctx.translate(w/2-player.x*scale,h/2-player.z*scale);
  ctx.fillStyle='#505c56';for(let i=-192;i<=192;i+=48){ctx.fillRect(i*scale-3,-230*scale,6,460*scale);ctx.fillRect(-220*scale,i*scale-3,440*scale,6)}
  ctx.fillStyle='#b38d62';for(const b of structures){ctx.fillRect((b.x-b.w/2)*scale,(b.z-b.d/2)*scale,b.w*scale,b.d*scale)}
  ctx.fillStyle='#42bcd0';for(const c of cars){ctx.beginPath();ctx.arc(c.x*scale,c.z*scale,2.4,0,Math.PI*2);ctx.fill()}
  for(const s of suspects){if(s.state==='arrested')continue;ctx.fillStyle=s.state==='stunned'?'#d2f36b':'#f08c62';ctx.beginPath();ctx.arc(s.x*scale,s.z*scale,s.state==='stunned'?4:3,0,Math.PI*2);ctx.fill()}
  ctx.restore();ctx.strokeStyle='rgba(210,243,107,.2)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(w/2-5,h/2);ctx.lineTo(w/2+5,h/2);ctx.moveTo(w/2,h/2-5);ctx.lineTo(w/2,h/2+5);ctx.stroke();
  ctx.fillStyle='#d2f36b';ctx.beginPath();ctx.moveTo(w/2,h/2-6);ctx.lineTo(w/2-4,h/2+4);ctx.lineTo(w/2+4,h/2+4);ctx.closePath();ctx.fill();
}
function tick(dt){
  elapsed+=dt;player.cooldown=Math.max(0,player.cooldown-dt);player.charge=Math.min(1,player.charge+dt*1.35);
  $('charge-fill').style.width=`${Math.round(player.charge*100)}%`;
  movePlayer(dt);updateSuspects(dt);updateCamera(dt);updateInteraction();
  clockMinutes=(clockMinutes+dt*.22)%1440;const hrs=String(Math.floor(clockMinutes/60)%12||12).padStart(2,'0'),mins=String(Math.floor(clockMinutes%60)).padStart(2,'0');$('clock').textContent=`${hrs}:${mins}`;
  for(let i=effects.length-1;i>=0;i--){const fx=effects[i];fx.t-=dt;fx.line.material.opacity=Math.max(0,fx.t/.18);fx.flash.material.opacity=Math.max(0,fx.t/.18);if(fx.t<=0){world.remove(fx.line,fx.flash);fx.line.geometry.dispose();fx.line.material.dispose();fx.flash.material.dispose();effects.splice(i,1)}}
  if(Math.floor(elapsed*4)%4===0)drawMinimap();
}
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-lastFrame)/1000||0);lastFrame=now;if(started&&!paused)tick(dt);renderer.render(scene,started?camera:menuCamera)}
function onFatalError(error){console.error(error);$('start-error').classList.remove('hidden')}
try{requestAnimationFrame(frame)}catch(error){onFatalError(error)}
