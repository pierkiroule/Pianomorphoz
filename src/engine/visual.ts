import * as THREE from 'three';
import type { Settings } from './types';

type Ribbon = { mesh: THREE.Mesh; born: number; life: number; phase: number; z: number };
type Veil = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture; mesh: THREE.Mesh; seed: number };
const vertex = `
uniform float uTime; uniform float uPulse; uniform float uPhase;
varying vec2 vUv; varying float vInk;
void main() {
  vUv = uv;
  vec3 p = position;
  float u = uv.x;
  float drift = uTime * .31 + uPhase;
  float envelope = sin(u * 3.14159265);
  p.x += (sin(p.z * .29 + drift) * .31 + sin(p.y * .43 - drift * .7) * .22) * envelope;
  p.y += (cos(p.z * .24 - drift * .8) * .34 + sin(p.x * .47 + drift) * .18) * envelope;
  p.xyz += normal * sin(u * 18. - uTime * 3. + uPhase) * uPulse * .16 * envelope;
  vInk = .5 + .5 * sin(u * 39. + drift);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
}`;
const fragment = `
uniform vec3 uColor; uniform float uOpacity;
varying vec2 vUv; varying float vInk;
void main() {
  float edge = pow(max(0., 1. - abs(vUv.y * 2. - 1.)), .48);
  float grain = sin(vUv.x * 317. + vUv.y * 49.) * sin(vUv.x * 97. - vUv.y * 133.);
  float wash = .55 + .32 * vInk + .13 * grain;
  float alpha = uOpacity * edge * wash;
  gl_FragColor = vec4(uColor, alpha);
}`;
export class VisualEngine {
  canvas: HTMLCanvasElement;
  settings: Settings;
  audio = 0;
  midi = 0;
  sustain = false;
  running = true;
  background: HTMLImageElement | HTMLVideoElement | null = null;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(64, 1, .1, 240);
  private ribbons: Ribbon[] = [];
  private veils: Veil[] = [];
  private raf = 0;
  private last = 0;
  private time = 0;
  private energy = 0;
  private transient = 0;
  private seed = 1537;
  private travel = 0;
  private clock = 0;
  private pigmentClock = 0;
  private destroyed = false;
  private bgSource: HTMLImageElement | HTMLVideoElement | null = null;
  private bgTexture: THREE.Texture | null = null;
  private bgMesh: THREE.Mesh | null = null;

