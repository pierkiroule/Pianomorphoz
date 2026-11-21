import * as THREE from 'three';
import type { Settings } from './types';

type Form = { mesh: THREE.Mesh; line: THREE.Line; age: number; life: number; phase: number; speed: number; depth: number; pitch: number };
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
  private camera = new THREE.PerspectiveCamera(66, 1, .1, 260);
  private forms: Form[] = [];
  private raf = 0;
  private last = 0;
  private time = 0;
  private energy = 0;
  private seed = 8197;
  private spawnClock = 0;
  private travel = 0;
  private backdrop: THREE.Mesh | null = null;
  private backdropSource: HTMLImageElement | HTMLVideoElement | null = null;
  private texture: THREE.Texture | null = null;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, settings: Settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color('#ffffff');
    this.scene.fog = new THREE.Fog(0xffffff, 35, 115);
    this.camera.position.set(0, 0, 0);
    this.resize();
    this.reset();
    this.raf = requestAnimationFrame(this.loop);
  }
  private random = () => {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  };
  private range = (a: number, b: number) => a + this.random() * (b - a);
  resize = () => {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 700 ? 1.4 : 1.7));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
  private clearForms() {
    for (const f of this.forms) {
      this.scene.remove(f.mesh, f.line);
      f.mesh.geometry.dispose(); (f.mesh.material as THREE.Material).dispose();
      f.line.geometry.dispose(); (f.line.material as THREE.Material).dispose();
    }
    this.forms = [];
  }
  reset = () => {
    this.clearForms(); this.seed = 8197; this.time = 0; this.travel = 0; this.spawnClock = 0;
    this.camera.position.set(0, 0, 0);
    for (let i = 0; i < 16; i++) this.spawn(.35, undefined, -12 - i * 6);
  };
  private spawn(power = .5, pitch?: number, depth?: number) {
    const cap = window.innerWidth < 700 ? 25 : 38;
    if (this.forms.length >= cap) return;
    const phase = this.range(0, Math.PI * 2);
    const size = this.range(1.3, 3.7) * (.75 + power * .6);
    const x = pitch === undefined ? this.range(-9, 9) : (pitch - 60) / 6;
    const y = this.range(-6, 6);
    const z = depth ?? this.camera.position.z - this.range(22, 65);
    const pts: THREE.Vector3[] = [];
    const count = 48;
    for (let i = 0; i < count; i++) {
      const u = i / (count - 1), a = u * Math.PI * this.range(2.2, 3.4) + phase;
      const taper = Math.sin(Math.PI * u);
      pts.push(new THREE.Vector3(
        Math.cos(a) * size * (0.3 + u * 1.4),
        Math.sin(a) * size * (.3 + u * 1.2),
        (u - .5) * size * 3 + Math.sin(a * .6) * size * .6
      ).multiplyScalar(.55 + taper * .45));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const radius = this.range(.018, .075) * (1 + power * .4);
    const geometry = new THREE.TubeGeometry(curve, 110, radius, 5, false);
    const color = new THREE.Color(this.settings.colors[Math.floor(this.random() * this.settings.colors.length)] || '#526f69');
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .48, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(100));
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: .24, depthWrite: false }));
    line.position.copy(mesh.position);
    this.scene.add(mesh, line);
    this.forms.push({ mesh, line, age: 0, life: this.range(13, 28), phase, speed: this.range(.06, .22), depth: z, pitch: pitch ?? 60 });
  }
  note = (pitch: number, velocity: number) => {
    const v = Math.max(0, Math.min(1, velocity / 127));
    this.midi = Math.max(this.midi, v);
    this.spawn(v, pitch);
  };
  private syncBackground() {
    if (this.background === this.backdropSource) return;
    this.backdropSource = this.background;
    if (this.backdrop) {
      this.camera.remove(this.backdrop);
      this.backdrop.geometry.dispose();
      (this.backdrop.material as THREE.Material).dispose();
      this.backdrop = null;
    }
    this.texture?.dispose(); this.texture = null;
    if (!this.background) return;
    this.texture = this.background instanceof HTMLVideoElement
      ? new THREE.VideoTexture(this.background)
      : new THREE.Texture(this.background);
    if (!(this.background instanceof HTMLVideoElement)) this.texture.needsUpdate = true;
    const material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, opacity: this.settings.bgOpacity / 100, depthWrite: false, depthTest: false });
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(180, 120), material);
    this.backdrop.position.z = -105;
    this.backdrop.renderOrder = -1;
    this.camera.add(this.backdrop);
    if (!this.camera.parent) this.scene.add(this.camera);
  }
  private loop = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(.05, (now - (this.last || now)) / 1000);
    this.last = now;
    this.syncBackground();
    if (this.running) {
      this.time += dt;
      const target = Math.max(this.audio * 2.5, this.midi, this.sustain ? .2 : 0);
      this.energy = THREE.MathUtils.damp(this.energy, target, 3, dt);
      this.midi *= Math.exp(-dt * 3.2);
      const speed = 1.7 + this.energy * 2.5;
      this.travel += speed * dt;
      this.camera.position.set(
        Math.sin(this.time * .13) * 2.5 + Math.sin(this.time * .037) * 2,
        Math.sin(this.time * .1) * 1.7,
        -this.travel
      );
      this.camera.lookAt(
        Math.sin(this.time * .13 + .55) * 3,
        Math.sin(this.time * .1 + .4) * 2,
        -this.travel - 24
      );
      this.spawnClock += dt * (.3 + this.settings.density / 100 * 1.1) * (1 + this.energy);
      if (this.spawnClock >= 1) {
        this.spawnClock -= 1;
        this.spawn(.3 + this.energy);
      }
      for (const f of [...this.forms]) {
        f.age += dt;
        const fade = Math.min(1, f.age / 1.6, (f.life - f.age) / 3);
        const wave = Math.sin(this.time * .42 + f.phase);
        f.mesh.rotation.set(wave * .16, this.time * f.speed, Math.sin(this.time * .17 + f.phase) * .28);
        f.line.rotation.copy(f.mesh.rotation);
        const scale = 1 + Math.sin(this.time * .6 + f.phase) * .1 + this.energy * .15;
        f.mesh.scale.setScalar(scale);
        f.line.scale.copy(f.mesh.scale);
        const opacity = Math.max(0, fade) * (.3 + this.settings.intensity / 170);
        (f.mesh.material as THREE.MeshBasicMaterial).opacity = opacity * .65;
        (f.line.material as THREE.LineBasicMaterial).opacity = opacity * .32;
        if (f.age > f.life || f.depth > this.camera.position.z + 8) {
          this.scene.remove(f.mesh, f.line);
          f.mesh.geometry.dispose(); (f.mesh.material as THREE.Material).dispose();
          f.line.geometry.dispose(); (f.line.material as THREE.Material).dispose();
          this.forms.splice(this.forms.indexOf(f), 1);
        }
      }
    }
    if (this.backdrop) (this.backdrop.material as THREE.MeshBasicMaterial).opacity = this.settings.bgOpacity / 100;
    this.renderer.render(this.scene, this.camera);
  };
  destroy = () => {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.clearForms();
    if (this.backdrop) { this.camera.remove(this.backdrop); this.backdrop.geometry.dispose(); (this.backdrop.material as THREE.Material).dispose(); }
    this.texture?.dispose();
    this.renderer.dispose();
  };
}
