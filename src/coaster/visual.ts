import * as THREE from 'three';
import type {MidiSession} from './midi';
const TAU=Math.PI*2, N=88, S=32;
type Voice={pitch:number;velocity:number;start:number;release:number|null};
export class FiberCoaster {
 private scene=new THREE.Scene();private camera=new THREE.PerspectiveCamera(76,1,.05,200);
 private renderer:THREE.WebGLRenderer;private fibers:THREE.Mesh[]=[];private positions:Float32Array[]=[];
 private voices:Voice[]=[];private active=new Map<string,Voice>();private held=new Set<string>();private sustain=new Uint8Array(16);
 private session:MidiSession|null=null;private index=0;private time=0;private last=0;private raf=0;private running=true;private playing=false;
 private duration=0;private origin=0;private palette=0;private motion=1;private previewMode=false;private liveStart=performance.now();
 private energy=0;private register=64;private drift=0;private bend=0;private travel=0;private audioLevel=0;private audioBands=[0,0,0];
 onTime:(ms:number,playing:boolean)=>void=()=>{};
 constructor(private canvas:HTMLCanvasElement){
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  this.renderer.setClearColor('#fffefa');this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.scene.background=new THREE.Color('#fffefa');this.scene.fog=new THREE.FogExp2('#fffefa',.014);
  for(let n=0;n<N;n++){
   const vertices=new Float32Array((S+1)*2*3),idx:number[]=[];
   for(let j=0;j<S;j++){const a=j*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}
   const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(vertices,3).setUsage(THREE.DynamicDrawUsage));geo.setIndex(idx);
   const mat=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false});
   const mesh=new THREE.Mesh(geo,mat);mesh.frustumCulled=false;this.scene.add(mesh);this.fibers.push(mesh);this.positions.push(vertices);
  }
  this.resize();this.raf=requestAnimationFrame(this.loop);
 }
 resize=()=>{const w=this.canvas.clientWidth||innerWidth,h=this.canvas.clientHeight||innerHeight;this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();};
 setAudioFeatures(level:number,bands:number[]){this.audioLevel=THREE.MathUtils.clamp(level,0,1);this.audioBands=[0,1,2].map(i=>THREE.MathUtils.clamp(bands[i]||0,0,1));}
 note(data:number[],at=performance.now()){
  const cmd=data[0]&240,ch=data[0]&15,p=data[1]||0,v=data[2]||0,key=ch+':'+p;
  if(cmd===144&&v>0&&p>=21&&p<=108){
   const old=this.active.get(key);if(old)old.release=at;
   const voice={pitch:p,velocity:v/127,start:at,release:null};this.voices.push(voice);this.active.set(key,voice);this.held.add(key);
   const delta=THREE.MathUtils.clamp((p-this.register)/24,-1,1);this.register+=(p-this.register)*.14;this.drift=this.drift*.78+delta*.22;this.bend=this.bend*.84+delta*.16;
   this.energy=Math.max(this.energy,v/127);
  }else if(cmd===128||(cmd===144&&v===0)){
   this.held.delete(key);const voice=this.active.get(key);if(voice&&!this.sustain[ch]){voice.release=at;this.active.delete(key);}
  }else if(cmd===176&&p===64){this.sustain[ch]=v>=64?1:0;if(!this.sustain[ch])for(const [k,voice] of this.active){if(k.startsWith(ch+':')&&!this.held.has(k)){voice.release=at;this.active.delete(k);}}}
 }
 setSession(s:MidiSession|null){this.pause();this.session=s;this.duration=s?.duration||0;this.previewMode=!!s;this.seek(0);this.liveStart=performance.now();}
 setStyle(palette:number,motion:number){this.palette=palette;this.motion=motion;}
 seek(ms:number){
  this.time=Math.max(0,Math.min(ms,this.duration));this.index=0;this.origin=performance.now()-this.time;this.voices=[];this.active.clear();this.held.clear();this.sustain.fill(0);this.register=64;this.drift=0;this.bend=0;this.travel=0;
  if(this.session){const base=performance.now()-this.time;while(this.index<this.session.events.length&&this.session.events[this.index].t<=this.time){const e=this.session.events[this.index++];this.note(e.data,base+e.t);}}
 }
 play(){if(!this.session||!this.duration)return false;if(this.time>=this.duration)this.seek(0);this.playing=true;this.previewMode=true;this.origin=performance.now()-this.time;return true;}
 pause(){this.playing=false;this.onTime(this.time,false);}
 private loop=(now:number)=>{
  if(!this.running)return;this.raf=requestAnimationFrame(this.loop);
  const dt=Math.min(.05,(now-(this.last||now))/1000);this.last=now;
  if(this.playing&&this.session){const target=Math.min(this.duration,now-this.origin);while(this.index<this.session.events.length&&this.session.events[this.index].t<=target){const e=this.session.events[this.index++];this.note(e.data,this.origin+e.t);}this.time=target;if(target>=this.duration)this.playing=false;this.onTime(this.time,this.playing);}
  this.energy=Math.max(0,this.energy-dt*.16);this.audioLevel*=.96;
  this.voices=this.voices.filter(v=>(v.release===null?now-v.start<20000:now-v.release<2200));
  const t=(this.previewMode?this.time:now-this.liveStart)/1000;
  this.travel+=(dt*(.55+this.energy*.55)*this.motion);
  const center=(z:number)=>({x:Math.sin(z*.065+this.drift)*(.9+this.energy*.4),y:Math.cos(z*.043+this.bend)*(.7+this.energy*.3)+(this.register-64)*.016});
  const zCamera=-this.travel;const c=center(zCamera);const ahead=center(zCamera-5);
  this.camera.position.set(c.x,c.y,zCamera+1);
  this.camera.lookAt(ahead.x,ahead.y,zCamera-5);
  const palette=[.53,.02,.31,.72][this.palette]??.53;
  for(let n=0;n<N;n++){
   const pitch=n+21,voices=this.voices.filter(v=>v.pitch===pitch);
   const mat=this.fibers[n].material as THREE.MeshBasicMaterial;
   if(!voices.length){mat.opacity=0;continue;}
   const voice=voices[voices.length-1];
   const age=Math.max(0,(now-voice.start)/1000);
   const fade=voice.release===null?1:Math.max(0,1-(now-voice.release)/1900);
   const strength=voice.velocity*fade;
   const band=this.audioBands[pitch<52?0:pitch<76?1:2]||0;
   const resonance=this.audioLevel*.12+band*.22;
   const width=(.007+Math.pow(voice.velocity,1.5)*.065)*(1+resonance);
   mat.opacity=Math.min(.95,(.13+.8*Math.sqrt(voice.velocity))*fade);
   mat.color.setHSL((palette+n/N*.23)%1,.45+strength*.35,Math.min(.87,.47+strength*.25+resonance*.12));
   const arr=this.positions[n],angle=(n/N)*TAU;
   for(let j=0;j<=S;j++){
    const f=j/S;
    const z=zCamera-1-f*(4+Math.min(age,8)*1.7);
    const origin=center(z),phase=f*TAU*3+age*2+n*.31;
    const radius=2.3+Math.sin(phase)*(.05+resonance*.25);
    const x=origin.x+Math.cos(angle)*radius,y=origin.y+Math.sin(angle)*radius;
    const wave=Math.sin(phase*1.7)*(.035+resonance*.22);
    const segment=Math.floor(f*12+n*.13);
    const visible=segment%4!==0&&f<Math.min(1,age*.9+.12);
    const w=visible?width*(1+wave):0;
    const k=j*6;arr[k]=x-Math.sin(angle)*w;arr[k+1]=y+Math.cos(angle)*w;arr[k+2]=z;
    arr[k+3]=x+Math.sin(angle)*w;arr[k+4]=y-Math.cos(angle)*w;arr[k+5]=z;
   }
   this.fibers[n].geometry.attributes.position.needsUpdate=true;
  }
  this.renderer.render(this.scene,this.camera);
 };
 destroy(){this.running=false;cancelAnimationFrame(this.raf);for(const mesh of this.fibers){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}this.renderer.dispose();}
}
