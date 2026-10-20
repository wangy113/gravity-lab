/**
 * Stability guard (docs/ARCHITECTURE.md 5.3). The springs are integrated explicitly: Rapier's
 * semi-implicit Euler with the damping force computed from the previous velocity. For one
 * mode with angular frequency w and damping ratio z, and h = w dt, that is stable only while
 * h^2 + 4 z h < 4 (and z h < 1). The guard computes every mode of each spring chain
 * (lateral, vertical and rocking) and rejects a specimen that uses more than 70% of that.
 */
import { DT } from '../constants.ts';
import type { CompiledFloor, CompiledSpring } from './compile.ts';
import { chainMatrix, symmetricEigen } from './modal.ts';

export const STABILITY_LIMIT = 0.7;
/** The isolators' moat stop is a spring 60 times as stiff as the bearings (prototype `applySprings`). */
export const MOAT_FACTOR = 60;

export type Chain = 'lateral' | 'vertical' | 'rocking';
// Model 1's support springs stiffen with every story added, so height is what drives the
// vertical and rocking modes. Laterally the frame stiffness and floor mass do.
const ADVICE: Record<Chain, string> = {
  lateral: 'Try a more flexible frame or heavier floors.',
  vertical: 'Try fewer stories.',
  rocking: 'Try fewer stories or wider floors.',
};
export interface ModeUse { chain: Chain; hz: number; zeta: number; use: number }
export interface StabilityReport { ok: boolean; worst: ModeUse; modes: ModeUse[]; message: string }

/** Share of the stability limit one mode uses, 1 at the limit. */
export function stabilityUse(omega: number, zeta: number, dt = DT): number {
  const h = omega * dt;
  return Math.max((h * h + 4 * zeta * h) / 4, zeta * h);
}

/** Modes of a fixed-base chain with damping per link, damping ratios by Rayleigh quotient. */
function chainModes(chain: Chain, masses: number[], k: number[], c: number[], dt: number): ModeUse[] {
  const K = chainMatrix(masses, k), C = chainMatrix(masses, c);
  const { values, vectors } = symmetricEigen(K);
  return values.map((lambda, i) => {
    const w = Math.sqrt(Math.max(0, lambda));
    const v = vectors[i]!;
    let cq = 0;
    for (let a = 0; a < v.length; a++) for (let b = 0; b < v.length; b++) cq += v[a]! * C[a]![b]! * v[b]!;
    const zeta = w > 0 ? cq / (2 * w) : 0;
    return { chain, hz: w / (2 * Math.PI), zeta, use: stabilityUse(w, zeta, dt) };
  });
}

/**
 * Checks a compiled tower. Springs must form one chain from the table up (spring i holds
 * floor i), which is what Model 1 builds.
 */
export function checkStability(floors: readonly CompiledFloor[], springs: readonly CompiledSpring[], dt = DT): StabilityReport {
  springs.forEach((s, i) => {
    if (s.upper !== i || s.lower !== i - 1) throw new Error('stability check expects one spring per floor, bottom to top');
  });
  const mass = floors.map((f) => f.mass), inertia = floors.map((f) => f.inertia);
  const modes = [
    // Worst case laterally: an isolated building pressed against its moat stop.
    // Isolators and the roof damper at their stops are the stiffest case.
    ...chainModes('lateral', mass, springs.map((s) => (s.iso ? s.k * (1 + MOAT_FACTOR) : s.k)), springs.map((s) => s.c), dt),
    ...chainModes('vertical', mass, springs.map((s) => s.kv), springs.map((s) => s.cv), dt),
    ...chainModes('rocking', inertia, springs.map((s) => s.kr), springs.map((s) => s.cr), dt),
  ];
  const worst = modes.reduce((a, b) => (b.use > a.use ? b : a));
  const ok = worst.use <= STABILITY_LIMIT;
  const pct = Math.round(worst.use * 100);
  const message = ok
    ? `Stable: the fastest ${worst.chain} vibration (${worst.hz.toFixed(1)} Hz) uses ${pct}% of what the simulation can handle.`
    : `This building vibrates too fast for the simulation to follow. Its ${worst.chain} vibration at ${worst.hz.toFixed(1)} Hz would use ${pct}% of the limit, and the most allowed is ${Math.round(STABILITY_LIMIT * 100)}%. ${ADVICE[worst.chain]}`;
  return { ok, worst, modes, message };
}
