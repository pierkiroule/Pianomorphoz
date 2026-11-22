import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';

const harmonies=[
 {name:'Do majeur',open:1.25,twist:.12,fold:.15,hue:.47,energy:.72},
 {name:'La mineur',open:.68,twist:-.42,fold:.85,hue:.66,energy:.55},
 {name:'Fa majeur 7',open:1.42,twist:.25,fold:.26,hue:.34,energy:.76},
 {name:'Sol suspendu',open:1.08,twist:.7,fold:.65,hue:.55,energy:.56},
 {name:'Mi diminué',open:.66,twist:1.28,fold:1.15,hue:.78,energy:.84},
 {name:'La mineur 7',open:.78,twist:-.36,fold:.8,hue:.65,energy:.58},
 {name:'Sol 7',open:1.05,twist:.9,fold:.9,hue:.09,energy:.85},
 {name:'Do majeur',open:1.48,twist:.12,fold:.12,hue:.47,energy:.84},
 {name:'Silence',open:1.25,twist:0,fold:.12,hue:.47,energy:.08}
];
const vertex=`
precision mediump float;
uniform float uTime,uTravel,uOpen,uTwist,uFold,uEnergy,uIndex;
varying vec2 vUv;
varying float vDepth,vLight;
void main(){
 vUv=uv;
 float t=uv.y;
 float az=uIndex*1.04719755+uTwist*t*3.6+sin(t*12.0+uTime*.34+uIndex)*.23;
 float bloom=pow(abs(sin(t*8.8-uTime*.25+uIndex*.72)),1.7);
 float radius=(2.5+uOpen*2.3)*(1.0+.30*bloom);
 float width=(.14+1.45*bloom+.42*uFold)*sin(3.14159265*t);
 float wave=sin(t*25.0+uTime*.7+uIndex*2.0)*.22;
 float fold=sin(uv.x*3.14159*2.0+t*16.0+uTime*.45)*uFold*.36;
 float x=cos(az)*(radius+wave)+cos(az+1.57)*(uv.x-.5)*width;
 float y=sin(az)*(radius+wave)+sin(az+1.57)*(uv.x-.5)*width+fold;
 float z=-5.0-t*100.0;
 x+=sin(z*.057+uTravel*.035)*1.3;
 y+=cos(z*.046+uTravel*.02)*.9;
 vec3 p=vec3(x,y,z);
 vDepth=t;
 vLight=.55+.45*sin(t*15.0+uIndex+uTime*.3);
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
}`;
const fragment=`
precision mediump float;
uniform float uTime,uHue,uEnergy,uIndex;
varying vec2 vUv;
varying float vDepth,vLight;
vec3 hsl2rgb(vec3 c){
 vec3 rgb=clamp(abs(mod(c.x*6.0+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.);
 rgb=rgb*rgb*(3.-2.*rgb);
 return c.z+c.y*(rgb-.5)*(1.-abs(2.*c.z-1.));
}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
}
void main(){
 float edge=abs(vUv.x-.5)*2.;
 float grain=noise(vec2(vUv.x*19.+uIndex*7.,vUv.y*160.+uTime*.1));
 float vein=sin(vUv.y*96.+sin(vUv.x*15.+uTime*.15)*3.);
 float border=smoothstep(.48,.98,edge);
 float alpha=(.13+.36*border+.13*grain+.10*vein)*(.3+.7*uEnergy);
 alpha*=smoothstep(0.,.08,vUv.y)*(1.-smoothstep(.84,1.,vUv.y));
 alpha*=1.-smoothstep(.35,1.,vDepth)*.75;
 alpha*=1.-smoothstep(.90,1.,edge)*.3;
 vec3 ink=hsl2rgb(vec3(fract(uHue+uIndex*.065),.34+.12*grain,.55+.12*vLight));
 vec3 ivory=vec3(.985,.978,.963);
 vec3 color=mix(ivory,ink,.58+.32*border+.12*grain);
 gl_FragColor=vec4(color,clamp(alpha,0.,.72));
}`;
const buttonStyle:React.CSSProperties={border:'1px solid #d9ddd7',background:'#fffdf5dc',borderRadius:22,padding:'11px 15px',color:'#2d4444',fontWeight:600,backdropFilter:'blur(10px)'};
function Artwork({playing,quality,onStatus}:{playing:boolean;quality:number;onStatus:(n:number,f:number)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const live=useRef({playing,quality,onStatus});live.current={playing,quality,onStatus};
 useEffect(()=>{
  const el=canvas.current;if(!el)return;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#fbfaf7');scene.fog=new THREE.FogExp2('#fbfaf7',.009);
  const camera=new THREE.PerspectiveCamera(78,1,.1,140);
  const renderer=new THREE.WebGLRenderer({canvas:el,antialias:false,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  const surfaces:THREE.Mesh[]=[];
  const geometry=new THREE.PlaneGeometry(1,1,9,126);
  geometry.translate(0,.5,0);
  const common={uTime:{value:0},uTravel:{value:0},uOpen:{value:1},uTwist:{value:0},uFold:{value:0},uEnergy:{value:.5},uHue:{value:.5}};
  for(let i=0;i<6;i++){
   const uniforms={...Object.fromEntries(Object.entries(common).map(([k,v])=>[k,{value:v.value}])),uIndex:{value:i}};
   const mat=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.NormalBlending});
   const mesh=new THREE.Mesh(geometry,mat);mesh.frustumCulled=false;scene.add(mesh);surfaces.push(mesh);
  }
  const filaments:THREE.Mesh[]=[];
  const lineGeo=new THREE.PlaneGeometry(1,1,1,126);lineGeo.translate(0,.5,0);
  for(let i=0;i<6;i++){
   const uniforms={...Object.fromEntries(Object.entries(common).map(([k,v])=>[k,{value:v.value}])),uIndex:{value:i+.12}};
   const mat=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide});
   const mesh=new THREE.Mesh(lineGeo,mat);mesh.frustumCulled=false;scene.add(mesh);filaments.push(mesh);
  }
  let time=0,travel=0,last=performance.now(),raf=0,frames=0,frameClock=last,fps=60,lastStatus=0;
  const resize=()=>{const w=el.clientWidth||window.innerWidth,h=el.clientHeight||window.innerHeight;renderer.setPixelRatio(Math.min(devicePixelRatio||1,live.current.quality));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
  resize();window.addEventListener('resize',resize);
  const render=(now:number)=>{
   raf=requestAnimationFrame(render);
   const dt=Math.min(.04,(now-last)/1000);last=now;
   if(live.current.playing){time+=dt;travel+=dt*2.2;}
   const duration=4.1,idx=Math.floor(time/duration)%harmonies.length;
   const phase=(time%duration)/duration;
   const smooth=(v:number)=>v*v*(3-2*v);
   const blend=smooth(THREE.MathUtils.clamp((phase-.62)/.38,0,1));
   const a=harmonies[idx],b=harmonies[(idx+1)%harmonies.length];
   const lerp=(key:keyof typeof a)=>THREE.MathUtils.lerp(a[key] as number,b[key] as number,blend);
   const camZ=-travel;
   camera.position.set(Math.sin(camZ*.055)*1.3,Math.cos(camZ*.044)*.9,camZ);
   camera.lookAt(Math.sin((camZ-11)*.055)*1.3,Math.cos((camZ-11)*.044)*.9,camZ-11);
   camera.rotation.z=Math.sin(camZ*.035)*.075;
   for(const mesh of [...surfaces,...filaments]){
    const u=(mesh.material as THREE.ShaderMaterial).uniforms;
    u.uTime.value=time;u.uTravel.value=travel;u.uOpen.value=lerp('open');
    u.uTwist.value=lerp('twist');u.uFold.value=lerp('fold');u.uEnergy.value=lerp('energy');
    u.uHue.value=lerp('hue');
    mesh.position.z=camZ;
   }
   renderer.render(scene,camera);
   frames++;if(now-frameClock>1000){fps=Math.round(frames*1000/(now-frameClock));frames=0;frameClock=now;}
   if(now-lastStatus>300){lastStatus=now;live.current.onStatus(idx,fps);}
  };
  raf=requestAnimationFrame(render);
  return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize);geometry.dispose();lineGeo.dispose();for(const mesh of [...surfaces,...filaments])(mesh.material as THREE.Material).dispose();renderer.dispose();};
 },[]);
 return <canvas ref={canvas} style={{position:'absolute',inset:0,width:'100%',height:'100%',display:'block'}}/>;
}
export default function Prototype(){
 const [playing,setPlaying]=useState(true),[quality,setQuality]=useState(1),[step,setStep]=useState(0),[fps,setFps]=useState(0),[settings,setSettings]=useState(false);
 return <main style={{position:'fixed',inset:0,overflow:'hidden',background:'#fbfaf7',fontFamily:'system-ui,sans-serif',color:'#293d3d'}}>
  <Artwork playing={playing} quality={quality} onStatus={(s,f)=>{setStep(s);setFps(f);}}/>
  <div style={{position:'absolute',top:16,left:16,right:16,display:'flex',justifyContent:'space-between',pointerEvents:'none'}}>
   <div style={{background:'#fffdf5b9',padding:'9px 13px',borderRadius:15,backdropFilter:'blur(9px)'}}><strong style={{fontSize:12,letterSpacing:1.6}}>PIANO ROLL COASTER •°</strong><div style={{fontSize:11,opacity:.7}}>Architecture d'aquarelle vivante · V2</div></div>
   <div style={{fontSize:12,background:'#fffdf5c8',borderRadius:14,padding:11}}>{fps} FPS</div>
  </div>
  <div style={{position:'absolute',bottom:18,left:16,right:16,display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
   <div style={{borderRadius:18,background:'#fffdf5ce',padding:'10px 14px',backdropFilter:'blur(10px)'}}><div style={{fontSize:10,opacity:.6}}>HARMONIE</div><strong style={{fontSize:14}}>{harmonies[step]?.name}</strong></div>
   <div style={{display:'flex',gap:8}}><button style={buttonStyle} onClick={()=>setPlaying(v=>!v)}>{playing?'Ⅱ Pause':'▶ Voyage'}</button><button style={buttonStyle} onClick={()=>setSettings(v=>!v)}>⚙</button></div>
  </div>
  {settings&&<div style={{position:'absolute',right:16,bottom:82,width:250,background:'#fffdf5ed',borderRadius:17,padding:18,boxShadow:'0 8px 35px #3452'}}>
   <strong>Laboratoire V2</strong><p style={{fontSize:12,lineHeight:1.6}}>6 voiles aquarelle, 6 filaments, morphogenèse harmonique. Géométrie statique déformée par shaders GPU. Séquence simulée, sans MIDI ni audio.</p>
   <label style={{fontSize:12}}>Résolution : {quality.toFixed(2)}×<input style={{width:'100%'}} type="range" min=".6" max="1.5" step=".05" value={quality} onChange={e=>setQuality(Number(e.target.value))}/></label>
   <button style={{...buttonStyle,marginTop:10}} onClick={()=>setSettings(false)}>Fermer</button>
  </div>}
 </main>;
}