  constructor(canvas: HTMLCanvasElement, settings: Settings) {
    this.canvas = canvas; this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color('#ffffff');
    this.scene.fog = new THREE.Fog(0xffffff, 42, 112);
    this.scene.add(this.camera);
    this.resize();
    this.makeVeils();
    this.reset();
    this.raf = requestAnimationFrame(this.loop);
  }
  private rand = () => { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; };
  private range = (a: number, b: number) => a + (b - a) * this.rand();
  resize = () => {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, w < 700 ? 1.3 : 1.6));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  };
  private makeVeils() {
    for (let i = 0; i < 3; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = innerWidth < 700 ? 128 : 256;
      const ctx = canvas.getContext('2d', { alpha: true })!;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: .38, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(20, 15), material);
      mesh.position.set((i - 1) * 3, (i % 2) * 2 - 1, -18 - i * 13);
      mesh.rotation.y = (i - 1) * .28;
      this.scene.add(mesh);
      this.veils.push({ canvas, ctx, texture, mesh, seed: i * 1.7 });
    }
  }
  private spawn(power = .4, pitch = 60) {
    const cap = innerWidth < 700 ? 20 : 32;
    if (this.ribbons.length >= cap) return;
    const n = 70, vertices: number[] = [], uv: number[] = [], indices: number[] = [];
    const phase = this.range(0, 6.283), spread = this.range(1.8, 4.6);
    const x0 = (pitch - 60) / 7 + this.range(-2, 2), y0 = this.range(-5, 5);
    const width = this.range(.04, .16) * (1 + power * .5);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), a = phase + u * spread;
      const taper = Math.pow(Math.sin(Math.PI * u), .65);
      const cx = Math.sin(a) * (1 + u * 4) + x0;
      const cy = Math.cos(a * .83) * (1 + u * 3) + y0;
      const cz = (u - .5) * this.range(8, 15);
      for (const side of [-1, 1]) {
        vertices.push(cx + Math.cos(a) * width * taper * side, cy + Math.sin(a) * width * taper * side, cz);
        uv.push(u, (side + 1) / 2);
      }
      if (i < n - 1) { const j = i * 2; indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const colors = this.settings.colors;
    const color = new THREE.Color(colors[Math.floor(this.rand() * colors.length)] || '#526f69');
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPulse: { value: 0 }, uPhase: { value: phase }, uColor: { value: color }, uOpacity: { value: 0 } },
      vertexShader: vertex, fragmentShader: fragment,
      transparent: true, depthWrite: false, side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = this.camera.position.z - this.range(20, 62);
    this.scene.add(mesh);
    this.ribbons.push({ mesh, born: this.time, life: this.range(11, 22), phase, z: mesh.position.z });
  }
  note = (pitch: number, velocity: number) => {
    const v = THREE.MathUtils.clamp(velocity / 127, 0, 1);
    this.midi = Math.max(this.midi, v);
    this.transient = Math.max(this.transient, v);
    if (this.ribbons.length < 24) this.spawn(v, pitch);
  };
  private paint(dt: number) {
    for (const v of this.veils) {
      const { ctx, canvas } = v, w = canvas.width;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,.035)';
      ctx.fillRect(0, 0, w, w);
      ctx.globalCompositeOperation = 'source-over';
      const t = this.time * .24 + v.seed;
      const x = w * (.5 + .24 * Math.sin(t * .7));
      const y = w * (.5 + .27 * Math.cos(t * .59));
      const r = w * (.08 + this.energy * .045);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      const c = new THREE.Color(this.settings.colors[Math.floor(v.seed) % this.settings.colors.length] || '#93aba2');
      const hex = '#' + c.getHexString();
      grad.addColorStop(0, hex + '1c'); grad.addColorStop(.55, hex + '0d'); grad.addColorStop(1, hex + '00');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.7, r * .7, t, 0, Math.PI * 2); ctx.fill();
      v.texture.needsUpdate = true;
      v.mesh.position.z = this.camera.position.z - 20 - v.seed * 8;
      v.mesh.rotation.z = Math.sin(t * .4) * .13;
      (v.mesh.material as THREE.MeshBasicMaterial).opacity = .22 + Math.min(.22, this.energy * .16);
    }
  }
  private syncBackground() {
    if (this.background === this.bgSource) return;
    this.bgSource = this.background;
    if (this.bgMesh) {
      this.camera.remove(this.bgMesh);
      this.bgMesh.geometry.dispose(); (this.bgMesh.material as THREE.Material).dispose(); this.bgMesh = null;
    }
    this.bgTexture?.dispose(); this.bgTexture = null;
    if (!this.background) return;
    this.bgTexture = this.background instanceof HTMLVideoElement ? new THREE.VideoTexture(this.background) : new THREE.Texture(this.background);
    if (!(this.background instanceof HTMLVideoElement)) this.bgTexture.needsUpdate = true;
    this.bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(160, 110), new THREE.MeshBasicMaterial({ map: this.bgTexture, transparent: true, opacity: this.settings.bgOpacity / 100, depthWrite: false, depthTest: false }));
    this.bgMesh.position.z = -100;
    this.bgMesh.renderOrder = -1;
    this.camera.add(this.bgMesh);
  }
  reset = () => {
    for (const f of this.ribbons) {
      this.scene.remove(f.mesh); f.mesh.geometry.dispose(); (f.mesh.material as THREE.Material).dispose();
    }
    this.ribbons = []; this.time = 0; this.travel = 0; this.clock = 0;
    this.camera.position.set(0, 0, 0);
    for (const v of this.veils) { v.ctx.clearRect(0, 0, v.canvas.width, v.canvas.height); v.texture.needsUpdate = true; }
    for (let i = 0; i < 12; i++) this.spawn(.3, 45 + i * 4);
  };
  private loop = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(.05, (now - (this.last || now)) / 1000);
    this.last = now;
    this.syncBackground();
    if (this.running) {
      this.time += dt;
      const target = Math.max(this.audio * 2.4, this.midi, this.sustain ? .16 : 0);
      this.energy = THREE.MathUtils.damp(this.energy, target, target > this.energy ? 18 : .9, dt);
      this.midi *= Math.exp(-dt * 3);
      this.transient *= Math.exp(-dt * 16);
      const speed = .65 + this.energy * .8;
      this.travel += dt * speed;
      this.camera.position.set(Math.sin(this.time * .11) * 1.8, Math.sin(this.time * .08) * 1.3, -this.travel);
      this.camera.lookAt(Math.sin(this.time * .11 + .3) * 2, Math.sin(this.time * .08 + .3) * 1.5, -this.travel - 30);
      this.clock += dt * (.16 + this.settings.density / 160) * (1 + this.energy);
      if (this.clock >= 1) { this.clock -= 1; this.spawn(.3 + this.energy); }
      for (const f of [...this.ribbons]) {
        const age = this.time - f.born;
        const fade = Math.max(0, Math.min(1, age / 1.5, (f.life - age) / 4));
        const m = f.mesh.material as THREE.ShaderMaterial;
        m.uniforms.uTime.value = this.time;
        m.uniforms.uPulse.value = this.transient + this.energy * .3;
        m.uniforms.uOpacity.value = fade * (.35 + this.settings.intensity / 160);
        f.mesh.rotation.y = Math.sin(this.time * .1 + f.phase) * .13;
        if (age >= f.life || f.z > this.camera.position.z + 8) {
          this.scene.remove(f.mesh); f.mesh.geometry.dispose(); m.dispose();
          this.ribbons.splice(this.ribbons.indexOf(f), 1);
        }
      }
      this.pigmentClock += dt;
      if (this.pigmentClock >= 1 / 15) { this.paint(this.pigmentClock); this.pigmentClock = 0; }
    }
    if (this.bgMesh) (this.bgMesh.material as THREE.MeshBasicMaterial).opacity = this.settings.bgOpacity / 100;
    this.renderer.render(this.scene, this.camera);
  };
  destroy = () => {
    this.destroyed = true; cancelAnimationFrame(this.raf);
    for (const f of this.ribbons) { this.scene.remove(f.mesh); f.mesh.geometry.dispose(); (f.mesh.material as THREE.Material).dispose(); }
    for (const v of this.veils) { this.scene.remove(v.mesh); v.mesh.geometry.dispose(); (v.mesh.material as THREE.Material).dispose(); v.texture.dispose(); }
    if (this.bgMesh) { this.camera.remove(this.bgMesh); this.bgMesh.geometry.dispose(); (this.bgMesh.material as THREE.Material).dispose(); }
    this.bgTexture?.dispose(); this.renderer.dispose();
  };
}
