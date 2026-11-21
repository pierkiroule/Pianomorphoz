import type {Settings} from './types';
export type PaperFormat='square'|'a4p'|'a4l'|'a3p'|'wide';
export type PaperTexture='cotton'|'smooth'|'washi';
export type BrushKind='wash'|'calligraphy'|'filament'|'bloom'|'splatter'|'petal';
export type BrushConfig={kind:BrushKind;color:string;water:number};
export type PaperConfig={format:PaperFormat;texture:PaperTexture;absorption:number};
type Mark={x:number;y:number;r:number;angle:number;alpha:number;color:string;kind:BrushKind;born:number;life:number};
const TAU=Math.PI*2,clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export class VisualEngine{
 canvas:HTMLCanvasElement;settings:Settings;audio=0;midi=0;sustain=false;running=true;
 bands={low:0,mid:0,high:0,level:0,transient:0};background:HTMLImageElement|HTMLVideoElement|null=null;
 mode:'play'|'reveal'|'print'='play';
 paperConfig:PaperConfig={format:'a4l',texture:'cotton',absorption:65};
 brushes:BrushConfig[]=[{kind:'wash',color:'#365e79',water:75},{kind:'filament',color:'#bb7a6b',water:35},{kind:'bloom',color:'#c7a35b',water:85}];
 private ctx:CanvasRenderingContext2D;private marks:Mark[]=[];private seed=12345;
 private w=1600;private h=1132;private x=800;private y=566;private angle=0;private t=0;private last=0;private raf=0;private destroyed=false;
 private pigment=document.createElement('canvas');private pigmentCtx=this.pigment.getContext('2d')!;
 private paper=document.createElement('canvas');private paperCtx=this.paper.getContext('2d')!;
 private frame=0;private cameraX=800;private cameraY=566;private zoom=1;private rotation=0;
 private targetZoom=1;private targetRotation=0;private shotZoom=1;private shotAngle=0;private fov=53;
 private pointer:{x:number;y:number}|null=null;private tick=0;private nextColor=0;
 constructor(canvas:HTMLCanvasElement,settings:Settings){
  this.canvas=canvas;this.settings=settings;this.ctx=canvas.getContext('2d',{alpha:false})!;
  this.configurePaper(this.paperConfig);this.resize();
  canvas.addEventListener('pointerdown',this.down);canvas.addEventListener('pointermove',this.move);
  canvas.addEventListener('pointerup',this.up);canvas.addEventListener('pointercancel',this.up);
  canvas.addEventListener('wheel',this.wheel,{passive:false});this.raf=requestAnimationFrame(this.loop);
 }
 private rand(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
 private range(a:number,b:number){return a+(b-a)*this.rand();}
 configurePaper=(p:PaperConfig)=>{
  this.paperConfig={...p};const ratios:Record<PaperFormat,number>={square:1,a4p:210/297,a4l:297/210,a3p:297/420,wide:16/9};
  const ratio=ratios[p.format];this.w=ratio>=1?1600:Math.round(1600*ratio);this.h=ratio>=1?Math.round(1600/ratio):1600;
  this.paper.width=this.pigment.width=this.w;this.paper.height=this.pigment.height=this.h;
  this.createTexture();this.reset();
 };
 setBrushes=(b:BrushConfig[])=>{this.brushes=b.slice(0,3).map(x=>({...x}));};
 private createTexture(){
  const c=this.paperCtx;c.fillStyle='#fffdfb';c.fillRect(0,0,this.w,this.h);
  const img=c.getImageData(0,0,this.w,this.h),d=img.data;
  const strength=this.paperConfig.texture==='smooth'?3:this.paperConfig.texture==='washi'?14:9;
  for(let i=0;i<d.length;i+=4){const n=(this.rand()-.5)*strength;d[i]=clamp(252+n,0,255);d[i+1]=clamp(251+n,0,255);d[i+2]=clamp(248+n,0,255);}
  c.putImageData(img,0,0);
 }
 resize=()=>{const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight),d=Math.min(devicePixelRatio||1,1.7);this.canvas.width=Math.round(w*d);this.canvas.height=Math.round(h*d);this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';};
 private pigmentColor(){const colors=this.settings.colors.filter(x=>/^#[0-9a-f]{6}$/i.test(x));return colors.length?colors[this.nextColor++%colors.length]:'#527b78';}
 private rgba(hex:string,a:number){const h=/^#[0-9a-f]{6}$/i.test(hex)?hex:'#527b78';return 'rgba('+parseInt(h.slice(1,3),16)+','+parseInt(h.slice(3,5),16)+','+parseInt(h.slice(5,7),16)+','+clamp(a,0,1)+')';}
 private deposit(m:Mark,c:CanvasRenderingContext2D=this.pigmentCtx){
  const r=m.r,cx=m.x,cy=m.y;c.save();c.globalCompositeOperation='multiply';
  const wash=m.kind==='wash'||m.kind==='bloom';const elongated=m.kind==='filament'||m.kind==='calligraphy';
  const rings=wash?4:2;
  for(let j=rings;j>=0;j--){const rr=r*(.3+j/rings*.8);const g=c.createRadialGradient(cx,cy,0,cx,cy,rr);
   g.addColorStop(0,this.rgba(m.color,m.alpha*.25));g.addColorStop(.7,this.rgba(m.color,m.alpha*(wash?.12:.25)));g.addColorStop(.94,this.rgba(m.color,m.alpha*.11));g.addColorStop(1,this.rgba(m.color,0));
   c.fillStyle=g;c.beginPath();c.ellipse(cx,cy,rr,rr*(elongated?.18:1),m.angle,0,TAU);c.fill();
  }
  c.strokeStyle=this.rgba(m.color,m.alpha*.16);c.lineWidth=Math.max(.5,r*.035);c.beginPath();
  for(let i=0;i<=24;i++){const a=i/24*TAU,rr=r*(.85+.1*Math.sin(a*9+cx*.03)+.05*Math.sin(a*17+cy*.02));const x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr;if(!i)c.moveTo(x,y);else c.lineTo(x,y);}c.stroke();
  c.restore();
 }
 private spawn(x:number,y:number,r:number,color:string,alpha:number,kind:BrushKind){
  const margin=Math.min(this.w,this.h)*.07;
  const m:Mark={x:clamp(x,margin,this.w-margin),y:clamp(y,margin,this.h-margin),r:clamp(r,1,100),angle:this.angle,alpha,color,kind,born:this.t,life:this.range(9,19)};
  this.marks.push(m);this.deposit(m);
  if(this.marks.length>950)this.marks.splice(0,100);
 }
 note=(pitch:number,velocity:number)=>{
  if(this.mode!=='play'||velocity<=0)return;const v=clamp(velocity/127,0,1);this.midi=Math.max(this.midi,v);
  const b=this.brushes[Math.abs(pitch)%Math.max(1,this.brushes.length)];const c=b?.color||this.pigmentColor();
  const a=pitch*2.399963;const rx=this.w*.28,ry=this.h*.28;
  // Golden-angle distribution spreads notes throughout the composition.
  this.x=this.w/2+Math.cos(a)*rx*(.35+.65*v);this.y=this.h/2+Math.sin(a)*ry*(.35+.65*v);
  this.angle=a+Math.PI/2;this.spawn(this.x,this.y,10+v*30,c,.2+v*.3,b?.kind||'wash');
 };
 private paint(dt:number,signal:number){
  const low=this.bands.low,mid=this.bands.mid,high=this.bands.high;
  this.angle+=(Math.sin(this.t*.8+this.x*.008)+Math.cos(this.t*.6+this.y*.007))*dt*(.6+this.settings.freedom/90);
  const speed=(30+signal*110)*(this.settings.intensity/100+.4);
  this.x+=Math.cos(this.angle)*speed*dt;this.y+=Math.sin(this.angle)*speed*dt;
  const cx=this.w/2,cy=this.h/2;const dx=(this.x-cx)/(this.w*.37),dy=(this.y-cy)/(this.h*.37);
  // Soft restoring force prevents edge congestion without a visible frame.
  this.angle+=Math.atan2(cy-this.y,cx-this.x)*dt*.025*(dx*dx+dy*dy);
  const margin=Math.min(this.w,this.h)*.08;
  if(this.x<margin||this.x>this.w-margin||this.y<margin||this.y>this.h-margin){this.x=clamp(this.x,margin,this.w-margin);this.y=clamp(this.y,margin,this.h-margin);this.angle=Math.atan2(cy-this.y,cx-this.x);}
  const brush=this.brushes[Math.floor(this.t/2.5)%Math.max(1,this.brushes.length)];const kind=brush?.kind||'wash';
  const size:Record<BrushKind,number>={wash:23,calligraphy:7,filament:3,bloom:29,splatter:5,petal:17};
  const r=size[kind]*(1+low*1.7+mid*.5)*(1+(brush?.water||50)/200);
  const orbit=this.t*(1.4+high*4),spread=kind==='bloom'?50:kind==='petal'?30:10;
  this.spawn(this.x+Math.cos(orbit)*spread,this.y+Math.sin(orbit)*spread,r,brush?.color||this.pigmentColor(),clamp(.1+signal*.24,.08,.48),kind);
  if(high>.15&&this.rand()<.3)this.spawn(this.x+this.range(-55,55),this.y+this.range(-55,55),this.range(1,5),brush?.color||this.pigmentColor(),.2,'splatter');
 }
 private rebuild(){
  // Redraw live marks in one bounded pass; old marks fade without ever staining the canvas.
  const c=this.pigmentCtx;c.clearRect(0,0,this.w,this.h);
  for(const m of this.marks){const age=this.t-m.born;const f=clamp((m.life-age)/Math.min(4,m.life*.35),0,1);if(f<=0)continue;this.deposit({...m,alpha:m.alpha*f},c);}
 }
 private camera(dt:number){
  const d=(a:number,b:number,k:number)=>a+(b-a)*(1-Math.exp(-dt*k));
  if(this.mode==='play'){
   const phase=Math.floor(this.t/8)%4;
   this.targetZoom=[.96,1.5,1.13,1.85][phase]*(1+.08*Math.sin(this.t*.8));
   this.targetRotation=[0,.08,-.1,.16][phase]+Math.sin(this.t*.18)*.04;
   const travel=.1*Math.min(this.w,this.h);
   this.cameraX=d(this.cameraX,this.w/2+Math.sin(this.t*.2)*travel,1.2);
   this.cameraY=d(this.cameraY,this.h/2+Math.cos(this.t*.16)*travel,1.2);
  }else{
   this.targetZoom=this.shotZoom*53/this.fov;this.targetRotation=this.shotAngle*Math.PI/180;
   this.cameraX=d(this.cameraX,this.w/2,2);this.cameraY=d(this.cameraY,this.h/2,2);
  }
  this.zoom=d(this.zoom,this.targetZoom,1.2);this.rotation=d(this.rotation,this.targetRotation,1.2);
 }
 private render(c:CanvasRenderingContext2D,w:number,h:number,print=false){
  c.save();c.fillStyle='#fff';c.fillRect(0,0,w,h);c.translate(w/2,h/2);
  c.rotate(print?0:this.rotation);const z=Math.min(w/this.w,h/this.h)*(print?1:this.zoom);c.scale(z,z);
  c.translate(-(print?this.w/2:this.cameraX),-(print?this.h/2:this.cameraY));
  // During play the paper texture is hidden; print can restore subtle cotton grain.
  if(print)c.drawImage(this.paper,0,0);c.drawImage(this.pigment,0,0);
  if(this.background&&((this.background instanceof HTMLImageElement&&this.background.complete)||(this.background instanceof HTMLVideoElement&&this.background.readyState>=2))){c.globalAlpha=this.settings.bgOpacity/100;c.drawImage(this.background,0,0,this.w,this.h);}
  c.restore();
 }
 private loop=(now:number)=>{
  if(this.destroyed)return;this.raf=requestAnimationFrame(this.loop);const dt=Math.min(.05,(now-(this.last||now))/1000);this.last=now;
  if(this.mode==='play'&&this.running){
   this.t+=dt;const signal=Math.max(this.audio*2,this.bands.low*.9+this.bands.mid*.8+this.bands.high*.5,this.midi);
   if(signal>.045){this.tick+=dt;if(this.tick>=1/30){this.paint(this.tick,signal);this.tick=0;}}
   this.midi*=Math.exp(-dt*5);
   this.marks=this.marks.filter(m=>this.t-m.born<m.life);
   // 15 Hz pigment redraw keeps the evolving composition light.
   this.frame+=dt;if(this.frame>1/15){this.rebuild();this.frame=0;}
  }
  this.camera(dt);this.render(this.ctx,this.canvas.width,this.canvas.height);
 };
 reveal=()=>{this.mode='reveal';this.running=false;this.shotZoom=1;this.shotAngle=0;this.fov=53;this.rebuild();};
 printMode=()=>{if(this.mode==='play')this.reveal();this.mode='print';};
 resume=()=>{this.mode='play';this.running=true;};
 setPrintView=(angle:number,_elevation:number,zoom:number)=>{this.shotAngle=angle;this.shotZoom=clamp(zoom,.3,3);};
 setPrintFov=(fov:number)=>{this.fov=clamp(fov,18,100);};
 rotatePrint=(degrees:number)=>{this.shotAngle+=degrees;};
 zoomPrint=(factor:number)=>{this.shotZoom=clamp(this.shotZoom*factor,.3,3);};
 resetPrint=()=>{this.shotZoom=1;this.shotAngle=0;this.fov=53;};
 private down=(e:PointerEvent)=>{if(this.mode==='print'){this.pointer={x:e.clientX,y:e.clientY};this.canvas.setPointerCapture(e.pointerId);}};
 private move=(e:PointerEvent)=>{if(!this.pointer||this.mode!=='print')return;this.shotAngle+=(e.clientX-this.pointer.x)*.15;this.shotZoom=clamp(this.shotZoom*Math.exp((e.clientY-this.pointer.y)*.002),.3,3);this.pointer={x:e.clientX,y:e.clientY};};
 private up=()=>{this.pointer=null;};
 private wheel=(e:WheelEvent)=>{if(this.mode==='print'){e.preventDefault();this.zoomPrint(Math.exp(-e.deltaY*.001));}};
 exportSheet=(width=3000)=>{const c=document.createElement('canvas');c.width=width;c.height=Math.round(width*this.h/this.w);this.render(c.getContext('2d')!,c.width,c.height,true);return c.toDataURL('image/png');};
 exportPrint=(size=3000,aspect=1)=>{const c=document.createElement('canvas');c.width=size;c.height=Math.round(size/aspect);this.render(c.getContext('2d')!,c.width,c.height,true);return c.toDataURL('image/png');};
 reset=()=>{this.marks=[];this.pigmentCtx.clearRect(0,0,this.w,this.h);this.x=this.cameraX=this.w/2;this.y=this.cameraY=this.h/2;this.angle=0;this.t=0;this.tick=0;this.frame=0;this.zoom=1;this.rotation=0;this.mode='play';this.running=true;};
 destroy=()=>{this.destroyed=true;cancelAnimationFrame(this.raf);this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointermove',this.move);this.canvas.removeEventListener('pointerup',this.up);this.canvas.removeEventListener('pointercancel',this.up);this.canvas.removeEventListener('wheel',this.wheel);};
}
