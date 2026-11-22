import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';

type Harmony={name:string;notes:number[];shape:number;twist:number;open:number;hue:number;energy:number};
const score:Harmony[]=[
 {name:'Do majeur',notes:[48,60,64,67,72],shape:0,twist:.12,open:1.1,hue:.48,energy:.55},
 {name:'La mineur',notes:[45,57,60,64,69],shape:1,twist:-.28,open:.77,hue:.64,energy:.48},
 {name:'Fa majeur 7',notes:[53,57,60,64,69],shape:0,twist:.17,open:1.3,hue:.34,energy:.62},
 {name:'Sol suspendu',notes:[43,55,60,62,67],shape:2,twist:.65,open:1.1,hue:.55,energy:.43},
 {name:'Mi diminué',notes:[52,55,58,64,70],shape:3,twist:1.1,open:.7,hue:.77,energy:.77},
 {name:'La mineur 7',notes:[45,52,55,60,64],shape:1,twist:-.24,open:.82,hue:.64,energy:.53},
 {name:'Sol 7',notes:[43,53,59,62,67],shape:3,twist:.72,open:1,hue:.08,energy:.78},
 {name:'Do majeur',notes:[48,55,60,64,72],shape:0,twist:.12,open:1.35,hue:.48,energy:.64},
 {name:'Silence',notes:[],shape:2,twist:0,open:1.2,hue:.55,energy:0}
];
const clamp=THREE.MathUtils.clamp, TAU=Math.PI*2;
function palette(pitch:number,hue:number){
 const h=(hue+(pitch%12)*.021)%1;
 return new THREE.Color().setHSL(h,.42,.58);
}
function LivingScene({playing,quality,onStep}:{playing:boolean;quality:number;onStep:(s:number,fps:number)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const refs=useRef({playing,quality,onStep});refs.current={playing,quality,onStep};
 useEffect(()=>{
  const el=canvas.current;if(!el)return;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#fbfaf7');
  scene.fog=new THREE.FogExp2('#fbfaf7',.014);
  const camera=new THREE.PerspectiveCamera(77,1,.08,170);
  const renderer=new THREE.WebGLRenderer({canvas:el,alpha:false,antialias:false,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  const strands:{mesh:THREE.Mesh;arr:Float32Array;mat:THREE.MeshBasicMaterial;index:number}[]=[];
  const COUNT=12,STEPS=88;
  for(let n=0;n<COUNT;n++){
   const arr=new Float32Array((STEPS+1)*2*3),colors=new Float32Array(arr.length),idx:number[]=[];
   for(let j=0;j<STEPS;j++){const k=j*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}
   const geometry=new THREE.BufferGeometry();
   geometry.setAttribute('position',new THREE.BufferAttribute(arr,3).setUsage(THREE.DynamicDrawUsage));
   geometry.setAttribute('color',new THREE.BufferAttribute(colors,3).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(idx);
   const mat=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,depthWrite:false,opacity:.8});
   const mesh=new THREE.Mesh(geometry,mat);mesh.frustumCulled=false;scene.add(mesh);strands.push({mesh,arr,mat,index:n});
  }
  let raf=0,last=performance.now(),time=0,travel=0,smoothed=0,frames=0,frameClock=last,fps=60;
  const resize=()=>{const w=el.clientWidth||innerWidth,h=el.clientHeight||innerHeight;renderer.setPixelRatio(Math.min(devicePixelRatio||1,refs.current.quality));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
  resize();addEventListener('resize',resize);
  const center=(z:number,shape:number,twist:number)=>new THREE.Vector3(Math.sin(z*.065+twist*.5)*(.85+shape*.13),Math.cos(z*.047+shape*.3)*.65+Math.sin(z*.023)*.55,z);
  const animate=(now:number)=>{
   raf=requestAnimationFrame(animate);
   const dt=Math.min(.04,(now-last)/1000);last=now;
   if(refs.current.playing)time+=dt;
   const beat=3.5;const slot=Math.floor(time/beat)%score.length;const next=(slot+1)%score.length;
   const phase=(time%beat)/beat;
   const ease=(v:number)=>v*v*(3-2*v);
   const mix=ease(clamp((phase-.65)/.35,0,1));
   const a=score[slot],b=score[next];
   const open=THREE.MathUtils.lerp(a.open,b.open,mix);
   const twist=THREE.MathUtils.lerp(a.twist,b.twist,mix);
   const shape=THREE.MathUtils.lerp(a.shape,b.shape,mix);
   const energy=THREE.MathUtils.lerp(a.energy,b.energy,mix);
   const notes=new Set([...a.notes,...b.notes].map(n=>n%12));
   smoothed+=(energy-smoothed)*Math.min(1,dt*2.5);
   travel+=dt*(2.4+smoothed*2.1)*(refs.current.playing?1:.16);
   const zCam=-travel,cc=center(zCam,shape,twist),look=center(zCam-8,shape,twist);
   camera.position.lerp(new THREE.Vector3(cc.x,cc.y,zCam+1.3),Math.min(1,dt*3.3));
   camera.lookAt(look);
   camera.rotation.z=Math.sin(zCam*.05+twist)*.055;
   for(const s of strands){
    const n=s.index,pa=a.notes.filter(p=>p%12===n),pb=b.notes.filter(p=>p%12===n);
    const weight=THREE.MathUtils.lerp(pa.length?1:0,pb.length?1:0,mix);
    const isOn=notes.has(n)&&weight>.008;
    s.mesh.visible=isOn;
    if(!isOn)continue;
    const pitch=(pa[0]??pb[0]??60);
    const base=palette(pitch,THREE.MathUtils.lerp(a.hue,b.hue,mix));
    const bright=base.clone().lerp(new THREE.Color('#fff4df'),.16+smoothed*.18);
    const glow=weight*(.35+.65*smoothed);
    s.mat.opacity=clamp(.15+glow*.68,0,.94);
    const theta=n/COUNT*TAU;
    for(let j=0;j<=STEPS;j++){
     const f=j/STEPS,z=zCam-2-f*92;
     const bend=theta+twist*f*2.8+Math.sin(f*7+time*.28+n*.6)*.12;
     const c=center(z,shape,twist);
     const radius=(1.6+open*1.12)*(1+.11*Math.sin(f*TAU*2+time*.35+n));
     const wobble=.08*Math.sin(f*21+time*1.3+n*1.7);
     const x=c.x+Math.cos(bend)*(radius+wobble),y=c.y+Math.sin(bend)*(radius+wobble);
     const gaps=Math.sin(f*TAU*(4+n%3)+n*2.6);
     const visible=gaps>-.62?1:0;
     const feather=Math.pow(Math.sin(Math.PI*f),.5);
     const width=(.009+.045*glow)*feather*visible*(1+.24*Math.sin(f*35+n));
     const k=j*6;
     s.arr[k]=x-Math.sin(bend)*width;s.arr[k+1]=y+Math.cos(bend)*width;s.arr[k+2]=z;
     s.arr[k+3]=x+Math.sin(bend)*width;s.arr[k+4]=y-Math.cos(bend)*width;s.arr[k+5]=z;
     const color=bright.clone().multiplyScalar(.7+.3*Math.sin(f*9+time*.8+n)**2);
     const colors=s.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
     for(let q=0;q<2;q++){colors.setXYZ(j*2+q,color.r,color.g,color.b);}
    }
    s.mesh.geometry.attributes.position.needsUpdate=true;
    s.mesh.geometry.attributes.color.needsUpdate=true;
   }
   renderer.render(scene,camera);
   frames++;if(now-frameClock>1000){fps=Math.round(frames*1000/(now-frameClock));frames=0;frameClock=now;}
   if(Math.floor(now/250)!==Math.floor((now-dt*1000)/250))refs.current.onStep(slot,fps);
  };
  raf=requestAnimationFrame(animate);
  return()=>{cancelAnimationFrame(raf);removeEventListener('resize',resize);for(const s of strands){s.mesh.geometry.dispose();s.mat.dispose();}renderer.dispose();};
 },[]);
 return <canvas ref={canvas} style={{position:'absolute',inset:0,width:'100%',height:'100%',display:'block'}}/>;
}
export default function Prototype(){
 const [playing,setPlaying]=useState(true),[step,setStep]=useState(0),[fps,setFps]=useState(0),[quality,setQuality]=useState(1.25),[info,setInfo]=useState(false);
 return <main style={{position:'fixed',inset:0,background:'#fbfaf7',color:'#283b3a',fontFamily:'system-ui,sans-serif',overflow:'hidden'}}>
  <LivingScene playing={playing} quality={quality} onStep={(s,f)=>{setStep(s);setFps(f);}}/>
  <div style={{position:'absolute',top:16,left:18,right:18,display:'flex',justifyContent:'space-between',alignItems:'start',pointerEvents:'none'}}>
   <div style={{background:'#fbfaf7b8',padding:'8px 12px',borderRadius:16,backdropFilter:'blur(8px)'}}><div style={{fontSize:12,letterSpacing:2,fontWeight:700}}>PIANO ROLL COASTER •°</div><div style={{fontSize:11,opacity:.7}}>Laboratoire morphogenèse musicale</div></div>
   <div style={{background:'#fbfaf7b8',padding:'8px 12px',borderRadius:16,fontSize:12}}>{fps} FPS</div>
  </div>
  <div style={{position:'absolute',bottom:20,left:16,right:16,display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
   <div style={{background:'#fbfaf7c9',backdropFilter:'blur(12px)',padding:'11px 14px',borderRadius:20,minWidth:120}}><div style={{fontSize:10,opacity:.65}}>HARMONIE</div><strong style={{fontSize:14}}>{score[step]?.name}</strong></div>
   <div style={{display:'flex',gap:8}}>
    <button onClick={()=>setPlaying(p=>!p)} style={btn}>{playing?'Ⅱ Pause':'▶ Voyage'}</button>
    <button onClick={()=>setInfo(v=>!v)} style={btn}>⚙</button>
   </div>
  </div>
  {info&&<div style={{position:'absolute',right:16,bottom:85,background:'#fffef0ed',padding:18,borderRadius:18,width:250,boxShadow:'0 12px 45px #3452'}}>
   <strong>Prototype visuel</strong><p style={{fontSize:12,lineHeight:1.5}}>Séquence harmonique simulée. 12 fibres réutilisées, trajectoire FPV, morphologies par accords. Sans MIDI, audio ni enregistrement.</p>
   <label style={{fontSize:12}}>Résolution GPU : {quality.toFixed(2)}×<input style={{width:'100%'}} type="range" min=".65" max="1.5" step=".05" value={quality} onChange={e=>setQuality(Number(e.target.value))}/></label>
   <button style={{...btn,marginTop:8}} onClick={()=>setInfo(false)}>Fermer</button>
  </div>}
 </main>;
}
const btn:React.CSSProperties={border:'1px solid #dae1dc',borderRadius:25,background:'#ffffffd9',color:'#244441',padding:'12px 17px',fontWeight:650,fontSize:13,backdropFilter:'blur(10px)'};
