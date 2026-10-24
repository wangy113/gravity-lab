import { describe, expect, it } from 'vitest';
import { STOP_FIGURES } from '../../src/shake-table/concept-figures.ts';
import { HINT_FIGURES } from '../../src/shake-table/hint-figures.ts';
import { STOPS } from '../../src/shake-table/tour.ts';

describe('concept figures (dual coding)', () => {
  it('pairs every guided test with one diagram', () => {
    expect(STOP_FIGURES).toHaveLength(STOPS.length);
  });

  it('pairs every design hint with one diagram', () => {
    expect(HINT_FIGURES).toHaveLength(8);
  });

  it('gives each diagram alt text and a caption that follow the house text rules', () => {
    for (const f of [...STOP_FIGURES.flatMap((s) => [s.setup, s.result]), ...HINT_FIGURES]) {
      expect(f.svg).toMatch(/^<svg [^>]*role="img"[^>]*aria-label="[^"]+"/);
      for (const text of [f.alt, f.caption]) {
        expect(text.length).toBeGreaterThan(20);
        expect(text).not.toMatch(/[—;·]/);
      }
    }
  });
});
