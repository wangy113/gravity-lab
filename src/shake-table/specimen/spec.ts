/**
 * Specimen specification, Models 1 and 2 (docs/ARCHITECTURE.md 5.3 and Appendix B). A specimen is
 * data: floors, stories and a base. `compile.ts` turns it into bodies and springs, and
 * `stability.ts` checks it before the simulation is allowed to run it.
 */
import { CH, M, ST, ISO_H, ISO_LIMIT, type PresetType } from '../constants.ts';

export type DamageLawSpec =
  /** The prototype's law: stiffness drops by up to 30% past the yield drift, failure at the ultimate drift. */
  | { kind: 'prototype-damage'; yieldDrift: number; ultimateDrift: number } // drift ratios
  /**
   * Model 2: elastic up to the yield drift, then the stiffness falls to `hardening` times k and
   * the story keeps a permanent lean when it unloads. It fractures past the ultimate drift, or
   * when its accumulated yielding reaches `capacity` times the gap between yield and ultimate.
   */
  | { kind: 'bilinear'; yieldDrift: number; ultimateDrift: number; hardening: number; capacity: number };

export interface StorySpec {
  columnHeight: number;  // clear height, also used for drift ratio, m
  dampingRatio: number;
  lateral: { kind: 'story'; k: number; law: DamageLawSpec }; // N/m
  /** Drawn members only. Model 1 puts the bracing's stiffness in `lateral.k`. */
  bracing: 'none' | 'x';
  /** Drawn only: column width, m (0.2 when not given). */
  columnSize?: number;
  /** Drawn only: show dampers. Model 1 puts their effect in `dampingRatio`. */
  dampers?: boolean;
}

export type BaseSpec =
  | { kind: 'fixed' }
  | { kind: 'rubber'; k: number; dampingRatio: number; moatGap: number; height: number }; // N/m, -, m, m

export interface SpecimenSpec {
  id: string;
  name: string;
  /**
   * 1: the prototype's model (support springs that stiffen with height, no P-Delta). 2: support
   * springs fixed per story, P-Delta, and the bilinear law allowed.
   */
  modelVersion: 1 | 2;
  plan: { x: number; z: number };              // slab size, m
  slab: { thickness: number; mass: number };   // m, kg per floor
  base: BaseSpec;
  stories: StorySpec[];                        // bottom to top
}

const story = (k: number, dampingRatio: number, yieldDrift: number, ultimateDrift: number, bracing: StorySpec['bracing']): StorySpec => ({
  columnHeight: CH, dampingRatio, bracing, lateral: { kind: 'story', k, law: { kind: 'prototype-damage', yieldDrift, ultimateDrift } },
});
const tower = (id: string, name: string, s: StorySpec, base: BaseSpec): SpecimenSpec => ({
  id, name, modelVersion: 1, plan: { x: 3, z: 3 }, slab: { thickness: ST, mass: M }, base, stories: [s, structuredClone(s), structuredClone(s)],
});

/** The prototype's three buildings (its `TYPES`), unchanged. */
export const PRESETS: Record<PresetType, SpecimenSpec> = {
  bare: tower('bare', 'Bare frame', story(1.14e6, 0.02, 0.02, 0.06, 'none'), { kind: 'fixed' }),
  braced: tower('braced', 'Braced', story(6.84e6, 0.05, 0.015, 0.045, 'x'), { kind: 'fixed' }),
  isolated: tower('isolated', 'Isolated', story(6.84e6, 0.05, 0.015, 0.045, 'x'), { kind: 'rubber', k: 1.01e5, dampingRatio: 0.25, moatGap: ISO_LIMIT, height: ISO_H }),
};

/** Limits a specimen must stay inside, checked before compiling. */
export const LIMITS = { stories: [1, 6], plan: [1.5, 5], storyK: [1e4, 5e7], dampingRatio: [0, 0.3], slabMass: [500, 2e4] } as const;

/** Plain messages for anything outside the limits, empty when the specimen is valid. */
export function specProblems(s: SpecimenSpec): string[] {
  const out: string[] = [];
  const inside = (v: number, [lo, hi]: readonly [number, number]): boolean => Number.isFinite(v) && v >= lo && v <= hi;
  if (!inside(s.stories.length, LIMITS.stories)) out.push(`A building needs ${LIMITS.stories[0]} to ${LIMITS.stories[1]} stories.`);
  if (!inside(s.plan.x, LIMITS.plan) || !inside(s.plan.z, LIMITS.plan)) out.push(`Floors must be ${LIMITS.plan[0]} to ${LIMITS.plan[1]} m wide.`);
  if (!inside(s.slab.mass, LIMITS.slabMass)) out.push(`Each floor must weigh ${LIMITS.slabMass[0]} to ${LIMITS.slabMass[1]} kg.`);
  if (!(s.slab.thickness > 0.05 && s.slab.thickness < 0.5)) out.push('Slabs must be 5 to 50 cm thick.');
  s.stories.forEach((st, i) => {
    const n = `Story ${i + 1}`;
    if (!inside(st.lateral.k, LIMITS.storyK)) out.push(`${n} stiffness must be between ${LIMITS.storyK[0]} and ${LIMITS.storyK[1]} N/m.`);
    if (!inside(st.dampingRatio, LIMITS.dampingRatio)) out.push(`${n} damping must be 0 to ${LIMITS.dampingRatio[1] * 100}%.`);
    if (!(st.columnHeight >= 1 && st.columnHeight <= 4)) out.push(`${n} columns must be 1 to 4 m tall.`);
    const law = st.lateral.law;
    if (!(law.yieldDrift > 0 && law.ultimateDrift > law.yieldDrift)) out.push(`${n} must fail at a larger drift than it yields.`);
    if (law.kind === 'bilinear' && !(law.hardening >= 0 && law.hardening < 1 && law.capacity > 0)) out.push(`${n} needs a hardening below 1 and a positive capacity.`);
    if (law.kind === 'bilinear' && s.modelVersion !== 2) out.push(`${n} uses the bilinear law, which needs Model 2.`);
  });
  if (s.base.kind === 'rubber' && !(s.base.k > 0 && s.base.moatGap > 0 && s.base.height > 0)) out.push('Isolators need a stiffness, a height and a moat gap.');
  return out;
}
