import {useEffect,useRef} from 'react';

type Gesture={note:number;velocity:number;time:number};
type Music={notes:Map<number,number>;pedal:boolean;last:number;connected:boolean;impulses:Gesture[];audioEnergy:number};
type Stroke={x:number;y:number;angle:number;length:number;width:number;hue:number;alpha:number;seed:number;born:number;kind:number};
const PIGMENTS=['#273943','#354b57','#46616b','#54716f','#6d7a66','#8b8069','#94745e','#8a6662','#7d626b','#686276','#535e75','#3b5366'];
const TAU=Math.PI*2;
function random(n:number){const v=Math.sin(n*127.1+78.233)*43758.5453;return v-Math.floor(v);}
function rgb(hex:string){return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];}
function brush(ctx:CanvasRenderingContext2D,s:Stroke,age:number){
 const fade=Math.max(0,1-age);
 if(fade<=0)return;
 const [r,g,b]=rgb(PIGMENTS[s.hue]);
 ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.angle);
 const w=s.width,l=s.length,seed=s.seed;
 // Soft wash, irregular capillary edges and restrained monochrome pigment.
 for(let layer=0;layer<5;layer++){
  const spread=1+layer*.19;
  ctx.beginPath();
  for(let i=0;i<=28;i++){
   const t=i/28,xx=(t-.5)*l;
   const edge=Math.sin(Math.PI*t)**.48;
   const noise=(random(seed+i*3+layer*89)-.5)*w*.29;
   const yy=-edge*w*spread+noise;
   if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);
  }
  for(let i=28;i>=0;i--){
   const t=i/28,xx=(t-.5)*l;
   const edge=Math.sin(Math.PI*t)**.48;
   const noise=(random(seed+i*7+layer*73)-.5)*w*.29;
   ctx.lineTo(xx,edge*w*spread+noise);
  }
  ctx.closePath();
  ctx.fillStyle='rgba('+r+','+g+','+b+','+(s.alpha*fade*(layer===0?.11:.034))+')';
  ctx.fill();
 }
 // Dry brush fibres: sparse, broken strokes, not uniform outlines.
 ctx.lineCap='round';
 for(let k=0;k<16;k++){
  const t=random(seed+k*11),off=(random(seed+k*13)-.5)*w*2.2;
  const start=(t-.5)*l,len=l*(.04+random(seed+k*19)*.24);
  ctx.beginPath();ctx.moveTo(start,off);
  ctx.quadraticCurveTo(start+len*.45,off+(random(seed+k*23)-.5)*w*.3,start+len,off+(random(seed+k*29)-.5)*w*.55);
  ctx.strokeStyle='rgba('+r+','+g+','+b+','+(s.alpha*fade*(.035+random(seed+k*31)*.12))+')';
  ctx.lineWidth=.25+random(seed+k*37)*1.25;ctx.stroke();
 }
 // Hairline branches connected to the same ink body.
 if(s.kind!==0)for(let k=0;k<5;k++){
  const t=(random(seed+k*41)-.5)*l*.8,side=k%2?1:-1;
  const h=w*(1.4+random(seed+k*43)*3);
  ctx.beginPath();ctx.moveTo(t,0);
  ctx.bezierCurveTo(t+l*.06,side*h*.35,t-l*.03,side*h*.8,t+l*.12,side*h);
  ctx.strokeStyle='rgba('+r+','+g+','+b+','+(s.alpha*fade*.13)+')';
  ctx.lineWidth=.35;ctx.stroke();
 }
 ctx.restore();
}
export default function SumiResonance({playing,canvasRef,musicRef}:{playing:boolean;canvasRef:React.RefObject<HTMLCanvasElement|null>;musicRef:React.RefObject<Music>}){
 const playingRef=useRef(playing);playingRef.current=playing;
 useEffect(()=>{
  const canvas=canvasRef.current;if(!canvas)return;
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return;
  const strokes:Stroke[]=[];
  let raf=0,last=performance.now(),lastNote=-Infinity,fade=0,sequence=0;
  let pending:Gesture[]=[];let pendingSince=0;
  const paper=document.createElement('canvas');paper.width=256;paper.height=256;
  const pc=paper.getContext('2d')!;
  pc.fillStyle='#faf9f5';pc.fillRect(0,0,256,256);
  const pixels=pc.getImageData(0,0,256,256);
  for(let i=0;i<pixels.data.length;i+=4){
   const n=(random(i*1.17)-.5)*15;
   pixels.data[i]=Math.max(0,250+n);
   pixels.data[i+1]=Math.max(0,249+n);
   pixels.data[i+2]=Math.max(0,245+n);
  }
  pc.putImageData(pixels,0,0);
  let width=1,height=1,dpr=1;
  function resize(){
   const rect=canvas!.getBoundingClientRect();
   const w=Math.max(1,rect.width),h=Math.max(1,rect.height);
   const ratio=Math.min(window.devicePixelRatio||1,1.5);
   if(w===width&&h===height&&ratio===dpr)return;
   width=w;height=h;dpr=ratio;
   canvas!.width=Math.round(w*ratio);canvas!.height=Math.round(h*ratio);
   ctx!.setTransform(ratio,0,0,ratio,0,0);
  }
  function commit(events:Gesture[],now:number){
   if(!events.length)return;
   sequence++;
   const weight=events.reduce((sum,e)=>sum+e.velocity,0)||1;
   const note=events.reduce((sum,e)=>sum*1+e.note*e.velocity,0)/weight;
   const pitch=Math.round(note)%12;
   const velocity=Math.min(1,weight/events.length/127);
   const spread=Math.max(...events.map(e=>e.note))-Math.min(...events.map(e=>e.note));
   const angle=(note-60)*.11+sequence*2.399963;
   const radius=Math.min(.16,.02+sequence*.009);
   const x=.5+Math.cos(angle)*radius;
   const y=.5+Math.sin(angle)*radius*.75;
   const count=4+Math.min(5,Math.floor(spread/6));
   for(let k=0;k<count;k++){
    const seed=sequence*101+k*17;
    const a=angle+Math.sin(k*2.4)*.65;
    const offset=(random(seed+1)-.5)*.045;
    strokes.push({
     x:x+Math.cos(a+Math.PI/2)*offset,
     y:y+Math.sin(a+Math.PI/2)*offset,
     angle:a,
     length:.09+velocity*.12+random(seed+2)*.1,
     width:.007+velocity*.009+random(seed+3)*.009,
     hue:pitch,alpha:.42+velocity*.42,seed,born:now,kind:k%3
    });
   }
   if(strokes.length>160)strokes.splice(0,strokes.length-160);
   lastNote=now;
  }
  function frame(now:number){
   raf=requestAnimationFrame(frame);
   if(now-last<30)return;
   const dt=Math.min(.08,(now-last)/1000);last=now;
   resize();
   const incoming=playingRef.current?musicRef.current.impulses.splice(0,96):[];
   if(incoming.length){
    if(!pending.length)pendingSince=now;
    pending.push(...incoming);
   }
   // Merge near-simultaneous notes into one composite ink gesture.
   if(pending.length&&now-pendingSince>=35){
    const batch=pending;pending=[];commit(batch,now);
   }
   const held=musicRef.current.notes.size>0;
   const audio=Math.max(0,Math.min(1,musicRef.current.audioEnergy));
   const active=playingRef.current&&(held||audio>.045||now-lastNote<350);
   const target=active?1:0;
   const rate=active?Math.min(1,dt*5):Math.min(1,dt*.7);
   fade+=(target-fade)*rate;
   if(fade<.004&&!pending.length&&!incoming.length){
    if(strokes.length)strokes.length=0;
    ctx!.drawImage(paper,0,0,width,height);
    return;
   }
   ctx!.drawImage(paper,0,0,width,height);
   const scale=Math.min(width,height)*1.85;
   ctx!.save();
   ctx!.translate(width*.5,height*.5);
   ctx!.scale(scale,scale);
   ctx!.translate(-.5,-.5);
   // Real audio controls wash breathing; no artificial motion at silence.
   const resonance=active?1+Math.min(.035,audio*.035):1;
   ctx!.translate(.5,.5);ctx!.scale(resonance,resonance);ctx!.translate(-.5,-.5);
   for(const s of strokes)brush(ctx!,s,1-fade);
   ctx!.restore();
  }
  raf=requestAnimationFrame(frame);
  return()=>cancelAnimationFrame(raf);
 },[canvasRef,musicRef]);
 return <canvas ref={canvasRef} style={{position:'absolute',inset:0,width:'100%',height:'100%',display:'block'}}/>;
}
