/**
 * Compiles a specimen specification into plain data: floor slabs, springs and the members to
 * draw (docs/ARCHITECTURE.md 5.3). The simulation turns this into Rapier bodies. For Model 1
 * the arithmetic follows the prototype's `buildTower` step by step, so the three presets give
 * bit-identical physics.
 */
import type { V3 } from '../../core/sim/math.ts';
import { TOP, X0 } from '../constants.ts';
import { coupledFrequencies, shearBuildingFrequencies } from './modal.ts';
import { specProblems, type SpecimenSpec } from './spec.ts';
import { checkStability, type StabilityReport } from './stability.ts';

const TABLE_HALF = 0.15; // half thickness of the table top, m
/** How far the roof damper's block can move before it hits its bumpers, m. */
export const TMD_STROKE = 0.35;
/** Model 2's support springs: single-story frequencies, Hz, and damping ratio. */
export const SUPPORT_V2 = { vertical: 15, rocking: 10, damping: 0.2 } as const;

export type MemberKind = 'col' | 'brace' | 'bear' | 'damper';
/** A drawn member, from a point on the lower body (`la`) to a point on the upper body (`lb`), body-local. */
export interface Member { la: V3; lb: V3; kind: MemberKind; size?: number }

export interface CompiledFloor {
  /** A building floor, or the tuned mass damper's block on the roof. */
  kind: 'slab' | 'tmd';
  y: number;         // centre height, m
  mass: number;      // kg
  half: { x: number; y: number; z: number }; // half sizes, m
  inertia: number;   // rocking inertia about a horizontal axis, kg m^2
  inertiaY: number;  // twisting inertia about the vertical axis, kg m^2
}

export interface CompiledSpring {
  label: string;
  lower: number;     // floor index below, -1 for the table
  upper: number;     // floor index above
  rest: V3;          // upper centre relative to lower centre at rest, m
  k: number; c: number;   // lateral, N/m and N s/m
  kv: number; cv: number; // vertical support
  kr: number; cr: number; // rocking support
  /** No damage law: isolators and the tuned mass damper. */
  iso: boolean;
  /** The tuned mass damper's spring (also `iso`, but with no moat). */
  tmd: boolean;
  moatGap: number;   // m, isolators only
  driftHeight: number; // m
  yieldR: number; ultR: number; // drift ratios
  /** Model 2's bilinear law, or null for the prototype's damage law. */
  bilinear: { hardening: number; capacity: number } | null;
  /** P-Delta: the weight above divided by the story height, N/m. It acts as a negative lateral stiffness. 0 in Model 1. */
  pDelta: number;
  /**
   * Model 2 stories: twisting. `ecc` is how far the centre of rigidity sits from the middle
   * along z (m), `kt` and `ct` the twisting stiffness and damping about it, `cx` and `cz` the
   * frame lines' half spacing (m), used to judge drift at the worst corner. Null otherwise.
   */
  torsion: { ecc: number; kt: number; ct: number; cx: number; cz: number } | null;
  members: Member[];
}

export interface CompiledSpecimen {
  spec: SpecimenSpec;
  floors: CompiledFloor[]; // bottom to top, the isolated base slab first
  springs: CompiledSpring[];
  /** Height of the lowest floor surface furniture stands on, m. */
  groundFloor: number;
  /** Undamaged natural frequencies, Hz, lowest first (with the roof damper, if any). */
  modes: number[];
  /** The roof damper's tuning, if it has one: its own frequency (Hz), damping ratio and mass (kg). */
  tmd: { hz: number; zeta: number; mass: number } | null;
  stability: StabilityReport;
}

export class SpecimenError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(problems.join(' '));
    this.problems = problems;
  }
}

