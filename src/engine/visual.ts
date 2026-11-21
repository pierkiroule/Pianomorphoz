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
 float grain=.80+.20*threads;float wash=sin(vUv.x*33.+sin(vUv.y*41.+uSeed)*2.)*sin(vUv.y*37.+uSeed);
 float border=pow(sin(vUv.y*3.14159265),.46);
 float vein=pow(abs(sin(vUv.x*27.+sin(vUv.y*11.)*3.+uSeed)),22.)*.12;
 vec3 ink=mix(uColor,vec3(1.),.18*(1.-edge)+vein+.12*max(0.,wash));
 float alpha=uOpacity*border*grain*(.40+.60*edge)*(.83+.17*wash);
 gl_FragColor=vec4(ink,alpha);
 }`;

const watercolorVertex=`
 varying vec2 vUv;varying float vDepth;
 void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vDepth=-mv.z;gl_Position=projectionMatrix*mv;}
`;
const watercolorFragment=`
 precision highp float;
 varying vec2 vUv;varying float vDepth;
 uniform vec3 uPigment;uniform float uSeed;uniform float uTime;uniform float uAlpha;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
 void main(){
   vec2 uv=vUv;float n=noise(uv*vec2(12.,6.)+uSeed)+.5*noise(uv*vec2(49.,23.)+uSeed*1.7);
   float gran=noise(uv*vec2(235.,130.)+uSeed*2.1);
   float wav=sin(uv.x*23.+uSeed*3.)*.035+sin(uv.x*51.+uSeed)*.018;
   float edge=abs(uv.y-.5)*2.;
   float mask=1.-smoothstep(.77+wav,.99+wav,edge);
   float pooling=smoothstep(.69,.98,edge)*(.4+.6*n);
   float dry=smoothstep(.27,.78,gran+.24*n);
   float alpha=uAlpha*mask*(.24+.34*n+.22*pooling)*(1.-dry*.48);
   vec3 pigment=mix(uPigment,vec3(.98),.24*gran+.13*n);
   pigment=mix(pigment,uPigment*.69,pooling*.48);
   gl_FragColor=vec4(pigment,clamp(alpha,0.,.56));
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
 private watercolorSheets:THREE.Mesh[]=[];private watercolorSeed=Math.random()*100;
 private styleMaterials:THREE.Object3D[]=[];private artStyle=0;private styleSeed=Math.random()*1000;
 private dancers:{tip:THREE.Vector3;trail:THREE.Vector3[];ink:THREE.Line;halo:THREE.Line;head:THREE.Mesh;phase:number}[]=[];
 private dust:THREE.Points|null=null;private dustPositions:Float32Array|null=null;private dustLife=new Float32Array(480);private dustCursor=0;private travel=0;private drawingClock=0;
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
  this.resize();this.initChoreography();this.raf=requestAnimationFrame(this.loop);
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
  const mesh=new THREE.Mesh(geometry,material);
  // Hand-drawn hairline ink contours follow the exact watercolor ribbon edges.
  const pos=geometry.getAttribute('position');const rows=8,segments=64;
  for(const edge of [0,rows]){
   const points:THREE.Vector3[]=[];
   for(let i=0;i<=segments;i++){
    const k=i*(rows+1)+edge;
    points.push(new THREE.Vector3(pos.getX(k),pos.getY(k),pos.getZ(k)));
   }
   const contour=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:edge===0?'#243d46':'#4a5350',transparent:true,opacity:.45,depthWrite:false}));
   contour.renderOrder=2;mesh.add(contour);
  }
  // Fine central ink filament, independent from the transparent pigment surface.
  const spine:THREE.Vector3[]=[];
  for(let i=0;i<=segments;i++){
   const k=i*(rows+1)+Math.floor(rows/2);
   spine.push(new THREE.Vector3(pos.getX(k),pos.getY(k),pos.getZ(k)+.012));
  }
  mesh.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(spine),new THREE.LineBasicMaterial({color:'#2d4245',transparent:true,opacity:.24,depthWrite:false})));mesh.frustumCulled=false;
  const angle=this.count*2.39996323+pitch*.025,rad=Math.sqrt((this.count%11)/11)*2.2;
  const center=persistent?new THREE.Vector3(0,0,0):new THREE.Vector3(Math.cos(angle)*rad,Math.sin(angle*1.3)*1.65,Math.sin(angle)*rad);
  mesh.position.copy(center);mesh.rotation.set(persistent?0:this.rand()*TAU,persistent?0:this.rand()*TAU,persistent?0:this.rand()*TAU);
  mesh.scale.setScalar(.3+velocity*.3);this.scene.add(mesh);
  const form={mesh,material,born:this.time,life:persistent?Infinity:this.range(14,27),seed,center,radius:2.5,kind:brush.kind};this.forms.push(form);if(persistent)this.idleForm=form;
 }
 private dispose(f:Form){this.scene.remove(f.mesh);f.mesh.traverse(child=>{if(child instanceof THREE.Line){child.geometry.dispose();(child.material as THREE.Material).dispose();}});f.mesh.geometry.dispose();f.material.dispose();}
 note=(pitch:number,velocity:number)=>{if(this.mode!=='play'||velocity<=0)return;const v=clamp(velocity/127,0,1);this.midi=Math.max(this.midi,v);this.accent=Math.max(this.accent,v);this.camPhase=(this.camPhase+(v>.65?1:0))%5;};
 private animateForms(dt:number){
  for(let i=this.forms.length-1;i>=0;i--){const f=this.forms[i];const age=this.time-f.born;if(age>=f.life){this.dispose(f);this.forms.splice(i,1);continue;}
   const persistent=f===this.idleForm;const rise=persistent?1:clamp(age/2.3,0,1),fall=persistent?1:clamp((f.life-age)/4.5,0,1),life=Math.min(rise,fall);
   const breathe=1+.08*Math.sin(this.time*.8+f.seed);
   f.mesh.scale.setScalar((persistent?1.25+this.energy*.95:.6+.7*rise)*breathe);
   f.mesh.rotation.y+=dt*(.055+this.energy*.15);f.mesh.rotation.x+=dt*.025;
   f.mesh.position.y=f.center.y+Math.sin(this.time*.35+f.seed)*.18;
   f.material.uniforms.uOpacity.value=life*(persistent?.72+this.energy*.12:.48+this.energy*.20);
   f.material.uniforms.uTime.value=this.time-f.born;f.material.uniforms.uEnergy.value=this.energy;
  }
 }
 private updateCamera(dt:number){
  const smooth=(a:number,b:number,k:number)=>a+(b-a)*(1-Math.exp(-dt*k));
  if(this.mode==='play'){
   this.camClock+=dt;
   if(this.camClock>7){this.camPhase=(this.camPhase+1)%5;this.camClock=0;}
   const t=this.time;
   this.camDistance=smooth(this.camDistance,5.4+Math.sin(t*.15)*.8,.65);
   // Camera follows the barycentre of the three brush tips.
   const target=new THREE.Vector3();for(const dancer of this.dancers)target.add(dancer.tip);if(this.dancers.length)target.multiplyScalar(1/this.dancers.length);
   this.focus.lerp(target,1-Math.exp(-dt*1.5));
   const desired=new THREE.Vector3(Math.sin(t*.15)*1.1,1.2+Math.sin(t*.22)*.45,this.camDistance).add(this.focus);
   this.camera.position.lerp(desired,1-Math.exp(-dt*1.5));this.camera.lookAt(this.focus);
   this.camFov=smooth(this.camFov,54+Math.sin(t*.13)*3,.65);this.camera.fov=this.camFov;this.camera.updateProjectionMatrix();
   this.camera.rotateZ(Math.sin(t*.35)*.022);
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
  const b=new THREE.Box3();for(const d of this.dancers){for(const p of d.trail)b.expandByPoint(p);}for(const f of this.forms){const r=3.5*f.mesh.scale.x;const d=new THREE.Vector3(r,r,r);b.expandByPoint(f.mesh.position.clone().sub(d));b.expandByPoint(f.mesh.position.clone().add(d));}
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
  ctx.globalAlpha=.035+Math.min(.10,activity*.16);
  ctx.strokeStyle=colors[Math.floor(t/2)%colors.length];
  ctx.lineWidth=1.4+activity*12;
  ctx.beginPath();ctx.moveTo(-radius*2,-radius*.2);
  ctx.bezierCurveTo(-radius,radius*1.5,radius,-radius*1.4,radius*2,radius*.2);
  ctx.stroke();
  ctx.globalAlpha=.018+activity*.025;ctx.fillStyle=colors[(Math.floor(t/2)+1)%colors.length];
  ctx.beginPath();ctx.ellipse(0,0,radius*1.6,radius*.65,0,0,Math.PI*2);ctx.fill();
  ctx.restore();this.paintTexture.needsUpdate=true;
 }
 private clearWatercolor(){for(const mesh of this.watercolorSheets){this.scene.remove(mesh);mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}this.watercolorSheets=[];}
 private updateWatercolor(){
  if(this.artStyle!==0)return;
  const palette=['#467c9a','#cb847f','#c6a46c'];
  for(let i=0;i<this.dancers.length;i++){
   const d=this.dancers[i];if(d.trail.length<3)continue;
   let mesh=this.watercolorSheets[i];
   if(!mesh){
    const material=new THREE.ShaderMaterial({vertexShader:watercolorVertex,fragmentShader:watercolorFragment,transparent:true,side:THREE.DoubleSide,depthWrite:false,uniforms:{uPigment:{value:new THREE.Color(palette[i])},uSeed:{value:this.watercolorSeed+i*13.7},uTime:{value:0},uAlpha:{value:.85}}});
    mesh=new THREE.Mesh(new THREE.BufferGeometry(),material);mesh.frustumCulled=false;mesh.renderOrder=2;this.scene.add(mesh);this.watercolorSheets[i]=mesh;
   }
   const trail=d.trail,verts:number[]=[],uv:number[]=[],indices:number[]=[];
   const rows=9;
   for(let k=0;k<trail.length;k++){
    const current=trail[k],prev=trail[Math.max(0,k-1)],next=trail[Math.min(trail.length-1,k+1)];
    const tangent=next.clone().sub(prev).normalize();
    const side=new THREE.Vector3(-tangent.y,tangent.x,.35+Math.sin(k*.13+i)*.3).normalize();
    const progress=k/Math.max(1,trail.length-1);
    const width=(.52+this.energy*.32)*(.5+.5*Math.sin(progress*Math.PI))*(.8+.2*Math.sin(k*.19+i));
    for(let j=0;j<rows;j++){
     const v=j/(rows-1),offset=(v-.5)*2*width;
     const curl=Math.sin(k*.15+v*8+i*2+this.time*.45)*.13;
     verts.push(current.x+side.x*offset,current.y+side.y*offset,current.z+side.z*offset+curl);
     uv.push(progress,v);
     if(k>0&&j>0){const a=(k-1)*rows+j-1,b=k*rows+j-1;indices.push(a,b,a+1,b,b+1,a+1);}
    }
   }
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();mesh.geometry.dispose();mesh.geometry=geometry;
   const uniforms=(mesh.material as THREE.ShaderMaterial).uniforms;uniforms.uTime.value=this.time;uniforms.uAlpha.value=.72+this.energy*.2;
  }
 }
 private clearStyleMaterials(){for(const obj of this.styleMaterials){this.scene.remove(obj);obj.traverse(child=>{if(child instanceof THREE.Mesh||child instanceof THREE.Points||child instanceof THREE.Line){child.geometry.dispose();(child.material as THREE.Material).dispose();}});}this.styleMaterials=[];}
 private addStyleObject(obj:THREE.Object3D){this.scene.add(obj);this.styleMaterials.push(obj);}
 private renderStyleMaterial(tip:THREE.Vector3,index:number){
  const style=this.artStyle,energy=clamp(this.energy,0,1),size=.08+energy*.12;
  const palette=['#789fb0','#202a31','#8b79b8','#658e7c','#d19d9e','#6f9f9d','#617a99','#b6a1bd','#536b7b','#d6a1ba'];
  const color=new THREE.Color(palette[style]);color.offsetHSL((index-1)*.055,0,0);
  const p=tip.clone();const lifetime=this.time;
  if(style===0||style===4||style===9){
   const w=style===4?.65:style===9?.38:.95;
   const geometry=new THREE.PlaneGeometry(w*(.5+energy),.35+size,8,3);
   const pos=geometry.attributes.position as THREE.BufferAttribute;
   for(let j=0;j<pos.count;j++){const x=pos.getX(j),y=pos.getY(j);pos.setZ(j,Math.sin(x*9+lifetime*1.4+index)*.11+Math.cos(y*11+lifetime)*.06);}geometry.computeVertexNormals();
   const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:style===0?.09:style===4?.2:.13,side:THREE.DoubleSide,depthWrite:false});
   const mesh=new THREE.Mesh(geometry,material);mesh.position.copy(p);mesh.rotation.set(Math.sin(lifetime*.7+index)*.5,lifetime*.32+index,Math.sin(lifetime*.9)*.3);this.addStyleObject(mesh);
  }else if(style===1){
   const geometry=new THREE.ConeGeometry(.025+energy*.08,.28+energy*.32,5);const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:'#202a31',transparent:true,opacity:.85}));mesh.position.copy(p);mesh.rotation.z=Math.sin(lifetime*2+index);this.addStyleObject(mesh);
  }else if(style===2||style===7){
   const count=style===7?48:30,positions=new Float32Array(count*3);
   for(let k=0;k<count;k++){const spread=style===7?.9:1.6;positions[k*3]=(this.rand()-.5)*spread;positions[k*3+1]=(this.rand()-.5)*spread;positions[k*3+2]=(this.rand()-.5)*spread;}
   const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
   const pts=new THREE.Points(geo,new THREE.PointsMaterial({color,size:style===7?.023:.065,transparent:true,opacity:style===7?.62:.24,depthWrite:false}));pts.position.copy(p);this.addStyleObject(pts);
  }else if(style===3||style===5){
   const points:THREE.Vector3[]=[];for(let k=0;k<7;k++){const t=k/6;points.push(new THREE.Vector3(Math.sin(t*5+index)*t*.22,t*(.35+energy*.35),Math.cos(t*5+index)*t*.22));}
   const curve=new THREE.CatmullRomCurve3(points);const geo=new THREE.TubeGeometry(curve,14,style===3?.009:.035,4,false);
   const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:style===3?.55:.38}));mesh.position.copy(p);mesh.rotation.z=lifetime*.23;this.addStyleObject(mesh);
  }else if(style===6){
   const geo=new THREE.TorusGeometry(.2+energy*.2,.009,4,32);const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.42}));mesh.position.copy(p);mesh.rotation.set(lifetime*.4,index,lifetime*.2);this.addStyleObject(mesh);
  }else if(style===8){
   const geo=new THREE.TetrahedronGeometry(.1+energy*.14,0);const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color,wireframe:true,transparent:true,opacity:.48}));mesh.position.copy(p);mesh.rotation.set(lifetime*.5,index,lifetime*.3);this.addStyleObject(mesh);
  }
  if(this.styleMaterials.length>110){const old=this.styleMaterials.splice(0,1)[0];this.scene.remove(old);old.traverse(child=>{if(child instanceof THREE.Mesh||child instanceof THREE.Points||child instanceof THREE.Line){child.geometry.dispose();(child.material as THREE.Material).dispose();}});}
 }
 setArtStyle=(n:number)=>{this.clearWatercolor();this.clearStyleMaterials();this.artStyle=Math.max(0,Math.min(9,Math.round(n)));this.styleSeed=Math.random()*1000;this.travel=0;for(const d of this.dancers){d.trail=[];d.ink.geometry.dispose();d.ink.geometry=new THREE.BufferGeometry();d.halo.geometry.dispose();d.halo.geometry=new THREE.BufferGeometry();}this.dustPositions?.fill(0);this.dustLife.fill(0);if(this.dust)this.dust.geometry.attributes.position.needsUpdate=true;};
 private initChoreography(){
  const colors=['#355b75','#b87869','#bda26e'];
  for(let i=0;i<3;i++){
   const ink=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:colors[i],transparent:true,opacity:.75,depthWrite:false}));
   const halo=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:colors[i],transparent:true,opacity:.16,depthWrite:false}));
   const head=new THREE.Mesh(new THREE.SphereGeometry(.075,10,8),new THREE.MeshBasicMaterial({color:colors[i],transparent:true,opacity:.75,depthWrite:false}));
   ink.frustumCulled=false;halo.frustumCulled=false;this.scene.add(ink,halo,head);
   this.dancers.push({tip:new THREE.Vector3(),trail:[],ink,halo,head,phase:i*TAU/3});
  }
  const positions=new Float32Array(480*3);this.dustPositions=positions;
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  this.dust=new THREE.Points(geo,new THREE.PointsMaterial({color:'#80919b',size:.035,transparent:true,opacity:.32,sizeAttenuation:true,depthWrite:false}));
  this.dust.frustumCulled=false;this.scene.add(this.dust);
 }
 private choreograph(dt:number){
  this.travel+=dt*(.48+this.energy*.75);
  this.drawingClock+=dt;
  const t=this.travel, intensity=clamp(this.energy,0,1);
  const center=new THREE.Vector3(Math.sin(t*.24)*.7,Math.cos(t*.19)*.45,-t*.6);
  for(let i=0;i<this.dancers.length;i++){
   const d=this.dancers[i],p=d.phase;
   const radius=1.0+.5*Math.sin(t*.17+p)+intensity*.5;
   const q=p+this.styleSeed*.01,style=this.artStyle;
   let x=center.x+Math.sin(t*(.75+i*.13)+q)*radius+Math.sin(t*1.7+q)*.28;
   let y=center.y+Math.cos(t*(.64+i*.09)+q)*(.9+intensity*.45)+Math.sin(t*1.21-q)*.25;
   let z=center.z+Math.sin(t*.53+q)*.85;
   switch(style){
    case 1:x=Math.sin(t*.38+q)*1.6;y=Math.sin(t*.91+q)*1.1;z=center.z+Math.cos(t*.28+q)*.3;break;
    case 2:x=Math.sin(t*1.8+q)*2.2;y=Math.cos(t*1.5+q)*1.6;z=center.z+Math.sin(t*2.3+q);break;
    case 3:x=Math.sin(t*.5+q)*.8+Math.sin(t*3+q)*.3;y=Math.cos(t*.3+q)*1.7;z=center.z+Math.sin(t*.7+q)*1.2;break;
    case 4:x=Math.sin(t*.62+q)*2.1;y=Math.sin(t*.62+q)*Math.cos(t*.3+q)*1.3;z=center.z+Math.cos(t*.62+q)*1.2;break;
    case 5:x=Math.sin(t*.4+q)*1.5+Math.sin(t*3.1+q)*.35;y=Math.cos(t*.47+q)*1.4;z=center.z+Math.cos(t*2.7+q)*.65;break;
    case 6:x=Math.cos(t*1.1+q)*1.5;y=Math.sin(t*1.1+q)*1.5;z=center.z+Math.sin(t*.22+q)*1.4;break;
    case 7:x=Math.sin(t*2.4+q)*2;y=Math.cos(t*2.8+q)*1.5;z=center.z+Math.sin(t*3.4+q)*.7;break;
    case 8:x=Math.round(Math.sin(t*.7+q)*5)/3;y=Math.round(Math.cos(t*.9+q)*5)/3;z=center.z+Math.round(Math.sin(t*.5+q)*4)/4;break;
    case 9:x=Math.sin(t*.5+q)*(1+Math.sin(t*2.1+q));y=Math.cos(t*.5+q)*(1+Math.sin(t*2.1+q));z=center.z+Math.sin(t*.8+q)*1.2;break;
   }
   d.tip.set(x,y,z);d.head.position.copy(d.tip);
   if(this.drawingClock>=.045){
    if(this.artStyle!==0)this.renderStyleMaterial(d.tip,i);
    d.trail.push(d.tip.clone());if(d.trail.length>220)d.trail.shift();
    if(d.trail.length>1){
     const g=new THREE.BufferGeometry().setFromPoints(d.trail);d.ink.geometry.dispose();d.ink.geometry=g;const mat=d.ink.material as THREE.LineBasicMaterial;mat.opacity=[.58,.92,.25,.48,.68,.62,.85,.12,.8,.56][this.artStyle];mat.color.set(['#416c81','#1d2931','#8170a8','#587d73','#b67d80','#527e87','#465c76','#b2a0aa','#364954','#a77a8c'][this.artStyle]);
     const offset=d.trail.map((v,k)=>v.clone().add(new THREE.Vector3(Math.sin(k*.22+p)*.035,Math.cos(k*.19+p)*.045,.055)));
     const h=new THREE.BufferGeometry().setFromPoints(offset);d.halo.geometry.dispose();d.halo.geometry=h;(d.halo.material as THREE.LineBasicMaterial).opacity=[.24,.035,.38,.1,.3,.2,.08,.06,.04,.25][this.artStyle];
    }
    for(let k=0;k<[6,1,16,8,4,11,3,22,2,14][this.artStyle];k++){
     const index=this.dustCursor++%480;const a=index*3;
     this.dustPositions![a]=x+(this.rand()-.5)*([.6,.08,2.5,.8,.35,1.2,.15,2.8,.12,1.5][this.artStyle]+intensity);
     this.dustPositions![a+1]=y+(this.rand()-.5)*([.6,.08,2.5,.8,.35,1.2,.15,2.8,.12,1.5][this.artStyle]+intensity);
     this.dustPositions![a+2]=z+(this.rand()-.5)*[.5,.05,2.2,1,.3,1.5,.1,2,.05,1.3][this.artStyle];
     this.dustLife[index]=1;
    }
   }
  }
  if(this.drawingClock>=.045){this.updateWatercolor();this.drawingClock=0;if(this.dust)this.dust.geometry.attributes.position.needsUpdate=true;}
  if(this.dustPositions){let moved=false;for(let k=0;k<480;k++)if(this.dustLife[k]>0){this.dustLife[k]=Math.max(0,this.dustLife[k]-dt*.1);this.dustPositions[k*3+1]+=dt*.035;moved=true;}if(moved&&this.dust)this.dust.geometry.attributes.position.needsUpdate=true;}
 }
 private loop=(now:number)=>{
  if(this.destroyed)return;this.raf=requestAnimationFrame(this.loop);
  const dt=Math.min(.05,(now-(this.last||now))/1000);this.last=now;
  if(this.mode==='play'&&this.running){
   this.time+=dt;const signal=Math.max(this.audio*2,this.bands.low*.8+this.bands.mid*.8+this.bands.high*.5,this.midi);
   this.energy+=(signal-this.energy)*(1-Math.exp(-dt*7));
   this.activeClock+=dt;
   if(signal>.035&&this.activeClock>.55+(.7-this.settings.density/180)){this.accent=Math.max(this.accent,signal);this.activeClock=0;}
   this.midi*=Math.exp(-dt*5);this.accent*=Math.exp(-dt*6);
   this.animateForms(dt);this.choreograph(dt);
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
 reset=()=>{if(this.paintCtx){this.paintCtx.fillStyle='#ffffff';this.paintCtx.fillRect(0,0,1024,1024);if(this.paintTexture)this.paintTexture.needsUpdate=true;}this.paintStep=0;for(const f of this.forms)this.dispose(f);this.forms=[];this.idleForm=null;this.time=0;this.activeClock=0;this.count=0;this.mode='play';this.running=true;this.camera.position.set(0,2,10);this.focus.set(0,0,0);this.camPhase=0;this.camClock=0;this.travel=0;for(const d of this.dancers){d.trail=[];d.ink.geometry.dispose();d.ink.geometry=new THREE.BufferGeometry();d.halo.geometry.dispose();d.halo.geometry=new THREE.BufferGeometry();}this.clearWatercolor();this.clearStyleMaterials();this.dustPositions?.fill(0);this.dustLife.fill(0);this.dustCursor=0;this.drawingClock=0;if(this.dust)this.dust.geometry.attributes.position.needsUpdate=true;};
 destroy=()=>{this.destroyed=true;cancelAnimationFrame(this.raf);this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointermove',this.move);this.canvas.removeEventListener('pointerup',this.up);this.canvas.removeEventListener('pointercancel',this.up);this.canvas.removeEventListener('wheel',this.wheel);for(const f of this.forms)this.dispose(f);if(this.backgroundMesh){this.backgroundMesh.geometry.dispose();(this.backgroundMesh.material as THREE.Material).dispose();}this.backgroundTexture?.dispose();this.paintTexture?.dispose();this.clearWatercolor();this.clearStyleMaterials();for(const d of this.dancers){for(const obj of [d.ink,d.halo,d.head]){this.scene.remove(obj);obj.geometry.dispose();(obj.material as THREE.Material).dispose();}}if(this.dust){this.scene.remove(this.dust);this.dust.geometry.dispose();(this.dust.material as THREE.Material).dispose();}this.renderer.dispose();};
}
