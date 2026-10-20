/**
 * The design challenge must stay solvable and keep teaching its lessons. These are the
 * calibration results from scripts/calibrate-design.ts, pinned so model changes cannot
 * quietly break the challenge.
 */
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { runScenario } from '../../src/shake-table/sim/scenario.ts';
import { designCost, designSpec, LEVELS, meetsLevel, type Design, type FrameChoice, type LevelId } from '../../src/shake-table/specimen/design.ts';

beforeAll(async () => {
  await RAPIER.init();
});

const FRAME: Record<string, FrameChoice> = { L: 'light', H: 'heavy', B: 'braced' };
/** "HHL" is heavy, heavy, light from the ground up. Dampers by story number. */
const design = (level: LevelId, frames: string, dampers: number[] = [], isolated = false): Design => ({
  level, frames: [...frames].map((c) => FRAME[c]!), dampers: [...frames].map((_, i) => dampers.includes(i + 1)), isolated,
});
const test = (d: Design): { survived: boolean; maxDriftPct: number; cost: number } => {
  const L = LEVELS[d.level];
  const r = runScenario(RAPIER, { type: 'custom', spec: designSpec(d), mode: 'quake', quake: L.quake, g: L.g });
  return { survived: !r.collapsed, maxDriftPct: Math.max(...r.stories.map((s) => s.maxDriftPct)), cost: designCost(d) };
};

describe('design challenge, level 1', { timeout: 60_000 }, () => {
  it('the starting design collapses', () => {
    expect(test(design(1, 'LLL')).survived).toBe(false);
  });

  it('can be won within the budget', () => {
    expect(meetsLevel(1, test(design(1, 'HHL')))).toBe(true);
  });

  it('teaches the soft story: a strong ground story over weak ones still fails, dampers rescue it', () => {
    expect(test(design(1, 'BLL')).survived).toBe(false);
    expect(test(design(1, 'BLL', [1, 2])).survived).toBe(true);
  });

  it('base isolation works on its own, at a price over the budget', () => {
    const r = test(design(1, 'LLL', [], true));
    expect(r.survived).toBe(true);
    expect(r.cost).toBeGreaterThan(LEVELS[1].budget);
  });
});

describe('design challenge, level 2', { timeout: 120_000 }, () => {
  it('the starting tower collapses', () => {
    expect(test(design(2, 'LLLLL')).survived).toBe(false);
  });

  it('standing is not enough: a tower can survive but drift past the limit', () => {
    const r = test(design(2, 'BLLLL')); // 3.7% drift: clearly over the limit, clearly short of breaking
    expect(r.survived).toBe(true);
    expect(r.maxDriftPct).toBeGreaterThan(LEVELS[2].maxDriftPct!);
    expect(meetsLevel(2, r)).toBe(false);
  });

  it('can be won within the budget by spreading the stiffness up the tower', () => {
    expect(meetsLevel(2, test(design(2, 'HHHHL')))).toBe(true);
  });
});
