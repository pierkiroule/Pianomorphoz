import * as THREE from 'three';

const vert=`
precision highp float;
uniform float uTime;uniform float uBass;uniform float uMid;
varying vec3 vPos;varying vec3 vNormal;varying vec2 vUv;
float wave(vec3 p){return sin(p.x*2.7+uTime*.47)*cos(p.y*3.1-uTime*.34)+sin(p.z*4.2+p.y*2.1+uTime*.29)*.48;}
void main(){
 vUv=uv;vec3 p=position;
 float w=wave(p);float r=length(p.xy);
 p+=normal*(w*(.18+uBass*.25)+sin(r*9.-uTime*.63)*(.06+uMid*.13));
 p.x+=sin(p.y*1.6+uTime*.22)*.18;p.y+=cos(p.z*1.3-uTime*.27)*.16;
 vPos=p;vNormal=normalize(normalMatrix*normal);
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
}`;
const frag=`
precision highp float;
uniform vec3 uColor;uniform float uTime;uniform float uEnergy;uniform float uSeed;
varying vec3 vPos;varying vec3 vNormal;varying vec2 vUv;
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(hash(i),hash(i+vec3(1.,0.,0.)),f.x),mix(hash(i+vec3(0.,1.,0.)),hash(i+vec3(1.,1.,0.)),f.x),f.y),mix(mix(hash(i+vec3(0.,0.,1.)),hash(i+vec3(1.,0.,1.)),f.x),mix(hash(i+vec3(0.,1.,1.)),hash(i+vec3(1.,1.,1.)),f.x),f.y),f.z);}
void main(){
 vec3 p=vPos*3.2+uSeed;
 float n=noise(p+uTime*.12),fine=noise(p*5.3),grain=noise(p*18.7);
 float vein=pow(max(0.,sin(vUv.x*31.+n*9.+uSeed)),14.);
 float edge=pow(1.-abs(dot(normalize(vNormal),normalize(vec3(.28,.38,.88)))),1.5);
 float alpha=(.06+.21*n+.14*edge+.12*vein)*(.68+.32*grain)*(1.+uEnergy*.45);
 alpha*=smoothstep(.02,.19,vUv.y)*(1.-smoothstep(.82,.99,vUv.y));
 vec3 col=mix(uColor,vec3(1.),.32*fine+.19*grain);
 col=mix(col,uColor*.62,vein*.5);
 gl_FragColor=vec4(col,clamp(alpha,0.,.55));
}`;
export class Morphogenesis {
 private group=new THREE.Group();
 private membranes:THREE.Mesh[]=[];
 private cloud:THREE.Points;
 private positions:Float32Array;
 private velocities:Float32Array;
 private seeds:Float32Array;
 private time=0;
 private readonly count=3200;
 private bass=0;private mid=0;private high=0;
 constructor(private scene:THREE.Scene){
  scene.add(this.group);
  const palette=['#4b8199','#bd7b81','#a79b75'];
  for(let i=0;i<3;i++){
   const geo=new THREE.SphereGeometry(1,96,56,0,Math.PI*2,0,Math.PI);
   const mat=new THREE.ShaderMaterial({vertexShader:vert,fragmentShader:frag,transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uTime:{value:0},uBass:{value:0},uMid:{value:0},uEnergy:{value:0},uSeed:{value:i*13.7},uColor:{value:new THREE.Color(palette[i])}}});
   const mesh=new THREE.Mesh(geo,mat);mesh.scale.set(2.2+i*.45,1.3+i*.25,.85+i*.17);mesh.rotation.set(i*.45,i*1.9,i*.37);mesh.position.set((i-1)*.8,(i-1)*.38,-i*.9);mesh.renderOrder=i;this.group.add(mesh);this.membranes.push(mesh);
  }
  this.positions=new Float32Array(this.count*3);this.velocities=new Float32Array(this.count*3);this.seeds=new Float32Array(this.count);
  for(let i=0;i<this.count;i++){
   const a=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*2.5,j=i*3;
   this.positions[j]=Math.cos(a)*r;this.positions[j+1]=Math.sin(a)*r*.7;this.positions[j+2]=(Math.random()-.5)*3;
   this.seeds[i]=Math.random()*100;
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
  this.cloud=new THREE.Points(geo,new THREE.PointsMaterial({color:'#628fa1',size:.027,transparent:true,opacity:.42,depthWrite:false,sizeAttenuation:true}));
  this.cloud.frustumCulled=false;this.group.add(this.cloud);
 }
 update(dt:number,bands:{low:number;mid:number;high:number;level:number}){
  this.time+=dt;
  const follow=1-Math.exp(-dt*4);
  this.bass+=(Math.min(1,bands.low*3)-this.bass)*follow;
  this.mid+=(Math.min(1,bands.mid*3)-this.mid)*follow;
  this.high+=(Math.min(1,bands.high*3)-this.high)*follow;
  for(let i=0;i<this.membranes.length;i++){
   const m=this.membranes[i],u=(m.material as THREE.ShaderMaterial).uniforms;
   u.uTime.value=this.time+i*1.2;u.uBass.value=this.bass;u.uMid.value=this.mid;u.uEnergy.value=Math.min(1,bands.level*3);
   m.rotation.y+=dt*(.055+i*.015+this.mid*.07);
   m.rotation.z+=dt*(.026+this.bass*.04);
   const pulse=1+this.bass*.16+Math.sin(this.time*.37+i)*.035;
   m.scale.set((2.2+i*.45)*pulse,(1.3+i*.25)*pulse,.85+i*.17+this.mid*.17);
  }
  const t=this.time;
  for(let i=0;i<this.count;i++){
   const j=i*3,x=this.positions[j],y=this.positions[j+1],z=this.positions[j+2],seed=this.seeds[i];
   const a=Math.sin(y*1.17+t*.23+seed*.02)+Math.cos(z*1.3-t*.17);
   const b=Math.sin(z*.93+t*.29)+Math.cos(x*1.12+t*.13+seed*.02);
   const c=Math.sin(x*1.1-t*.21)+Math.cos(y*.89+t*.19);
   const force=.22+this.mid*.23+this.high*.19;
   this.velocities[j]+=(b-c)*force*dt;this.velocities[j+1]+=(c-a)*force*dt;this.velocities[j+2]+=(a-b)*force*dt;
   const drag=Math.exp(-dt*1.3);this.velocities[j]*=drag;this.velocities[j+1]*=drag;this.velocities[j+2]*=drag;
   this.positions[j]+=this.velocities[j]*dt;this.positions[j+1]+=this.velocities[j+1]*dt;this.positions[j+2]+=this.velocities[j+2]*dt;
   if(x*x+y*y+z*z>48){this.positions[j]*=.985;this.positions[j+1]*=.985;this.positions[j+2]*=.985;}
  }
  (this.cloud.geometry.attributes.position as THREE.BufferAttribute).needsUpdate=true;
  this.group.rotation.y=Math.sin(t*.09)*.13;
 }
 reset(){this.time=0;this.bass=this.mid=this.high=0;}
 dispose(){this.scene.remove(this.group);for(const m of this.membranes){m.geometry.dispose();(m.material as THREE.Material).dispose();}this.cloud.geometry.dispose();(this.cloud.material as THREE.Material).dispose();}
}