/** Builds the model, or throws a SpecimenError with plain messages when the specimen is out of bounds or unstable. */
export function compileSpecimen(spec: SpecimenSpec): CompiledSpecimen {
  const problems = specProblems(spec);
  if (problems.length) throw new SpecimenError(problems);

  const t = spec.slab.thickness, m = spec.slab.mass;
  const n = spec.stories.length;
  const half = { x: spec.plan.x / 2, y: t / 2, z: spec.plan.z / 2 };
  const inertia = (m * (Math.max(spec.plan.x, spec.plan.z) ** 2 + t * t)) / 12;
  const inertiaY = (m * (spec.plan.x ** 2 + spec.plan.z ** 2)) / 12;
  // Numerical support springs (vertical and rocking). Model 1 keeps the prototype's: 10 Hz
  // vertical scaled by the number of stories, 8 Hz rocking, both 30% damped. That scaling
  // makes tall buildings unstable (stability.ts). Model 2 fixes them per story, so they stay
  // the same however tall the building is, and damps them at 20%.
  const v2 = spec.modelVersion === 2;
  const kv = v2 ? m * Math.pow(2 * Math.PI * SUPPORT_V2.vertical, 2) : m * n * Math.pow(2 * Math.PI * 10, 2);
  const cv = 2 * (v2 ? SUPPORT_V2.damping : 0.3) * Math.sqrt(kv * m);
  const kr = inertia * Math.pow(2 * Math.PI * (v2 ? SUPPORT_V2.rocking : 8), 2);
  const cr = 2 * (v2 ? SUPPORT_V2.damping : 0.3) * Math.sqrt(kr * inertia);
  // Weight carried by each story (the floors above it), for P-Delta in Model 2.
  const G = 9.81;
  const tmdMass = spec.tmd ? spec.tmd.massRatio * m * n : 0;
  const weightAbove = (story: number): number => (v2 ? G * (m * (n - story) + tmdMass) : 0);

  const floors: CompiledFloor[] = [];
  const springs: CompiledSpring[] = [];
  const support = { kv, cv, kr, cr };
  const addFloor = (y: number): number => floors.push({ kind: 'slab', y, mass: m, half, inertia, inertiaY }) - 1;

  let lower = -1, lowerTopY = TOP, lowerHalf = TABLE_HALF, lx = X0;
  let groundFloor = TOP;
  const base = spec.base;
  if (base.kind === 'rubber') {
    const yb = TOP + base.height + t / 2;
    const b = addFloor(yb);
    const totalMass = m * (n + 1);
    const s: CompiledSpring = {
      label: 'Isolators', lower: -1, upper: b, rest: { x: X0, y: TABLE_HALF + base.height + t / 2, z: 0 },
      k: base.k, c: 2 * base.dampingRatio * Math.sqrt(base.k * totalMass), ...support,
      iso: true, tmd: false, moatGap: base.moatGap, driftHeight: spec.stories[0]!.columnHeight, yieldR: 0, ultR: Infinity,
      bilinear: null, pDelta: 0, torsion: null, members: [],
    };
    const B = Math.min(half.x, half.z) - 0.4;
    for (const cx of [-B, B]) for (const cz of [-B, B]) s.members.push({ la: { x: X0 + cx, y: TABLE_HALF, z: cz }, lb: { x: cx, y: -t / 2, z: cz }, kind: 'bear' });
    springs.push(s);
    lower = b; lowerTopY = yb + t / 2; lowerHalf = t / 2; lx = 0;
    groundFloor = TOP + base.height + t;
  }

  let prevCenter = lower === -1 ? TOP - TABLE_HALF : lowerTopY - t / 2;
  spec.stories.forEach((st, i) => {
    const lh = i === 0 ? lowerHalf : t / 2;
    const y = prevCenter + lh + st.columnHeight + t / 2;
    const f = addFloor(y);
    const rest = { x: i === 0 ? lx : 0, y: y - prevCenter, z: 0 };
    const law = st.lateral.law;
    const s: CompiledSpring = {
      label: `Story ${i + 1}`, lower, upper: f, rest,
      k: st.lateral.k, c: 2 * st.dampingRatio * Math.sqrt(st.lateral.k * m), ...support,
      iso: false, tmd: false, moatGap: Infinity, driftHeight: st.columnHeight, yieldR: law.yieldDrift, ultR: law.ultimateDrift,
      bilinear: law.kind === 'bilinear' ? { hardening: law.hardening, capacity: law.capacity } : null,
      pDelta: weightAbove(i) / rest.y,
      torsion: null,
      members: [],
    };
    const Cx = half.x - 0.15, Cz = half.z - 0.15;
    if (v2) {
      // Frame lines along x sit at z = +Cz and -Cz and share the story's x stiffness; the lines
      // along z (at x = +Cx and -Cx) share the z stiffness evenly. The centre of rigidity is
      // where the x lines balance, and the story twists about it.
      const share = st.xShare ?? 0.5, k = st.lateral.k;
      const ecc = Cz * (2 * share - 1);
      const kt = k * (share * (Cz - ecc) ** 2 + (1 - share) * (Cz + ecc) ** 2) + k * Cx * Cx;
      s.torsion = { ecc, kt, ct: 2 * st.dampingRatio * Math.sqrt(kt * inertiaY), cx: Cx, cz: Cz };
    }
    for (const cx of [-Cx, Cx]) for (const cz of [-Cz, Cz]) s.members.push({ la: { x: rest.x + cx, y: lh, z: cz }, lb: { x: cx, y: -t / 2, z: cz }, kind: 'col', ...(st.columnSize ? { size: st.columnSize } : {}) });
    if (st.bracing !== 'none') for (const cz of st.bracing === 'one-side' ? [Cz] : [-Cz, Cz]) {
      s.members.push({ la: { x: rest.x - Cx, y: lh, z: cz }, lb: { x: Cx, y: -t / 2, z: cz }, kind: 'brace' });
      s.members.push({ la: { x: rest.x + Cx, y: lh, z: cz }, lb: { x: -Cx, y: -t / 2, z: cz }, kind: 'brace' });
    }
    // One damper per side, across the story's inner diagonal, just inside the frame.
    if (st.dampers) for (const cz of [-Cz * 0.8, Cz * 0.8]) s.members.push({ la: { x: rest.x - Cx + 0.35, y: lh, z: cz }, lb: { x: Cx - 0.35, y: -t / 2, z: cz }, kind: 'damper' });
    springs.push(s);
    lower = f; prevCenter = y;
  });

  // P-Delta softens each story, so the building swings a little slower than its frame alone.
  // Model 2 couples sway and twisting, so a building stiffer on one side has its own modes.
  const frequencies = (): number[] => (v2
    ? coupledFrequencies(floors.map((fl) => fl.mass), floors.map((fl) => fl.inertiaY),
      springs.map((s) => ({ k: s.k - s.pDelta, ecc: s.torsion?.ecc ?? 0, kt: s.torsion?.kt ?? s.kr })))
    : shearBuildingFrequencies(floors.map((fl) => fl.mass), springs.map((s) => s.k - s.pDelta)));
  let tmd: CompiledSpecimen['tmd'] = null;
  if (spec.tmd) {
    // Den Hartog's optimum for a damper on an undamped building: tune just below the first
    // mode, f = f1 / (1 + mu), with damping ratio sqrt(3 mu / (8 (1 + mu)^3)).
    const mu = spec.tmd.massRatio, f1 = frequencies()[0]!;
    const hz = f1 / (1 + mu), zeta = Math.sqrt((3 * mu) / (8 * Math.pow(1 + mu, 3)));
    const bh = { x: 0.35, y: 0.2, z: 0.35 }, gap = 0.12; // a steel block on short bearings
    const roof = floors.length - 1;
    const tI = (tmdMass * (4 * bh.x * bh.x + 4 * bh.y * bh.y)) / 12;
    const tk = tmdMass * Math.pow(2 * Math.PI * hz, 2);
    const tkv = tmdMass * Math.pow(2 * Math.PI * SUPPORT_V2.vertical, 2), tkr = tI * Math.pow(2 * Math.PI * SUPPORT_V2.rocking, 2);
    const restY = t / 2 + gap + bh.y;
    floors.push({ kind: 'tmd', y: floors[roof]!.y + restY, mass: tmdMass, half: bh, inertia: tI, inertiaY: tI });
    const s: CompiledSpring = {
      label: 'Roof damper', lower: roof, upper: floors.length - 1, rest: { x: 0, y: restY, z: 0 },
      k: tk, c: 2 * zeta * Math.sqrt(tk * tmdMass),
      kv: tkv, cv: 2 * SUPPORT_V2.damping * Math.sqrt(tkv * tmdMass), kr: tkr, cr: 2 * SUPPORT_V2.damping * Math.sqrt(tkr * tI),
      // Its stroke is limited by bumpers 35 cm out, like the isolators' moat, so it stays on the roof.
      iso: true, tmd: true, moatGap: TMD_STROKE, driftHeight: restY, yieldR: 0, ultR: Infinity, bilinear: null, pDelta: 0, torsion: null, members: [],
    };
    // the block's bearings and dampers, drawn from the roof to its corners
    for (const cx of [-0.25, 0.25]) for (const cz of [-0.25, 0.25]) s.members.push({ la: { x: cx, y: t / 2, z: cz }, lb: { x: cx, y: -bh.y, z: cz }, kind: 'damper' });
    springs.push(s);
    tmd = { hz, zeta, mass: tmdMass };
  }
  const modes = frequencies();
  const stability = checkStability(floors, springs);
  if (!stability.ok) throw new SpecimenError([stability.message]);
  return { spec, floors, springs, groundFloor, modes, stability, tmd };
}
