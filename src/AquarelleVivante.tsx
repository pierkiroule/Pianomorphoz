import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {MidiRecorder} from './coaster/midi';
import type {MidiSession} from './coaster/midi';
import {loadSessions,saveSession,deleteSession} from './coaster/storage';

const STATES=[
 {name:'Do majeur · floraison',feed:.0367,kill:.0649,flow:.24},
 {name:'La mineur · condensation',feed:.022,kill:.051,flow:.12},
 {name:'Sol suspendu · étirement',feed:.03,kill:.062,flow:.19},
 {name:'Mi diminué · turbulence',feed:.046,kill:.065,flow:.58},
 {name:'Fa majeur 7 · ramification',feed:.028,kill:.062,flow:.33},
 {name:'Silence · décantation',feed:.022,kill:.056,flow:.07}
];
const N=240;
const FILTERS=['Osmose','Capillarité','Floraison','Cristallisation','Rémanence','Iridescence'];
type LivingSettings={filter:number;intensity:number;autonomy:number;memory:number;blend:boolean};
const DEFAULT_LIVING:LivingSettings={filter:0,intensity:.68,autonomy:.55,memory:.7,blend:true};
const PALETTES=[{name:'Sépia botanique',paper:[250,248,242],ink:[38,58,60]},{name:'Bleu de Prusse',paper:[248,250,249],ink:[17,49,91]},{name:'Garance',paper:[252,248,245],ink:[110,35,57]},{name:'Forêt',paper:[248,250,245],ink:[34,75,57]},{name:'Noir sumi-e',paper:[251,250,247],ink:[23,25,29]}];
PALETTES.push(
 {name:'Lagune',paper:[248,250,247],ink:[19,80,109]},
 {name:'Corail vivant',paper:[252,247,243],ink:[176,56,65]},
 {name:'Forêt cellulaire',paper:[248,249,243],ink:[36,91,59]},
 {name:'Sumi-e précieux',paper:[250,249,246],ink:[23,26,30]}
);
type Gesture={note:number;velocity:number;time:number};
type Perception={energy:number;density:number;register:number;contrast:number;silence:number;novelty:number};
function createMorphogenesis(){
 let last=0,flow=0,contrast=.35,phase=0,accumulated=0;
 const history:Gesture[]=[];
 return {
  observe(events:Gesture[],now:number,active:number,audio:number):Perception{
   for(const event of events)history.push(event);
   while(history.length&&now-history[0].time>6500)history.shift();
   if(events.length)last=now;
   const recent=history.filter(x=>now-x.time<1200);
   const density=Math.min(1,recent.length/12);
   const velocity=recent.length?recent.reduce((sum,x)=>sum+x.velocity,0)/recent.length/127:0;
   const register=recent.length?recent.reduce((sum,x)=>sum+x.note,0)/recent.length/127:.48;
   const interval=recent.length>1?Math.abs(recent[recent.length-1].note-recent[0].note)/48:0;
   const target=Math.min(1,velocity*.45+density*.45+audio*.65+Math.min(1,active/6)*.2);
   flow+=(target-flow)*.075;
   contrast+=(Math.min(1,interval+density*.4+audio*.3)-contrast)*.012;
   const silence=last?Math.max(0,(now-last)/1000):20;
   accumulated+=density*.012;
   phase+=(density+.04)*.003;
   return {energy:flow,density,register,contrast,silence,novelty:Math.min(1,Math.abs(Math.sin(phase*2.3))*contrast+Math.max(0,accumulated-2)*.02)};
  }
 };
}
const buttonStyle:React.CSSProperties={border:'1px solid #cbd4d0',background:'#fffdf6e8',borderRadius:20,padding:'10px 13px',color:'#284044',fontWeight:600};
function PixelField({playing,onStats,canvasRef,musicRef,paletteRef,detailRef,livingRef}:{playing:boolean;onStats:(step:number,fps:number)=>void;canvasRef:React.RefObject<HTMLCanvasElement|null>;musicRef:React.RefObject<{notes:Map<number,number>;pedal:boolean;last:number;connected:boolean;impulses:Gesture[];audioEnergy:number}>;paletteRef:React.RefObject<number>;detailRef:React.RefObject<number>;livingRef:React.RefObject<LivingSettings>}){
 const canvas=canvasRef;
 const playingRef=useRef(playing);playingRef.current=playing;
 const statsRef=useRef(onStats);statsRef.current=onStats;
 useEffect(()=>{
  const target=canvas.current;if(!target)return;
  const ctx=target.getContext('2d',{alpha:false});if(!ctx)return;
  const buffer=document.createElement('canvas');buffer.width=N;buffer.height=N;
  const bc=buffer.getContext('2d',{alpha:false});if(!bc)return;
  const image=bc.createImageData(N,N);
  const veilCanvas=document.createElement('canvas');veilCanvas.width=N;veilCanvas.height=N;
  const veilContext=veilCanvas.getContext('2d');
  const veilImage=veilContext?.createImageData(N,N);
  let a=new Float32Array(N*N),b=new Float32Array(N*N),nextA=new Float32Array(N*N),nextB=new Float32Array(N*N);
  const seed=()=>{
   for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=y*N+x,dx=(x-N/2)/N,dy=(y-N/2)/N,r=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
    a[i]=1;
    // Dense central ink and several satellites are visible on the first frame.
    const edge=.14+.028*Math.sin(angle*7)+.018*Math.sin(angle*13);
    b[i]=r<edge?.9:0;
    for(let j=0;j<11;j++){
     const theta=j*2.39996,rad=.2+.035*Math.sin(j*4.2);
     const xx=.5+Math.cos(theta)*rad,yy=.5+Math.sin(theta)*rad;
     if(Math.hypot(x/N-xx,y/N-yy)<.025)b[i]=.95;
    }
   }
  };seed();
  let frame=0,elapsed=0,raf=0,last=performance.now(),fps=0,count=0,lastFps=last,lastStats=0;
  const pigment=new Float32Array(N*N),membrane=new Float32Array(N*N),wet=new Float32Array(N*N);
  const history=new Float32Array(N*N),crystal=new Float32Array(N*N);
  const clamp=(v:number)=>Math.max(0,Math.min(1,v));
  let livingPhase=0;
  const grammar=createMorphogenesis();
  let morphology=0,inkHue=0;
  const displacement=new Float32Array(88),speed=new Float32Array(88),nextSpeed=new Float32Array(88);
  let lastDrop=0;
  const deposit=(nx:number,ny:number,force:number,shape=0)=>{
   const cx=Math.floor(nx*N),cy=Math.floor(ny*N),radius=1+Math.round(force*7);
   for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    const x=cx+dx,y=cy+dy,d2=dx*dx+dy*dy;
    if(x<2||x>=N-2||y<2||y>=N-2||d2>radius*radius)continue;
    const i=y*N+x,ellipse=shape===1?(dx*dx*.3+dy*dy*2.2):shape===2?(dx*dx*2.4+dy*dy*.35):d2,w=Math.exp(-ellipse/(radius*radius*.45));
    b[i]=Math.min(1,b[i]+(.25+force*.65)*w);
    wet[i]=Math.min(1,wet[i]+w*.12);
   }
  };
  // Lightweight Three.js veil landscape. Rendered offscreen, then composited into
  // the same capture canvas so PNG and MediaRecorder include the optical scene.
  let renderer:THREE.WebGLRenderer|null=null;
  let scene:THREE.Scene|null=null,camera:THREE.PerspectiveCamera|null=null;
  let veilTexture:THREE.CanvasTexture|null=null;
  const veils:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>[]=[];
  try{
   renderer=new THREE.WebGLRenderer({alpha:false,antialias:false,powerPreference:'low-power',preserveDrawingBuffer:true});
   renderer.setPixelRatio(1);
   scene=new THREE.Scene();scene.background=new THREE.Color('#faf8f1');scene.fog=new THREE.Fog('#faf8f1',3.5,9);
   camera=new THREE.PerspectiveCamera(37,1,.1,30);camera.position.set(0,0,4.6);
   veilTexture=new THREE.CanvasTexture(veilCanvas);veilTexture.colorSpace=THREE.SRGBColorSpace;
   for(let k=0;k<3;k++){
    const geometry=new THREE.PlaneGeometry(3.05,3.05,12,12);
    const material=new THREE.MeshBasicMaterial({map:veilTexture,transparent:true,opacity:k===0?.9:k===1?.29:.16,depthWrite:false,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geometry,material);mesh.position.z=-k*.68;
    mesh.rotation.z=(k-1)*.14;mesh.rotation.y=(k-1)*.13;
    scene.add(mesh);veils.push(mesh);
   }
  }catch{renderer?.dispose();renderer=null;}
  const resize=()=>{const r=target.getBoundingClientRect(),d=Math.min(window.devicePixelRatio||1,1.5);target.width=Math.max(1,Math.floor(r.width*d));target.height=Math.max(1,Math.floor(r.height*d));ctx.setTransform(d,0,0,d,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';};
  resize();window.addEventListener('resize',resize);
  const draw=(now:number)=>{
   raf=requestAnimationFrame(draw);
   const dt=Math.min(.05,(now-last)/1000);last=now;
   if(playingRef.current)elapsed+=dt;
   const active=[...musicRef.current.notes.entries()];
   const impulses=playingRef.current?musicRef.current.impulses.splice(0,48):[];
   const perception=grammar.observe(impulses,now,active.length,musicRef.current.audioEnergy);
   morphology+=(perception.energy+morphology*.12-morphology)*.025;
   const pitches=active.map(([n])=>n),velocity=active.reduce((sum,[,v])=>sum+v,0)/Math.max(1,active.length)/127;
   const pcs=new Set(pitches.map(n=>n%12));
   const root=pitches.length?Math.min(...pitches)%12:0;
   const has=(intervals:number[])=>[...pcs].some(r=>intervals.every(i=>pcs.has((r+i)%12)));
   const major=has([0,4,7]),minor=has([0,3,7]);
   const diminished=has([0,3,6]),suspended=(has([0,5,7])||has([0,2,7]))&&!major&&!minor;
   const midiStep=major?0:minor?1:diminished?3:suspended?2:pitches.length?4:5;
   const step=musicRef.current.connected?midiStep:5;
   const state=STATES[step];
   const energy=perception.energy;
   const register=pitches.length?pitches.reduce((s,n)=>s+n,0)/pitches.length:60;
   const registerBias=(register-60)/48;
   const palette=PALETTES[paletteRef.current]||PALETTES[0];
   const chroma=Math.min(1,perception.contrast*.45+perception.register*.25+perception.novelty*.3);
   inkHue+=(chroma-inkHue)*.006;
   const living=livingRef.current;
   const activity=clamp(energy*.75+(musicRef.current.pedal?.15:0));
   const drive=clamp((.42+perception.novelty*.3)*( .35+activity*.65));
   const currentFilter=Math.min(5,Math.floor((perception.novelty*.6+perception.register*.3+Math.sin(elapsed*.017)*.1+.1)*6));
   livingPhase+=dt*(.1+living.autonomy*.8);
   if(playingRef.current){
    for(const event of impulses){
     const index=Math.max(0,Math.min(87,event.note-21));
     speed[index]+=.13+event.velocity/127*.72;
     const theta=index*2.39996323,radius=.12+.29*index/87;
     const power=event.velocity/127;
     const shape=power>.8?2:perception.density>.5?1:0;
     const drops=1+Math.floor(power*2+perception.density*2);
     for(let d=0;d<drops;d++){
      const jitter=d===0?0:Math.sin(event.time*.07+d*2.4)*.018*power;
      deposit(.5+Math.cos(theta)*radius+displacement[index]*.06+jitter,.5+Math.sin(theta)*radius+displacement[index]*.06-jitter,power*(d===0?1:.35),shape);
     }
    }
    const damping=.966+living.memory*.022;
    for(let j=0;j<88;j++){
     const lap=displacement[Math.max(0,j-1)]+displacement[Math.min(87,j+1)]-2*displacement[j];
     nextSpeed[j]=(speed[j]+lap*(.085+living.autonomy*.065)-displacement[j]*.024)*damping;
    }
    for(let j=0;j<88;j++){speed[j]=nextSpeed[j];displacement[j]=Math.max(-1,Math.min(1,displacement[j]+speed[j]));}
    // No autonomous drops: silence preserves the painting while the water settles.
    if(elapsed-lastDrop>.12&&active.length&&perception.energy>.09){
     lastDrop=elapsed;
     const count=Math.min(5,Math.ceil(perception.density*3+perception.energy*2));
     for(const [note,velocity] of active.slice(0,count)){
      const j=Math.max(0,Math.min(87,note-21)),theta=j*2.39996323,radius=.12+.29*j/87;
      deposit(.5+Math.cos(theta)*radius+displacement[j]*.06,.5+Math.sin(theta)*radius+displacement[j]*.06,velocity/127*.18,1);
     }
    }
    for(let iteration=0;iteration<(fps>0&&fps<24?1:2);iteration++){
     for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
      const i=y*N+x,aa=a[i],bb=b[i];
      const lapA=-aa+.2*(a[i-1]+a[i+1]+a[i-N]+a[i+N])+.05*(a[i-N-1]+a[i-N+1]+a[i+N-1]+a[i+N+1]);
      const lapB=-bb+.2*(b[i-1]+b[i+1]+b[i-N]+b[i+N])+.05*(b[i-N-1]+b[i-N+1]+b[i+N-1]+b[i+N+1]);
      const reaction=aa*bb*bb;
      nextA[i]=Math.max(0,Math.min(1,aa+.98*lapA-reaction+(state.feed+energy*.003)*(1-aa)));
      nextB[i]=Math.max(0,Math.min(1,bb+.48*lapB+reaction-(state.kill+state.feed)*bb));
     }
     [a,nextA]=[nextA,a];[b,nextB]=[nextB,b];
    }

   }
   // Four interacting visual scales: Gray-Scott, dye diffusion, oil-like membranes, micrograin.
   const pix=image.data;
   const t=elapsed;
   for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=y*N+x,xx=x/N-.5,yy=y/N-.5,v=b[i];
    const left=b[y*N+Math.max(0,x-1)],right=b[y*N+Math.min(N-1,x+1)];
    const up=b[Math.max(0,y-1)*N+x],down=b[Math.min(N-1,y+1)*N+x];
    const grad=Math.hypot(right-left,down-up);
    const swirl=Math.sin(xx*17+Math.sin(yy*11+t*.11)*2.3+t*.23)*Math.cos(yy*14-t*.17);
    const r=Math.hypot(xx,yy);
    const oil=Math.sin((r+swirl*.023)*125+v*22+t*.23);
    const cells=Math.sin(x*.24+Math.sin(y*.14+t*.15)*1.7)*Math.sin(y*.21+Math.cos(x*.12-t*.13)*1.8);
    const boundary=Math.pow(Math.max(0,1-Math.abs(oil)),13)*Math.max(0,Math.min(1,v*5+.13));
    const micro=Math.pow(Math.max(0,1-Math.abs(cells)),10)*Math.max(0,Math.min(1,v*3));
    const density=Math.max(0,Math.min(1,v*2.45));
    const dendrite=Math.pow(clamp(1-Math.abs(Math.sin(x*.27+Math.sin(y*.06+t*.12)*4)*Math.cos(y*.31+Math.sin(x*.04-t*.09)*3))),15);
    const rings=Math.pow(clamp(1-Math.abs(Math.sin(r*155+swirl*7+t*.12))),16);
    const mineral=Math.pow(clamp(1-Math.abs(Math.sin(x*.19+y*.13+Math.sin(y*.08+t*.03)*4))),24);
    const floral=Math.pow(clamp(1-Math.abs(Math.sin(Math.atan2(yy,xx)*9+r*65-t*.18))),12);
    const effects=[boundary+micro*.3,dendrite*density,floral*density,mineral*density,history[i],rings*density];
    const material=clamp((effects[currentFilter]*(living.blend?.75:1)+effects[(currentFilter+1)%6]*(living.blend?.25:0))*drive);
    history[i]=clamp(history[i]*(.93+living.memory*.069)+material*.014);
    crystal[i]=clamp(crystal[i]*.986+mineral*density*.014);
    pigment[i]=pigment[i]*.992+density*.008;
    wet[i]=wet[i]*.991+Math.max(0,1-grad*9)*density*.009;
    membrane[i]=membrane[i]*.96+(boundary+micro*.32+material*.8)*.04;
    const mist=Math.max(0,Math.min(1,(v*.75+pigment[i]*.22+Math.sin(xx*8+yy*9+t*.1)*.012)));
    const edge=Math.min(1,grad*3.8);
    const capillary=Math.pow(Math.max(0,Math.sin(x*.51+Math.sin(y*.027+t*.06)*4)*Math.sin(y*.43+Math.cos(x*.033-t*.05)*4)),13)*density;
    const dark=clamp(density*.71+membrane[i]*.45+edge*.24+capillary*.15+wet[i]*.12+material*.27+history[i]*living.memory*.18+crystal[i]*.08);
    const gold=clamp((Math.sin(xx*8+yy*13+t*.09)+1)*.5*membrane[i]*.65+(currentFilter===5?material*.55:0));
    const grain=((x*73+y*131+x*y*17)%101)/101-.5;
    const bloom=Math.pow(Math.max(0,1-Math.abs(Math.sin((xx*xx+yy*yy)*330+swirl*3+t*.15))),18)*density*.09;
    const p=i*4;
    pix[p]=Math.max(0,Math.min(255,palette.paper[0]*(1-dark)+(palette.ink[0]*(1-inkHue*.3)+72*inkHue*.3)*dark+gold*28+bloom*22+grain*2));
    pix[p+1]=Math.max(0,Math.min(255,palette.paper[1]*(1-dark)+palette.ink[1]*dark+mist*7+gold*10+bloom*18+grain*2));
    pix[p+2]=Math.max(0,Math.min(255,palette.paper[2]*(1-dark)+(palette.ink[2]*(1-inkHue*.4)+135*inkHue*.4)*dark+mist*13-gold*9+grain*2));
    pix[p+3]=255;
   }
   bc.putImageData(image,0,0);
   if(veilContext&&veilImage&&frame%2===0){
    const src=image.data,dst=veilImage.data;
    for(let i=0;i<N*N;i++){
     const p=i*4;
     dst[p]=src[p];dst[p+1]=src[p+1];dst[p+2]=src[p+2];
     dst[p+3]=Math.round(255*Math.min(.94,Math.max(0,(b[i]-.018)*2.6+history[i]*.3)));
    }
    veilContext.putImageData(veilImage,0,0);
   }
   const width=target.clientWidth,height=target.clientHeight;
   ctx.fillStyle='#faf8f1';ctx.fillRect(0,0,width,height);
   const size=Math.min(width,height)*.98;
   if(renderer&&scene&&camera&&veilTexture&&frame%2===0){
    const scale=Math.min(1,Math.max(.4,Math.min(width,height)/700));
    const renderWidth=Math.max(1,Math.floor(width*scale)),renderHeight=Math.max(1,Math.floor(height*scale));
    if(renderer.domElement.width!==renderWidth||renderer.domElement.height!==renderHeight)renderer.setSize(renderWidth,renderHeight,false);
    camera.aspect=width/Math.max(1,height);camera.updateProjectionMatrix();
    camera.position.x=Math.sin(elapsed*.045)*.22;
    camera.position.y=Math.cos(elapsed*.034)*.16;
    camera.position.z=4.6+Math.sin(elapsed*.028)*.25;
    camera.lookAt(0,0,-.45);
    veils.forEach((veil,k)=>{
     veil.rotation.z=(k-1)*.14+Math.sin(elapsed*.07+k)*.065;
     veil.rotation.y=(k-1)*.13+Math.sin(elapsed*.11+k)*.09;
     veil.position.x=Math.sin(elapsed*.09+k*2.1)*.12;
     const pos=veil.geometry.attributes.position as THREE.BufferAttribute;
     for(let j=0;j<pos.count;j++){
      const x=pos.getX(j),y=pos.getY(j);
      pos.setZ(j,Math.sin(x*2.3+elapsed*.21+k)*Math.cos(y*2.5-elapsed*.16)*(.045+perception.energy*.075));
     }
     pos.needsUpdate=true;
    });
    veilTexture.needsUpdate=true;renderer.render(scene,camera);
   }
   if(renderer){
    ctx.drawImage(renderer.domElement,0,0,width,height);
    ctx.save();ctx.globalAlpha=.1;ctx.filter='blur(11px)';
    ctx.drawImage(renderer.domElement,-width*.015,-height*.015,width*1.03,height*1.03);
    ctx.restore();
   }else if(!renderer){
    ctx.drawImage(buffer,(width-size)/2,(height-size)/2,size,size);
   }
   // Fine, deterministic pigment fibers at display resolution, independent of simulation pixels.
   ctx.save();ctx.globalCompositeOperation='multiply';
   for(let j=0;j<Math.round(80+detailRef.current*140);j++){
    const seed=j*2.399963229728653,rr=Math.sqrt((j+.5)/Math.round(80+detailRef.current*140))*size*.43;
    const x=width/2+Math.cos(seed)*rr,y=height/2+Math.sin(seed)*rr;
    const gx=Math.floor((x-(width-size)/2)/size*N),gy=Math.floor((y-(height-size)/2)/size*N);
    if(gx<0||gx>=N||gy<0||gy>=N||b[gy*N+gx]<.06)continue;
    const len=2+Math.abs(Math.sin(j*9.3))*size*.025;
    ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+Math.cos(seed+elapsed*.07)*len*.3,y+Math.sin(seed)*len*.3,x+Math.cos(seed+elapsed*.07)*len*.7,y+Math.sin(seed+1)*len*.7,x+Math.cos(seed+elapsed*.07)*len,y+Math.sin(seed+1)*len);
    ctx.strokeStyle=j%9===0?'rgba(143,99,55,.12)':`rgba(${palette.ink[0]},${palette.ink[1]},${palette.ink[2]},.14)`;ctx.lineWidth=.35;ctx.stroke();
   }
   ctx.restore();
   // Optical diffusion: a soft large-scale veil, then the sharp microstructure.
   ctx.save();ctx.globalAlpha=.16;ctx.filter='blur(12px)';ctx.drawImage(buffer,(width-size)/2,(height-size)/2,size,size);ctx.restore();
   frame++;count++;
   if(now-lastFps>1000){fps=Math.round(count*1000/(now-lastFps));count=0;lastFps=now;}
   if(now-lastStats>400){lastStats=now;statsRef.current(step,fps);}
  };
  raf=requestAnimationFrame(draw);
  return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize);veils.forEach(v=>{v.geometry.dispose();v.material.dispose();});veilTexture?.dispose();renderer?.dispose();};
 },[]);
 return <canvas ref={canvas} style={{position:'absolute',inset:0,width:'100%',height:'100%',display:'block'}}/>;
}
export default function Prototype(){
 const [uiVisible,setUiVisible]=useState(true),[playing,setPlaying]=useState(true);
 const [previewOpen,setPreviewOpen]=useState(false),[captureSeconds,setCaptureSeconds]=useState(0);
 const livingRef=useRef<LivingSettings>({...DEFAULT_LIVING,filter:2,intensity:.65,autonomy:.42,memory:.8}),paletteRef=useRef(7),detailRef=useRef(.9),recordStart=useRef(0),captureClock=useRef<number|null>(null);
 const [midiStatus,setMidiStatus]=useState('Connecter un piano pour peindre'),[recording,setRecording]=useState(false),[recorded,setRecorded]=useState('');
 const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[deviceId,setDeviceId]=useState(''),[recordStatus,setRecordStatus]=useState('');
 const [panel,setPanel]=useState(false),[sessions,setSessions]=useState<MidiSession[]>([]),[selected,setSelected]=useState(''),[taking,setTaking]=useState(false),[replaying,setReplaying]=useState(false),[midiInputs,setMidiInputs]=useState<{id:string;name:string}[]>([]),[midiOutputs,setMidiOutputs]=useState<{id:string;name:string}[]>([]),[midiInput,setMidiInput]=useState(''),[midiOutput,setMidiOutput]=useState('');
 const midiRecorder=useRef(new MidiRecorder()),playbackTimers=useRef<number[]>([]),replayRef=useRef(false),recordingRef=useRef(false);
 const canvasRef=useRef<HTMLCanvasElement>(null);
 const musicRef=useRef({notes:new Map<number,number>(),pedal:false,last:0,connected:false,impulses:[] as Gesture[],audioEnergy:0});
 const listenRef=useRef<{stream:MediaStream;context:AudioContext;timer:number}|null>(null),[listening,setListening]=useState(false);
 const midiAccessRef=useRef<MIDIAccess|null>(null),recorderRef=useRef<MediaRecorder|null>(null),streamRef=useRef<MediaStream|null>(null);
 useEffect(()=>()=>{if(recorded)URL.revokeObjectURL(recorded);},[recorded]);
 function captureImage(){
  const canvas=canvasRef.current;if(!canvas)return;
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  canvas.toBlob(blob=>{
   if(!blob){setRecordStatus('Impossible de capturer cette image');return;}
   const url=URL.createObjectURL(blob);
   const a=document.createElement('a');a.href=url;a.download='pianomorphoz-'+stamp+'.png';
   document.body.appendChild(a);a.click();a.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),30000);
  },'image/png');
 }

 useEffect(()=>()=>{if(captureClock.current!==null)clearInterval(captureClock.current);},[]);
 useEffect(()=>{void loadSessions().then(setSessions).catch(e=>setRecordStatus(String(e)));},[]);
 useEffect(()=>()=>{if(listenRef.current){clearInterval(listenRef.current.timer);listenRef.current.stream.getTracks().forEach(t=>t.stop());void listenRef.current.context.close();}playbackTimers.current.forEach(clearTimeout);midiAccessRef.current?.inputs.forEach(input=>{input.onmidimessage=null;});if(recorderRef.current?.state==='recording')recorderRef.current.stop();streamRef.current?.getTracks().forEach(t=>t.stop());},[]);
 function onMidi(data:number[],now=performance.now()){
  if(recordingRef.current)midiRecorder.current.push(data,now);
  const command=data[0]&240,n=data[1],v=data[2];
  if(command===144&&v>0){musicRef.current.notes.set(n,v);musicRef.current.impulses.push({note:n,velocity:v,time:now});if(musicRef.current.impulses.length>96)musicRef.current.impulses.splice(0,48);}
  if(command===128||(command===144&&v===0))musicRef.current.notes.delete(n);
  if(command===176&&n===64)musicRef.current.pedal=v>=64;
  musicRef.current.last=now;
 }
 function bindMidi(access:MIDIAccess,id?:string){
  const inputs=[...access.inputs.values()],outputs=[...access.outputs.values()];
  const input=inputs.find(i=>i.id===id)||inputs[0];
  access.inputs.forEach(i=>{i.onmidimessage=null;});
  if(input)input.onmidimessage=e=>{if(e.data)onMidi(Array.from(e.data),e.timeStamp||performance.now());};
  setMidiInputs(inputs.map(i=>({id:i.id,name:i.name||'MIDI IN'})));
  setMidiOutputs(outputs.map(i=>({id:i.id,name:i.name||'MIDI OUT'})));
  setMidiInput(input?.id||'');setMidiOutput(old=>outputs.some(o=>o.id===old)?old:outputs[0]?.id||'');
  musicRef.current.connected=!!input;setMidiStatus(input?'MIDI : '+(input.name||'entrée active'):'Aucune entrée MIDI');
 }
 async function connectMidi(){
  try{
   if(!navigator.requestMIDIAccess)throw Error('Web MIDI indisponible. Utiliser Chrome ou Edge.');
   const access=await navigator.requestMIDIAccess();midiAccessRef.current=access;
   bindMidi(access);access.onstatechange=()=>bindMidi(access);
  }catch(error){setMidiStatus(String(error));}
 }
 function stopPlayback(){
  playbackTimers.current.forEach(clearTimeout);playbackTimers.current=[];replayRef.current=false;setReplaying(false);
  musicRef.current.notes.clear();
  const output=midiAccessRef.current?.outputs.get(midiOutput);
  if(output)for(let ch=0;ch<16;ch++){output.send([0xb0|ch,64,0]);output.send([0xb0|ch,123,0]);}
 }
 function playSession(){
  const session=sessions.find(s=>s.id===selected);if(!session)return;
  stopPlayback();replayRef.current=true;setReplaying(true);musicRef.current.connected=true;
  const output=midiAccessRef.current?.outputs.get(midiOutput);
  for(const event of session.events){
   playbackTimers.current.push(window.setTimeout(()=>{
    if(!replayRef.current)return;
    onMidi(event.data);
    if(output&&event.data[0]<240)output.send(event.data);
   },Math.max(0,event.t)));
  }
  playbackTimers.current.push(window.setTimeout(()=>stopPlayback(),session.duration+300));
 }
 async function toggleTake(){
  if(recordingRef.current){recordingRef.current=false;setTaking(false);const session=midiRecorder.current.stop();
   if(session.events.length){try{await saveSession(session);setSessions(await loadSessions());setSelected(session.id);setRecordStatus('Prise MIDI sauvegardée en local');}catch(e){setRecordStatus(String(e));}}
   else setRecordStatus('Aucune note MIDI enregistrée');return;
  }
  if(!musicRef.current.connected){setRecordStatus('Connecter une entrée MIDI avant la prise');return;}
  stopPlayback();midiRecorder.current.start();recordingRef.current=true;setTaking(true);setRecordStatus('Prise MIDI en cours');
 }
 async function removeSession(){if(!selected)return;try{await deleteSession(selected);setSessions(await loadSessions());setSelected('');}catch(e){setRecordStatus(String(e));}}
 function exportSession(){const session=sessions.find(s=>s.id===selected);if(!session)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(session,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='pianomorphoz-session.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function selectAudio(){
  try{
   const probe=await navigator.mediaDevices.getUserMedia({audio:true});
   const list=await navigator.mediaDevices.enumerateDevices();probe.getTracks().forEach(t=>t.stop());
   const inputs=list.filter(d=>d.kind==='audioinput');setDevices(inputs);
   if(inputs.length===1)setDeviceId(inputs[0].deviceId);
   setRecordStatus('Choisir une entrée audio, idéalement Yamaha USB.');
  }catch(error){setRecordStatus('Entrées audio : '+String(error));}
 }
 async function toggleListening(){
  if(listenRef.current){
   const l=listenRef.current;clearInterval(l.timer);l.stream.getTracks().forEach(t=>t.stop());void l.context.close();
   listenRef.current=null;musicRef.current.audioEnergy=0;setListening(false);return;
  }
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:deviceId?{exact:deviceId}:undefined,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
   const context=new AudioContext(),source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();
   analyser.fftSize=1024;analyser.smoothingTimeConstant=.62;source.connect(analyser);
   const wave=new Uint8Array(analyser.fftSize),spectrum=new Uint8Array(analyser.frequencyBinCount);
   let prev=0,lastOnset=0;
   const timer=window.setInterval(()=>{
    analyser.getByteTimeDomainData(wave);analyser.getByteFrequencyData(spectrum);
    let sum=0;for(let i=0;i<wave.length;i++){const v=(wave[i]-128)/128;sum+=v*v;}
    const rms=Math.sqrt(sum/wave.length),energy=Math.min(1,Math.max(0,(rms-.012)*6));
    musicRef.current.audioEnergy+=(energy-musicRef.current.audioEnergy)*.23;
    const now=performance.now();
    if(energy>.12&&energy>prev*1.26&&now-lastOnset>125){
     let total=0,weighted=0;
     for(let i=2;i<spectrum.length;i++){const w=spectrum[i];total+=w;weighted+=i*w;}
     const centroid=total?weighted/total:50;
     const note=Math.round(Math.max(36,Math.min(95,42+centroid*.18)));
     musicRef.current.impulses.push({note,velocity:Math.round(Math.min(127,Math.max(25,energy*127))),time:now});
     lastOnset=now;
    }
    prev=energy;
   },40);
   listenRef.current={stream,context,timer};setListening(true);setRecordStatus('Écoute active · aucun retour audio vers les haut-parleurs');
  }catch(error){setRecordStatus('Écoute audio : '+String(error));setListening(false);}
 }
 async function toggleRecording(){
  if(recorderRef.current?.state==='recording'){recorderRef.current.stop();setRecording(false);return;}
  try{
   if(!canvasRef.current?.captureStream||!window.MediaRecorder)throw Error('Enregistrement vidéo indisponible');
   const video=canvasRef.current.captureStream(30);
   // Optional microphone capture. Never play captured audio back to speakers.
   let audio:MediaStream|null=null;
   try{
    audio=await navigator.mediaDevices.getUserMedia({audio:{deviceId:deviceId?{exact:deviceId}:undefined,channelCount:{ideal:2},echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    const actual=audio.getAudioTracks()[0]?.getSettings().deviceId;
    if(deviceId&&actual&&actual!==deviceId)throw Error('Entrée audio sélectionnée non respectée');
    setRecordStatus('Capture audio active · aucune restitution vers les enceintes');
   }catch(error){audio?.getTracks().forEach(t=>t.stop());audio=null;setRecordStatus('Vidéo sans audio : '+String(error));}
   const stream=new MediaStream([...video.getVideoTracks(),...(audio?.getAudioTracks()||[])]);
   streamRef.current=stream;
   const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(x=>MediaRecorder.isTypeSupported(x));
   const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined),chunks:BlobPart[]=[];
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   recorder.onstop=()=>{if(captureClock.current!==null){clearInterval(captureClock.current);captureClock.current=null;}const blob=new Blob(chunks,{type:recorder.mimeType||'video/webm'});const url=URL.createObjectURL(blob);setRecorded(old=>{if(old)URL.revokeObjectURL(old);return url;});stream.getTracks().forEach(t=>t.stop());streamRef.current=null;setRecording(false);setPreviewOpen(true);setRecordStatus('Enregistrement terminé · aperçu disponible');};
   recorderRef.current=recorder;recorder.start(1000);recordStart.current=performance.now();setCaptureSeconds(0);captureClock.current=window.setInterval(()=>setCaptureSeconds(Math.floor((performance.now()-recordStart.current)/1000)),500);setRecording(true);
  }catch(error){setRecordStatus('Enregistrement : '+String(error));setRecording(false);}
 }
 return <main style={{position:'fixed',inset:0,overflow:'hidden',background:'#faf8f1',fontFamily:'system-ui,sans-serif',color:'#284044'}}>
  <PixelField playing={playing} canvasRef={canvasRef} musicRef={musicRef} paletteRef={paletteRef} detailRef={detailRef} livingRef={livingRef} onStats={()=>{}}/>
  <button aria-label={uiVisible?'Masquer les commandes':'Afficher les commandes'} title={uiVisible?'Mode immersion':'Afficher les commandes'} onClick={()=>{setUiVisible(v=>!v);setPanel(false);}} style={{...buttonStyle,position:'absolute',top:12,right:12,zIndex:12,padding:'9px 12px',fontSize:12,background:'#fffdf6c9',backdropFilter:'blur(12px)'}}>{uiVisible?'◌ Immersion':'☷'}</button>
  {uiVisible&&<div style={{position:'absolute',top:12,left:12,zIndex:4,background:'#fffdf6b8',backdropFilter:'blur(12px)',borderRadius:14,padding:'7px 11px',fontSize:11,pointerEvents:'none'}}>
   <strong>PIANOMORPHOZ •°</strong><span style={{opacity:.6}}> · MORPHÉA</span>
  </div>}
  {uiVisible&&<div style={{position:'absolute',bottom:'max(12px,env(safe-area-inset-bottom))',left:'50%',transform:'translateX(-50%)',display:'flex',alignItems:'center',gap:6,zIndex:8,background:'#fffdf6ce',backdropFilter:'blur(16px)',border:'1px solid #d5dbd4',padding:6,borderRadius:28,boxShadow:'0 6px 24px #20322a20',maxWidth:'calc(100vw - 20px)'}}>
   <button style={{...buttonStyle,padding:'9px 12px'}} onClick={()=>setPanel(v=>!v)} aria-label="Réglages du studio" title="Atelier et réglages">☷ Atelier</button>
   <button style={{...buttonStyle,padding:'9px 12px'}} onClick={captureImage} aria-label="Capturer une image PNG" title="Photo instantanée PNG">▣ Photo</button>
   <button style={{...buttonStyle,padding:'9px 12px'}} onClick={()=>setPlaying(v=>!v)} aria-label={playing?'Pause':'Lecture'}>{playing?'Ⅱ':'▶'}</button>
   <button style={{...buttonStyle,padding:'9px 12px',color:recording?'#a71935':undefined}} onClick={toggleRecording} aria-label={recording?'Arrêter la vidéo':'Enregistrer une vidéo'}>{recording?'■ Stop':'● REC'}</button>
   {recorded&&!recording&&<button style={{...buttonStyle,padding:'9px 12px'}} onClick={()=>setPreviewOpen(true)} title="Prévisualiser la dernière capture">▶ Voir</button>}
  </div>}
  {panel&&uiVisible&&<section style={{position:'absolute',top:55,right:12,bottom:75,width:'min(350px,calc(100vw - 24px))',overflowY:'auto',background:'#fffdf6f5',border:'1px solid #d4dcd5',borderRadius:20,padding:16,boxShadow:'0 8px 40px #2442',fontSize:13,zIndex:5}}>
   <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><h2 style={{margin:'0 0 10px',fontSize:17}}>Atelier pictural</h2><button style={{...buttonStyle,padding:'5px 10px'}} onClick={()=>setPanel(false)} aria-label='Fermer les réglages'>✕</button></div>
   <p>Jouez. La matière interprète vos gestes, sans réglage esthétique.</p><p style={{fontSize:11,opacity:.75}}>{midiStatus}</p>
   <button style={buttonStyle} onClick={connectMidi}>Connecter le piano MIDI</button>
   {midiInputs.length>0&&<label style={{display:'block',marginTop:10}}>Entrée MIDI<select style={{width:'100%'}} value={midiInput} onChange={e=>bindMidi(midiAccessRef.current!,e.target.value)}>{midiInputs.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
   {midiOutputs.length>0&&<label style={{display:'block',marginTop:10}}>Sortie Yamaha<select style={{width:'100%'}} value={midiOutput} onChange={e=>setMidiOutput(e.target.value)}>{midiOutputs.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
   <details><summary style={{cursor:'pointer',marginTop:14,fontWeight:600}}>Sessions MIDI (facultatif)</summary><h3>Enregistrer une improvisation</h3>
   <button style={buttonStyle} onClick={()=>void toggleTake()}>{taking?'■ Terminer la prise MIDI':'● Enregistrer MIDI'}</button>
   <label style={{display:'block',marginTop:12}}>Sessions enregistrées<select style={{width:'100%'}} value={selected} onChange={e=>setSelected(e.target.value)}><option value=''>Choisir une session</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.name} ({Math.round(s.duration/1000)} s)</option>)}</select></label>
   <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}><button style={buttonStyle} disabled={!selected||replaying} onClick={playSession}>▶ Rejouer</button><button style={buttonStyle} disabled={!replaying} onClick={stopPlayback}>■ Stop</button><button style={buttonStyle} disabled={!selected} onClick={exportSession}>JSON</button><button style={buttonStyle} disabled={!selected} onClick={()=>void removeSession()}>Supprimer</button></div>
   </details><p style={{fontSize:12,opacity:.75}}>MORPHÉA interprète le jeu et transforme automatiquement les pigments, les voiles et la lumière. Aucun style à régler.</p>
   <h3>Production audiovisuelle</h3>
   <p>Sélectionner l'entrée audio USB ou le micro. Puis utiliser « Vidéo » pour enregistrer l'image et le son ensemble.</p>
   <button style={buttonStyle} onClick={selectAudio}>Choisir la source audio</button>
   <button style={{...buttonStyle,marginLeft:6}} onClick={()=>void toggleListening()}>{listening?'■ Arrêter l’écoute':'◉ Écouter le son'}</button>
   {devices.length>0&&<select style={{display:'block',width:'100%',marginTop:8}} value={deviceId} onChange={e=>setDeviceId(e.target.value)}><option value=''>Microphone par défaut</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||'Entrée audio'}</option>)}</select>}
   <p style={{fontSize:11,opacity:.75}}>{recordStatus}</p>
   {recorded&&<button style={buttonStyle} onClick={()=>setPreviewOpen(true)}>▶ Prévisualiser la capture</button>}
   <p style={{fontSize:11}}>Pour le mastering WAV et le montage avancé : <a href='?studio=1'>outils historiques</a>.</p>
  </section>}
  {recording&&<div style={{position:'absolute',top:14,left:'50%',transform:'translateX(-50%)',background:'#8d2335',color:'white',borderRadius:30,padding:'8px 16px',fontSize:12,fontWeight:700}}>● REC {Math.floor(captureSeconds/60).toString().padStart(2,'0')}:{(captureSeconds%60).toString().padStart(2,'0')}</div>}
  {previewOpen&&recorded&&<div style={{position:'absolute',inset:0,zIndex:20,background:'#182122e8',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}><div style={{width:'min(760px,96vw)',background:'#fffdf6',padding:16,borderRadius:20}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><strong>Prévisualisation de la prise</strong><button style={buttonStyle} onClick={()=>setPreviewOpen(false)}>Fermer</button></div><video src={recorded} controls playsInline style={{width:'100%',maxHeight:'65vh',background:'#000',borderRadius:10}}/><div style={{display:'flex',gap:10,marginTop:12}}><a style={{...buttonStyle,textDecoration:'none'}} href={recorded} download={'pianomorphoz-capture.'+(recorded&&recorderRef.current?.mimeType.includes('mp4')?'mp4':'webm')}>Télécharger la vidéo</a></div></div></div>}
 </main>;
}
