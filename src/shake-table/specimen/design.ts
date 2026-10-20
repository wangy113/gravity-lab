/**
 * The design challenge's building kit: the levels, what a student can choose for each story
 * and for the base, what each choice costs, and how a design becomes a specimen
 * specification. Designs run on Model 2 (bilinear stories, P-Delta, support springs fixed per
 * story), so a building can survive but lean, and taller buildings stay stable.
 * Costs are lab credits, not dollars. They only make the trade-offs visible.
 */
import { CH, ISO_H, ISO_LIMIT, M, ST } from '../constants.ts';
import type { QuakeKind } from '../motion/quake.ts';
import type { SpecimenSpec, StorySpec } from './spec.ts';

export type FrameChoice = 'light' | 'heavy' | 'braced';
export type LevelId = 1 | 2;
export interface Design {
  level: LevelId;
  frames: FrameChoice[]; // story 1 (bottom) up, one per story
  dampers: boolean[];
  isolated: boolean;
}

/** The challenges. Calibrated with scripts/calibrate-design.ts and pinned by tests/scenarios/design.test.ts. */
export interface Level {
  title: string; stories: number; g: number; quake: QuakeKind; budget: number;
  /** Largest story drift allowed during the quake, percent, or null when surviving is enough. */
  maxDriftPct: number | null;
}
export const LEVELS: Record<LevelId, Level> = {
  1: { title: 'Three-story office', stories: 3, g: 0.4, quake: 'standard', budget: 600, maxDriftPct: null },
  // The slower quake: a tall flexible tower rides out the standard one, which puts its energy
  // higher. The drift limit asks for a building that is still usable, not just standing.
  2: { title: 'Five-story tower', stories: 5, g: 0.55, quake: 'slow', budget: 1000, maxDriftPct: 2.5 },
};

/** Whether a tested design meets its level: survived, within the drift limit and the budget. */
export function meetsLevel(level: LevelId, r: { survived: boolean; maxDriftPct: number; cost: number }): boolean {
  const L = LEVELS[level];
  return r.survived && (L.maxDriftPct === null || r.maxDriftPct <= L.maxDriftPct) && r.cost <= L.budget;
}

interface FrameKind {
  label: string; k: number; zeta: number; cost: number;
  yieldDrift: number; ultimateDrift: number; hardening: number; capacity: number;
  bracing: StorySpec['bracing']; columnSize: number;
}
export const FRAMES: Record<FrameChoice, FrameKind> = {
  // Moment frames bend a long way before they break. Braced frames are about six times
  // stiffer but yield sooner and wear out faster once the braces start to buckle.
  light: { label: 'Light frame', k: 1.14e6, zeta: 0.02, cost: 100, yieldDrift: 0.02, ultimateDrift: 0.06, hardening: 0.05, capacity: 6, bracing: 'none', columnSize: 0.2 },
  heavy: { label: 'Heavy frame', k: 2.85e6, zeta: 0.03, cost: 180, yieldDrift: 0.02, ultimateDrift: 0.06, hardening: 0.05, capacity: 6, bracing: 'none', columnSize: 0.32 },
  braced: { label: 'Braced frame', k: 6.84e6, zeta: 0.05, cost: 260, yieldDrift: 0.01, ultimateDrift: 0.04, hardening: 0.03, capacity: 3, bracing: 'x', columnSize: 0.2 },
};
/** Viscous dampers add damping to a story without making it stiffer. */
export const DAMPER = { label: 'Dampers', zeta: 0.2, cost: 120 } as const;
/** The prototype's rubber isolators and moat. */
export const ISOLATION = { label: 'Base isolation', k: 1.01e5, zeta: 0.25, cost: 450 } as const;

export function startDesign(level: LevelId): Design {
  const n = LEVELS[level].stories;
  return { level, frames: Array<FrameChoice>(n).fill('light'), dampers: Array<boolean>(n).fill(false), isolated: false };
}

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
      lateral: { kind: 'story', k: F.k, law: { kind: 'bilinear', yieldDrift: F.yieldDrift, ultimateDrift: F.ultimateDrift, hardening: F.hardening, capacity: F.capacity } },
    };
  });
  return {
    id: 'custom', name: 'Your design', modelVersion: 2,
    plan: { x: 3, z: 3 }, slab: { thickness: ST, mass: M },
    base: d.isolated ? { kind: 'rubber', k: ISOLATION.k, dampingRatio: ISOLATION.zeta, moatGap: ISO_LIMIT, height: ISO_H } : { kind: 'fixed' },
    stories,
  };
}

/** A short name for notebooks and tables, for example "Braced, heavy, light + dampers on 1". */
export function designName(d: Design): string {
  const frames = d.frames.map((f) => FRAMES[f].label.split(' ')[0]!.toLowerCase()).join(', ');
  const damp = d.dampers.map((on, i) => (on ? i + 1 : 0)).filter(Boolean);
  const dampText = damp.length ? ` + dampers on ${damp.length > 1 ? `${damp.slice(0, -1).join(', ')} and ${damp.at(-1)}` : damp[0]}` : '';
  return `${d.isolated ? 'Isolated: ' : ''}${frames[0]!.toUpperCase()}${frames.slice(1)}${dampText}`;
}
