import { describe, expect, it } from 'vitest';
import baseline from '../scenarios/baseline.json' with { type: 'json' };
import { POE } from '../../src/shake-table/pedagogy.ts';
import { STOPS } from '../../src/shake-table/tour.ts';

const HOUSE = /[—;·]/;

describe('guided test instructions', () => {
  it('only ask for controls the guided panel shows (the control room is hidden during a test)', () => {
    const hidden = /press Reset|set Frequency|Frequency slider|Strength slider|control room|Building type/i;
    STOPS.forEach((s, i) => {
      for (const text of [s.body, s.notice, POE[i]!.explain]) expect(text, s.title).not.toMatch(hidden);
    });
  });

  it('runs test 3 again at 1.2 Hz from a button, with the follow-up setup the baseline checks', () => {
    const s = STOPS[2]!, follow = (baseline as { scenarios: { id: string; config: Record<string, unknown> }[] }).scenarios.find((x) => x.id === 'steady-1.2hz-bare')!;
    expect(s.compare).toBeDefined();
    expect({ type: s.cfg.type, mode: s.cfg.mode, f: s.compare!.f, g: s.cfg.g }).toEqual(follow.config);
    expect(s.compare!.label).not.toMatch(HOUSE);
  });
});
