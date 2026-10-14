/**
 * Compiles a specimen specification into plain data: floor slabs, Model 1 springs and the
 * members to draw (docs/ARCHITECTURE.md 5.3). The simulation turns this into Rapier bodies.
 * The arithmetic follows the prototype's `buildTower` step by step, so the three presets
 * give bit-identical physics.
 */
import type { V3 } from '../../core/sim/math.ts';
import { TOP, X0 } from '../constants.ts';
import { shearBuildingFrequencies } from './modal.ts';
import { specProblems, type SpecimenSpec } from './spec.ts';
import { checkStability, type StabilityReport } from './stability.ts';

const TABLE_HALF = 0.15; // half thickness of the table top, m

export type MemberKind = 'col' | 'brace' | 'bear' | 'damper';
/** A drawn member, from a point on the lower body (`la`) to a point on the upper body (`lb`), body-local. */
export interface Member { la: V3; lb: V3; kind: MemberKind; size?: number }

export interface CompiledFloor {
  y: number;         // centre height, m
  mass: number;      // kg
  half: { x: number; y: number; z: number }; // half sizes, m
  inertia: number;   // rocking inertia about a horizontal axis, kg m^2
}

export interface CompiledSpring {
  label: string;
  lower: number;     // floor index below, -1 for the table
  upper: number;     // floor index above
  rest: V3;          // upper centre relative to lower centre at rest, m
  k: number; c: number;   // lateral, N/m and N s/m
  kv: number; cv: number; // vertical support
  kr: number; cr: number; // rocking support
  iso: boolean;
  moatGap: number;   // m, isolators only
  driftHeight: number; // m
  yieldR: number; ultR: number; // drift ratios
  members: Member[];
}

export interface CompiledSpecimen {
  spec: SpecimenSpec;
  floors: CompiledFloor[]; // bottom to top, the isolated base slab first
  springs: CompiledSpring[];
  /** Height of the lowest floor surface furniture stands on, m. */
  groundFloor: number;
  /** Undamaged natural frequencies, Hz, lowest first. */
  modes: number[];
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
  // The prototype's numerical support springs: 10 Hz vertical (scaled by the number of
  // stories) and 8 Hz rocking, both 30% damped. Model 2 will fix them per story.
  const kv = m * n * Math.pow(2 * Math.PI * 10, 2);
  const cv = 2 * 0.3 * Math.sqrt(kv * m);
  const kr = inertia * Math.pow(2 * Math.PI * 8, 2);
  const cr = 2 * 0.3 * Math.sqrt(kr * inertia);

  const floors: CompiledFloor[] = [];
  const springs: CompiledSpring[] = [];
  const support = { kv, cv, kr, cr };
  const addFloor = (y: number): number => floors.push({ y, mass: m, half, inertia }) - 1;

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
      iso: true, moatGap: base.moatGap, driftHeight: spec.stories[0]!.columnHeight, yieldR: 0, ultR: Infinity, members: [],
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
      iso: false, moatGap: Infinity, driftHeight: st.columnHeight, yieldR: law.yieldDrift, ultR: law.ultimateDrift, members: [],
    };
    const Cx = half.x - 0.15, Cz = half.z - 0.15;
    for (const cx of [-Cx, Cx]) for (const cz of [-Cz, Cz]) s.members.push({ la: { x: rest.x + cx, y: lh, z: cz }, lb: { x: cx, y: -t / 2, z: cz }, kind: 'col', ...(st.columnSize ? { size: st.columnSize } : {}) });
    if (st.bracing === 'x') for (const cz of [-Cz, Cz]) {
      s.members.push({ la: { x: rest.x - Cx, y: lh, z: cz }, lb: { x: Cx, y: -t / 2, z: cz }, kind: 'brace' });
      s.members.push({ la: { x: rest.x + Cx, y: lh, z: cz }, lb: { x: -Cx, y: -t / 2, z: cz }, kind: 'brace' });
    }
    // One damper per side, across the story's inner diagonal, just inside the frame.
    if (st.dampers) for (const cz of [-Cz * 0.8, Cz * 0.8]) s.members.push({ la: { x: rest.x - Cx + 0.35, y: lh, z: cz }, lb: { x: Cx - 0.35, y: -t / 2, z: cz }, kind: 'damper' });
    springs.push(s);
    lower = f; prevCenter = y;
  });

  const modes = shearBuildingFrequencies(floors.map((fl) => fl.mass), springs.map((s) => s.k));
  const stability = checkStability(floors, springs);
  if (!stability.ok) throw new SpecimenError([stability.message]);
  return { spec, floors, springs, groundFloor, modes, stability };
}
