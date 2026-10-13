import { describe, expect, it } from 'vitest';
import { compileSpecimen, SpecimenError } from '../../src/shake-table/specimen/compile.ts';
import { PRESETS, type SpecimenSpec } from '../../src/shake-table/specimen/spec.ts';
import { STABILITY_LIMIT, stabilityUse } from '../../src/shake-table/specimen/stability.ts';

const withStories = (n: number): SpecimenSpec => {
  const s = structuredClone(PRESETS.bare);
  s.stories = Array.from({ length: n }, () => structuredClone(s.stories[0]!));
  return s;
};

describe('specimen compiler', () => {
  it('reproduces the prototype modes from the presets (docs/ARCHITECTURE.md 4)', () => {
    expect(compileSpecimen(PRESETS.bare).modes[0]).toBeCloseTo(1.196, 3);
    expect(compileSpecimen(PRESETS.braced).modes[0]).toBeCloseTo(2.929, 3);
    expect(compileSpecimen(PRESETS.isolated).modes.map((f) => +f.toFixed(3))).toEqual([0.397, 5.064, 9.316, 12.163]);
  });

  it('builds the prototype tower geometry', () => {
    const c = compileSpecimen(PRESETS.isolated);
    expect(c.floors).toHaveLength(4);
    expect(c.springs.map((s) => s.label)).toEqual(['Isolators', 'Story 1', 'Story 2', 'Story 3']);
    expect(c.floors.map((f) => +f.y.toFixed(6))).toEqual([1.25, 3.25, 5.25, 7.25]);
    expect(c.groundFloor).toBeCloseTo(1.35, 9);
    expect(c.springs[1]!.members.filter((m) => m.kind === 'brace')).toHaveLength(4);
    expect(compileSpecimen(PRESETS.bare).springs[0]!.members.filter((m) => m.kind === 'brace')).toHaveLength(0);
  });

  it('rejects specimens outside the limits with plain messages', () => {
    const s = structuredClone(PRESETS.bare);
    s.stories[1]!.lateral.k = -5;
    s.stories[2]!.lateral.law.ultimateDrift = 0.01;
    try {
      compileSpecimen(s);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SpecimenError);
      expect((e as SpecimenError).problems).toEqual([
        'Story 2 stiffness must be between 10000 and 50000000 N/m.',
        'Story 3 must fail at a larger drift than it yields.',
      ]);
    }
  });
});

describe('stability guard', () => {
  it('measures the prototype buildings as the architecture document does (5.3)', () => {
    const bare = compileSpecimen(PRESETS.bare).stability;
    const iso = compileSpecimen(PRESETS.isolated).stability;
    expect(bare.worst.chain).toBe('vertical');
    expect(bare.worst.use).toBeCloseTo(0.61, 2);
    expect(iso.worst.hz).toBeCloseTo(32.6, 1);
    expect(iso.worst.use).toBeCloseTo(0.66, 2);
    expect(iso.ok && bare.ok).toBe(true);
  });

  it('rejects a building whose support springs would blow up', () => {
    expect(() => compileSpecimen(withStories(6))).toThrow(/111% of the limit/);
    expect(() => compileSpecimen(withStories(6))).toThrow(/Try fewer stories/);
    expect(() => compileSpecimen(withStories(2))).not.toThrow();
  });

  it('matches the integrator: one mode grows exactly when its use passes 1', () => {
    // Rapier's semi-implicit Euler with the damping force taken from the previous velocity.
    // Near the limit an undamped mode is bounded but swings widely, so compare the peak of
    // a late window with an earlier one rather than with the start.
    const grows = (w: number, zeta: number, dt: number): boolean => {
      let x = 1, v = 0, early = 0, late = 0;
      for (let i = 0; i < 400; i++) {
        v += dt * (-w * w * x - 2 * zeta * w * v); x += dt * v;
        const a = Math.hypot(x, v / w);
        if (i >= 100 && i < 200) early = Math.max(early, a);
        if (i >= 300) late = Math.max(late, a);
      }
      return late > 2 * early;
    };
    const dt = 1 / 240;
    for (const zeta of [0, 0.05, 0.3, 0.56]) for (const use of [0.7, 0.95, 1.05, 1.3]) {
      // Solve h^2 + 4 zeta h = 4 use for h, then w = h / dt.
      const h = -2 * zeta + Math.sqrt(4 * zeta * zeta + 4 * use);
      expect(stabilityUse(h / dt, zeta, dt)).toBeCloseTo(use, 9);
      expect(grows(h / dt, zeta, dt)).toBe(use > 1);
    }
    expect(STABILITY_LIMIT).toBe(0.7);
  });
});
