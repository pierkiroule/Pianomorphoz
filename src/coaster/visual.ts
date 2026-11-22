import * as THREE from 'three';
import type {MidiSession} from './midi';
const TAU=Math.PI*2;
export class FiberCoaster {
 private scene=new THREE.Scene();private camera=new THREE.PerspectiveCamera(72,1,.05,250);
 private renderer:THREE.WebGLRenderer;private fibers:THREE.Line[]=[];private materials:THREE.LineBasicMaterial[]=[];private positions:Float32Array[]=[];
 private activity=new Float32Array(88);private sustain=new Uint8Array(16);private active=new Map<string,number>();
 private session:MidiSession|null=null;private index=0;private time=0;private last=0;private raf=0;private running=true;private playing=false;
 private speed=1;private duration=0;private origin=0;private palette=0;private motion=1;private liveStart=performance.now();private pulse=0;private previewMode=false;onTime:(ms:number,playing:boolean)=>void=()=>{};
 constructor(private canvas:HTMLCanvasElement){
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  this.renderer.setClearColor('#fffefa');this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.scene.background=new THREE.Color('#fffefa');
  this.scene.fog=new THREE.FogExp2('#fffefa',.006);
  for(let n=0;n<88;n++){
   const points:THREE.Vector3[]=[];
   for(let i=0;i<=180;i++){
    const z=3-i*.55,theta=(n/88)*TAU+Math.sin(i*.055+n*.13)*.17+i*.009;
    const radius=2.05+Math.sin(i*.045+n*.19)*.35;
    const cx=Math.sin(i*.026)*.65,cy=Math.cos(i*.021)*.4;
    points.push(new THREE.Vector3(cx+Math.cos(theta)*radius,cy+Math.sin(theta)*radius,z));
   }
   const geometry=new THREE.BufferGeometry().setFromPoints(points);
   const material=new THREE.LineBasicMaterial({color:new THREE.Color().setHSL(.53+n/88*.27,.58,.55),transparent:true,opacity:.42,depthWrite:false});
   const line=new THREE.Line(geometry,material);this.scene.add(line);this.fibers.push(line);this.materials.push(material);this.positions.push(geometry.attributes.position.array as Float32Array);
  }
  this.resize();this.raf=requestAnimationFrame(this.loop);
 }
 resize=()=>{const w=this.canvas.clientWidth||innerWidth,h=this.canvas.clientHeight||innerHeight;this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();};
 note(data:number[]){
  const cmd=data[0]&0xf0,ch=data[0]&15,n=data[1]||0,v=data[2]||0,key=ch+':'+n;
  if(cmd===0x90&&v>0){this.active.set(key,v);if(n>=21&&n<=108)this.activity[n-21]=Math.max(this.activity[n-21],v/127);}
  if(cmd===0x80||(cmd===0x90&&v===0)){this.active.delete(key);}
  if(cmd===0xb0&&n===64)this.sustain[ch]=v>=64?1:0;
 }
 setSession(session:MidiSession|null){this.session=session;this.duration=session?.duration||0;this.pause();this.previewMode=!!session;this.seek(0);this.liveStart=performance.now();}
 setStyle(palette:number,motion:number){this.palette=palette;this.motion=motion;}
 seek(ms:number){
  this.time=Math.max(0,Math.min(ms,this.duration));this.index=0;this.origin=performance.now()-this.time;this.activity.fill(0);this.active.clear();this.sustain.fill(0);
  if(this.session){while(this.index<this.session.events.length&&this.session.events[this.index].t<=this.time){this.note(this.session.events[this.index].data);this.index++;}}
 }
 play(){if(!this.session||!this.duration)return false;if(this.time>=this.duration)this.seek(0);this.playing=true;this.previewMode=true;this.origin=performance.now()-this.time;return true;}
 pause(){this.playing=false;this.onTime(this.time,false);}
 private loop=(now:number)=>{
  if(!this.running)return;this.raf=requestAnimationFrame(this.loop);
  const dt=Math.min(.05,(now-(this.last||now))/1000);this.last=now;
  if(this.playing&&this.session){const target=Math.min(this.duration,now-this.origin);while(this.index<this.session.events.length&&this.session.events[this.index].t<=target){this.note(this.session.events[this.index].data);this.index++;}this.time=target;if(target>=this.duration)this.playing=false;this.onTime(this.time,this.playing);}
  const heldNotes=new Set<number>();for(const key of this.active.keys())heldNotes.add(Number(key.split(':')[1]));
  const wallTime=(now-this.liveStart)/1000;
  this.pulse=Math.max(0,this.pulse-dt*.4);
  for(let i=0;i<88;i++){
   const held=heldNotes.has(i+21);
   const a=this.activity[i];this.activity[i]=held?Math.max(a,.28):Math.max(0,a-dt*.22);
   this.materials[i].opacity=.32+this.activity[i]*.68;
   const base=[.53,.03,.32,.70][this.palette]??.53;
   const color=new THREE.Color().setHSL((base+i/88*.20)%1,.46+this.activity[i]*.42,.56-this.activity[i]*.18);
   this.materials[i].color.copy(color);
   const array=this.positions[i];const geometry=this.fibers[i].geometry;for(let j=0;j<=180;j++){const k=j*3;const z=3-j*.55;const theta=i/88*TAU+Math.sin(j*.055+i*.13+wallTime*.42)*.17+j*.009;const radius=2.05+Math.sin(j*.045+i*.19+wallTime*.8)*.35+this.activity[i]*.2;array[k]=Math.sin(j*.026+wallTime*.15)*.65+Math.cos(theta)*radius;array[k+1]=Math.cos(j*.021+wallTime*.12)*.4+Math.sin(theta)*radius;array[k+2]=z;}geometry.attributes.position.needsUpdate=true;
  }
  const t=this.previewMode?this.time/1000:wallTime;
  const travel=this.previewMode?Math.min(t*this.speed*1.3*this.motion,75):(wallTime*this.speed*.5*this.motion)%70;
  this.camera.position.set(Math.sin(t*.14)*.45*this.motion,Math.cos(t*.12)*.32*this.motion,1.5-travel);
  const target=new THREE.Vector3(Math.sin((t+2)*.14)*.35,Math.cos((t+2)*.12)*.28,this.camera.position.z-6);
  this.camera.lookAt(target);
  this.renderer.render(this.scene,this.camera);
 };
 destroy(){this.running=false;cancelAnimationFrame(this.raf);this.fibers.forEach(l=>l.geometry.dispose());this.materials.forEach(m=>m.dispose());this.renderer.dispose();}
}
