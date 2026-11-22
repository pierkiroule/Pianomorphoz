import {useEffect,useRef,useState} from 'react';

const STATES=[
 {name:'Do majeur · floraison',feed:.0367,kill:.0649,flow:.24},
 {name:'La mineur · condensation',feed:.022,kill:.051,flow:.12},
 {name:'Sol suspendu · étirement',feed:.03,kill:.062,flow:.19},
 {name:'Mi diminué · turbulence',feed:.046,kill:.065,flow:.58},
 {name:'Fa majeur 7 · ramification',feed:.028,kill:.062,flow:.33},
 {name:'Silence · décantation',feed:.022,kill:.056,flow:.07}
];
const N=240;
const buttonStyle:React.CSSProperties={border:'1px solid #cbd4d0',background:'#fffdf6e8',borderRadius:20,padding:'10px 13px',color:'#284044',fontWeight:600};
function PixelField({playing,onStats,canvasRef,musicRef}:{playing:boolean;onStats:(step:number,fps:number)=>void;canvasRef:React.RefObject<HTMLCanvasElement|null>;musicRef:React.RefObject<{notes:Map<number,number>;pedal:boolean;last:number;connected:boolean}>}){
 const canvas=canvasRef;
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
  const pigment=new Float32Array(N*N),membrane=new Float32Array(N*N),wet=new Float32Array(N*N);
  const resize=()=>{const r=target.getBoundingClientRect(),d=Math.min(window.devicePixelRatio||1,1.5);target.width=Math.max(1,Math.floor(r.width*d));target.height=Math.max(1,Math.floor(r.height*d));ctx.setTransform(d,0,0,d,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';};
  resize();window.addEventListener('resize',resize);
  const draw=(now:number)=>{
   raf=requestAnimationFrame(draw);
   const dt=Math.min(.05,(now-last)/1000);last=now;
   if(playingRef.current)elapsed+=dt;
   const active=[...musicRef.current.notes.entries()];
   const pitches=active.map(([n])=>n),velocity=active.reduce((sum,[,v])=>sum+v,0)/Math.max(1,active.length)/127;
   const pcs=new Set(pitches.map(n=>n%12));
   const root=pitches.length?Math.min(...pitches)%12:0;
   const has=(intervals:number[])=>[...pcs].some(r=>intervals.every(i=>pcs.has((r+i)%12)));
   const major=has([0,4,7]),minor=has([0,3,7]);
   const diminished=has([0,3,6]),suspended=(has([0,5,7])||has([0,2,7]))&&!major&&!minor;
   const midiStep=major?0:minor?1:diminished?3:suspended?2:pitches.length?4:5;
   const step=musicRef.current.connected?midiStep:Math.floor(elapsed/7)%STATES.length;
   const state=STATES[step];
   const energy=musicRef.current.connected?Math.min(1,velocity+.12*active.length):.42;
   if(playingRef.current){
    for(let iteration=0;iteration<2;iteration++){
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
    if(frame%(musicRef.current.connected?Math.max(5,Math.round(22-energy*17)):16)===0){
     const theta=elapsed*.48,angle=musicRef.current.connected?(root/12*Math.PI*2+elapsed*.1):theta;
     const px=Math.floor(N*(.5+.26*Math.cos(angle))),py=Math.floor(N*(.5+.26*Math.sin(angle*1.3)));
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
    pigment[i]=pigment[i]*.992+density*.008;
    wet[i]=wet[i]*.991+Math.max(0,1-grad*9)*density*.009;
    membrane[i]=membrane[i]*.96+(boundary+micro*.32)*.04;
    const mist=Math.max(0,Math.min(1,(v*.75+pigment[i]*.22+Math.sin(xx*8+yy*9+t*.1)*.012)));
    const edge=Math.min(1,grad*3.8);
    const capillary=Math.pow(Math.max(0,Math.sin(x*.51+Math.sin(y*.027+t*.06)*4)*Math.sin(y*.43+Math.cos(x*.033-t*.05)*4)),13)*density;
    const dark=Math.min(1,density*.77+membrane[i]*.48+edge*.24+capillary*.17+wet[i]*.12);
    const gold=Math.min(1,(Math.sin(xx*8+yy*13+t*.09)+1)*.5*membrane[i]*.65);
    const grain=((x*73+y*131+x*y*17)%101)/101-.5;
    const bloom=Math.pow(Math.max(0,1-Math.abs(Math.sin((xx*xx+yy*yy)*330+swirl*3+t*.15))),18)*density*.09;
    const p=i*4;
    pix[p]=Math.max(0,Math.min(255,250-dark*212+gold*42+bloom*36+grain*2));
    pix[p+1]=Math.max(0,Math.min(255,248-dark*190+mist*7+gold*15+bloom*24+grain*2));
    pix[p+2]=Math.max(0,Math.min(255,242-dark*169+mist*13-gold*19+grain*2));
    pix[p+3]=255;
   }
   bc.putImageData(image,0,0);
   const width=target.clientWidth,height=target.clientHeight;
   ctx.fillStyle='#faf8f1';ctx.fillRect(0,0,width,height);
   const size=Math.min(width,height)*.98;
   ctx.drawImage(buffer,(width-size)/2,(height-size)/2,size,size);
   // Fine, deterministic pigment fibers at display resolution, independent of simulation pixels.
   ctx.save();ctx.globalCompositeOperation='multiply';
   for(let j=0;j<220;j++){
    const seed=j*2.399963229728653,rr=Math.sqrt((j+.5)/220)*size*.43;
    const x=width/2+Math.cos(seed)*rr,y=height/2+Math.sin(seed)*rr;
    const gx=Math.floor((x-(width-size)/2)/size*N),gy=Math.floor((y-(height-size)/2)/size*N);
    if(gx<0||gx>=N||gy<0||gy>=N||b[gy*N+gx]<.06)continue;
    const len=2+Math.abs(Math.sin(j*9.3))*size*.025;
    ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+Math.cos(seed+elapsed*.07)*len*.3,y+Math.sin(seed)*len*.3,x+Math.cos(seed+elapsed*.07)*len*.7,y+Math.sin(seed+1)*len*.7,x+Math.cos(seed+elapsed*.07)*len,y+Math.sin(seed+1)*len);
    ctx.strokeStyle=j%9===0?'rgba(143,99,55,.12)':'rgba(24,58,67,.12)';ctx.lineWidth=.35;ctx.stroke();
   }
   ctx.restore();
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
 const [midiStatus,setMidiStatus]=useState('Démo automatique'),[recording,setRecording]=useState(false),[recorded,setRecorded]=useState('');
 const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[deviceId,setDeviceId]=useState(''),[recordStatus,setRecordStatus]=useState('');
 const canvasRef=useRef<HTMLCanvasElement>(null);
 const musicRef=useRef({notes:new Map<number,number>(),pedal:false,last:0,connected:false});
 const midiAccessRef=useRef<MIDIAccess|null>(null),recorderRef=useRef<MediaRecorder|null>(null),streamRef=useRef<MediaStream|null>(null);
 useEffect(()=>()=>{if(recorded)URL.revokeObjectURL(recorded);},[recorded]);
 useEffect(()=>()=>{midiAccessRef.current?.inputs.forEach(input=>{input.onmidimessage=null;});if(recorderRef.current?.state==='recording')recorderRef.current.stop();streamRef.current?.getTracks().forEach(t=>t.stop());},[]);
 async function connectMidi(){
  try{
   if(!navigator.requestMIDIAccess)throw Error('Web MIDI indisponible. Utiliser Chrome ou Edge.');
   const access=await navigator.requestMIDIAccess();midiAccessRef.current=access;
   const bind=()=>{
    let count=0;
    access.inputs.forEach(input=>{count++;input.onmidimessage=(event)=>{
     const data=event.data;if(!data)return;
     const command=data[0]&240,n=data[1],v=data[2];
     if(command===144&&v>0)musicRef.current.notes.set(n,v);
     if(command===128||(command===144&&v===0))musicRef.current.notes.delete(n);
     if(command===176&&n===64)musicRef.current.pedal=v>=64;
     musicRef.current.last=performance.now();
    };});
    musicRef.current.connected=count>0;setMidiStatus(count?count+' entrée(s) MIDI active(s)':'Aucune entrée MIDI détectée');
   };bind();access.onstatechange=bind;
  }catch(error){setMidiStatus(String(error));}
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
   recorder.onstop=()=>{const blob=new Blob(chunks,{type:recorder.mimeType||'video/webm'});const url=URL.createObjectURL(blob);setRecorded(old=>{if(old)URL.revokeObjectURL(old);return url;});stream.getTracks().forEach(t=>t.stop());streamRef.current=null;setRecording(false);setRecordStatus('Enregistrement terminé · fichier disponible');};
   recorderRef.current=recorder;recorder.start(1000);setRecording(true);
  }catch(error){setRecordStatus('Enregistrement : '+String(error));setRecording(false);}
 }
 return <main style={{position:'fixed',inset:0,overflow:'hidden',background:'#faf8f1',fontFamily:'system-ui,sans-serif',color:'#284044'}}>
  <PixelField playing={playing} canvasRef={canvasRef} musicRef={musicRef} onStats={(s,f)=>{setStep(s);setFps(f);}}/>
  <div style={{position:'absolute',top:14,left:14,right:14,display:'flex',justifyContent:'space-between',pointerEvents:'none'}}>
   <div style={{padding:'10px 13px',borderRadius:15,background:'#fffdf6e0'}}><strong style={{fontSize:12,letterSpacing:1}}>AQUARELLE VIVANTE •°</strong><div style={{fontSize:11,opacity:.7}}>V7 · matière organique résonante</div></div>
   <div style={{fontSize:12,padding:11,borderRadius:15,background:'#fffdf6e0'}}>{fps} FPS</div>
  </div>
  <div style={{position:'absolute',bottom:16,left:14,right:14,display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
   <div style={{background:'#fffdf6ed',borderRadius:15,padding:'10px 13px'}}><div style={{fontSize:10,opacity:.6}}>{musicRef.current.connected?'HARMONIE MIDI':'HARMONIE SIMULÉE'}</div><strong style={{fontSize:13}}>{STATES[step].name}</strong></div>
   <div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'flex-end'}}><button style={buttonStyle} onClick={connectMidi}>MIDI</button><button style={buttonStyle} onClick={selectAudio}>Audio</button><button style={buttonStyle} onClick={toggleRecording}>{recording?'■ Stop vidéo':'● Vidéo'}</button><button style={buttonStyle} onClick={()=>setPlaying(v=>!v)}>{playing?'Ⅱ':'▶'}</button></div>
  </div>
  <div style={{position:'absolute',top:70,left:14,fontSize:11,background:'#fffdf6d9',padding:'5px 9px',borderRadius:10}}>{midiStatus} · <a href='?studio=1' style={{color:'#284044'}}>Studio historique</a></div>
  {devices.length>0&&<div style={{position:'absolute',top:100,left:14,background:'#fffdf6ed',padding:8,borderRadius:12,maxWidth:'85vw'}}><label style={{fontSize:11}}>Source audio <select value={deviceId} onChange={e=>setDeviceId(e.target.value)}><option value=''>Microphone par défaut</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||'Entrée audio'}</option>)}</select></label></div>}
  {recordStatus&&<div style={{position:'absolute',top:150,left:14,fontSize:11,background:'#fffdf6ed',padding:'5px 9px',borderRadius:9,maxWidth:'80vw'}}>{recordStatus}</div>}
  {recorded&&<a href={recorded} download={'aquarelle-vivante-'+Date.now()+'.webm'} style={{position:'absolute',top:185,left:14,...buttonStyle,textDecoration:'none',fontSize:12}}>Télécharger la vidéo WebM</a>}
 </main>;
}
