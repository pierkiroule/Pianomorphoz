import type {Settings} from './types';
type Bands={low:number;mid:number;high:number;level:number;transient:number};
type Mark={x:number;y:number;r:number;color:string;alpha:number;birth:number;kind:number;angle:number};
export type PaperFormat='square'|'a4p'|'a4l'|'a3p'|'wide';
export type PaperTexture='cotton'|'smooth'|'washi';
export type BrushKind='wash'|'calligraphy'|'filament'|'bloom'|'splatter'|'petal';
export type BrushConfig={kind:BrushKind;color:string;water:number};
export type PaperConfig={format:PaperFormat;texture:PaperTexture;absorption:number};
type Mode='play'|'reveal'|'print';
const TAU=Math.PI*2;
export class VisualEngine{
 canvas:HTMLCanvasElement;settings:Settings;audio=0;midi=0;sustain=false;running=true;
 bands:Bands={low:0,mid:0,high:0,level:0,transient:0};background:HTMLImageElement|HTMLVideoElement|null=null;
 mode:Mode='play';
 private ctx:CanvasRenderingContext2D;private paper:HTMLCanvasElement;private ink:HTMLCanvasElement;
 private pctx:CanvasRenderingContext2D;private ictx:CanvasRenderingContext2D;
 private marks:Mark[]=[];private rng=991;private raf=0;private last=0;private time=0;private activeTime=0;
 private x=0;private y=0;private heading=0;private gesture=0;private gestureTime=0;private noteEnergy=0;private noteAge=0;
 private cameraX=0;private cameraY=0;private cameraZoom=1;private cameraAngle=0;private cameraFov=53;
 private targetX=0;private targetY=0;private targetZoom=1;private targetAngle=0;private shotAngle=0;private shotElevation=0;private shotZoom=1;
 private pointer:{x:number;y:number}|null=null;private paletteIndex=0;private paletteKey='';
 paperConfig:PaperConfig={format:'a4l',texture:'cotton',absorption:65};
 brushes:BrushConfig[]=[{kind:'wash',color:'#365e79',water:75},{kind:'filament',color:'#bb7a6b',water:35},{kind:'bloom',color:'#c7a35b',water:85}];
 private lastPaint=false;private destroyed=false;private paintClock=0;private logical=1800;private paperSize=1800;private sheetWidth=1800;private sheetHeight=1273;
 constructor(canvas:HTMLCanvasElement,settings:Settings){
  this.canvas=canvas;this.settings=settings;this.ctx=canvas.getContext('2d',{alpha:false})!;
  this.paper=document.createElement('canvas');this.ink=document.createElement('canvas');
  this.paper.width=this.paper.height=this.paperSize;this.ink.width=this.ink.height=this.logical;
  this.pctx=this.paper.getContext('2d')!;this.ictx=this.ink.getContext('2d')!;
  this.configurePaper(this.paperConfig);this.resize();
  canvas.addEventListener('pointerdown',this.down);canvas.addEventListener('pointermove',this.move);
  canvas.addEventListener('pointerup',this.up);canvas.addEventListener('pointercancel',this.up);
  canvas.addEventListener('wheel',this.wheel,{passive:false});
  this.raf=requestAnimationFrame(this.loop);
 }
 private rand(){this.rng=(Math.imul(this.rng,1664525)+1013904223)>>>0;return this.rng/4294967296;}
 private range(a:number,b:number){return a+(b-a)*this.rand();}
 private color(){const c=this.settings.colors.filter(v=>/^#[0-9a-f]{6}$/i.test(v));if(!c.length)return '#3b6463';const k=c.join();if(k!==this.paletteKey){this.paletteKey=k;this.paletteIndex=0;}return c[(this.paletteIndex++)%c.length];}
 configurePaper=(cfg:PaperConfig)=>{
  this.paperConfig={...cfg};const ratios:Record<PaperFormat,number>={square:1,a4p:210/297,a4l:297/210,a3p:297/420,wide:16/9};
  const ratio=ratios[cfg.format];this.sheetWidth=ratio>=1?this.logical:Math.round(this.logical*ratio);
  this.sheetHeight=ratio>=1?Math.round(this.logical/ratio):this.logical;
  this.paper.width=this.ink.width=this.sheetWidth;this.paper.height=this.ink.height=this.sheetHeight;
  this.createPaper();this.reset();
 };
 setBrushes=(brushes:BrushConfig[])=>{this.brushes=brushes.slice(0,3).map(b=>({...b}));};
 private createPaper(){
  const c=this.pctx,n=this.sheetWidth,h=this.sheetHeight;c.fillStyle='#fffdf9';c.fillRect(0,0,n,h);
  const img=c.getImageData(0,0,n,n),d=img.data;
  for(let y=0;y<h;y++)for(let x=0;x<n;x++){const i=(y*n+x)*4;const rough=this.paperConfig.texture==='smooth'?5:this.paperConfig.texture==='washi'?20:14;const noise=(this.rand()-.5)*rough+Math.sin(x*.43+y*.21)*2;d[i]=Math.max(0,Math.min(255,251+noise));d[i+1]=Math.max(0,Math.min(255,250+noise));d[i+2]=Math.max(0,Math.min(255,247+noise));}
  c.putImageData(img,0,0);
 }
 resize=()=>{const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight),d=Math.min(devicePixelRatio||1,1.8);this.canvas.width=Math.round(w*d);this.canvas.height=Math.round(h*d);this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';};
 private mark(x:number,y:number,r:number,color:string,alpha:number,kind:number){
  if(this.marks.length>4500)this.marks.splice(0,600);
  const m:Mark={x:Math.max(1,Math.min(this.sheetWidth-1,x)),y:Math.max(1,Math.min(this.sheetHeight-1,y)),r,color,alpha,birth:this.time,kind,angle:this.heading};this.marks.push(m);
  this.deposit(m);
 }
 private deposit(m:Mark){
  const c=this.ictx,x=m.x,y=m.y,r=Math.max(1,m.r)*(1+this.paperConfig.absorption/250);
  c.save();c.globalCompositeOperation='multiply';
  const rings=m.kind===3?5:3;
  for(let j=rings;j>=0;j--){
   const rr=r*(.4+j/rings*.8),a=m.alpha*(j===0?.36:.08);
   const g=c.createRadialGradient(x,y,rr*.08,x,y,rr);
   g.addColorStop(0,this.rgba(m.color,a*.85));g.addColorStop(.65,this.rgba(m.color,a));
   g.addColorStop(.85,this.rgba(m.color,a*.35));g.addColorStop(1,this.rgba(m.color,0));
   c.fillStyle=g;c.beginPath();c.ellipse(x+Math.sin(m.angle)*rr*.13,y+Math.cos(m.angle)*rr*.13,rr,rr*(m.kind===2?.3:1),m.angle,0,TAU);c.fill();
  }
  // Dry pigment collects at the edge; irregular paper absorption.
  c.strokeStyle=this.rgba(m.color,m.alpha*.16);c.lineWidth=Math.max(.5,r*.05);
  c.beginPath();for(let i=0;i<=24;i++){const a=i/24*TAU,rr=r*(.85+.13*Math.sin(a*7+m.x*.03)+.07*Math.sin(a*13+m.y*.02));const xx=x+Math.cos(a)*rr,yy=y+Math.sin(a)*rr;if(i===0)c.moveTo(xx,yy);else c.lineTo(xx,yy);}c.stroke();
  for(let k=0;k<Math.min(28,3+Math.floor(r*.4));k++){
   const a=this.rand()*TAU,dist=Math.sqrt(this.rand())*r,px=x+Math.cos(a)*dist,py=y+Math.sin(a)*dist;
   c.fillStyle=this.rgba(m.color,m.alpha*this.range(.05,.24));c.fillRect(px,py,this.range(.4,1.6),this.range(.4,1.6));
  }
  c.restore();
 }
 private rgba(hex:string,a:number){const h=hex.replace('#','');return 'rgba('+parseInt(h.slice(0,2),16)+','+parseInt(h.slice(2,4),16)+','+parseInt(h.slice(4,6),16)+','+Math.max(0,Math.min(1,a))+')';}
 note=(pitch:number,velocity:number)=>{
  if(this.mode!=='play'||velocity<=0)return;
  const v=Math.min(1,velocity/127);this.midi=Math.max(this.midi,v);this.noteEnergy=Math.max(this.noteEnergy,v);this.noteAge=0;
  this.gesture=(pitch%6+6)%6;this.gestureTime=0;
  this.heading+=(pitch-60)*.008;
  const brush=this.brushes[Math.abs(pitch)%Math.max(1,this.brushes.length)]||this.brushes[0];const c=brush?.color||this.color(),r=(7+v*35)*(1+(brush?.water||50)/150);
  this.mark(this.x,this.y,r,c,.26+v*.3,this.gesture);
  if(v>.55){for(let i=0;i<3+Math.floor(v*8);i++){const a=this.rand()*TAU,dist=this.range(r,r*3);this.mark(this.x+Math.cos(a)*dist,this.y+Math.sin(a)*dist,this.range(1,7),c,.1+v*.16,4);}}
 };
 private paint(dt:number,signal:number){
  this.activeTime+=dt;this.gestureTime+=dt;
  const t=this.activeTime,low=this.bands.low,mid=this.bands.mid,high=this.bands.high;
  if(this.gestureTime>2.5&&this.bands.transient>.04){this.gesture=(this.gesture+1+Math.floor(this.rand()*3))%6;this.gestureTime=0;}
  const curl=Math.sin(t*(.7+high*3)+this.y*.005)*.7+Math.cos(t*.43+this.x*.007)*.45;
  this.heading+=curl*dt*(.6+this.settings.freedom/100*2);
  const speed=(20+signal*165)*(this.settings.intensity/100+.4);
  this.x+=Math.cos(this.heading)*speed*dt;this.y+=Math.sin(this.heading)*speed*dt;
  const margin=80;if(this.x<margin||this.x>this.sheetWidth-margin||this.y<margin||this.y>this.sheetHeight-margin){this.heading+=Math.PI*.8;this.x=Math.max(margin,Math.min(this.sheetWidth-margin,this.x));this.y=Math.max(margin,Math.min(this.sheetHeight-margin,this.y));}
  const density=Math.max(1,Math.min(3,Math.round(1+this.settings.density/50)));
  const brush=this.brushes[this.gesture%Math.max(1,this.brushes.length)]||this.brushes[0];const color=brush?.color||this.color();
  for(let i=0;i<density;i++){
   const a=t*([1,2.7,5,1.4,8,3][this.gesture])+i*TAU/density;
   const spread=[8,42,12,80,65,30][this.gesture]*(1+mid*1.5);
   const px=this.x+Math.cos(a)*spread,py=this.y+Math.sin(a)*spread;
   const kind=brush?.kind||'wash';const kindScale:Record<BrushKind,number>={wash:1.7,calligraphy:.55,filament:.2,bloom:1.9,splatter:.3,petal:1.15};const r=[11,19,4,27,3,13][this.gesture]*(1+low*2.5+this.noteEnergy*.8)*(1+(brush?.water||50)/170)*kindScale[kind];
   const alpha=Math.min(.48,.06+signal*.23+this.noteEnergy*.08);
   this.mark(px,py,r,color,alpha,kind==='filament'||kind==='calligraphy'?2:kind==='bloom'?3:this.gesture);
  }
  if(high>.12&&this.rand()<Math.min(.8,high*dt*24))this.mark(this.x+this.range(-90,90),this.y+this.range(-90,90),this.range(1,5),this.color(),.3,4);
 }
 private camera(dt:number,active:boolean){
  if(this.mode==='play'){
   const t=this.time,level=this.bands.level;
   const scene=Math.floor(t/7)%5;
   const base=[1.15,2.1,.75,1.65,1.3][scene];
   this.targetZoom=base*(1+.2*Math.sin(t*.8)+Math.min(.25,level*.5));
   this.targetAngle=[0,.13,-.18,.28,-.22][scene]+Math.sin(t*.22)*.09;
   this.targetX=this.x+Math.sin(t*.32)*[80,160,45,220,120][scene];
   this.targetY=this.y+Math.cos(t*.26)*[90,100,180,60,130][scene];
  }else{
   this.targetZoom=this.shotZoom*(53/this.cameraFov);
   this.targetAngle=this.shotAngle*Math.PI/180;
   this.targetX=this.sheetWidth/2;this.targetY=this.sheetHeight/2;
  }
  const damp=(v:number,target:number,k:number)=>v+(target-v)*(1-Math.exp(-dt*k));
  this.cameraX=damp(this.cameraX,this.targetX,1.3);this.cameraY=damp(this.cameraY,this.targetY,1.3);
  this.cameraZoom=damp(this.cameraZoom,this.targetZoom,1.2);this.cameraAngle=damp(this.cameraAngle,this.targetAngle,1.3);
 }
 private render(ctx:CanvasRenderingContext2D,w:number,h:number){
  ctx.save();ctx.fillStyle='#fffdf9';ctx.fillRect(0,0,w,h);
  ctx.translate(w/2,h/2);ctx.rotate(this.cameraAngle);
  const z=Math.min(w/this.sheetWidth,h/this.sheetHeight)*this.cameraZoom;
  ctx.scale(z,z);ctx.translate(-this.cameraX,-this.cameraY);
  ctx.drawImage(this.paper,0,0);ctx.drawImage(this.ink,0,0);
  if(this.background&&((this.background instanceof HTMLImageElement&&this.background.complete)||(this.background instanceof HTMLVideoElement&&this.background.readyState>=2))){ctx.globalAlpha=this.settings.bgOpacity/100;ctx.drawImage(this.background,0,0,this.sheetWidth,this.sheetHeight);}
  ctx.restore();
 }
 private loop=(now:number)=>{
  if(this.destroyed)return;this.raf=requestAnimationFrame(this.loop);
  const dt=Math.min(.05,(now-(this.last||now))/1000);this.last=now;
  if(this.mode==='play'&&this.running){
   this.time+=dt;const signal=Math.max(this.audio*2,this.bands.low*.9+this.bands.mid*.8+this.bands.high*.5,this.midi);
   const active=signal>.045;
   if(active){this.paintClock+=dt;if(this.paintClock>=1/30){this.paint(Math.min(.06,this.paintClock),signal);this.paintClock=0;}}else if(this.lastPaint){this.gestureTime=0;this.paintClock=0;}
   this.lastPaint=active;this.midi*=Math.exp(-dt*5);this.noteEnergy*=Math.exp(-dt*7);
  }
  this.camera(dt,true);this.render(this.ctx,this.canvas.width,this.canvas.height);
 };
 reveal=()=>{this.mode='reveal';this.running=false;this.shotAngle=0;this.shotZoom=1;this.cameraFov=53;};
 printMode=()=>{if(this.mode==='play')this.reveal();this.mode='print';};
 resume=()=>{this.mode='play';this.running=true;};
 setPrintView=(angle:number,elevation:number,zoom:number)=>{this.shotAngle=angle;this.shotElevation=elevation;this.shotZoom=Math.max(.3,Math.min(3,zoom));};
 setPrintFov=(fov:number)=>{this.cameraFov=Math.max(18,Math.min(100,fov));};
 rotatePrint=(degrees:number)=>{this.shotAngle+=degrees;};
 zoomPrint=(factor:number)=>{this.shotZoom=Math.max(.3,Math.min(3,this.shotZoom*factor));};
 resetPrint=()=>{this.shotAngle=0;this.shotElevation=0;this.shotZoom=1;this.cameraFov=53;};
 private down=(e:PointerEvent)=>{if(this.mode==='print'){this.pointer={x:e.clientX,y:e.clientY};this.canvas.setPointerCapture(e.pointerId);}};
 private move=(e:PointerEvent)=>{if(!this.pointer||this.mode!=='print')return;this.shotAngle+=(e.clientX-this.pointer.x)*.16;this.shotZoom=Math.max(.3,Math.min(3,this.shotZoom*Math.exp((e.clientY-this.pointer.y)*.002)));this.pointer={x:e.clientX,y:e.clientY};};
 private up=()=>{this.pointer=null;};
 private wheel=(e:WheelEvent)=>{if(this.mode!=='print')return;e.preventDefault();this.zoomPrint(Math.exp(-e.deltaY*.001));};
 exportSheet=(width=3000)=>{const height=Math.round(width*this.sheetHeight/this.sheetWidth);const out=document.createElement('canvas');out.width=width;out.height=height;const c=out.getContext('2d')!;c.drawImage(this.paper,0,0,width,height);c.globalCompositeOperation='multiply';c.drawImage(this.ink,0,0,width,height);return out.toDataURL('image/png');};
 exportPrint=(size=3000,aspect=1)=>{
  const width=size,height=Math.round(size/aspect);const out=document.createElement('canvas');out.width=width;out.height=height;
  const c=out.getContext('2d')!;const prev=[this.cameraX,this.cameraY,this.cameraZoom,this.cameraAngle];
  this.cameraX=this.sheetWidth/2;this.cameraY=this.sheetHeight/2;this.cameraZoom=this.shotZoom*53/this.cameraFov;this.cameraAngle=this.shotAngle*Math.PI/180;
  this.render(c,width,height);
  [this.cameraX,this.cameraY,this.cameraZoom,this.cameraAngle]=prev;
  return out.toDataURL('image/png');
 };
 reset=()=>{
  this.ictx.clearRect(0,0,this.sheetWidth,this.sheetHeight);this.marks=[];this.x=this.sheetWidth/2;this.y=this.sheetHeight/2;this.heading=-Math.PI/2;
  this.time=0;this.activeTime=0;this.gesture=0;this.gestureTime=0;this.noteEnergy=0;this.lastPaint=false;
  this.paintClock=0;this.cameraX=this.x;this.cameraY=this.y;this.cameraZoom=1;this.cameraAngle=0;this.mode='play';this.running=true;
 };
 destroy=()=>{this.destroyed=true;cancelAnimationFrame(this.raf);this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointermove',this.move);this.canvas.removeEventListener('pointerup',this.up);this.canvas.removeEventListener('pointercancel',this.up);this.canvas.removeEventListener('wheel',this.wheel);};
}
