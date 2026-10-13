import { describe, expect, it } from 'vitest';
import { achievableG, preflightNote } from '../../src/shake-table/motion/preflight.ts';

describe('table preflight', () => {
  it('limits slow steady shaking by the stroke', () => {
    // 0.5 m at 0.5 Hz: 0.5 * (2 pi 0.5)^2 / 9.81 = 0.503 g
    expect(achievableG('steady', 0.6, 0.5)).toBeCloseTo(0.503, 3);
    expect(preflightNote('steady', 0.6, 0.5)).toMatch(/about 0\.50 g, not 0\.60 g/);
  });
  it('says nothing when the table can do what was asked', () => {
    expect(preflightNote('steady', 0.25, 1.2)).toBeNull();
    expect(preflightNote('sweep', 0.2, 1)).toBeNull();
    expect(preflightNote('quake', 0.3, 1)).toBeNull();
  });
  it('reports the quake strength after stroke clipping', () => {
    const at06 = achievableG('quake', 0.6, 1);
    expect(at06).toBeLessThanOrEqual(0.6);
    expect(achievableG('quake', 0.3, 1)).toBeCloseTo(0.3, 3);
  });
});
