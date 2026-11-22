import {useEffect,useRef} from 'react';
import type {RefObject} from 'react';

type Gesture={note:number;velocity:number;time:number};
type Music={notes:Map<number,number>;pedal:boolean;last:number;connected:boolean;impulses:Gesture[];audioEnergy:number};
type Props={playing:boolean;immersive:boolean;canvasRef:RefObject<HTMLCanvasElement|null>;musicRef:RefObject<Music>};
const COLORS=['#353e45','#52646b','#647777','#738379','#858374','#917f70','#8b706b','#826d78','#747080','#626f83','#576e7e','#4c616e'];
const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
const rand=(x:number)=>{const y=Math.sin(x*127.1+78.233)*43758.5453;return y-Math.floor(y);};
type Stroke={x:number;y:number;radius:number;age:number;life:number;hue:number;velocity:number;seed:number;kind:number};
export default function SumiResonance({playing,canvasRef,musicRef}:Props){
 const playingRef=useRef(playing);playingRef.current=playing;
 useEffect(()=>{
  const canvas=canvasRef.current;if(!canvas)return;
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return;
  const ink=document.createElement('canvas'),ic=ink.getContext('2d');
  if(!ic)return;
  let w=1,h=1,dpr=1,raf=0,last=performance.now(),lastSound=0,fade=0,frame=0;
  let pending:Gesture[]=[],batchStart=0;
  const strokes:Stroke[]=[];
  let seed=11;
  const resize=()=>{
   const r=canvas.getBoundingClientRect();
   const nw=Math.max(1,Math.round(r.width)),nh=Math.max(1,Math.round(r.height));
   if(nw===w&&nh===h)return;
   const old=document.createElement('canvas');old.width=ink.width;old.height=ink.height;
   old.getContext('2d')?.drawImage(ink,0,0);
   w=nw;h=nh;dpr=Math.min(devicePixelRatio||1,1.5);
   canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
   ctx.setTransform(dpr,0,0,dpr,0,0);
   ink.width=w;ink.height=h;
   if(old.width&&old.height)ic.drawImage(old,0,0,w,h);
  };
  const drop=(events:Gesture[])=>{
   if(!events.length)return;
   const vel=events.reduce((s,e)=>s+e.velocity,0)/events.length/127;
   const note=events.reduce((s,e)=>s+e.note,0)/events.length;
   const pitchClass=Math.round(note)%12;
   const n=strokes.length,angle=n*2.399963+rand(seed)*.55;
   const radius=Math.min(w,h)*(.012+.013*vel);
   const spread=Math.min(w,h)*(.045+.018*Math.sqrt(n+1));
   strokes.push({x:w/2+Math.cos(angle)*Math.min(spread,Math.min(w,h)*.16),y:h/2+Math.sin(angle)*Math.min(spread,Math.min(w,h)*.13),radius,age:0,life:2.4+vel*2,hue:pitchClass,velocity:vel,seed:seed++,kind:events.length>1?2:(note>70?1:0)});
   if(strokes.length>55)strokes.shift();
   lastSound=performance.now();fade=1;
  };
  const mark=(s:Stroke,energy:number,dt:number)=>{
   s.age+=dt;
   const p=clamp(s.age/s.life);
   const resonance=clamp(energy*1.9);
   const reach=s.radius*(1+p*(2.2+resonance*3.5));
   const alpha=(.024+.035*s.velocity)*Math.pow(1-p,.7);
   const hue=COLORS[s.hue];
   // Wet wash: many translucent irregular paper-grain strokes, not circles.
   for(let j=0;j<12;j++){
    const t=s.age*8+j*.52+s.seed;
    const theta=t*2.399963+Math.sin(s.seed*.7+j)*.7;
    const rr=reach*(.2+.8*rand(j*11+s.seed*7));
    const x=s.x+Math.cos(theta)*rr,y=s.y+Math.sin(theta)*rr*.76;
    const length=reach*(.25+.75*rand(j*5+s.seed));
    ic.save();ic.translate(x,y);ic.rotate(theta+.65);
    ic.globalAlpha=alpha*(.5+rand(j+s.seed));
    ic.strokeStyle=hue;ic.lineWidth=Math.max(.35,reach*.045*(1-p*.7));
    ic.lineCap='round';
    ic.beginPath();
    ic.moveTo(-length*.48,Math.sin(t)*reach*.08);
    ic.bezierCurveTo(-length*.12,-reach*.15,length*.13,reach*.12,length*.55,Math.cos(t)*reach*.09);
    ic.stroke();
    // Kasure: tiny interruptions and split fibers.
    for(let k=0;k<3;k++){
     const dx=(rand(k*23+j+s.seed)-.5)*length;
     ic.globalAlpha=alpha*.48;
     ic.lineWidth=.35+rand(k+j)*.8;
     ic.beginPath();ic.moveTo(dx,-reach*.06);ic.lineTo(dx+length*.16,reach*.07);ic.stroke();
    }
    ic.restore();
   }
   // Fine dendritic sumi-e branching; geometry evolves with the audio envelope.
   if(frame%2===0){
    const branches=s.kind===1?3:5;
    for(let k=0;k<branches;k++){
     const a=s.seed*2.1+k*2.399963+s.age*.24;
     const root=reach*.2,tip=reach*(.62+.45*rand(s.seed+k));
     ic.strokeStyle=hue;ic.globalAlpha=alpha*.85;
     ic.lineWidth=Math.max(.4,s.radius*.055*(1-p));
     ic.beginPath();
     ic.moveTo(s.x+Math.cos(a)*root,s.y+Math.sin(a)*root*.8);
     ic.quadraticCurveTo(s.x+Math.cos(a+.32)*tip*.55,s.y+Math.sin(a+.32)*tip*.55,s.x+Math.cos(a)*tip,s.y+Math.sin(a)*tip*.8);
     ic.stroke();
    }
   }
   ic.globalAlpha=1;
  };
  const draw=(now:number)=>{
   raf=requestAnimationFrame(draw);
   const dt=Math.min(.045,(now-last)/1000);last=now;frame++;
   resize();
   const incoming=playingRef.current?musicRef.current.impulses.splice(0,96):[];
   if(incoming.length){
    if(!pending.length)batchStart=now;
    pending.push(...incoming);
   }
   if(pending.length&&now-batchStart>=42){drop(pending);pending=[];}
   const active=musicRef.current.notes.size;
   const audio=clamp(musicRef.current.audioEnergy);
   const recent=now-lastSound<450;
   const energized=playingRef.current&&(active>0||recent||audio>.09);
   // Silence evaporates all marks. A quiet connected piano without audio
   // still gets its envelope from held MIDI notes.
   const target=energized?1:0;
   fade+=(target-fade)*Math.min(1,dt*(energized?8:1.05));
   const opacity=clamp(fade);
   if(!energized&&opacity<.005){ic.clearRect(0,0,w,h);strokes.length=0;fade=0;}
   else{
    // Localized ink marks dissolve; no perpetual animation at rest.
    if(!energized){
     ic.save();ic.globalCompositeOperation='destination-out';ic.fillStyle='rgba(0,0,0,'+clamp(dt*.82)+')';ic.fillRect(0,0,w,h);ic.restore();
    }
    if(energized){
     const energy=Math.max(audio,active?Math.min(.5,active*.12):0);
     for(const s of strokes)if(s.age<s.life)mark(s,energy,dt);
    }
   }
   ctx.fillStyle='#fbfaf7';ctx.fillRect(0,0,w,h);
   // Fixed camera, subtle washi grain, generous unpainted paper.
   ctx.globalAlpha=opacity;
   ctx.drawImage(ink,0,0,w,h);
   ctx.globalAlpha=1;
   const grains=Math.min(1700,Math.floor(w*h/370));
   ctx.fillStyle='rgba(66,61,54,.035)';
   for(let i=0;i<grains;i++){
    const x=rand(i*3+2)*w,y=rand(i*7+5)*h;
    ctx.fillRect(x,y,.65,.65);
   }
  };
  resize();window.addEventListener('resize',resize);
  raf=requestAnimationFrame(draw);
  return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize);};
 },[canvasRef,musicRef]);
 return <canvas ref={canvasRef} style={{position:'absolute',inset:0,width:'100%',height:'100%',display:'block'}}/>;
}
