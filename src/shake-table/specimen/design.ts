/**
 * The design challenge's building kit: what a student can choose for each story and for
 * the base, what each choice costs, and how a design becomes a specimen specification.
 * Costs are lab credits, not dollars. They only make the trade-offs visible.
 */
import { CH, ISO_H, ISO_LIMIT, M, ST } from '../constants.ts';
import type { SpecimenSpec, StorySpec } from './spec.ts';

export type FrameChoice = 'light' | 'heavy' | 'braced';
export interface Design {
  frames: [FrameChoice, FrameChoice, FrameChoice]; // story 1 (bottom) to story 3
  dampers: [boolean, boolean, boolean];
  isolated: boolean;
}

interface FrameKind { label: string; k: number; zeta: number; yieldDrift: number; ultimateDrift: number; cost: number; bracing: StorySpec['bracing']; columnSize: number }
export const FRAMES: Record<FrameChoice, FrameKind> = {
  // The prototype's bare frame and braced frame, plus a heavier moment frame between them.
  light: { label: 'Light frame', k: 1.14e6, zeta: 0.02, yieldDrift: 0.02, ultimateDrift: 0.06, cost: 100, bracing: 'none', columnSize: 0.2 },
  heavy: { label: 'Heavy frame', k: 2.85e6, zeta: 0.03, yieldDrift: 0.02, ultimateDrift: 0.06, cost: 180, bracing: 'none', columnSize: 0.32 },
  braced: { label: 'Braced frame', k: 6.84e6, zeta: 0.05, yieldDrift: 0.015, ultimateDrift: 0.045, cost: 260, bracing: 'x', columnSize: 0.2 },
};
/** Viscous dampers add damping to a story without making it stiffer. */
export const DAMPER = { label: 'Dampers', zeta: 0.2, cost: 120 } as const;
/** The prototype's rubber isolators and moat. */
export const ISOLATION = { label: 'Base isolation', k: 1.01e5, zeta: 0.25, cost: 450 } as const;

/** The challenge: survive this quake within this budget. Calibrated with scripts/calibrate-design.ts. */
export const CHALLENGE = { g: 0.4, budget: 600 } as const;

export const START_DESIGN: Design = { frames: ['light', 'light', 'light'], dampers: [false, false, false], isolated: false };

export function designCost(d: Design): number {
  return d.frames.reduce((s, f) => s + FRAMES[f].cost, 0) + d.dampers.filter(Boolean).length * DAMPER.cost + (d.isolated ? ISOLATION.cost : 0);
}

export function designSpec(d: Design): SpecimenSpec {
  const stories = d.frames.map((f, i): StorySpec => {
    const F = FRAMES[f];
    return {
      columnHeight: CH,
      dampingRatio: F.zeta + (d.dampers[i] ? DAMPER.zeta : 0),
      bracing: F.bracing,
      columnSize: F.columnSize,
      dampers: d.dampers[i],
      lateral: { kind: 'story', k: F.k, law: { kind: 'prototype-damage', yieldDrift: F.yieldDrift, ultimateDrift: F.ultimateDrift } },
    };
  });
  return {
    id: 'custom', name: 'Your design', modelVersion: 1,
    plan: { x: 3, z: 3 }, slab: { thickness: ST, mass: M },
    base: d.isolated ? { kind: 'rubber', k: ISOLATION.k, dampingRatio: ISOLATION.zeta, moatGap: ISO_LIMIT, height: ISO_H } : { kind: 'fixed' },
    stories,
  };
}

/** A short name for notebooks and tables, for example "Braced, heavy, light + dampers on 1". */
export function designName(d: Design): string {
  const frames = d.frames.map((f) => FRAMES[f].label.split(' ')[0]!.toLowerCase()).join(', ');
  const damp = d.dampers.map((on, i) => (on ? i + 1 : 0)).filter(Boolean);
  return `${d.isolated ? 'Isolated: ' : ''}${frames[0]!.toUpperCase()}${frames.slice(1)}${damp.length ? ` + dampers on ${damp.join(' and ')}` : ''}`;
}
