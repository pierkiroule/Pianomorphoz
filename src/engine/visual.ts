import * as THREE from 'three';
import type {Settings} from './types';
export type PaperFormat='square'|'a4p'|'a4l'|'a3p'|'wide';
export type PaperTexture='cotton'|'smooth'|'washi';
export type BrushKind='wash'|'calligraphy'|'filament'|'bloom'|'splatter'|'petal';
export type BrushConfig={kind:BrushKind;color:string;water:number};
export type PaperConfig={format:PaperFormat;texture:PaperTexture;absorption:number};
type Form={mesh:THREE.Mesh;material:THREE.ShaderMaterial;born:number;life:number;seed:number;center:THREE.Vector3;radius:number;kind:BrushKind};
const clamp=THREE.MathUtils.clamp,TAU=Math.PI*2;
const vertex=`
 varying vec2 vUv;varying vec3 vNormal;varying vec3 vPosition;
 uniform float uTime;uniform float uSeed;uniform float uEnergy;
 void main(){
 vUv=uv;vec3 p=position;float wave=sin(uv.x*16.+uSeed*8.+uTime*.65)*sin(uv.y*9.-uTime*.38);
 p+=normal*wave*(.028+.055*uEnergy);
 vNormal=normalize(normalMatrix*normal);vPosition=p;
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
 }`;
const fragment=`
 precision mediump float;
 varying vec2 vUv;varying vec3 vNormal;varying vec3 vPosition;
 uniform vec3 uColor;uniform float uOpacity;uniform float uSeed;uniform float uTime;
 void main(){
 float edge=pow(abs(dot(normalize(vNormal),vec3(.24,.5,.84))),.48);
 float threads=sin(vUv.x*177.+sin(vUv.y*21.+uSeed)*9.)*sin(vUv.y*143.+uSeed*13.);
 float grain=.86+.14*threads;
 float border=pow(sin(vUv.y*3.14159265),.46);
 float vein=pow(abs(sin(vUv.x*27.+sin(vUv.y*11.)*3.+uSeed)),22.)*.12;
 vec3 ink=mix(uColor,vec3(1.),.22*(1.-edge)+vein);
 float alpha=uOpacity*border*grain*(.52+.48*edge);
 gl_FragColor=vec4(ink,alpha);
 }`;
