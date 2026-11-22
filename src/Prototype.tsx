import {useEffect,useRef,useState} from 'react';

type State={name:string;feed:number;kill:number;flow:number;hue:number};
const SCORE:State[]=[
 {name:'Do majeur · floraison',feed:.0367,kill:.0649,flow:.32,hue:.52},
 {name:'La mineur · condensation',feed:.022,kill:.051,flow:.2,hue:.68},
 {name:'Sol suspendu · suspension',feed:.03,kill:.062,flow:.13,hue:.56},
 {name:'Mi diminué · turbulence',feed:.046,kill:.065,flow:.9,hue:.78},
 {name:'Fa majeur 7 · ramification',feed:.028,kill:.062,flow:.48,hue:.35},
 {name:'Silence · décantation',feed:.022,kill:.056,flow:.08,hue:.53}
];
const VERT=`#version 300 es
precision highp float;
out vec2 vUv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUv=p*.5;gl_Position=vec4(p*2.-1.,0.,1.);}`;
const SIM=`#version 300 es
precision highp float;
uniform sampler2D uPrev;
uniform vec2 uPixel;
uniform float uDt,uTime,uFeed,uKill,uFlow,uSeed;
in vec2 vUv;out vec4 frag;
vec2 readChem(vec2 uv){return texture(uPrev,fract(uv)).rg;}
void main(){
 vec2 uv=vUv;
 vec2 vel=vec2(sin(uv.y*15.+uTime*.22)+cos(uv.x*9.-uTime*.17),cos(uv.x*13.+uTime*.2)-sin(uv.y*11.-uTime*.13));
 uv=fract(uv-vel*uFlow*.00065);
 vec2 c=readChem(uv);
 vec2 dx=vec2(uPixel.x,0.),dy=vec2(0.,uPixel.y);
 vec2 lap=-c;
 lap+=.2*(readChem(uv+dx)+readChem(uv-dx)+readChem(uv+dy)+readChem(uv-dy));
 lap+=.05*(readChem(uv+dx+dy)+readChem(uv+dx-dy)+readChem(uv-dx+dy)+readChem(uv-dx-dy));
 float reaction=c.x*c.y*c.y;
 float a=c.x+(.98*lap.x-reaction+uFeed*(1.-c.x))*uDt;
 float b=c.y+(.48*lap.y+reaction-(uKill+uFeed)*c.y)*uDt;
 // Sparse pigment injections act as musical gestures, never resetting the state.
 vec2 point=vec2(.5+.23*cos(uTime*.37+uSeed*2.),.5+.21*sin(uTime*.29+uSeed*3.));
 float dist=length((vUv-point)*vec2(1.,1.));
 b+=.016*exp(-dist*dist/ .00032)*uDt;
 frag=vec4(clamp(a,0.,1.),clamp(b,0.,1.),0.,1.);
}`;
const DISPLAY=`#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uResolution;
uniform float uHue,uTime;
in vec2 vUv;out vec4 frag;
vec3 palette(float x){
 vec3 inkA=vec3(.065,.13,.16),inkB=vec3(.17,.35,.39),inkC=vec3(.56,.39,.26);
 return mix(mix(inkA,inkB,clamp(uHue*1.2,0.,1.)),inkC,smoothstep(.55,.85,uHue)*.38+x*.15);
}
void main(){
 vec2 uv=vUv;
 float b=texture(uTex,uv).g;
 vec2 px=1./uResolution;
 float bx=texture(uTex,uv+vec2(px.x,0.)).g-texture(uTex,uv-vec2(px.x,0.)).g;
 float by=texture(uTex,uv+vec2(0.,px.y)).g-texture(uTex,uv-vec2(0.,px.y)).g;
 float edge=clamp(length(vec2(bx,by))*2.2,0.,1.);
 float body=smoothstep(.055,.38,b);
 float pigment=clamp(body*.8+edge*.5,0.,1.);
 float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
 vec3 paper=vec3(.987,.981,.963)+(grain-.5)*.012;
 vec3 ink=palette(b);
 vec3 col=mix(paper,ink,pigment*.94);
 col=mix(col,vec3(.96,.83,.58),edge*.10);
 frag=vec4(col,1.);
}`;
const BUTTON:React.CSSProperties={border:'1px solid #d8d9d3',background:'#fffdf5e8',borderRadius:20,padding:'10px 13px',fontWeight:600,color:'#304544'};
function Simulation({playing,quality,onStatus}:{playing:boolean;quality:number;onStatus:(i:number,f:number)=>void}){
 const ref=useRef<HTMLCanvasElement>(null),live=useRef({playing,quality,onStatus});live.current={playing,quality,onStatus};
 useEffect(()=>{
  const canvas=ref.current;if(!canvas)return;
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:false});
  if(!gl)return;
  const ext=gl.getExtension('EXT_color_buffer_float');
  const floatTargets=Boolean(ext);
  const compile=(kind:number,source:string)=>{
   const sh=gl.createShader(kind);if(!sh)throw Error('shader allocation');
   gl.shaderSource(sh,source);gl.compileShader(sh);
   if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh)||'shader compilation');
   return sh;
  };
  const program=(frag:string)=>{
   const p=gl.createProgram();if(!p)throw Error('program allocation');
   const vs=compile(gl.VERTEX_SHADER,VERT),fs=compile(gl.FRAGMENT_SHADER,frag);
   gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);
   gl.deleteShader(vs);gl.deleteShader(fs);
   if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p)||'link');
   return p;
  };
  const sim=program(SIM),display=program(DISPLAY),vao=gl.createVertexArray();gl.bindVertexArray(vao);
  const N=256;
  const targets:Array<{tex:WebGLTexture;fbo:WebGLFramebuffer}>=[];
  for(let k=0;k<2;k++){
   const tex=gl.createTexture(),fbo=gl.createFramebuffer();if(!tex||!fbo)throw Error('texture allocation');
   gl.bindTexture(gl.TEXTURE_2D,tex);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
   const data=floatTargets?new Float32Array(N*N*4):new Uint8Array(N*N*4);
   for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const p=(y*N+x)*4,dx=(x-N/2)/N,dy=(y-N/2)/N;
    const r=Math.sqrt(dx*dx+dy*dy),angle=Math.atan2(dy,dx);
    const rings=Math.sin(r*135+angle*7)*.5+.5;
    data[p]=floatTargets?1:255;data[p+1]=(r<.12&&rings>.4)?(floatTargets?(.7+.2*rings):Math.round(255*(.7+.2*rings))):0;data[p+3]=floatTargets?1:255;
   }
   if(floatTargets)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,N,N,0,gl.RGBA,gl.FLOAT,data);else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,N,N,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
   gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
   if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('framebuffer incomplete');
   targets.push({tex,fbo});
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  const loc=(p:WebGLProgram,n:string)=>gl.getUniformLocation(p,n);
  const s={prev:loc(sim,'uPrev'),pixel:loc(sim,'uPixel'),dt:loc(sim,'uDt'),time:loc(sim,'uTime'),feed:loc(sim,'uFeed'),kill:loc(sim,'uKill'),flow:loc(sim,'uFlow'),seed:loc(sim,'uSeed')};
  const d={tex:loc(display,'uTex'),res:loc(display,'uResolution'),hue:loc(display,'uHue'),time:loc(display,'uTime')};
  let index=0,raf=0,last=performance.now(),time=0,frames=0,fps=60,clock=last,lastStatus=0,applied=-1;
  const resize=()=>{
   const r=canvas.getBoundingClientRect(),q=Math.min(window.devicePixelRatio||1,live.current.quality);
   canvas.width=Math.max(1,Math.floor(r.width*q));canvas.height=Math.max(1,Math.floor(r.height*q));applied=live.current.quality;
  };
  resize();window.addEventListener('resize',resize);
  const render=(now:number)=>{
   raf=requestAnimationFrame(render);
   const dt=Math.min(.045,(now-last)/1000);last=now;
   if(live.current.playing)time+=dt;
   if(applied!==live.current.quality)resize();
   const duration=6,step=Math.floor(time/duration)%SCORE.length;
   const phase=(time%duration)/duration,x=Math.max(0,Math.min(1,(phase-.6)/.4)),blend=x*x*(3-2*x);
   const a=SCORE[step],b=SCORE[(step+1)%SCORE.length];
   const mix=(key:'feed'|'kill'|'flow'|'hue')=>a[key]*(1-blend)+b[key]*blend;
   if(live.current.playing){
    gl.useProgram(sim);gl.viewport(0,0,N,N);gl.uniform1i(s.prev,0);
    gl.uniform2f(s.pixel,1/N,1/N);gl.uniform1f(s.time,time);
    gl.uniform1f(s.feed,mix('feed'));gl.uniform1f(s.kill,mix('kill'));gl.uniform1f(s.flow,mix('flow'));gl.uniform1f(s.seed,step);
    for(let i=0;i<2;i++){
     gl.bindFramebuffer(gl.FRAMEBUFFER,targets[1-index].fbo);
     gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,targets[index].tex);
     gl.uniform1f(s.dt,1);gl.drawArrays(gl.TRIANGLES,0,3);index=1-index;
    }
   }
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);
   gl.useProgram(display);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,targets[index].tex);
   gl.uniform1i(d.tex,0);gl.uniform2f(d.res,1/N,1/N);gl.uniform1f(d.hue,mix('hue'));gl.uniform1f(d.time,time);
   gl.drawArrays(gl.TRIANGLES,0,3);
   frames++;if(now-clock>1000){fps=Math.round(frames*1000/(now-clock));frames=0;clock=now;}
   if(now-lastStatus>300){lastStatus=now;live.current.onStatus(step,fps);}
  };
  raf=requestAnimationFrame(render);
  return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize);targets.forEach(t=>{gl.deleteTexture(t.tex);gl.deleteFramebuffer(t.fbo);});gl.deleteVertexArray(vao);gl.deleteProgram(sim);gl.deleteProgram(display);};
 },[]);
 return <canvas ref={ref} style={{position:'absolute',inset:0,width:'100%',height:'100%',display:'block'}}/>;
}
export default function Prototype(){
 const [playing,setPlaying]=useState(true),[quality,setQuality]=useState(1),[step,setStep]=useState(0),[fps,setFps]=useState(0),[settings,setSettings]=useState(false);
 return <main style={{position:'fixed',inset:0,overflow:'hidden',background:'#fbfaf6',fontFamily:'system-ui,sans-serif',color:'#304543'}}>
  <Simulation playing={playing} quality={quality} onStatus={(i,f)=>{setStep(i);setFps(f);}}/>
  <div style={{position:'absolute',top:15,left:15,right:15,display:'flex',justifyContent:'space-between',pointerEvents:'none'}}>
   <div style={{padding:'10px 13px',background:'#fffdf6d5',borderRadius:15,backdropFilter:'blur(8px)'}}>
    <strong style={{fontSize:12,letterSpacing:1.3}}>PIXEL VIVANT •°</strong>
    <div style={{fontSize:11,opacity:.7}}>Réaction-diffusion · GPU · V5</div>
   </div>
   <div style={{padding:11,background:'#fffdf6d5',borderRadius:13,fontSize:12}}>{fps} FPS</div>
  </div>
  <div style={{position:'absolute',bottom:16,left:15,right:15,display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
   <div style={{padding:'10px 13px',background:'#fffdf6e9',borderRadius:15}}>
    <div style={{fontSize:10,opacity:.65}}>HARMONIE</div><strong style={{fontSize:13}}>{SCORE[step].name}</strong>
   </div>
   <div style={{display:'flex',gap:7}}><button style={BUTTON} onClick={()=>setPlaying(v=>!v)}>{playing?'Ⅱ Pause':'▶ Reprendre'}</button><button style={BUTTON} onClick={()=>setSettings(v=>!v)}>⚙</button></div>
  </div>
  {settings&&<div style={{position:'absolute',right:15,bottom:80,padding:16,width:245,maxWidth:'calc(100vw - 30px)',background:'#fffdf6f4',borderRadius:17,boxShadow:'0 8px 30px #3453'}}>
   <strong>Laboratoire pixel</strong><p style={{fontSize:12,lineHeight:1.5}}>Simulation Gray–Scott 256×256, advection légère et mémoire. Repli automatique en textures RGBA8 si les textures flottantes ne sont pas prises en charge. WebGL2 requis. Accords simulés.</p>
   <label style={{fontSize:12}}>Résolution {quality.toFixed(2)}×<input style={{width:'100%'}} type="range" min=".5" max="1.5" step=".05" value={quality} onChange={e=>setQuality(Number(e.target.value))}/></label>
   <button style={{...BUTTON,marginTop:8}} onClick={()=>setSettings(false)}>Fermer</button>
  </div>}
 </main>;
}
