import {useEffect,useRef,useState} from 'react';

const STATES=[
 {name:'Do majeur · floraison',feed:.0367,kill:.0649,flow:.24},
 {name:'La mineur · condensation',feed:.022,kill:.051,flow:.12},
 {name:'Sol suspendu · étirement',feed:.03,kill:.062,flow:.19},
 {name:'Mi diminué · turbulence',feed:.046,kill:.065,flow:.58},
 {name:'Fa majeur 7 · ramification',feed:.028,kill:.062,flow:.33},
 {name:'Silence · décantation',feed:.022,kill:.056,flow:.07}
];
const N=192;
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
  const pigment=new Float32Array(N*N),membrane=new Float32Array(N*N);
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
    pigment[i]=pigment[i]*.994+density*.006;
    membrane[i]=membrane[i]*.96+(boundary+micro*.32)*.04;
    const mist=Math.max(0,Math.min(1,(v*.75+pigment[i]*.22+Math.sin(xx*8+yy*9+t*.1)*.012)));
    const edge=Math.min(1,grad*3.8);
    const dark=Math.min(1,density*.81+membrane[i]*.58+edge*.18);
    const gold=Math.min(1,(Math.sin(xx*8+yy*13+t*.09)+1)*.5*membrane[i]*.65);
    const grain=((x*73+y*131+x*y*17)%101)/101-.5;
    const p=i*4;
    pix[p]=Math.max(0,Math.min(255,250-dark*212+gold*42+grain*2));
    pix[p+1]=Math.max(0,Math.min(255,248-dark*190+mist*7+gold*15+grain*2));
    pix[p+2]=Math.max(0,Math.min(255,242-dark*169+mist*13-gold*19+grain*2));
    pix[p+3]=255;
   }
   bc.putImageData(image,0,0);
   const width=target.clientWidth,height=target.clientHeight;
   ctx.fillStyle='#faf8f1';ctx.fillRect(0,0,width,height);
   const size=Math.min(width,height)*.98;
   ctx.drawImage(buffer,(width-size)/2,(height-size)/2,size,size);
   // Optical diffusion: a soft large-scale veil, then the sharp microstructure.
   ctx.save();ctx.globalAlpha=.16;ctx.filter='blur(12px)';ctx.drawImage(buffer,(width-size)/2,(height-size)/2,size,size);ctx.restore();
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
   <div style={{padding:'10px 13px',borderRadius:15,background:'#fffdf6e0'}}><strong style={{fontSize:12,letterSpacing:1}}>MATIÈRES VIVANTES •°</strong><div style={{fontSize:11,opacity:.7}}>V6 · encre / eau / huile / alcool</div></div>
   <div style={{fontSize:12,padding:11,borderRadius:15,background:'#fffdf6e0'}}>{fps} FPS</div>
  </div>
  <div style={{position:'absolute',bottom:16,left:14,right:14,display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
   <div style={{background:'#fffdf6ed',borderRadius:15,padding:'10px 13px'}}><div style={{fontSize:10,opacity:.6}}>HARMONIE SIMULÉE</div><strong style={{fontSize:13}}>{STATES[step].name}</strong></div>
   <button style={buttonStyle} onClick={()=>setPlaying(v=>!v)}>{playing?'Ⅱ Pause':'▶ Reprendre'}</button>
  </div>
 </main>;
}
