import * as THREE from 'three';
import type { Settings } from './types';

type Stroke = { mesh: THREE.Mesh; points: THREE.Vector3[]; widths: number[]; color: THREE.Color; age: number };
type Drop = { mesh: THREE.Sprite; velocity: THREE.Vector3; age: number; life: number };
type Mode = 'play' | 'reveal' | 'print';
const VS = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const FS = `uniform vec3 ink;uniform float opacity;varying vec2 vUv;
void main(){float edge=pow(max(0.,1.-abs(vUv.y*2.-1.)),.55);
float grain=sin(vUv.x*231.+vUv.y*31.)*sin(vUv.x*79.-vUv.y*97.);
gl_FragColor=vec4(ink,opacity*edge*(.76+.24*grain));}`;
export class VisualEngine {
  canvas: HTMLCanvasElement; settings: Settings; audio=0; midi=0; sustain=false; running=true; bands={low:0,mid:0,high:0,level:0,transient:0};
  background: HTMLImageElement|HTMLVideoElement|null=null;
  mode: Mode='play'; private renderer: THREE.WebGLRenderer; private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(53,1,.1,1000);
  private strokes: Stroke[]=[]; private drops: Drop[]=[]; private tip=new THREE.Vector3();
  private heading=new THREE.Vector3(0,0,-1); private target=new THREE.Vector3();
  private time=0; private last=0; private distance=0; private energy=0; private pulse=0;
  private raf=0; private seed=947; private step=0; private current:Stroke|null=null;
  private bounds=new THREE.Box3(); private center=new THREE.Vector3(); private radius=10;
  private orbitTheta=0; private orbitPhi=.25; private orbitZoom=1; private orbitPan=new THREE.Vector3();
  private pointer: {x:number;y:number}|null=null;
  private bgSource: HTMLImageElement|HTMLVideoElement|null=null; private bgTexture:THREE.Texture|null=null;
  private bgMesh:THREE.Mesh|null=null; private destroyed=false;
  private splashTexture:THREE.CanvasTexture; private colorCursor=0; private paletteSignature='';
  constructor(canvas:HTMLCanvasElement,settings:Settings){
    this.canvas=canvas;this.settings=settings;
    this.renderer=new THREE.WebGLRenderer({canvas,alpha:false,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.scene.background=new THREE.Color('#ffffff');
    this.scene.fog=new THREE.Fog('#ffffff',65,200);
    const c=document.createElement('canvas');c.width=c.height=64;
    const ctx=c.getContext('2d')!,g=ctx.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'rgba(255,255,255,.85)');g.addColorStop(.25,'rgba(255,255,255,.6)');
    g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
    this.splashTexture=new THREE.CanvasTexture(c);
    this.canvas.addEventListener('pointerdown',this.down);this.canvas.addEventListener('pointermove',this.move);
    this.canvas.addEventListener('pointerup',this.up);this.canvas.addEventListener('pointercancel',this.up);
    this.canvas.addEventListener('wheel',this.wheel,{passive:false});
    this.resize();this.reset();this.raf=requestAnimationFrame(this.loop);
  }
  private rand=()=>{this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296};
  private range=(a:number,b:number)=>a+(b-a)*this.rand();
  resize=()=>{const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,w<700?1.5:2));
    this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();};
  private color(){const colors=this.settings.colors.filter(c=>/^#[0-9a-fA-F]{6}$/.test(c));if(!colors.length)return new THREE.Color('#365e59');const signature=colors.join(',');if(signature!==this.paletteSignature){this.paletteSignature=signature;this.colorCursor=0;}const index=this.colorCursor++%colors.length;return new THREE.Color(colors[index]);}
  private createStroke(){
    const material=new THREE.ShaderMaterial({vertexShader:VS,fragmentShader:FS,
      uniforms:{ink:{value:this.color()},opacity:{value:.78}},side:THREE.DoubleSide,transparent:true,depthWrite:false});
    const mesh=new THREE.Mesh(new THREE.BufferGeometry(),material);mesh.frustumCulled=false;
    this.scene.add(mesh);
    const stroke:Stroke={mesh,points:[],widths:[],color:(material.uniforms.ink.value as THREE.Color),age:0};
    this.strokes.push(stroke);this.current=stroke;
  }
  private updateStroke(s:Stroke){
    const n=s.points.length;if(n<2)return;
    const positions=new Float32Array(n*6),uvs=new Float32Array(n*4),indices=new Uint32Array((n-1)*6);
    const tangent=new THREE.Vector3(),side=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
    for(let i=0;i<n;i++){
      tangent.copy(s.points[Math.min(n-1,i+1)]).sub(s.points[Math.max(0,i-1)]).normalize();
      side.crossVectors(tangent,up).normalize();
      if(side.lengthSq()<.01)side.set(1,0,0);
      const w=s.widths[i];
      for(let k=0;k<2;k++){const j=i*2+k,p=s.points[i].clone().addScaledVector(side,(k?1:-1)*w);
        positions.set([p.x,p.y,p.z],j*3);uvs.set([i/(n-1),k],j*2);}
      if(i<n-1){const j=i*2,o=i*6;indices.set([j,j+1,j+2,j+1,j+3,j+2],o);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));
    g.setAttribute('uv',new THREE.BufferAttribute(uvs,2));g.setIndex(new THREE.BufferAttribute(indices,1));
    s.mesh.geometry.dispose();s.mesh.geometry=g;
  }
  private splatter(power:number){
    const count=Math.min(12,2+Math.floor(power*10));
    for(let i=0;i<count&&this.drops.length<220;i++){
      const mat=new THREE.SpriteMaterial({map:this.splashTexture,color:this.color(),transparent:true,opacity:this.range(.2,.7),depthWrite:false});
      const sprite=new THREE.Sprite(mat);sprite.position.copy(this.tip);
      sprite.position.add(new THREE.Vector3(this.range(-.4,.4),this.range(-.4,.4),this.range(-.4,.4)));
      sprite.scale.setScalar(this.range(.03,.23)*(1+power));this.scene.add(sprite);
      this.drops.push({mesh:sprite,velocity:new THREE.Vector3(this.range(-1,1),this.range(-1,1),this.range(-1,1)).multiplyScalar(.3+power*2),age:0,life:this.range(5,18)});
    }
  }
  note=(pitch:number,velocity:number)=>{
    if(this.mode!=='play')return;
    const v=Math.max(0,Math.min(1,velocity/127));this.midi=Math.max(this.midi,v);
    this.pulse=Math.max(this.pulse,v);
    this.heading.x+=((pitch-60)/60)*v*.25;
    this.heading.y+=Math.sin(pitch*.38)*v*.2;
    this.heading.normalize();
    if(v>.67)this.splatter(v);
    if(this.current&&this.current.points.length>8&&v>.55)this.createStroke();
  };
  private paint(dt:number){
    const t=this.time,freedom=this.settings.freedom/100;
    const curl=new THREE.Vector3(Math.sin(t*(.73+this.bands.high*.5)+this.tip.y*.19),Math.cos(t*(.47+this.bands.mid*.4)+this.tip.z*.17),-.9+this.bands.low*.2);
    this.heading.lerp(curl.normalize(),Math.min(1,dt*(.35+freedom*.9)));
    this.heading.normalize();
    const speed=(.5+this.energy*2.2)*(1+this.settings.intensity/180);
    this.tip.addScaledVector(this.heading,speed*dt);
    this.distance+=speed*dt;
    this.step+=speed*dt;
    if(this.step>.065){
      this.step=0;
      if(!this.current||this.current.points.length>=90)this.createStroke();
      const s=this.current!;
      s.points.push(this.tip.clone());
      const w=(.012+this.energy*.13+this.pulse*.09+this.bands.low*.14)*(.65+.35*Math.sin(t*3));
      s.widths.push(w);
      this.updateStroke(s);
      this.bounds.expandByPoint(this.tip);
    }
    if((this.energy>.5||this.bands.transient>.08)&&this.rand()<dt*(this.energy*2+this.bands.transient*18))this.splatter(this.energy+this.bands.transient);
  }
  private updateCamera(dt:number){
    if(this.mode==='play'){
      const behind=this.heading.clone().multiplyScalar(-7);
      const desired=this.tip.clone().add(behind).add(new THREE.Vector3(0,2.4,0));
      this.camera.position.lerp(desired,1-Math.exp(-dt*1.25));
      const look=this.tip.clone().addScaledVector(this.heading,5);
      this.target.lerp(look,1-Math.exp(-dt*2));
      this.camera.lookAt(this.target);
    }else{
      const r=this.radius*2.7*this.orbitZoom;
      const pos=new THREE.Vector3(Math.sin(this.orbitTheta)*Math.cos(this.orbitPhi)*r,
        Math.sin(this.orbitPhi)*r,Math.cos(this.orbitTheta)*Math.cos(this.orbitPhi)*r);
      const aim=this.center.clone().add(this.orbitPan);
      this.camera.position.lerp(aim.clone().add(pos),1-Math.exp(-dt*3));
      this.camera.lookAt(aim);
    }
  }
  reveal=()=>{
    this.mode='reveal';this.running=false;this.current=null;
    this.bounds.getCenter(this.center);
    const size=this.bounds.getSize(new THREE.Vector3());
    this.radius=Math.max(2,size.length()*.5);
    this.orbitTheta=.4;this.orbitPhi=.25;this.orbitZoom=1;this.orbitPan.set(0,0,0);
  };
  printMode=()=>{if(this.mode==='play')this.reveal();this.mode='print';};
  resume=()=>{this.mode='play';this.running=true;this.current=null;};
  setPrintView=(angle:number,elevation:number,zoom:number)=>{
    this.orbitTheta=THREE.MathUtils.degToRad(angle);
    this.orbitPhi=THREE.MathUtils.degToRad(Math.max(-85,Math.min(85,elevation)));
    this.orbitZoom=Math.max(.3,Math.min(3,zoom));
  };
  private down=(e:PointerEvent)=>{if(this.mode==='print'){this.pointer={x:e.clientX,y:e.clientY};this.canvas.setPointerCapture(e.pointerId);}};
  private move=(e:PointerEvent)=>{if(!this.pointer||this.mode!=='print')return;
    this.orbitTheta+=(e.clientX-this.pointer.x)*.008;
    this.orbitPhi=THREE.MathUtils.clamp(this.orbitPhi+(e.clientY-this.pointer.y)*.008,-1.48,1.48);
    this.pointer={x:e.clientX,y:e.clientY};};
  private up=()=>{this.pointer=null;};
  private wheel=(e:WheelEvent)=>{if(this.mode!=='print')return;e.preventDefault();this.orbitZoom=THREE.MathUtils.clamp(this.orbitZoom*Math.exp(e.deltaY*.001),.3,3);};
  exportPrint=(size=3000,aspect=1)=>{
    const width=size,height=Math.round(size/aspect);
    const oldSize=new THREE.Vector2();this.renderer.getSize(oldSize);
    const oldAspect=this.camera.aspect;const oldPixel=this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);this.renderer.setSize(width,height,false);
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene,this.camera);
    const url=this.canvas.toDataURL('image/png');
    this.renderer.setPixelRatio(oldPixel);this.renderer.setSize(oldSize.x,oldSize.y,false);
    this.camera.aspect=oldAspect;this.camera.updateProjectionMatrix();
    return url;
  };
  private syncBackground(){
    if(this.background===this.bgSource)return;this.bgSource=this.background;
    if(this.bgMesh){this.camera.remove(this.bgMesh);this.bgMesh.geometry.dispose();(this.bgMesh.material as THREE.Material).dispose();this.bgMesh=null;}
    this.bgTexture?.dispose();this.bgTexture=null;
    if(!this.background)return;
    this.bgTexture=this.background instanceof HTMLVideoElement?new THREE.VideoTexture(this.background):new THREE.Texture(this.background);
    if(!(this.background instanceof HTMLVideoElement))this.bgTexture.needsUpdate=true;
    this.bgMesh=new THREE.Mesh(new THREE.PlaneGeometry(160,110),new THREE.MeshBasicMaterial({map:this.bgTexture,transparent:true,opacity:this.settings.bgOpacity/100,depthTest:false,depthWrite:false}));
    this.bgMesh.position.z=-100;this.camera.add(this.bgMesh);
  }
  reset=()=>{
    for(const s of this.strokes){this.scene.remove(s.mesh);s.mesh.geometry.dispose();(s.mesh.material as THREE.Material).dispose();}
    for(const d of this.drops){this.scene.remove(d.mesh);(d.mesh.material as THREE.Material).dispose();}
    this.strokes=[];this.drops=[];this.current=null;this.mode='play';this.running=true;
    this.tip.set(0,0,0);this.heading.set(0,0,-1);this.camera.position.set(0,2,8);
    this.time=0;this.distance=0;this.step=0;this.bounds.makeEmpty();this.energy=0;this.pulse=0;
    this.createStroke();
  };
  private loop=(now:number)=>{
    if(this.destroyed)return;this.raf=requestAnimationFrame(this.loop);
    const dt=Math.min(.05,(now-(this.last||now))/1000);this.last=now;
    this.syncBackground();
    if(this.mode==='play'&&this.running){
      this.time+=dt;const target=Math.max(this.audio*3,this.bands.low*.9+this.bands.mid*.8+this.bands.high*.5,this.midi,this.sustain?.18:0);
      this.energy=THREE.MathUtils.damp(this.energy,target,target>this.energy?20:1.1,dt);
      this.midi*=Math.exp(-dt*3);this.pulse*=Math.exp(-dt*14);
      this.paint(dt);
    }
    for(const d of this.drops){
      if(this.mode==='play'&&this.running){d.age+=dt;d.mesh.position.addScaledVector(d.velocity,dt);d.velocity.multiplyScalar(Math.exp(-dt*.7));}
      (d.mesh.material as THREE.SpriteMaterial).opacity=Math.max(.05,.6*(1-d.age/d.life));
    }
    this.updateCamera(dt);
    if(this.bgMesh)(this.bgMesh.material as THREE.MeshBasicMaterial).opacity=this.settings.bgOpacity/100;
    this.renderer.render(this.scene,this.camera);
  };
  destroy=()=>{
    this.destroyed=true;cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointermove',this.move);
    this.canvas.removeEventListener('pointerup',this.up);this.canvas.removeEventListener('pointercancel',this.up);
    this.canvas.removeEventListener('wheel',this.wheel);
    for(const s of this.strokes){s.mesh.geometry.dispose();(s.mesh.material as THREE.Material).dispose();}
    for(const d of this.drops)(d.mesh.material as THREE.Material).dispose();
    this.splashTexture.dispose();this.bgTexture?.dispose();
    if(this.bgMesh){this.bgMesh.geometry.dispose();(this.bgMesh.material as THREE.Material).dispose();}
    this.renderer.dispose();
  };
}
