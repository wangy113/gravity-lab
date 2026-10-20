/**
 * The shake table simulation: a Rapier world with the table, the building, the block wall
 * and the furniture. Ported from the prototype (resetWorld, buildTower, applySprings,
 * failStory, buildWall, buildFurniture, detectImpacts). No three.js and no DOM, so it runs
 * in the browser, in a worker or in Node.
 */
import type RAPIER_NS from '@dimforge/rapier3d-deterministic-compat';
import type { SimEvent, Vec3 } from '../../core/sim/events.ts';
import { fromUnitVectors, qinv, qmul, qyaw, rotate, type Q4, type V3 } from '../../core/sim/math.ts';
import { lcg, type Rng } from '../../core/sim/rng.ts';
import { DT, RIM, STORY, TOP, TX, TZ, X0, type BuildingType } from '../constants.ts';
import { propSize, type PropId, type PropSize } from '../contents/props.ts';
import { compileSpecimen, type CompiledSpecimen, type CompiledSpring, type Member } from '../specimen/compile.ts';
import { coupledFrequencies, shearBuildingFrequencies } from '../specimen/modal.ts';
import { PRESETS, type SpecimenSpec } from '../specimen/spec.ts';
import { MOAT_FACTOR } from '../specimen/stability.ts';
import { TableDrive, type ShakeMode } from '../motion/table.ts';

type Rapier = typeof RAPIER_NS;
type RigidBody = RAPIER_NS.RigidBody;

export type BodyKind = 'table' | 'slab' | 'block' | 'prop' | 'piece';
/** What the view needs to draw a body. */
export type BodyShape =
  | { type: 'table' }
  | { type: 'slab'; half: { x: number; y: number; z: number } }
  | { type: 'tmd'; half: { x: number; y: number; z: number } }
  | { type: 'block'; w: number; h: number; d: number; tint: number; uv: [number, number] }
  | { type: 'prop'; prop: PropId; size: PropSize }
  | { type: 'member-piece'; member: 'col' | 'brace'; len: number; story: number }
  | { type: 'chunk'; size: number; uv: [number, number] };

export interface BodyRec {
  id: number;
  body: RigidBody;
  kind: BodyKind;
  mass: number;
  shape: BodyShape;
  pv: V3; // velocity at the last impact check
  y0: number; // height when created, m
  cool: number; // impact cooldown, s
}

export type { Member, MemberKind } from '../specimen/compile.ts';

export interface Spring {
  index: number;
  a: BodyRec; b: BodyRec; aDyn: boolean;
  rest: V3;
  k: number; c: number; kv: number; cv: number; kr: number; cr: number;
  iso: boolean; tmd: boolean; label: string; yieldR: number; ultR: number;
  moatGap: number; driftHeight: number; // m
  bilinear: { hardening: number; capacity: number } | null;
  pDelta: number; // N/m, weight above over story height (Model 2)
  torsion: { ecc: number; kt: number; ct: number; cx: number; cz: number } | null;
  ex: number; ez: number; // bilinear law: permanent (plastic) offset, m
  plastic: number; // bilinear law: accumulated yielding, m
  damage: number; failed: boolean;
  r: number; // drift ratio
  d: number; // lateral displacement, m
  members: Member[];
}

export interface SimOptions {
  type?: BuildingType;
  /** The specification to build when `type` is 'custom'. */
  spec?: SpecimenSpec;
  /** Seed for debris and other random choices that affect physics. */
  seed?: number;
  /** Use prop sizes measured from the Poly Haven models (default) or the prototype's fallback boxes. */
  useModelSizes?: boolean;
}

const UP: V3 = { x: 0, y: 1, z: 0 };
const IMPACT_WINDOW = 4; // steps: impacts are judged over 1/60 s, the prototype's nominal frame

export class ShakeTableSim {
  readonly drive = new TableDrive();
  type: BuildingType;
  /** The compiled specimen on the table now. */
  specimen!: CompiledSpecimen;
  world!: RAPIER_NS.World;
  bodies: BodyRec[] = [];
  springs: Spring[] = [];
  /** Slab bodies bottom to top (base slab first when isolated). */
  levels: BodyRec[] = [];
  /** The tuned mass damper's block, if the building has one. */
  tmdBlock: BodyRec | null = null;
  /** Every compiled floor's body, in the compiler's order (slabs, then the damper block). */
  private floorBodies: BodyRec[] = [];
  table!: BodyRec;
  simT = 0;
  steps = 0;
  generation = 0; // increments on every reset, so views know to rebuild
  readonly events: SimEvent[] = [];
  failNote = '';
  peakRoof = 0; // m
  peakF = 0; // Hz

