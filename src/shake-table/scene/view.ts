/**
 * The three.js view of the lab. It reads poses from the Lab and never touches physics.
 * Ported from the prototype's renderer, hall, static lab, mesh sync, dust and cameras.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { assetUrl, type RuntimeManifest } from '../../core/assets/manifest.ts';
import { TIERS, type Tier } from '../../core/render/quality.ts';
import type { SimEvent } from '../../core/sim/events.ts';
import { TOP, TX, TZ } from '../constants.ts';
import { FALLBACK, type PropId } from '../contents/props.ts';
import { SPRING_FIELDS, type Lab } from '../lab.ts';
import type { BodyRec } from '../sim/simulation.ts';
import { buildHall, upgradeMaterial, type HallView } from './hall.ts';
import { loadMaterials, mesh, polyMaterial, tiledBox, type Materials } from './materials.ts';

export type CameraMode = 'orbit' | 'side' | 'ride';
const STATIC_PROPS: [string, number, number, number][] = [
  ['tool_cart', 6.9, -4.6, -0.7],
  ['metal_toolbox', 5.6, -6.4, 0.3],
  ['industrial_storage_cart', -7.6, -4.2, 0.5],
  ['korean_fire_extinguisher_01', -7.0, 4.6, 0.4],
  ['portable_searchlight', 7.4, 4.4, -2.3],
];

interface MemberView { mesh: THREE.Mesh; spring: number; member: number; w: number }

export class LabView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  camMode: CameraMode = 'orbit';
  stress = true;
  /** Stronger camera shake, a warning beacon and bigger dust, for demos. */
  drama = true;
  tier: Tier = 'medium';
  /** Set when something visible changed outside the simulation (camera, settings, hall). */
  dirty = true;
  private hallKey = 'aircraft';
  /** Seconds of the current run, shown on the fixed cameras' tag. */
  kickCam = 0;

  private readonly sun = new THREE.DirectionalLight(0xffffff, 1.6);
  private readonly dyn = new THREE.Group();
  private readonly stat = new THREE.Group();
  private mat!: Materials;
  private readonly models: Record<string, THREE.Object3D> = {};
  private manifest: RuntimeManifest | null = null;
  private envTex: THREE.Texture | null = null;
  private hall: HallView | null = null;
  private generation = -1;
  private bodyViews: (THREE.Object3D | null)[] = [];
  private memberViews: MemberView[] = [];
  private storyMats: (THREE.MeshStandardMaterial | null)[] = [];
  private rods: { r: THREE.Mesh; c: THREE.Mesh; z: number }[] = [];
  private readonly geo: Record<string, THREE.BufferGeometry> = {};
  private savedOrbit: { p: THREE.Vector3; t: THREE.Vector3 } | null = null;
  private readonly camOffset = new THREE.Vector3();
  private readonly dust: { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number; size: number }[] = [];
  private dustI = 0;
  private readonly damperMat = new THREE.MeshStandardMaterial({ color: 0xd2381e, metalness: 0.5, roughness: 0.35 });
  private beaconLight!: THREE.PointLight;
  private beaconLamp!: THREE.MeshStandardMaterial;

  constructor(canvas: HTMLCanvasElement) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap was removed in r186
    this.renderer = r;
    this.scene.background = new THREE.Color(0x1a1e22);
    // A little haze gives the hall depth.
    this.scene.fog = new THREE.Fog(0xa7adb1, 38, 120);
    this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 500);
    this.camera.position.set(12.5, 3.3, 14.5);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(-0.3, 2.7, 0);
    Object.assign(this.controls, { enableDamping: true, maxPolarAngle: Math.PI * 0.49, minDistance: 3, maxDistance: 26 });
    this.controls.addEventListener('change', () => (this.dirty = true));

    const sun = this.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 80 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.position.set(8, 18, 6);
    sun.target.position.set(0, 2, 0);
    this.scene.add(sun, sun.target, new THREE.HemisphereLight(0xffffff, 0x444444, 0.25), this.dyn, this.stat);
    this.initDust();
  }

  resize(): void {
    this.dirty = true;
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  // ---------------------------------------------------------------- loading

  /** Loads materials, props and the first hall. `step` is called as each part finishes. */
  async load(manifest: RuntimeManifest | null, hall: string, step: (msg?: string) => void): Promise<void> {
    this.manifest = manifest;
    const hallP = this.loadHall(hall).catch(() => undefined).then(() => step('Loading textures and props'));
    const matsP = loadMaterials(manifest).then((m) => { this.mat = m; step(); });
    const modelIds = this.firstModels();
    const modelsP = modelIds.map((id) => this.loadModel(id).then(() => step()));
    await Promise.all([hallP, matsP, ...modelsP]);
    this.sharedGeo();
    this.buildStatic();
  }

  get loadSteps(): number {
    return 2 + this.firstModels().length;
  }

  /** Models needed before the lab is usable: everything except the hall dressing. */
  private firstModels(): string[] {
    const decor = this.manifest?.decor?.models ?? [];
    return Object.keys(this.manifest?.models ?? {}).filter((id) => !decor.includes(id));
  }

  async loadHall(key: string): Promise<void> {
    this.hallKey = key;
    this.dirty = true;
    const H = this.manifest?.hdris.find((h) => h.key === key);
    try {
      if (!H) throw new Error(`hall ${key} not in manifest`);
      const tex = await new HDRLoader().setDataType(THREE.HalfFloatType).loadAsync(assetUrl(TIERS[this.tier].hdri === 'low' ? H.fileLow : H.file));
      tex.mapping = THREE.EquirectangularReflectionMapping;
      this.sun.position.set(H.sun[0] * 30, H.sun[1] * 30, H.sun[2] * 30);
      this.envTex?.dispose();
      this.envTex = tex;
      // The HDRI lights the hall and shows in reflections. The hall itself is modeled (hall.ts).
      this.scene.environment = tex;
    } catch (e) {
      console.warn('HDRI failed, using fallback', e);
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      throw e;
    }
  }

  /** Hall textures and dressing props: loaded after the lab is usable (decor assets). */
  async loadDecor(): Promise<void> {
    const decor = this.manifest?.decor;
    if (!decor || !this.hall) return;
    const hm = this.hall.mats;
    // Tints are linear multipliers: above 1 lightens a dark texture, uneven channels shift its hue.
    const tex: [string, [THREE.MeshStandardMaterial, [number, number, number]][]][] = [
      ['concrete_block_wall', [[hm.block, [1.9, 1.95, 2.05]]]],
      ['corrugated_iron', [[hm.cladding, [0.62, 0.72, 0.86]], [hm.roof, [0.75, 0.75, 0.78]]]],
    ];
    await Promise.all([
      ...tex.filter(([id]) => decor.textures.includes(id)).map(async ([id, targets]) => {
        const loaded = await polyMaterial(this.manifest, id);
        for (const [target, tint] of targets) upgradeMaterial(target, loaded, tint);
        this.dirty = true;
      }),
      ...decor.models.map((id) => this.loadModel(id)),
    ]);
    this.hall.dress(this.models);
    this.dirty = true;
  }

  private async loadModel(id: string): Promise<void> {
    try {
      const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(assetUrl(this.manifest!.models[id]!));
      gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.models[id] = gltf.scene;
    } catch (e) {
      console.warn('model failed', id, e);
    }
  }

  private sharedGeo(): void {
    Object.assign(this.geo, {
      table: tiledBox(TX * 2, 0.3, TZ * 2, 1.5),
      slab: tiledBox(3, 0.2, 3, 1.5),
      col: tiledBox(0.2, 1, 0.2, 0.6),
      brace: new THREE.CylinderGeometry(0.035, 0.035, 1, 10),
      bear: new THREE.CylinderGeometry(0.24, 0.24, 1, 28),
      damper: new THREE.CylinderGeometry(0.075, 0.075, 1, 16),
      rod: new THREE.CylinderGeometry(0.07, 0.07, 1, 24),
      clevis: new THREE.BoxGeometry(0.25, 0.35, 0.4),
      bolt: new THREE.CylinderGeometry(0.03, 0.03, 0.004, 10),
    });
  }

  /** Pit, reaction wall, actuators and the props around the hall (prototype `buildStatic`). */
  private buildStatic(): void {
    const M = this.mat;
    const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, tile = 3): void => {
      const o = mesh(tiledBox(w, h, d, tile), m);
      o.position.set(x, y, z);
      this.stat.add(o);
    };
    this.hall = buildHall(M.floor);
    this.stat.add(this.hall.group);
    // pit walls (top flush with the table) and the reaction wall on the -x side
    add(10.6, TOP, 0.7, -0.5, TOP / 2, 3.6, M.found);
    add(10.6, TOP, 0.7, -0.5, TOP / 2, -3.6, M.found);
    add(0.75, TOP, 6.5, 4.4, TOP / 2, 0, M.found);
    add(1.2, 1.55, 8.6, -5.2, 0.775, 0, M.found);
    add(8.65, 0.04, 6.5, -0.29, 0.02, 0, M.dark, 2);
    const hz = (len: number, x: number, z: number, ry: number): void => {
      const m = mesh(new THREE.BoxGeometry(len, 0.012, 0.14), M.hazard(len), false, true);
      m.position.set(x, TOP + 0.006, z);
      m.rotation.y = ry;
      this.stat.add(m);
    };
    hz(8.4, -0.4, 3.32, 0); hz(8.4, -0.4, -3.32, 0); hz(6.5, 4.1, 0, Math.PI / 2);
    for (const z of [-1.7, 1.7]) {
      const cyl = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 32), M.hyd);
      cyl.rotation.z = Math.PI / 2; cyl.position.set(-4.35, 0.55, z);
      const cap = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 32), M.chrome);
      cap.rotation.z = Math.PI / 2; cap.position.set(-4.58, 0.55, z);
      const hose = mesh(new THREE.TorusGeometry(0.28, 0.035, 10, 24, Math.PI), M.rubber);
      hose.position.set(-4.35, 0.78, z); hose.rotation.y = Math.PI / 2;
      this.stat.add(cyl, cap, hose);
    }
    for (const [id, x, z, ry] of STATIC_PROPS) {
      const t = this.models[id];
      if (!t) continue;
      const o = t.clone(true);
      o.position.set(x, 0, z);
      o.rotation.y = ry;
      this.stat.add(o);
    }
    // Warning beacon on the reaction wall: flashes while the table is live.
    this.beaconLamp = new THREE.MeshStandardMaterial({ color: 0x551010, emissive: 0xff2a1a, emissiveIntensity: 0, roughness: 0.4 });
    const lamp = mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.22, 24), this.beaconLamp);
    lamp.position.set(-5.2, 1.66, 3.9);
    const base = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 24), M.dark);
    base.position.set(-5.2, 1.58, 3.9);
    this.beaconLight = new THREE.PointLight(0xff3020, 0, 9, 1.6);
    this.beaconLight.position.set(-5.2, 1.9, 3.9);
    this.stat.add(lamp, base);
    this.scene.add(this.beaconLight);
    const spot = new THREE.SpotLight(0xfff0dc, 45, 30, 0.38, 0.6, 1.4);
    spot.position.set(7.2, 2.2, 4.2);
    spot.target.position.set(-0.8, 3.2, 0);
    this.scene.add(spot, spot.target);
  }

  // ---------------------------------------------------------------- bodies

  private rebuild(lab: Lab): void {
    while (this.dyn.children.length) this.dyn.remove(this.dyn.children[0]!);
    for (const m of this.storyMats) m?.dispose();
    this.bodyViews = [];
    this.memberViews = [];
    this.rods = [];
    const sim = lab.sim;
    this.storyMats = sim.springs.map((s) => (s.iso ? null : this.mat.steel.clone()));
    sim.springs.forEach((s, si) => s.members.forEach((m, mi) => {
      const o = m.kind === 'col' ? mesh(this.geo.col!, this.storyMats[si]!)
        : m.kind === 'brace' ? mesh(this.geo.brace!, this.mat.brace)
        : m.kind === 'damper' ? mesh(this.geo.damper!, this.damperMat)
        : mesh(this.geo.bear!, this.mat.rubber);
      this.dyn.add(o);
      this.memberViews.push({ mesh: o, spring: si, member: mi, w: m.kind === 'col' && m.size ? m.size / 0.2 : 1 });
    }));
    for (const z of [-1.7, 1.7]) {
      const r = mesh(this.geo.rod!, this.mat.chrome);
      r.rotation.z = Math.PI / 2;
      const c = mesh(this.geo.clevis!, this.mat.hyd);
      this.dyn.add(r, c);
      this.rods.push({ r, c, z });
    }
    this.generation = sim.generation;
  }

  private bodyView(o: BodyRec): THREE.Object3D {
    const s = o.shape, M = this.mat;
    let v: THREE.Object3D;
    switch (s.type) {
      case 'table': {
        const t = mesh(this.geo.table!, M.plate);
        const bolts = new THREE.InstancedMesh(this.geo.bolt!, M.dark, 13 * 11);
        const mtx = new THREE.Matrix4();
        let n = 0;
        for (let i = 0; i < 13; i++) for (let j = 0; j < 11; j++) { mtx.makeTranslation(-3 + i * 0.5, 0.151, -2.5 + j * 0.5); bolts.setMatrixAt(n++, mtx); }
        t.add(bolts);
        v = t;
        break;
      }
      case 'slab': {
        const h = s.half; // the preset slab is 3 m by 0.2 m by 3 m
        v = h.x === 1.5 && h.y === 0.1 && h.z === 1.5 ? mesh(this.geo.slab!, M.slab) : mesh(tiledBox(h.x * 2, h.y * 2, h.z * 2, 1.5), M.slab);
        break;
      }
      case 'block': v = mesh(tiledBox(s.w, s.h, s.d, 0.7, s.uv), M.blocks[s.tint]!); break;
      case 'prop': v = this.propView(s.prop); break;
      case 'member-piece': {
        const p = mesh(s.member === 'col' ? this.geo.col! : this.geo.brace!, s.member === 'col' ? (this.storyMats[s.story] ?? M.steel) : M.brace);
        p.scale.set(1, s.len, 1);
        v = p;
        break;
      }
      case 'chunk': v = mesh(tiledBox(s.size, s.size * 0.7, s.size * 1.2, 1.5, s.uv), M.debris); break;
    }
    this.dyn.add(v);
    return v;
  }

  /** A Poly Haven prop centred on its bounding box, like the prototype's `addProp`. */
  private propView(id: PropId): THREE.Object3D {
    let obj: THREE.Object3D;
    const model = this.models[id];
    if (model) obj = model.clone(true);
    else {
      const f = FALLBACK[id];
      obj = mesh(new THREE.BoxGeometry(f.x, f.y, f.z), new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.7 }));
    }
    const box = new THREE.Box3().setFromObject(obj);
    obj.position.sub(box.getCenter(new THREE.Vector3()));
    const g = new THREE.Group();
    g.add(obj);
    return g;
  }

  // ---------------------------------------------------------------- per frame

  private readonly _p0 = new THREE.Vector3();
  private readonly _p1 = new THREE.Vector3();
  private readonly _a = new THREE.Vector3();
  private readonly _b = new THREE.Vector3();
  private readonly _d = new THREE.Vector3();
  private readonly _qa = [0, 0, 0, 1];
  private readonly UP = new THREE.Vector3(0, 1, 0);

  /** Places every body and member from the lab's poses, interpolated between physics steps. */
  sync(lab: Lab): void {
    if (lab.sim.generation !== this.generation) this.rebuild(lab);
    const { prev, curr } = lab;
    const alpha = lab.alpha;
    const bodies = lab.sim.bodies;
    for (let i = 0; i < bodies.length; i++) {
      let v = this.bodyViews[i];
      if (i >= curr.count) {
        if (v) v.visible = false;
        continue;
      }
      if (!v) v = this.bodyViews[i] = this.bodyView(bodies[i]!);
      v.visible = true;
      const k = i * 7, c = curr.data;
      if (i < prev.count) {
        const p = prev.data;
        v.position.lerpVectors(this._p0.set(p[k]!, p[k + 1]!, p[k + 2]!), this._p1.set(c[k]!, c[k + 1]!, c[k + 2]!), alpha);
        THREE.Quaternion.slerpFlat(this._qa, 0, p as unknown as number[], k + 3, c as unknown as number[], k + 3, alpha);
        v.quaternion.fromArray(this._qa).normalize();
      } else {
        v.position.set(c[k]!, c[k + 1]!, c[k + 2]!);
        v.quaternion.set(c[k + 3]!, c[k + 4]!, c[k + 5]!, c[k + 6]!);
      }
    }
    this.syncMembers(lab);
    this.syncRods();
  }

  private syncMembers(lab: Lab): void {
    const springs = lab.sim.springs, st = lab.springState;
    for (const mv of this.memberViews) {
      const s = springs[mv.spring]!, m = s.members[mv.member]!;
      const failed = st[mv.spring * SPRING_FIELDS + 2]! > 0.5;
      mv.mesh.visible = !failed;
      if (failed) continue;
      const A = this.bodyViews[s.a.id], B = this.bodyViews[s.b.id];
      if (!A || !B) continue;
      this._a.set(m.la.x, m.la.y, m.la.z).applyQuaternion(A.quaternion).add(A.position);
      this._b.set(m.lb.x, m.lb.y, m.lb.z).applyQuaternion(B.quaternion).add(B.position);
      this._d.subVectors(this._b, this._a);
      const L = this._d.length();
      mv.mesh.position.addVectors(this._a, this._b).multiplyScalar(0.5);
      mv.mesh.quaternion.setFromUnitVectors(this.UP, this._d.divideScalar(L));
      mv.mesh.scale.set(mv.w, L, mv.w);
    }
    springs.forEach((s, i) => {
      const mat = this.storyMats[i];
      if (!mat) return;
      const r = st[i * SPRING_FIELDS]!, damage = st[i * SPRING_FIELDS + 1]!;
      if (this.stress) {
        const t = Math.min(1, r / s.ultR);
        mat.color.setRGB(0.2 + 1.6 * t, 1.4 - 1.2 * Math.max(0, t - 0.4) * 1.8, 0.25);
        mat.emissive.setRGB(t * 0.5, (1 - t) * 0.12, 0);
      } else {
        mat.color.setRGB(1 - damage * 0.4, 1 - damage * 0.55, 1 - damage * 0.6);
        mat.emissive.setRGB(0, 0, 0);
      }
    });
  }

  /** Actuator rods and clevises follow the table. */
  private syncRods(): void {
    const tx = this.bodyViews[0]?.position.x ?? 0;
    for (const { r, c, z } of this.rods) {
      const x0 = -4.1, x1 = -TX + tx - 0.12, L = Math.max(0.05, x1 - x0);
      r.position.set((x0 + x1) / 2, 0.55, z);
      r.scale.set(1, L, 1);
      c.position.set(-TX + tx - 0.12, 0.6, z);
    }
  }

  // ---------------------------------------------------------------- effects

  private initDust(): void {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(0.5, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    for (let i = 0; i < 220; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: 0xd6cdbf, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      this.scene.add(s);
      this.dust.push({ s, v: new THREE.Vector3(), life: 0, max: 1, size: 1 });
    }
  }

  private puff(x: number, y: number, z: number, n: number, power: number): void {
    for (let i = 0; i < n; i++) {
      const d = this.dust[this.dustI++ % TIERS[this.tier].dust]!;
      d.s.visible = true; d.life = 0; d.max = 1.6 + Math.random() * 2.2; d.size = 0.4 + Math.random() * 0.6 * power;
      d.s.position.set(x + (Math.random() - 0.5) * 2.4, y + (Math.random() - 0.3) * 0.6, z + (Math.random() - 0.5) * 2.4);
      d.v.set((Math.random() - 0.5) * 2.6 * power, Math.random() * 0.9 * power, (Math.random() - 0.5) * 2.6 * power);
    }
  }

  clearDust(): void {
    for (const d of this.dust) d.s.visible = false;
  }

  /** Dust and camera kick for a simulation event (sound is handled by the audio module). */
  onEvent(e: SimEvent): void {
    const [x, y, z] = e.pos;
    const k = this.drama ? 1.6 : 1;
    if (e.kind === 'impact') { if (e.heavy) this.puff(x, y, z, Math.round(26 * k), 1.6 * k); else if (e.p > 0.5) this.puff(x, y, z, 4, 0.6); }
    else if (e.kind === 'fail') { this.puff(x, y, z, Math.round(40 * k), 2.2 * k); this.kickCam = this.drama ? 2.5 : 1; }
  }

  updateDust(dt: number): void {
    for (const d of this.dust) {
      if (!d.s.visible) continue;
      d.life += dt;
      const k = d.life / d.max;
      if (k >= 1) { d.s.visible = false; continue; }
      d.v.multiplyScalar(Math.pow(0.35, dt));
      d.v.y += 0.12 * dt;
      d.s.position.addScaledVector(d.v, dt);
      const sz = d.size * (1 + k * 3);
      d.s.scale.set(sz, sz, sz);
      (d.s.material as THREE.SpriteMaterial).opacity = 0.85 * Math.sin(Math.PI * Math.min(1, k * 1.15)) * (1 - k);
    }
  }

  // ---------------------------------------------------------------- cameras

  setCamera(mode: CameraMode): void {
    this.dirty = true;
    if (mode === this.camMode) return;
    if (this.camMode === 'orbit') this.savedOrbit = { p: this.camera.position.clone(), t: this.controls.target.clone() };
    this.camMode = mode;
    this.controls.enabled = mode === 'orbit';
    this.camera.up.set(0, 1, 0);
    if (mode === 'orbit') {
      this.camera.fov = 45;
      if (this.savedOrbit) { this.camera.position.copy(this.savedOrbit.p); this.controls.target.copy(this.savedOrbit.t); }
    }
    if (mode === 'side') this.camera.fov = 26;
    if (mode === 'ride') this.camera.fov = 78;
    this.camera.updateProjectionMatrix();
  }

  private readonly _e = new THREE.Vector3();
  private readonly _t = new THREE.Vector3();
  private readonly _u = new THREE.Vector3();

  /** Positions the camera for the current mode, with a little shake while the table runs. */
  updateCamera(lab: Lab): void {
    if (this.camMode === 'orbit') { this.controls.update(); this.hall?.clamp(this.camera.position); }
    else if (this.camMode === 'side') { this.camera.position.set(0.3, 3.9, 21); this.camera.lookAt(0.3, 3.75, 0); }
    else {
      const lv = lab.sim.levels[lab.sim.specimen.spec.base.kind === 'fixed' ? 0 : 1];
      const o = lv && this.bodyViews[lv.id];
      if (o) {
        this._e.set(-1.25, 1.35, 1.2).applyQuaternion(o.quaternion).add(o.position);
        this._t.set(1.0, 0.55, -0.9).applyQuaternion(o.quaternion).add(o.position);
        this._u.set(0, 1, 0).applyQuaternion(o.quaternion);
        this.camera.position.copy(this._e);
        this.camera.up.copy(this._u);
        this.camera.lookAt(this._t);
      }
    }
    this.camOffset.set(0, 0, 0);
    if (!this.reduceMotion && !lab.replay.on) {
      const acc = lab.sim.drive.accG;
      const d = this.drama ? 2.4 : 1;
      const k = ((this.camMode === 'orbit' ? acc * 0.05 : this.camMode === 'side' ? acc * 0.015 : 0) + this.kickCam * 0.12) * d;
      if (k > 0.0005) this.camOffset.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    }
    this.kickCam *= this.drama ? 0.93 : 0.9;
    this.camera.position.add(this.camOffset);
  }

  /** Applies a quality tier: pixel density, shadows, dust and the HDRI resolution. */
  async applyTier(tier: Tier, reloadHall = true): Promise<void> {
    const prevHdri = TIERS[this.tier].hdri;
    this.tier = tier;
    const t = TIERS[tier];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, t.maxPixelRatio));
    const shadows = t.shadowMap > 0;
    if (shadows !== this.renderer.shadowMap.enabled || (shadows && this.sun.shadow.mapSize.x !== t.shadowMap)) {
      this.renderer.shadowMap.enabled = shadows;
      this.sun.shadow.mapSize.set(t.shadowMap || 1024, t.shadowMap || 1024);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
      });
    }
    this.dirty = true;
    if (reloadHall && prevHdri !== t.hdri && this.manifest) await this.loadHall(this.hallKey).catch(() => undefined);
  }

  /** True while dust is in the air. */
  get dustActive(): boolean {
    return this.dust.some((d) => d.s.visible);
  }

  /** Beacon flashes twice a second while the table runs (steady under reduced motion). */
  updateBeacon(live: boolean, seconds: number): void {
    if (!this.beaconLight) return;
    const on = live && (this.reduceMotion || Math.floor(seconds * 4) % 2 === 0);
    this.beaconLight.intensity = on ? 30 : 0;
    this.beaconLamp.emissiveIntensity = on ? 4 : live ? 0.6 : 0;
  }

  /** Turns the orbit camera around the building (radians). */
  orbitBy(angle: number): void {
    this.toOrbit();
    const off = this.camera.position.clone().sub(this.controls.target);
    off.applyAxisAngle(this.UP, angle);
    this.camera.position.copy(this.controls.target).add(off);
  }

  /** Moves the orbit camera closer (factor < 1) or farther (factor > 1). */
  zoomBy(factor: number): void {
    this.toOrbit();
    const off = this.camera.position.clone().sub(this.controls.target);
    const len = Math.min(26, Math.max(3, off.length() * factor));
    this.camera.position.copy(this.controls.target).add(off.setLength(len));
  }

  /** The default orbit view, framed for a building of `stories` stories (3 is the prototype's view). */
  resetView(stories = 3): void {
    this.toOrbit();
    const k = Math.max(1, stories / 3); // taller buildings: look higher and step back
    this.camera.position.set(-0.3 + 12.8 * k, 3.3 + 1.6 * (k - 1) * 3, 14.5 * k);
    this.controls.target.set(-0.3, 2.7 + 2.0 * (stories - 3) * 0.5, 0);
    this.dirty = true;
  }

  private toOrbit(): void {
    if (this.camMode !== 'orbit') this.setCamera('orbit');
  }

  /** Draws the frame if `draw` is set, and always undoes this frame's camera shake. */
  finishFrame(draw: boolean): void {
    if (draw) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
    this.camera.position.sub(this.camOffset);
  }

  get shaking(): boolean {
    return this.camOffset.lengthSq() > 0 || this.kickCam > 0.01;
  }
}
