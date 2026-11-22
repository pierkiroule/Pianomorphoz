import {useEffect,useRef,useState} from 'react';

type Mood={name:string;spread:number;branch:number;curl:number;ink:number};
const moods:Mood[]=[
 {name:'Do majeur · éclosion',spread:1.18,branch:.65,curl:.12,ink:.78},
 {name:'La mineur · contraction',spread:.68,branch:.3,curl:.42,ink:.9},
 {name:'Sol suspendu · étirement',spread:1.05,branch:1.0,curl:.25,ink:.64},
 {name:'Mi diminué · turbulence',spread:.82,branch:.85,curl:1.1,ink:.9},
 {name:'Fa majeur 7 · floraison',spread:1.35,branch:1.15,curl:.15,ink:.73},
 {name:'Silence · dépôt',spread:1,branch:.35,curl:.08,ink:.48}
];
const style:React.CSSProperties={border:'1px solid #d6d7d2',background:'#fffdf6dd',borderRadius:20,padding:'10px 14px',color:'#283c3b',fontWeight:600};
const TAU=Math.PI*2;
function Ink({playing,quality,onStatus}:{playing:boolean;quality:number;onStatus:(i:number,f:number)=>void}){
 const ref=useRef<HTMLCanvasElement>(null);
 const live=useRef({playing,quality,onStatus});live.current={playing,quality,onStatus};
 useEffect(()=>{
  const canvas=ref.current;if(!canvas)return;
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return;
  const layer=document.createElement('canvas'),lc=layer.getContext('2d',{alpha:true});
  if(!lc)return;
  let w=0,h=0,dpr=1,raf=0,last=performance.now(),time=0,frames=0,fps=60,clock=last,lastStatus=0,frame=0,applied=-1;
  const resize=()=>{
   const rect=canvas.getBoundingClientRect();w=Math.max(1,rect.width);h=Math.max(1,rect.height);
   dpr=Math.min(window.devicePixelRatio||1,live.current.quality);
   const pw=Math.round(w*dpr),ph=Math.round(h*dpr);
   if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;layer.width=pw;layer.height=ph;}
   ctx.setTransform(dpr,0,0,dpr,0,0);lc.setTransform(dpr,0,0,dpr,0,0);applied=live.current.quality;
  };
  resize();window.addEventListener('resize',resize);
  const render=(now:number)=>{
   raf=requestAnimationFrame(render);
   const dt=Math.min(.045,(now-last)/1000);last=now;
   if(live.current.playing)time+=dt;
   if(applied!==live.current.quality)resize();
   const duration=5.5,idx=Math.floor(time/duration)%moods.length;
   const progress=(time%duration)/duration;
   const t=Math.max(0,Math.min(1,(progress-.55)/.45)),blend=t*t*(3-2*t);
   const a=moods[idx],b=moods[(idx+1)%moods.length];
   const mix=(key:'spread'|'branch'|'curl'|'ink')=>a[key]*(1-blend)+b[key]*blend;
   const cx=w*.5,cy=h*.51,scale=Math.min(w,h)*.28;
   // A fading pigment memory: never a hard reset between harmonies.
   lc.save();lc.globalCompositeOperation='destination-out';lc.fillStyle='rgba(0,0,0,.012)';lc.fillRect(0,0,w,h);lc.restore();
   const radial=(angle:number)=>{
    const petals=Math.sin(angle*5+time*.14)*.15+Math.sin(angle*9-time*.19)*.09;
    const grain=Math.sin(angle*17+time*.26)*.045+Math.sin(angle*31-time*.13)*.025;
    const fold=Math.sin(angle*3-time*.3)*mix('curl')*.16;
    return scale*mix('spread')*(.57+petals+grain+fold);
   };
   const points=240;
   // Soft translucent washes form the living body.
   for(let wash=3;wash>=0;wash--){
    lc.beginPath();
    for(let j=0;j<=points;j++){
     const angle=j/points*TAU;
     const r=radial(angle)*(1+wash*.10)+Math.sin(angle*13+time*.55+wash)*scale*.024;
     const x=cx+Math.cos(angle)*r,y=cy+Math.sin(angle)*r*.86;
     if(j===0)lc.moveTo(x,y);else lc.lineTo(x,y);
    }
    lc.closePath();
    lc.fillStyle=wash===0?'rgba(24,35,39,.042)':wash===1?'rgba(28,60,66,.019)':wash===2?'rgba(61,111,114,.014)':'rgba(152,118,77,.009)';
    lc.fill();
    if(wash===0){lc.strokeStyle='rgba(17,37,43,.075)';lc.lineWidth=.8;lc.stroke();}
   }
   // Capillary dendrites grow from the same organism, never random decorative particles.
   const branches=Math.round(18+mix('branch')*28);
   for(let i=0;i<branches;i++){
    const angle=i/branches*TAU+Math.sin(i*8.31)*.07;
    const base=radial(angle)*(.48+.18*Math.sin(i*2.7));
    const len=scale*(.24+mix('branch')*.43)*(.6+.4*Math.sin(i*9.1)**2);
    const seed=i*7.137;
    lc.beginPath();
    for(let j=0;j<=32;j++){
     const f=j/32,turn=Math.sin(f*5+seed+time*.38)*.16+mix('curl')*f*f*.28;
     const rr=base+len*f;
     const x=cx+Math.cos(angle+turn)*rr,y=cy+Math.sin(angle+turn)*rr*.86;
     if(j===0)lc.moveTo(x,y);else lc.lineTo(x,y);
    }
    lc.lineWidth=.35+(i%4)*.14;lc.strokeStyle=i%7===0?'rgba(130,101,68,.08)':'rgba(19,47,53,.12)';lc.stroke();
    if(i%3===0){
     const f=.66,turn=Math.sin(f*5+seed+time*.38)*.16+mix('curl')*f*f*.28,rr=base+len*f;
     const bx=cx+Math.cos(angle+turn)*rr,by=cy+Math.sin(angle+turn)*rr*.86;
     lc.beginPath();lc.moveTo(bx,by);
     lc.quadraticCurveTo(bx+Math.cos(angle+1)*len*.3,by+Math.sin(angle+1)*len*.3,bx+Math.cos(angle+.55)*len*.6,by+Math.sin(angle+.55)*len*.5);
     lc.lineWidth=.45;lc.strokeStyle='rgba(26,51,54,.1)';lc.stroke();
    }
   }
   // Ink nucleus: an evolving coherent blot with turbulent contour.
   lc.beginPath();
   for(let j=0;j<=points;j++){
    const angle=j/points*TAU;
    const noise=Math.sin(angle*7+time*.45)*.13+Math.sin(angle*13-time*.3)*.075+Math.sin(angle*27+time*.22)*.03;
    const radius=scale*(.26+.15*mix('ink'))*(1+noise+Math.sin(angle*3+time*.4)*mix('curl')*.17);
    const x=cx+Math.cos(angle)*radius,y=cy+Math.sin(angle)*radius*.86;
    if(j===0)lc.moveTo(x,y);else lc.lineTo(x,y);
   }
   lc.closePath();lc.fillStyle='rgba(12,27,33,.08)';lc.fill();
   // Paper stays white; pigment history slowly evaporates.
   ctx.fillStyle='#fbfaf6';ctx.fillRect(0,0,w,h);
   ctx.drawImage(layer,0,0,w,h);
   // A few crisp fresh contours on top of the accumulated pigment.
   ctx.beginPath();
   for(let j=0;j<=points;j++){
    const angle=j/points*TAU,r=radial(angle)*.74;
    const x=cx+Math.cos(angle)*r,y=cy+Math.sin(angle)*r*.86;
    if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
   }
   ctx.closePath();ctx.lineWidth=.65;ctx.strokeStyle='rgba(21,41,46,.2)';ctx.stroke();
   frames++;frame++;
   if(now-clock>1000){fps=Math.round(frames*1000/(now-clock));frames=0;clock=now;}
   if(now-lastStatus>300){lastStatus=now;live.current.onStatus(idx,fps);}
  };
  raf=requestAnimationFrame(render);
  return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize);};
 },[]);
 return <canvas ref={ref} style={{position:'absolute',inset:0,width:'100%',height:'100%',display:'block'}}/>;
}
export default function Prototype(){
 const [playing,setPlaying]=useState(true),[quality,setQuality]=useState(1),[step,setStep]=useState(0),[fps,setFps]=useState(0),[settings,setSettings]=useState(false);
 return <main style={{position:'fixed',inset:0,overflow:'hidden',background:'#fbfaf6',fontFamily:'system-ui,sans-serif',color:'#293e3e'}}>
  <Ink playing={playing} quality={quality} onStatus={(s,f)=>{setStep(s);setFps(f);}}/>
  <div style={{position:'absolute',top:15,left:15,right:15,display:'flex',justifyContent:'space-between',pointerEvents:'none'}}>
   <div style={{padding:'10px 13px',background:'#fffdf6c8',borderRadius:15,backdropFilter:'blur(8px)'}}>
    <strong style={{fontSize:12,letterSpacing:1.3}}>ENCRE RÉSONANTE •°</strong>
    <div style={{fontSize:11,opacity:.7}}>Morphogenèse picturale · 2D · V4</div>
   </div>
   <div style={{fontSize:12,padding:11,background:'#fffdf6c8',borderRadius:13}}>{fps} FPS</div>
  </div>
  <div style={{position:'absolute',bottom:16,left:15,right:15,display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
   <div style={{padding:'10px 13px',background:'#fffdf6dc',borderRadius:15,backdropFilter:'blur(8px)'}}>
    <div style={{fontSize:10,opacity:.65}}>HARMONIE</div><strong style={{fontSize:13}}>{moods[step].name}</strong>
   </div>
   <div style={{display:'flex',gap:7}}><button style={style} onClick={()=>setPlaying(v=>!v)}>{playing?'Ⅱ Pause':'▶ Reprendre'}</button><button style={style} onClick={()=>setSettings(v=>!v)}>⚙</button></div>
  </div>
  {settings&&<div style={{position:'absolute',bottom:80,right:15,padding:16,width:235,maxWidth:'calc(100vw - 30px)',borderRadius:17,background:'#fffdf6f3',boxShadow:'0 8px 35px #3453'}}>
   <strong>Laboratoire 2D</strong><p style={{fontSize:12,lineHeight:1.5}}>Une seule tache organique. Mémoire du pigment, diffusion, ramifications, éclosion et contraction. Accords simulés, sans MIDI ni audio.</p>
   <label style={{fontSize:12}}>Résolution : {quality.toFixed(2)}×<input type="range" min=".5" max="1.5" step=".05" value={quality} onChange={e=>setQuality(Number(e.target.value))} style={{width:'100%'}}/></label>
   <button style={{...style,marginTop:9}} onClick={()=>setSettings(false)}>Fermer</button>
  </div>}
 </main>;
}
