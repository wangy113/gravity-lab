/**
 * The design challenge must stay solvable and keep teaching its lessons. These are the
 * calibration results from scripts/calibrate-design.ts, pinned so model changes cannot
 * quietly break the challenge.
 */
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { runScenario } from '../../src/shake-table/sim/scenario.ts';
import { CHALLENGE, designCost, designSpec, type Design, type FrameChoice } from '../../src/shake-table/specimen/design.ts';

beforeAll(async () => {
  await RAPIER.init();
});

const design = (frames: [FrameChoice, FrameChoice, FrameChoice], dampers = [false, false, false], isolated = false): Design =>
  ({ frames, dampers: dampers as Design['dampers'], isolated });
const survives = (d: Design): boolean => !runScenario(RAPIER, { type: 'custom', spec: designSpec(d), mode: 'quake', g: CHALLENGE.g }).collapsed;

describe('design challenge', { timeout: 60_000 }, () => {
  it('the starting design collapses', () => {
    expect(survives(design(['light', 'light', 'light']))).toBe(false);
  });

  it('can be won within the budget', () => {
    const d = design(['heavy', 'heavy', 'light']);
    expect(designCost(d)).toBeLessThanOrEqual(CHALLENGE.budget);
    expect(survives(d)).toBe(true);
  });

  it('teaches the soft story: a strong ground story over weak ones still fails, dampers rescue it', () => {
    expect(survives(design(['braced', 'light', 'light']))).toBe(false);
    expect(survives(design(['braced', 'light', 'light'], [true, true, true]))).toBe(true);
  });

  it('base isolation works on its own, at a price over the budget', () => {
    const d = design(['light', 'light', 'light'], [false, false, false], true);
    expect(survives(d)).toBe(true);
    expect(designCost(d)).toBeGreaterThan(CHALLENGE.budget);
  });
});
