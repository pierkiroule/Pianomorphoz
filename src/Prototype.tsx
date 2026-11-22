import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';

type Harmony={name:string;open:number;curl:number;twist:number;hue:number;energy:number};
const SCORE:Harmony[]=[
 {name:'Do majeur · éclosion',open:1.15,curl:.25,twist:.08,hue:.48,energy:.72},
 {name:'La mineur · repli',open:.58,curl:1.05,twist:-.3,hue:.65,energy:.52},
 {name:'Sol suspendu · suspension',open:.95,curl:.6,twist:.85,hue:.54,energy:.65},
 {name:'Mi diminué · torsion',open:.67,curl:1.2,twist:1.3,hue:.78,energy:.82},
 {name:'Fa majeur 7 · expansion',open:1.38,curl:.22,twist:.2,hue:.33,energy:.76},
 {name:'Sol 7 · tension',open:.92,curl:.85,twist:.8,hue:.10,energy:.82},
 {name:'Do majeur · résolution',open:1.48,curl:.12,twist:.06,hue:.48,energy:.86},
 {name:'Silence · respiration',open:1.05,curl:.38,twist:.06,hue:.48,energy:.25}
];
const vertex=`
precision highp float;
uniform float uTime,uOpen,uCurl,uTwist,uIndex,uPetals,uPulse;
varying vec2 vUv;
varying float vShade,vDepth;
void main(){
 vUv=uv;
 float t=uv.y;
 float side=uv.x*2.0-1.0;
 float a=uIndex*6.2831853/uPetals;
 float spiral=uTwist*t*t*.75;
 float length=7.0*(.72+.28*uOpen);
 float r=.35+length*t;
 float width=4.5*pow(sin(3.14159265*t),.85)*(.6+.4*uOpen);
 float ridge=pow(abs(side),1.7);
 float flute=sin(side*12.0+t*21.0+uTime*.33)*.12*pow(t,.6);
 float fold=sin(t*9.0+uTime*.3+uIndex)*.15;
 float ang=a+spiral+side*.12*sin(t*5.0+uTime*.2);
 float radial=r+fold+flute;
 float tangent=side*width;
 float x=cos(ang)*radial-sin(ang)*tangent;
 float y=sin(ang)*radial+cos(ang)*tangent;
 float z=-1.8+2.8*sin(t*3.14159265)*uOpen-4.0*t*t*uCurl
        +ridge*(1.7+uCurl*1.4)*sin(t*3.14159265)
        +sin(t*12.0+side*4.0+uTime*.5)*.16*uPulse;
 vShade=.55+.45*max(0.,sin(t*8.0+side*4.0+uIndex));
 vDepth=t;
 gl_Position=projectionMatrix*modelViewMatrix*vec4(x,y,z,1.);
}`;
const fragment=`
precision mediump float;
uniform float uTime,uHue,uIndex,uEnergy;
varying vec2 vUv;
varying float vShade,vDepth;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
vec3 hsl(vec3 c){vec3 rgb=clamp(abs(mod(c.x*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.);rgb=rgb*rgb*(3.-2.*rgb);return c.z+c.y*(rgb-.5)*(1.-abs(2.*c.z-1.));}
void main(){
 float edge=abs(vUv.x-.5)*2.;
 float vein=pow(max(0.,cos(vUv.x*46.+sin(vUv.y*21.)*2.)),18.);
 float mid=pow(1.-edge,9.);
 float grain=noise(vUv*vec2(37.,130.)+uIndex*3.);
 float wash=noise(vUv*vec2(5.,13.)+uIndex*9.);
 float tip=smoothstep(0.,.08,vUv.y)*(1.-smoothstep(.88,1.,vUv.y));
 float alpha=(.22+.24*edge+.13*grain+.09*wash+.13*vein+.15*mid)*tip;
 vec3 pigment=hsl(vec3(fract(uHue+uIndex*.024),.36+.17*wash,.57+.12*vShade));
 vec3 base=vec3(.998,.987,.967);
 vec3 color=mix(base,pigment,.32+.32*edge+.19*wash+.12*vein);
 color+=vec3(.03,.026,.012)*mid;
 gl_FragColor=vec4(clamp(color,0.,1.),alpha*(.66+.34*uEnergy));
}`;
const coreVertex=`
varying vec3 vNormal;
varying vec3 vPos;
uniform float uTime,uPulse;
void main(){
 vec3 p=position;
 float w=sin(p.x*5.+uTime*.7)*sin(p.y*4.-uTime*.4)*sin(p.z*5.);
 p+=normal*(.10*w+.06*uPulse);
 vNormal=normalize(normalMatrix*normal);
 vPos=p;
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
}`;
const coreFragment=`
varying vec3 vNormal;varying vec3 vPos;
void main(){
 float light=.65+.35*abs(dot(normalize(vNormal),normalize(vec3(.4,.7,1.))));
 float line=pow(abs(sin(vPos.x*17.+vPos.y*13.+vPos.z*19.)),24.);
 vec3 c=mix(vec3(.77,.70,.49),vec3(.98,.92,.75),light)+line*.06;
 gl_FragColor=vec4(c,1.);
}`;
const controls:React.CSSProperties={border:'1px solid #d8dedb',background:'#fffdf6dd',borderRadius:20,padding:'10px 14px',color:'#314c49',fontSize:13,fontWeight:600};
function Flower({playing,quality,onStatus}:{playing:boolean;quality:number;onStatus:(step:number,fps:number)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const current=useRef({playing,quality,onStatus});current.current={playing,quality,onStatus};
 useEffect(()=>{
  const el=canvas.current;if(!el)return;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#faf9f5');scene.fog=new THREE.FogExp2('#faf9f5',.008);
  const camera=new THREE.PerspectiveCamera(74,1,.07,160);
  const renderer=new THREE.WebGLRenderer({canvas:el,antialias:false,alpha:false,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  const geometry=new THREE.PlaneGeometry(1,1,22,96);geometry.translate(0,.5,0);
  const petals:THREE.Mesh[]=[];
  const PETALS=9;
  for(let i=0;i<PETALS;i++){
   const material=new THREE.ShaderMaterial({
    vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,
    side:THREE.DoubleSide,uniforms:{
     uTime:{value:0},uOpen:{value:1},uCurl:{value:.4},uTwist:{value:0},
     uIndex:{value:i},uPetals:{value:PETALS},uPulse:{value:.5},uHue:{value:.5},uEnergy:{value:.7}
    }
   });
   const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;
   scene.add(mesh);petals.push(mesh);
  }
  const coreGeometry=new THREE.IcosahedronGeometry(.82,4);
  const coreMaterial=new THREE.ShaderMaterial({vertexShader:coreVertex,fragmentShader:coreFragment,uniforms:{uTime:{value:0},uPulse:{value:.4}}});
  const core=new THREE.Mesh(coreGeometry,coreMaterial);core.position.z=-2.4;scene.add(core);
  const stemGeometry=new THREE.CylinderGeometry(.09,.23,8,8);
  const stemMaterial=new THREE.MeshBasicMaterial({color:'#a3b9a2'});
  const stem=new THREE.Mesh(stemGeometry,stemMaterial);stem.position.set(0,-4.7,-3.6);stem.rotation.x=.25;scene.add(stem);
  let raf=0,last=performance.now(),time=0,frames=0,fps=60,frameClock=last,lastStatus=0,appliedQuality=-1;
  const resize=()=>{const w=el.clientWidth||window.innerWidth,h=el.clientHeight||window.innerHeight;renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,current.current.quality));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();appliedQuality=current.current.quality;};
  resize();window.addEventListener('resize',resize);
  const render=(now:number)=>{
   raf=requestAnimationFrame(render);
   const dt=Math.min(.05,(now-last)/1000);last=now;
   if(current.current.playing)time+=dt;
   if(appliedQuality!==current.current.quality)resize();
   const duration=5.2,step=Math.floor(time/duration)%SCORE.length;
   const p=(time%duration)/duration;
   const x=THREE.MathUtils.clamp((p-.56)/.44,0,1),blend=x*x*(3-2*x);
   const a=SCORE[step],b=SCORE[(step+1)%SCORE.length];
   const mix=(key:'open'|'curl'|'twist'|'hue'|'energy')=>THREE.MathUtils.lerp(a[key],b[key],blend);
   const pulse=.5+.5*Math.sin(time*1.7);
   for(const mesh of petals){
    const u=(mesh.material as THREE.ShaderMaterial).uniforms;
    u.uTime.value=time;u.uOpen.value=mix('open');u.uCurl.value=mix('curl');
    u.uTwist.value=mix('twist');u.uHue.value=mix('hue');
    u.uEnergy.value=mix('energy');u.uPulse.value=pulse;
   }
   coreMaterial.uniforms.uTime.value=time;coreMaterial.uniforms.uPulse.value=pulse;
   core.scale.setScalar(.8+.24*mix('energy')+.07*pulse);
   // FPV flight: approach, skim the petals, enter the corolla, pass through the heart, emerge.
   // Each 41.6s cycle repeats as the flower continues to evolve.
   const cycle=(time%(duration*SCORE.length))/(duration*SCORE.length);
   const z=17-27*cycle;
   const orbit=cycle*Math.PI*2.1;
   const radius=cycle<.23?3.0*(1.-cycle/.23)+.9:cycle<.7?.9+1.8*Math.sin((cycle-.23)/.47*Math.PI):.9;
   const xCam=Math.cos(orbit)*radius+Math.sin(time*.18)*.24;
   const yCam=Math.sin(orbit)*radius*.7+Math.cos(time*.21)*.18;
   camera.position.set(xCam,yCam,z);
   const lookZ=z-7;
   camera.lookAt(Math.cos(orbit+.3)*radius*.35,Math.sin(orbit+.3)*radius*.3,lookZ);
   camera.rotation.z=Math.sin(time*.25)*.045;
   renderer.render(scene,camera);
   frames++;
   if(now-frameClock>1000){fps=Math.round(frames*1000/(now-frameClock));frames=0;frameClock=now;}
   if(now-lastStatus>350){lastStatus=now;current.current.onStatus(step,fps);}
  };
  raf=requestAnimationFrame(render);
  return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize);geometry.dispose();coreGeometry.dispose();stemGeometry.dispose();coreMaterial.dispose();stemMaterial.dispose();petals.forEach(m=>(m.material as THREE.Material).dispose());renderer.dispose();};
 },[]);
 return <canvas ref={canvas} style={{position:'absolute',inset:0,width:'100%',height:'100%',display:'block'}}/>;
}
export default function Prototype(){
 const [playing,setPlaying]=useState(true),[quality,setQuality]=useState(1),[step,setStep]=useState(0),[fps,setFps]=useState(0),[settings,setSettings]=useState(false);
 return <main style={{position:'fixed',inset:0,overflow:'hidden',background:'#faf9f5',fontFamily:'system-ui,sans-serif',color:'#344e4b'}}>
  <Flower playing={playing} quality={quality} onStatus={(s,f)=>{setStep(s);setFps(f);}}/>
  <div style={{position:'absolute',top:16,left:16,right:16,display:'flex',justifyContent:'space-between',alignItems:'flex-start',pointerEvents:'none'}}>
   <div style={{padding:'10px 13px',borderRadius:15,background:'#fffdf5c9',backdropFilter:'blur(8px)'}}>
    <strong style={{fontSize:12,letterSpacing:1.4}}>FLORAMORPH •°</strong>
    <div style={{fontSize:11,opacity:.72}}>Morphogenèse florale · Drone FPV · V3</div>
   </div>
   <div style={{padding:'9px 12px',borderRadius:14,background:'#fffdf5c9',fontSize:12}}>{fps} FPS</div>
  </div>
  <div style={{position:'absolute',bottom:17,left:15,right:15,display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
   <div style={{background:'#fffdf5d9',padding:'10px 13px',borderRadius:16,backdropFilter:'blur(8px)'}}>
    <div style={{fontSize:10,opacity:.62}}>HARMONIE</div><strong style={{fontSize:13}}>{SCORE[step].name}</strong>
   </div>
   <div style={{display:'flex',gap:7}}><button style={controls} onClick={()=>setPlaying(v=>!v)}>{playing?'Ⅱ Pause':'▶ Voyage'}</button><button style={controls} onClick={()=>setSettings(v=>!v)}>⚙</button></div>
  </div>
  {settings&&<div style={{position:'absolute',right:15,bottom:80,width:245,maxWidth:'calc(100vw - 30px)',background:'#fffdf5f2',padding:16,borderRadius:17,boxShadow:'0 8px 30px #3453'}}>
   <strong>Laboratoire floral</strong>
   <p style={{fontSize:12,lineHeight:1.6}}>9 pétales sculptés sur GPU, nervures et aquarelle procédurales. Caméra FPV autonome. Accords simulés, sans MIDI ni audio.</p>
   <label style={{fontSize:12}}>Résolution {quality.toFixed(2)}×<input style={{width:'100%'}} type="range" min=".55" max="1.5" step=".05" value={quality} onChange={e=>setQuality(Number(e.target.value))}/></label>
   <button style={{...controls,marginTop:8}} onClick={()=>setSettings(false)}>Fermer</button>
  </div>}
 </main>;
}
