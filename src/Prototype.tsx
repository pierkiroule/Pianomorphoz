import {useEffect,useRef,useState} from 'react';

const STATES=[
 {name:'Do majeur · floraison',feed:.0367,kill:.0649,flow:.24},
 {name:'La mineur · condensation',feed:.022,kill:.051,flow:.12},
 {name:'Sol suspendu · étirement',feed:.03,kill:.062,flow:.19},
 {name:'Mi diminué · turbulence',feed:.046,kill:.065,flow:.58},
 {name:'Fa majeur 7 · ramification',feed:.028,kill:.062,flow:.33},
 {name:'Silence · décantation',feed:.022,kill:.056,flow:.07}
];
const N=180;
const buttonStyle:React.CSSProperties={border:'1px solid #cbd4d0',background:'#fffdf6e8',borderRadius:20,padding:'10px 13px',color:'#284044',fontWeight:600};
function PixelField({playing,onStats}:{playing:boolean;onStats:(step:number,fps:number)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const playingRef=useRef(playing);playingRef.current=playing;
 const statsRef=useRef(onStats);statsRef.current=onStats;
 useEffect(()=>{
  const target=canvas.current;if(!target)return;
  const ctx=target.getContext('2d',{alpha:false});if(!ctx)return;
  const buffer=document.createElement('canvas');buffer.width=N;buffer.height=N;
  const bc=buffer.getContext('2d',{alpha:false});if(!bc)return;
  const image=bc.createImageData(N,N);
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
  const resize=()=>{const r=target.getBoundingClientRect(),d=Math.min(window.devicePixelRatio||1,1.5);target.width=Math.max(1,Math.floor(r.width*d));target.height=Math.max(1,Math.floor(r.height*d));ctx.setTransform(d,0,0,d,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';};
  resize();window.addEventListener('resize',resize);
  const draw=(now:number)=>{
   raf=requestAnimationFrame(draw);
   const dt=Math.min(.05,(now-last)/1000);last=now;
   if(playingRef.current)elapsed+=dt;
   const step=Math.floor(elapsed/7)%STATES.length,state=STATES[step];
   if(playingRef.current){
    for(let iteration=0;iteration<2;iteration++){
     for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
      const i=y*N+x,aa=a[i],bb=b[i];
      const lapA=-aa+.2*(a[i-1]+a[i+1]+a[i-N]+a[i+N])+.05*(a[i-N-1]+a[i-N+1]+a[i+N-1]+a[i+N+1]);
      const lapB=-bb+.2*(b[i-1]+b[i+1]+b[i-N]+b[i+N])+.05*(b[i-N-1]+b[i-N+1]+b[i+N-1]+b[i+N+1]);
      const reaction=aa*bb*bb;
      nextA[i]=Math.max(0,Math.min(1,aa+.98*lapA-reaction+state.feed*(1-aa)));
      nextB[i]=Math.max(0,Math.min(1,bb+.48*lapB+reaction-(state.kill+state.feed)*bb));
     }
     [a,nextA]=[nextA,a];[b,nextB]=[nextB,b];
    }
    if(frame%16===0){
     const theta=elapsed*.48,px=Math.floor(N*(.5+.26*Math.cos(theta))),py=Math.floor(N*(.5+.26*Math.sin(theta*1.3)));
     for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
      const x=px+dx,y=py+dy;if(x>1&&x<N-2&&y>1&&y<N-2&&dx*dx+dy*dy<12)b[y*N+x]=.95;
     }
    }
   }
   const pix=image.data;
   for(let i=0;i<N*N;i++){
    const v=b[i],ink=Math.max(0,Math.min(1,(v-.025)*2.25)),grain=((i*37+Math.floor(i/N)*19)%17)/17;
    const p=i*4;
    pix[p]=Math.round(250-ink*224+grain*2);
    pix[p+1]=Math.round(248-ink*207+grain*2);
    pix[p+2]=Math.round(241-ink*194+grain*2);
    pix[p+3]=255;
   }
   bc.putImageData(image,0,0);
   const width=target.clientWidth,height=target.clientHeight;
   ctx.fillStyle='#faf8f1';ctx.fillRect(0,0,width,height);
   const size=Math.min(width,height)*.98;
   ctx.drawImage(buffer,(width-size)/2,(height-size)/2,size,size);
   frame++;count++;
   if(now-lastFps>1000){fps=Math.round(count*1000/(now-lastFps));count=0;lastFps=now;}
   if(now-lastStats>400){lastStats=now;statsRef.current(step,fps);}
  };
  raf=requestAnimationFrame(draw);
  return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize);};
 },[]);
 return <canvas ref={canvas} style={{position:'absolute',inset:0,width:'100%',height:'100%',display:'block'}}/>;
}
export default function Prototype(){
 const [playing,setPlaying]=useState(true),[step,setStep]=useState(0),[fps,setFps]=useState(0);
 return <main style={{position:'fixed',inset:0,overflow:'hidden',background:'#faf8f1',fontFamily:'system-ui,sans-serif',color:'#284044'}}>
  <PixelField playing={playing} onStats={(s,f)=>{setStep(s);setFps(f);}}/>
  <div style={{position:'absolute',top:14,left:14,right:14,display:'flex',justifyContent:'space-between',pointerEvents:'none'}}>
   <div style={{padding:'10px 13px',borderRadius:15,background:'#fffdf6e0'}}><strong style={{fontSize:12,letterSpacing:1}}>PIXEL VIVANT •°</strong><div style={{fontSize:11,opacity:.7}}>V5.1 · réaction-diffusion 2D</div></div>
   <div style={{fontSize:12,padding:11,borderRadius:15,background:'#fffdf6e0'}}>{fps} FPS</div>
  </div>
  <div style={{position:'absolute',bottom:16,left:14,right:14,display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
   <div style={{background:'#fffdf6ed',borderRadius:15,padding:'10px 13px'}}><div style={{fontSize:10,opacity:.6}}>HARMONIE SIMULÉE</div><strong style={{fontSize:13}}>{STATES[step].name}</strong></div>
   <button style={buttonStyle} onClick={()=>setPlaying(v=>!v)}>{playing?'Ⅱ Pause':'▶ Reprendre'}</button>
  </div>
 </main>;
}