export class VisualEngine{
 canvas:HTMLCanvasElement;settings:Settings;audio=0;midi=0;sustain=false;running=true;
 bands={low:0,mid:0,high:0,level:0,transient:0};background:HTMLImageElement|HTMLVideoElement|null=null;
 mode:'play'|'reveal'|'print'='play';
 paperConfig:PaperConfig={format:'a4l',texture:'cotton',absorption:65};
 brushes:BrushConfig[]=[{kind:'wash',color:'#365e79',water:75},{kind:'filament',color:'#bb7a6b',water:35},{kind:'bloom',color:'#c7a35b',water:85}];
 private renderer:THREE.WebGLRenderer;private scene=new THREE.Scene();private camera=new THREE.PerspectiveCamera(52,1,.04,180);
 private forms:Form[]=[];private seed=14217;private raf=0;private last=0;private time=0;private activeClock=0;private destroyed=false;
 private cursor=new THREE.Vector3();private heading=new THREE.Vector3(.3,.1,-1).normalize();private focus=new THREE.Vector3();
 private camPhase=0;private camClock=0;private camDistance=9;private camFov=52;private shotAngle=0;private shotElevation=0;private shotZoom=1;private printFov=53;
 private pointer:{x:number;y:number}|null=null;private energy=0;private accent=0;private count=0;private lastSignal=0;private idleForm:Form|null=null;
 private paintCanvas=document.createElement('canvas');private paintCtx:CanvasRenderingContext2D|null=null;private paintTexture:THREE.CanvasTexture|null=null;private paintClock=0;private paintStep=0;
 private backgroundTexture:THREE.Texture|null=null;private backgroundMesh:THREE.Mesh|null=null;private bgRef:HTMLImageElement|HTMLVideoElement|null=null;
 constructor(canvas:HTMLCanvasElement,settings:Settings){
  this.canvas=canvas;this.settings=settings;
  this.renderer=new THREE.WebGLRenderer({canvas,alpha:false,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.renderer.debug.checkShaderErrors=true;
  this.paintCanvas.width=1024;this.paintCanvas.height=1024;this.paintCtx=this.paintCanvas.getContext('2d');
  if(this.paintCtx){this.paintCtx.fillStyle='#ffffff';this.paintCtx.fillRect(0,0,1024,1024);this.paintTexture=new THREE.CanvasTexture(this.paintCanvas);this.paintTexture.colorSpace=THREE.SRGBColorSpace;this.scene.background=this.paintTexture;}else{this.scene.background=new THREE.Color('#ffffff');}
  this.scene.fog=new THREE.Fog('#ffffff',30,90);
  this.camera.position.set(0,2,10);
  canvas.addEventListener('pointerdown',this.down);canvas.addEventListener('pointermove',this.move);
  canvas.addEventListener('pointerup',this.up);canvas.addEventListener('pointercancel',this.up);
  canvas.addEventListener('wheel',this.wheel,{passive:false});
  this.resize();this.spawn(60,.45,true);this.raf=requestAnimationFrame(this.loop);
 }
 private rand(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
 private range(a:number,b:number){return a+(b-a)*this.rand();}
 resize=()=>{const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight);this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,w<750?1.35:1.75));this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();};
 configurePaper=(p:PaperConfig)=>{this.paperConfig={...p};};
 setBrushes=(b:BrushConfig[])=>{this.brushes=b.slice(0,3).map(v=>({...v}));};
 private makeGeometry(kind:BrushKind,seed:number){
  const segments=64,rows=8,verts:number[]=[],uvs:number[]=[],indices:number[]=[];
  const width:Record<BrushKind,number>={wash:1.7,calligraphy:.75,filament:.22,bloom:1.4,splatter:.48,petal:1.2};
  const length=kind==='filament'?6:kind==='bloom'?3.5:4.6;
  for(let i=0;i<=segments;i++){const t=i/segments,theta=t*TAU*(kind==='bloom'?1.3:.65);
   const radial=(.2+.8*Math.sin(Math.PI*t))*(.7+.3*Math.sin(t*12+seed));
   for(let j=0;j<=rows;j++){const v=j/rows-.5;
    const ribbon=width[kind]*v*radial;
    const x=Math.sin(theta)*(.9+t*1.3)+Math.cos(theta)*ribbon;
    const y=(t-.5)*length+Math.sin(t*12+seed)*.24+ribbon*.2;
    const z=Math.cos(theta)*(.9+t*1.3)+Math.sin(theta)*ribbon+Math.sin(v*TAU+t*13)*.11;
    verts.push(x,y,z);uvs.push(t,j/rows);
    if(i<segments&&j<rows){const a=i*(rows+1)+j,b=a+rows+1;indices.push(a,b,a+1,b,b+1,a+1);}
   }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();return geo;
 }
 private spawn(pitch=60,velocity=.6,persistent=false){
  if(this.forms.length>=18){const index=this.forms.findIndex(f=>f!==this.idleForm);if(index>=0){const old=this.forms.splice(index,1)[0];this.dispose(old);}}
  const brush=this.brushes[this.count%Math.max(1,this.brushes.length)]||this.brushes[0];this.count++;
  const seed=this.rand()*100;const colors=this.settings.colors.filter(c=>/^#[0-9a-f]{6}$/i.test(c));
  const color=brush.color||colors[this.count%Math.max(1,colors.length)]||'#517b79';
  const material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,side:THREE.DoubleSide,transparent:true,depthWrite:false,uniforms:{uColor:{value:new THREE.Color(color)},uOpacity:{value:0},uTime:{value:0},uSeed:{value:seed},uEnergy:{value:0}}});
  const geometry=this.makeGeometry(brush.kind,seed);
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;
  const angle=this.count*2.39996323+pitch*.025,rad=Math.sqrt((this.count%11)/11)*2.2;
  const center=persistent?new THREE.Vector3(0,0,0):new THREE.Vector3(Math.cos(angle)*rad,Math.sin(angle*1.3)*1.65,Math.sin(angle)*rad);
  mesh.position.copy(center);mesh.rotation.set(persistent?0:this.rand()*TAU,persistent?0:this.rand()*TAU,persistent?0:this.rand()*TAU);
  mesh.scale.setScalar(.3+velocity*.3);this.scene.add(mesh);
  const form={mesh,material,born:this.time,life:persistent?Infinity:this.range(14,27),seed,center,radius:2.5,kind:brush.kind};this.forms.push(form);if(persistent)this.idleForm=form;
 }
 private dispose(f:Form){this.scene.remove(f.mesh);f.mesh.geometry.dispose();f.material.dispose();}
 note=(pitch:number,velocity:number)=>{if(this.mode!=='play'||velocity<=0)return;const v=clamp(velocity/127,0,1);this.midi=Math.max(this.midi,v);this.accent=Math.max(this.accent,v);this.spawn(pitch,v);this.camPhase=(this.camPhase+(v>.65?1:0))%5;};
 private animateForms(dt:number){
  for(let i=this.forms.length-1;i>=0;i--){const f=this.forms[i];const age=this.time-f.born;if(age>=f.life){this.dispose(f);this.forms.splice(i,1);continue;}
   const persistent=f===this.idleForm;const rise=persistent?1:clamp(age/2.3,0,1),fall=persistent?1:clamp((f.life-age)/4.5,0,1),life=Math.min(rise,fall);
   const breathe=1+.08*Math.sin(this.time*.8+f.seed);
   f.mesh.scale.setScalar((persistent?1.25+this.energy*.95:.6+.7*rise)*breathe);
   f.mesh.rotation.y+=dt*(.06+this.energy*.2);f.mesh.rotation.x+=dt*.035;
   f.mesh.position.y=f.center.y+Math.sin(this.time*.35+f.seed)*.18;
   f.material.uniforms.uOpacity.value=life*(persistent?.95+this.energy*.05:.65+this.energy*.17);
   f.material.uniforms.uTime.value=this.time-f.born;f.material.uniforms.uEnergy.value=this.energy;
  }
 }
 private updateCamera(dt:number){
  const smooth=(a:number,b:number,k:number)=>a+(b-a)*(1-Math.exp(-dt*k));
  if(this.mode==='play'){
   this.camClock+=dt;
   if(this.camClock>7){this.camPhase=(this.camPhase+1)%5;this.camClock=0;}
   const t=this.time;const distances=[9,4.2,12,5.7,3.5];
   this.camDistance=smooth(this.camDistance,distances[this.camPhase]*(1-.18*this.energy),1.2);
   const angle=t*[.14,.33,-.17,.48,-.38][this.camPhase];
   const target=new THREE.Vector3(Math.sin(t*.17)*.25,Math.sin(t*.21)*.15,0);
   this.focus.lerp(target,1-Math.exp(-dt*1.5));
   const desired=new THREE.Vector3(Math.sin(angle)*this.camDistance*.9,Math.sin(angle*.7)*2.2,Math.cos(angle)*this.camDistance).add(this.focus);
   this.camera.position.lerp(desired,1-Math.exp(-dt*1.5));this.camera.lookAt(this.focus);
   this.camFov=smooth(this.camFov,[55,69,43,79,36][this.camPhase],1.1);this.camera.fov=this.camFov;this.camera.updateProjectionMatrix();
   this.camera.rotateZ(Math.sin(t*.35)*.035);
  }else{
   const bounds=this.computeBounds(),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
   const aspect=this.camera.aspect,fov=THREE.MathUtils.degToRad(this.printFov);
   const dist=Math.max(5,(Math.max(size.y,size.x/Math.max(.5,aspect))*.5)/Math.tan(fov/2)+size.z*.5+1.4)*this.shotZoom;
   const theta=THREE.MathUtils.degToRad(this.shotAngle),phi=THREE.MathUtils.degToRad(this.shotElevation);
   const desired=center.clone().add(new THREE.Vector3(Math.sin(theta)*Math.cos(phi)*dist,Math.sin(phi)*dist,Math.cos(theta)*Math.cos(phi)*dist));
   this.camera.position.lerp(desired,1-Math.exp(-dt*3));this.focus.lerp(center,1-Math.exp(-dt*3));this.camera.lookAt(this.focus);
   this.camera.fov=this.printFov;this.camera.updateProjectionMatrix();
  }
 }
 private computeBounds(){
  const b=new THREE.Box3();for(const f of this.forms){const r=3.5*f.mesh.scale.x;const d=new THREE.Vector3(r,r,r);b.expandByPoint(f.mesh.position.clone().sub(d));b.expandByPoint(f.mesh.position.clone().add(d));}
  if(b.isEmpty())b.setFromCenterAndSize(new THREE.Vector3(),new THREE.Vector3(8,7,8));return b;
 }
 private syncBackground(){
  if(this.background===this.bgRef)return;this.bgRef=this.background;
  if(this.backgroundMesh){this.camera.remove(this.backgroundMesh);this.backgroundMesh.geometry.dispose();(this.backgroundMesh.material as THREE.Material).dispose();this.backgroundMesh=null;}
  this.backgroundTexture?.dispose();this.backgroundTexture=null;if(!this.background)return;
  const tex=this.background instanceof HTMLVideoElement?new THREE.VideoTexture(this.background):new THREE.Texture(this.background);
  tex.needsUpdate=true;this.backgroundTexture=tex;
  this.backgroundMesh=new THREE.Mesh(new THREE.PlaneGeometry(140,90),new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:this.settings.bgOpacity/100,depthTest:false,depthWrite:false}));
  this.backgroundMesh.position.z=-85;this.camera.add(this.backgroundMesh);
 }
 private paint(dt:number){
  const ctx=this.paintCtx;if(!ctx||!this.paintTexture)return;
  this.paintClock+=dt;const activity=Math.max(this.audio,this.bands.level,this.midi);
  if(this.paintClock<.025)return;this.paintClock=0;
  const t=this.paintStep++*.016;
  const x=512+Math.sin(t*.71)*255+Math.sin(t*1.93)*65;
  const y=512+Math.cos(t*.57)*245+Math.cos(t*1.37)*75;
  const angle=t*.8+Math.sin(t*.43);
  const radius=12+activity*70+8*Math.sin(t*.7);
  const colors=['#365e79','#bb7a6b','#c7a35b','#527c71'];
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);
  ctx.globalAlpha=.14+Math.min(.55,activity*.75);
  ctx.strokeStyle=colors[Math.floor(t/2)%colors.length];
  ctx.lineWidth=1.4+activity*12;
  ctx.beginPath();ctx.moveTo(-radius*2,-radius*.2);
  ctx.bezierCurveTo(-radius,radius*1.5,radius,-radius*1.4,radius*2,radius*.2);
  ctx.stroke();
  ctx.globalAlpha=.055+activity*.08;ctx.fillStyle=colors[(Math.floor(t/2)+1)%colors.length];
  ctx.beginPath();ctx.ellipse(0,0,radius*1.6,radius*.65,0,0,Math.PI*2);ctx.fill();
  ctx.restore();this.paintTexture.needsUpdate=true;
 }
 private loop=(now:number)=>{
  if(this.destroyed)return;this.raf=requestAnimationFrame(this.loop);
  const dt=Math.min(.05,(now-(this.last||now))/1000);this.last=now;
  if(this.mode==='play'&&this.running){
   this.time+=dt;const signal=Math.max(this.audio*2,this.bands.low*.8+this.bands.mid*.8+this.bands.high*.5,this.midi);
   this.energy+=(signal-this.energy)*(1-Math.exp(-dt*7));
   this.activeClock+=dt;
   if(signal>.035&&this.activeClock>.55+(.7-this.settings.density/180)){this.spawn(60+Math.round(this.bands.mid*24),clamp(signal,0,1));this.activeClock=0;}
   this.midi*=Math.exp(-dt*5);this.accent*=Math.exp(-dt*6);
   this.animateForms(dt);this.paint(dt);
  }
  this.syncBackground();this.updateCamera(dt);
  if(this.backgroundMesh)(this.backgroundMesh.material as THREE.MeshBasicMaterial).opacity=this.settings.bgOpacity/100;
  try{this.renderer.render(this.scene,this.camera);}catch(error){console.error('Sonomorphoz WebGL render failed',error);}
 };
 reveal=()=>{this.mode='reveal';this.running=false;this.shotAngle=0;this.shotElevation=0;this.shotZoom=1;this.printFov=53;};
 printMode=()=>{if(this.mode==='play')this.reveal();this.mode='print';};
 resume=()=>{this.mode='play';this.running=true;};
 setPrintView=(a:number,e:number,z:number)=>{this.shotAngle=a;this.shotElevation=clamp(e,-85,85);this.shotZoom=clamp(z,.3,3);};
 setPrintFov=(v:number)=>{this.printFov=clamp(v,18,100);};
 rotatePrint=(v:number)=>{this.shotAngle+=v;};zoomPrint=(v:number)=>{this.shotZoom=clamp(this.shotZoom*v,.3,3);};
 resetPrint=()=>{this.shotAngle=0;this.shotElevation=0;this.shotZoom=1;this.printFov=53;};
 private down=(e:PointerEvent)=>{if(this.mode==='print'){this.pointer={x:e.clientX,y:e.clientY};this.canvas.setPointerCapture(e.pointerId);}};
 private move=(e:PointerEvent)=>{if(!this.pointer||this.mode!=='print')return;this.shotAngle+=(e.clientX-this.pointer.x)*.18;this.shotElevation=clamp(this.shotElevation+(e.clientY-this.pointer.y)*.12,-85,85);this.pointer={x:e.clientX,y:e.clientY};};
 private up=()=>{this.pointer=null;};
 private wheel=(e:WheelEvent)=>{if(this.mode==='print'){e.preventDefault();this.zoomPrint(Math.exp(e.deltaY*.001));}};
 exportPrint=(size=3000,aspect=1)=>{
  const w=size,h=Math.round(size/aspect),old=new THREE.Vector2();this.renderer.getSize(old);
  const ratio=this.renderer.getPixelRatio(),cameraPos=this.camera.position.clone(),cameraQuat=this.camera.quaternion.clone(),oldAspect=this.camera.aspect,oldFov=this.camera.fov;
  try{
   this.renderer.setPixelRatio(1);this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.fov=this.printFov;this.camera.updateProjectionMatrix();
   const bounds=this.computeBounds(),dim=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
   const dist=Math.max(5,(Math.max(dim.y,dim.x/Math.max(.5,this.camera.aspect))*.5)/Math.tan(THREE.MathUtils.degToRad(this.printFov)/2)+dim.z*.5+1.4)*this.shotZoom;
   const a=THREE.MathUtils.degToRad(this.shotAngle),e=THREE.MathUtils.degToRad(this.shotElevation);
   this.camera.position.copy(center).add(new THREE.Vector3(Math.sin(a)*Math.cos(e)*dist,Math.sin(e)*dist,Math.cos(a)*Math.cos(e)*dist));this.camera.lookAt(center);
   this.renderer.render(this.scene,this.camera);return this.canvas.toDataURL('image/png');
  }finally{
   this.renderer.setPixelRatio(ratio);this.renderer.setSize(old.x,old.y,false);this.camera.aspect=oldAspect;this.camera.fov=oldFov;this.camera.position.copy(cameraPos);this.camera.quaternion.copy(cameraQuat);this.camera.updateProjectionMatrix();
  }
 };
 exportSheet=(width=3000)=>{const ratios:Record<PaperFormat,number>={square:1,a4p:210/297,a4l:297/210,a3p:297/420,wide:16/9};return this.exportPrint(width,ratios[this.paperConfig.format]);};
 reset=()=>{if(this.paintCtx){this.paintCtx.fillStyle='#ffffff';this.paintCtx.fillRect(0,0,1024,1024);if(this.paintTexture)this.paintTexture.needsUpdate=true;}this.paintStep=0;for(const f of this.forms)this.dispose(f);this.forms=[];this.idleForm=null;this.time=0;this.activeClock=0;this.count=0;this.mode='play';this.running=true;this.camera.position.set(0,2,10);this.focus.set(0,0,0);this.camPhase=0;this.camClock=0;this.spawn(60,.45,true);};
 destroy=()=>{this.destroyed=true;cancelAnimationFrame(this.raf);this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointermove',this.move);this.canvas.removeEventListener('pointerup',this.up);this.canvas.removeEventListener('pointercancel',this.up);this.canvas.removeEventListener('wheel',this.wheel);for(const f of this.forms)this.dispose(f);if(this.backgroundMesh){this.backgroundMesh.geometry.dispose();(this.backgroundMesh.material as THREE.Material).dispose();}this.backgroundTexture?.dispose();this.paintTexture?.dispose();this.renderer.dispose();};
}