  private readonly R: Rapier;
  private customSpec: SpecimenSpec | null = null;
  private readonly seed: number;
  private readonly useModelSizes: boolean;
  private rand!: Rng; // physics stream
  private visual!: Rng; // visual-only stream (texture offsets)

  constructor(R: Rapier, opts: SimOptions = {}) {
    this.R = R;
    this.type = opts.type ?? 'bare';
    this.seed = opts.seed ?? 1;
    this.useModelSizes = opts.useModelSizes ?? true;
    this.reset(this.type, opts.spec);
  }

  get anyFailed(): boolean {
    return this.springs.some((s) => s.failed);
  }

  /**
   * Rebuilds the world (prototype `setType` and `resetWorld`). Pass a specification to test
   * a building other than the preset for `type`. Throws a SpecimenError, with plain
   * messages, when the specification is out of bounds or would not integrate stably.
   */
  reset(type: BuildingType = this.type, spec?: SpecimenSpec): void {
    if (spec) this.customSpec = spec;
    if (type === 'custom' && !this.customSpec) throw new Error('a custom building needs a specification');
    const compiled = compileSpecimen(type === 'custom' ? this.customSpec! : PRESETS[type]);
    this.type = type;
    this.specimen = compiled;
    this.generation++;
    if (this.world) this.world.free();
    const R = this.R;
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = DT;
    this.world.integrationParameters.numSolverIterations = 8;
    this.bodies = []; this.springs = []; this.levels = []; this.floorBodies = []; this.tmdBlock = null;
    this.events.length = 0;
    this.simT = 0; this.steps = 0;
    this.failNote = ''; this.peakRoof = 0; this.peakF = 0;
    this.drive.reset();
    this.rand = lcg(this.seed * 7919 + 17);
    this.visual = lcg(this.seed * 104729 + 3);

    const ground = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    this.world.createCollider(R.ColliderDesc.cuboid(80, 0.5, 80).setTranslation(0, -0.5, 0).setFriction(0.7), ground);
    for (const [x, y, z, hx, hy, hz] of RIM) this.world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.7), ground);

    const tb = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, TOP - 0.15, 0));
    this.world.createCollider(R.ColliderDesc.cuboid(TX, 0.15, TZ).setFriction(0.8), tb);
    this.table = this.register(tb, 1e9, 'table', { type: 'table' });

    this.buildTower();
    this.buildWall();
    this.buildFurniture();
  }

  setMode(mode: ShakeMode): void {
    this.drive.mode = mode;
    if (this.drive.on) this.drive.stop();
  }

  start(): void {
    this.failNote = ''; this.peakRoof = 0; this.peakF = 0;
    this.drive.start();
    for (const o of this.bodies) if (o.kind !== 'table') o.body.wakeUp();
  }

  stop(): void {
    this.drive.stop();
  }

  /** One physics step of DT seconds (prototype `physStep`, plus per-step bookkeeping). */
  step(): void {
    const x = this.drive.step();
    this.table.body.setNextKinematicTranslation({ x, y: TOP - 0.15, z: 0 });
    this.applySprings();
    this.world.step();
    this.simT += DT;
    this.steps++;
    if (this.steps % IMPACT_WINDOW === 0) this.detectImpacts(IMPACT_WINDOW * DT);
    if (this.drive.active && !this.anyFailed) {
      const roof = Math.abs(this.roofSwing());
      if (roof > this.peakRoof) { this.peakRoof = roof; this.peakF = this.drive.fNow; }
    }
  }

  /** Roof displacement relative to the table, m (prototype `roofSwing`). */
  roofSwing(): number {
    const top = this.levels[this.levels.length - 1];
    if (!top) return 0;
    return top.body.translation().x - this.table.body.translation().x - X0;
  }

  /** How many wall blocks have dropped more than 10 cm from where they were built. */
  wallBlocksDown(): number {
    return this.bodies.filter((o) => o.kind === 'block' && o.y0 - o.body.translation().y > 0.1).length;
  }

  /** First natural frequency of the current (damaged) building, Hz, or 0 after a failure. */
  natBeat(): number {
    if (this.anyFailed) return 0;
    const ks = this.springs.map((s) => s.k * (1 - 0.3 * s.damage) - s.pDelta);
    // Model 2 couples sway with twisting, as the compiler's modal analysis does.
    if (this.specimen.spec.modelVersion === 2) {
      const floors = this.specimen.floors;
      return coupledFrequencies(floors.map((f) => f.mass), floors.map((f) => f.inertiaY),
        this.springs.map((s, i) => ({ k: ks[i]!, ecc: s.torsion?.ecc ?? 0, kt: s.torsion?.kt ?? s.kr })))[0] ?? 0;
    }
    return shearBuildingFrequencies(this.springs.map((s) => s.b.mass), ks)[0] ?? 0;
  }

  /** World-space ends of a member of a spring, for drawing and for failure pieces. */
  memberEnds(s: Spring, m: Member, a: V3 = { x: 0, y: 0, z: 0 }, b: V3 = { x: 0, y: 0, z: 0 }): [V3, V3] {
    const pa = s.a.body.translation(), pb = s.b.body.translation();
    rotate(m.la, s.a.body.rotation(), a); a.x += pa.x; a.y += pa.y; a.z += pa.z;
    rotate(m.lb, s.b.body.rotation(), b); b.x += pb.x; b.y += pb.y; b.z += pb.z;
    return [a, b];
  }

  // ---------------------------------------------------------------- building

  private register(body: RigidBody, mass: number, kind: BodyKind, shape: BodyShape): BodyRec {
    const o: BodyRec = { id: this.bodies.length, body, mass, kind, shape, pv: { x: 0, y: 0, z: 0 }, cool: 0, y0: body.translation().y };
    this.bodies.push(o);
    return o;
  }

  private dynBody(x: number, y: number, z: number, q: Q4 | null, sleep: boolean): RigidBody {
    const d = this.R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setCanSleep(sleep).setAngularDamping(0.15).setLinearDamping(0.02);
    if (q) d.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    return this.world.createRigidBody(d);
  }

  private addSlab(f: CompiledSpecimen['floors'][number]): BodyRec {
    const { x: hx, y: hy, z: hz } = f.half;
    const b = this.dynBody(X0, f.y, 0, null, false);
    this.world.createCollider(this.R.ColliderDesc.cuboid(hx, hy, hz).setDensity(f.mass / (hx * 2 * (hy * 2) * hz * 2)).setFriction(0.7), b);
    const o = this.register(b, f.mass, 'slab', f.kind === 'tmd' ? { type: 'tmd', half: f.half } : { type: 'slab', half: f.half });
    if (f.kind === 'tmd') this.tmdBlock = o; else this.levels.push(o);
    this.floorBodies.push(o);
    return o;
  }

  private addSpring(cs: CompiledSpring): Spring {
    const s: Spring = {
      ...cs, index: this.springs.length, a: cs.lower < 0 ? this.table : this.floorBodies[cs.lower]!, b: this.floorBodies[cs.upper]!,
      aDyn: cs.lower >= 0, ex: 0, ez: 0, plastic: 0, damage: 0, failed: false, r: 0, d: 0, members: cs.members.map((m) => ({ ...m })),
    };
    this.springs.push(s);
    return s;
  }

  /** Floors and springs from the compiled specimen (prototype `buildTower`). */
  private buildTower(): void {
    for (const f of this.specimen.floors) this.addSlab(f);
    for (const cs of this.specimen.springs) this.addSpring(cs);
  }

  /** Unreinforced block wall on the +x side of the table (prototype `buildWall`). */
  private buildWall(): void {
    const WX = 2.4, bl = 0.4, bh = 0.2, bt = 0.18;
    for (let c = 0; c < 11; c++) {
      const y = TOP + bh / 2 + c * bh + 0.001 * c;
      const pieces: [number, number][] = c % 2 === 0
        ? [-1.0, -0.6, -0.2, 0.2, 0.6, 1.0].map((z) => [z, bl])
        : [[-1.1, 0.2], [-0.8, bl], [-0.4, bl], [0, bl], [0.4, bl], [0.8, bl], [1.1, 0.2]];
      for (const [z, len] of pieces) {
        const uv: [number, number] = [this.visual(), this.visual()];
        const b = this.dynBody(WX, y, z, null, true);
        this.world.createCollider(this.R.ColliderDesc.cuboid(bt / 2, bh / 2 - 0.001, (len - 0.016) / 2).setMass(26 * len).setFriction(0.7).setRestitution(0.02), b);
        this.register(b, 26 * len, 'block', { type: 'block', w: bt, h: bh - 0.014, d: len - 0.016, tint: Math.abs(c * 7 + Math.round(z * 10)) % 3, uv });
      }
    }
  }

  private addProp(id: PropId, x: number, yBottom: number, z: number, ry: number, mass: number): number {
    const size = propSize(id, this.useModelSizes);
    // Props may sleep once settled (the prototype kept them awake). Shake wakes every body,
    // and on Rapier 0.21 a resting scene costs about a ninth as much with sleeping props.
    const b = this.dynBody(x, yBottom + size.y / 2 + 0.005, z, qyaw(ry), true);
    this.world.createCollider(this.R.ColliderDesc.cuboid((size.x / 2) * 0.97, size.y / 2, (size.z / 2) * 0.97).setMass(mass).setFriction(0.45).setRestitution(0.05), b);
    this.register(b, mass, 'prop', { type: 'prop', prop: id, size });
    return yBottom + size.y;
  }

  /** Furniture inside the building and loose props on the table (prototype `buildFurniture`). */
  private buildFurniture(): void {
    const f1 = this.specimen.groundFloor;
    const fl = (n: number): number => f1 + n * STORY;
    const X = X0;
    const deskTop = this.addProp('metal_office_desk', X + 0.35, f1, -0.75, 0, 35);
    this.addProp('cardboard_box_01', X + 0.55, deskTop, -0.75, 0.3, 6);
    this.addProp('plastic_monobloc_chair_01', X + 0.3, f1, 0.15, Math.PI, 5);
    const c1 = this.addProp('wooden_crate_01', X + 0.65, fl(1), -0.7, 0.2, 18);
    this.addProp('wooden_crate_01', X + 0.62, c1, -0.72, -0.15, 18);
    this.addProp('plastic_crate_01', X - 0.55, fl(1), -0.85, 0.1, 3);
    this.addProp('plastic_monobloc_chair_01', X + 0.1, fl(1), 0.65, 2.4, 5);
    let s = fl(2);
    for (let i = 0; i < 3; i++) s = this.addProp('cardboard_box_01', X + 0.7 + (i % 2) * 0.03, s, 0.6, 0.2 * i, 6);
    this.addProp('metal_office_desk', X - 0.2, fl(2), -0.75, 0, 35);
    this.addProp('wooden_crate_01', 2.9, TOP, 2.2, 0.4, 18);
    this.addProp('plastic_crate_01', 2.95, TOP, -2.2, -0.3, 3);
  }

  // ---------------------------------------------------------------- springs

  /** The shear-building model: story springs applied as impulses before each step (prototype `applySprings`). */
  private applySprings(): void {
    for (const s of this.springs) {
      if (s.failed) continue;
      const A = s.a.body, B = s.b.body;
      const pa = A.translation(), pb = B.translation();
      const qa = A.rotation(), qb = B.rotation();
      const rv = rotate(s.rest, qa);
      const dx = pb.x - pa.x - rv.x, dy = pb.y - pa.y - rv.y, dz = pb.z - pa.z - rv.z;
      const va = A.linvel(), vb = B.linvel();
      if (s.torsion) { this.applyTorsionStory(s, A, B, dx, dy, dz); continue; }
      let fx: number, fz: number;
      if (s.bilinear) {
        [fx, fz] = this.bilinearForce(s, dx, dz);
        fx -= s.c * (vb.x - va.x); fz -= s.c * (vb.z - va.z);
      } else {
        const kf = s.k * (1 - 0.3 * s.damage);
        fx = -kf * dx - s.c * (vb.x - va.x); fz = -kf * dz - s.c * (vb.z - va.z);
      }
      // P-Delta (Model 2): the weight above pushes a leaning story further over.
      if (s.pDelta) { fx += s.pDelta * dx; fz += s.pDelta * dz; }
      const fy = -s.kv * dy - s.cv * (vb.y - va.y);
      const d = Math.hypot(dx, dz);
      s.d = d; s.r = d / s.driftHeight;
      if (s.iso && d > s.moatGap) {
        const e = d - s.moatGap;
        fx -= (s.k * MOAT_FACTOR * e * dx) / d; fz -= (s.k * MOAT_FACTOR * e * dz) / d;
      }
      B.applyImpulse({ x: fx * DT, y: fy * DT, z: fz * DT }, true);
      if (s.aDyn) A.applyImpulse({ x: -fx * DT, y: -fy * DT, z: -fz * DT }, true);
      const qr = qmul(qb, qinv(qa));
      if (qr.w < 0) { qr.x = -qr.x; qr.y = -qr.y; qr.z = -qr.z; qr.w = -qr.w; }
      const sn = Math.hypot(qr.x, qr.y, qr.z);
      const ang = 2 * Math.atan2(sn, qr.w);
      const f = sn > 1e-9 ? ang / sn : 2;
      const wa = A.angvel(), wb = B.angvel();
      const tx = -s.kr * qr.x * f - s.cr * (wb.x - wa.x);
      const ty = -s.kr * qr.y * f - s.cr * (wb.y - wa.y);
      const tz = -s.kr * qr.z * f - s.cr * (wb.z - wa.z);
      B.applyTorqueImpulse({ x: tx * DT, y: ty * DT, z: tz * DT }, true);
      if (s.aDyn) A.applyTorqueImpulse({ x: -tx * DT, y: -ty * DT, z: -tz * DT }, true);
      if (!s.iso && s.bilinear) {
        if (s.r > s.ultR || s.damage >= 1) this.failStory(s, dx, dz);
      } else if (!s.iso) {
        if (s.r > s.yieldR) {
          if (s.damage === 0) this.emit({ kind: 'crack', t: this.simT, p: 0.5, story: s.label, pos: this.memberMid(s) });
          s.damage = Math.min(1, s.damage + ((s.r - s.yieldR) / (s.ultR - s.yieldR)) * DT * 1.6);
        }
        if (s.r > s.ultR || s.damage >= 1) this.failStory(s, dx, dz);
      }
    }
  }

  /**
   * A Model 2 story that can twist. The story's law acts at its centre of rigidity, which sits
   * `ecc` from the middle along z when one side is stiffer. There a sideways force also twists
   * the floor, and the frames resist twisting with `kt` about that point. The drift that breaks
   * the story is judged at its worst corner, so the flexible side of a twisting story fails first.
   */
  private applyTorsionStory(s: Spring, A: RigidBody, B: RigidBody, dx: number, dy: number, dz: number): void {
    const T = s.torsion!;
    const va = A.linvel(), vb = B.linvel(), wa = A.angvel(), wb = B.angvel();
    const qr = qmul(B.rotation(), qinv(A.rotation()));
    if (qr.w < 0) { qr.x = -qr.x; qr.y = -qr.y; qr.z = -qr.z; qr.w = -qr.w; }
    const sn = Math.hypot(qr.x, qr.y, qr.z);
    const f = sn > 1e-9 ? (2 * Math.atan2(sn, qr.w)) / sn : 2;
    const th = qr.y * f; // twist about the vertical axis, rad (a point at z moves by th * z along x)
    // displacement of the centre of rigidity, where the story's law acts
    const ux = dx + th * T.ecc, uz = dz;
    let [fx, fz] = s.bilinear ? this.bilinearForce(s, ux, uz) : [-s.k * (1 - 0.3 * s.damage) * ux, -s.k * (1 - 0.3 * s.damage) * uz];
    const lx = fx; // the frames' force, which acts at the centre of rigidity
    fx -= s.c * (vb.x - va.x); fz -= s.c * (vb.z - va.z);
    if (s.pDelta) { fx += s.pDelta * dx; fz += s.pDelta * dz; }
    const fy = -s.kv * dy - s.cv * (vb.y - va.y);
    // drift at the worst corner of the frame lines
    let worst = 0;
    for (const cx of [-T.cx, T.cx]) for (const cz of [-T.cz, T.cz]) worst = Math.max(worst, Math.hypot(dx + th * cz, dz - th * cx));
    s.d = Math.hypot(ux, uz); s.r = worst / s.driftHeight;
    B.applyImpulse({ x: fx * DT, y: fy * DT, z: fz * DT }, true);
    if (s.aDyn) A.applyImpulse({ x: -fx * DT, y: -fy * DT, z: -fz * DT }, true);
    // rocking (about x and z) through the support springs, twisting (about y) through the frames
    const tx = -s.kr * qr.x * f - s.cr * (wb.x - wa.x);
    const ty = T.ecc * lx - T.kt * th - T.ct * (wb.y - wa.y);
    const tz = -s.kr * qr.z * f - s.cr * (wb.z - wa.z);
    B.applyTorqueImpulse({ x: tx * DT, y: ty * DT, z: tz * DT }, true);
    if (s.aDyn) A.applyTorqueImpulse({ x: -tx * DT, y: -ty * DT, z: -tz * DT }, true);
    if (s.r > s.ultR || s.damage >= 1) this.failStory(s, dx, dz);
  }

  /** How far a story has twisted, degrees (Model 2). */
  twistDeg(s: Spring): number {
    const qr = qmul(s.b.body.rotation(), qinv(s.a.body.rotation()));
    const sn = Math.hypot(qr.x, qr.y, qr.z);
    const f = sn > 1e-9 ? (2 * Math.atan2(sn, Math.abs(qr.w))) / sn : 2;
    return ((qr.w < 0 ? -qr.y : qr.y) * f * 180) / Math.PI;
  }

  /**
   * Model 2's bilinear story law, in both horizontal directions at once (kinematic hardening).
   * The elastic part of the drift is capped at the yield drift. Pushing past it moves the
   * plastic offset (ex, ez), which stays when the story unloads: a permanent lean. After
   * yielding the story stiffness is `hardening` times k. Damage is the accumulated yielding
   * over the story's capacity, and the story fractures at 1.
   */
  private bilinearForce(s: Spring, dx: number, dz: number): [number, number] {
    const law = s.bilinear!, a = law.hardening, dy = s.yieldR * s.driftHeight;
    let ux = dx - s.ex, uz = dz - s.ez;
    const u = Math.hypot(ux, uz);
    if (u > dy) {
      const over = u - dy;
      s.ex += (ux / u) * over; s.ez += (uz / u) * over;
      ux = dx - s.ex; uz = dz - s.ez;
      if (s.plastic === 0) this.emit({ kind: 'crack', t: this.simT, p: 0.5, story: s.label, pos: this.memberMid(s) });
      s.plastic += over;
      s.damage = Math.min(1, s.plastic / (law.capacity * (s.ultR - s.yieldR) * s.driftHeight));
    }
    return [-s.k * (a * dx + (1 - a) * ux), -s.k * (a * dz + (1 - a) * uz)];
  }

  /** Permanent lean of a story after yielding (Model 2), as a drift ratio. */
  residualDrift(s: Spring): number {
    return Math.hypot(s.ex, s.ez) / s.driftHeight;
  }

  private memberMid(s: Spring): Vec3 {
    const p = s.b.body.translation();
    return [p.x, p.y - 1, p.z];
  }

  /** A story gives way: members become Rapier pieces, concrete chunks fall (prototype `failStory`). */
  private failStory(s: Spring, dx: number, dz: number): void {
    const R = this.R, rand = this.rand;
    s.failed = true;
    if (!this.failNote) {
      this.failNote = this.drive.mode === 'quake'
        ? `${s.label} failed ${this.drive.t.toFixed(1)} s into the quake`
        : `${s.label} failed at ${this.drive.fNow.toFixed(2)} Hz`;
    }
    const va = s.a.body.linvel(), vb = s.b.body.linvel();
    const vel = { x: (va.x + vb.x) / 2, y: (va.y + vb.y) / 2, z: (va.z + vb.z) / 2 };
    const dl = Math.hypot(dx, dz) || 1;
    const dir = { x: dx / dl, z: dz / dl };
    const story = s.index;
    // Model 2 stories can wear out at a small drift, with the floor nearly still. Broken
    // columns spawned upright under it would hold it up like props, so for Model 2 the
    // pieces are a little shorter and thrown outward, and the floor is pushed the way it
    // leans (a random way if it barely leans). Model 1 keeps the prototype's behavior.
    const m2 = s.bilinear !== null;
    const centre = s.b.body.translation();
    if (m2) {
      if (Math.hypot(dx, dz) < 0.01) { const a = rand() * Math.PI * 2; dir.x = Math.cos(a); dir.z = Math.sin(a); }
      s.b.body.setLinvel({ x: vb.x + dir.x * 1.2, y: vb.y, z: vb.z + dir.z * 1.2 }, true);
    }
    for (const m of s.members) {
      const [a, b] = this.memberEnds(s, m);
      const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const axis = { x: (b.x - a.x) / L, y: (b.y - a.y) / L, z: (b.z - a.z) / L };
      const q = fromUnitVectors(UP, axis);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
      const isCol = m.kind === 'col';
      const parts = isCol ? 2 : 1, w = isCol ? 0.2 : 0.07;
      for (let p = 0; p < parts; p++) {
        const off = parts === 2 ? (p === 0 ? -L / 4 : L / 4) : 0, len = (L / parts) * (m2 ? 0.8 : 1);
        const body = this.dynBody(mid.x + axis.x * off, mid.y + axis.y * off, mid.z + axis.z * off, q, true);
        this.world.createCollider(R.ColliderDesc.cuboid(w / 2, len / 2, w / 2).setMass(isCol ? 90 : 30).setFriction(0.6), body);
        const kick = (p === 0 ? 1 : -1) * 1.8;
        if (m2) {
          // outward from the middle of the floor plan
          const ox = mid.x - centre.x, oz = mid.z - centre.z, ol = Math.hypot(ox, oz) || 1;
          body.setLinvel({ x: vel.x + (ox / ol) * 2 + dir.x * kick * 0.5 + (rand() - 0.5), y: vel.y, z: vel.z + (oz / ol) * 2 + dir.z * kick * 0.5 + (rand() - 0.5) }, true);
        } else {
          body.setLinvel({ x: vel.x + dir.x * kick + (rand() - 0.5), y: vel.y, z: vel.z + dir.z * kick + (rand() - 0.5) }, true);
        }
        body.setAngvel({ x: (rand() - 0.5) * 5, y: (rand() - 0.5) * 2, z: (rand() - 0.5) * 5 }, true);
        this.register(body, 90, 'piece', { type: 'member-piece', member: isCol ? 'col' : 'brace', len, story });
      }
    }
    const p = s.b.body.translation();
    for (let i = 0; i < 14; i++) {
      const sz = 0.08 + rand() * 0.16;
      const uv: [number, number] = [this.visual(), this.visual()];
      const hx = this.specimen.floors[0]!.half.x, hz = this.specimen.floors[0]!.half.z;
      const ex = (rand() < 0.5 ? -1 : 1) * hx * (0.6 + rand() * 0.45), ez = (rand() - 0.5) * hz * 2;
      const body = this.dynBody(p.x + ex, p.y - 0.2, p.z + ez, null, true);
      this.world.createCollider(R.ColliderDesc.cuboid(sz / 2, sz * 0.35, sz * 0.6).setMass(4).setFriction(0.6).setRestitution(0.2), body);
      body.setLinvel({ x: vel.x + (rand() - 0.5) * 3, y: rand() * 2, z: vel.z + (rand() - 0.5) * 3 }, true);
      this.register(body, 4, 'piece', { type: 'chunk', size: sz, uv });
    }
    s.b.body.applyTorqueImpulse({ x: (rand() - 0.5) * 3000, y: 0, z: (rand() - 0.5) * 3000 }, true);
    this.emit({ kind: 'fail', t: this.simT, p: 1, story: s.label, pos: [p.x, p.y - 0.8, p.z] });
  }

  // ---------------------------------------------------------------- events

  /**
   * Impacts from sudden velocity changes (the prototype's test), judged over a fixed window
   * of simulated time instead of per rendered frame, so every device hears the same thing.
   */
  private detectImpacts(window: number): void {
    for (const o of this.bodies) {
      if (o.kind === 'table') continue;
      const v = o.body.linvel();
      const dv = Math.hypot(v.x - o.pv.x, v.y - o.pv.y, v.z - o.pv.z);
      o.pv.x = v.x; o.pv.y = v.y; o.pv.z = v.z;
      o.cool -= window;
      if (dv > 1.6 && o.cool <= 0) {
        const J = o.mass * dv;
        if (J < 25) continue;
        o.cool = 0.3;
        const t = o.body.translation();
        this.emit({ kind: 'impact', t: this.simT, p: Math.min(1, J / (o.kind === 'slab' ? 20000 : 600)), heavy: o.kind === 'slab' || J > 2000, pos: [t.x, t.y, t.z] });
      }
    }
  }

  private emit(e: SimEvent): void {
    this.events.push(e);
  }
}
