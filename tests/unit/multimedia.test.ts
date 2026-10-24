import { describe, expect, it } from 'vitest';
import { resultFigure, STOP_FIGURES } from '../../src/shake-table/concept-figures.ts';
import { figureHtml } from '../../src/shake-table/figure.ts';
import { HINT_FIGURES } from '../../src/shake-table/hint-figures.ts';
import { GLOSSARY } from '../../src/shake-table/pedagogy.ts';
import { STOPS } from '../../src/shake-table/tour.ts';

const HOUSE = /[—;·]/;

describe('multimedia learning principles', () => {
  it('teaches every key word before the reading and marks it in the reading (pre-training, signaling)', () => {
    for (const s of STOPS) {
      expect(s.terms.length).toBeGreaterThan(0);
      const marked = [...s.body.matchAll(/<b class="term">([^<]+)<\/b>/g)].map((m) => m[1]!.toLowerCase());
      for (const t of s.terms) {
        expect(GLOSSARY[t], t).toBeDefined();
        expect(marked.some((m) => m.startsWith(t.toLowerCase())), `${s.title}: ${t}`).toBe(true);
      }
    }
  });

  it('teaches each key word once, in the first test that uses it', () => {
    const all = STOPS.flatMap((s) => s.terms);
    expect(new Set(all).size).toBe(all.length);
    expect(Object.keys(GLOSSARY).sort()).toEqual([...all].sort());
  });

  it('gives every diagram a short look-here cue that differs from its caption (redundancy)', () => {
    for (const f of [...STOP_FIGURES.flatMap((s) => [s.setup, s.result]), ...HINT_FIGURES]) {
      expect(f.cue.length).toBeGreaterThan(10);
      expect(f.cue.length).toBeLessThan(f.caption.length);
      expect(f.cue).not.toMatch(HOUSE);
      expect(figureHtml(f, 'panel')).toContain(f.cue);
      expect(figureHtml(f, 'panel')).not.toContain(f.caption);
      expect(figureHtml(f)).toContain(f.caption);
    }
  });

  it('draws the measured peak on the sweep result diagrams (spatial contiguity)', () => {
    const f = resultFigure(1, { peakRoofHz: 1.23 });
    expect(f.svg).toContain('your run: 1.23 Hz');
    expect(f.alt).toContain('1.23 hertz');
    expect(f.svg).toMatch(/aria-label="[^"]*1\.23 hertz/);
    expect(f.svg.endsWith('</svg>')).toBe(true);
    expect(resultFigure(3, { peakRoofHz: 2.9 }).svg).toContain('your run: 2.90 Hz');
    // No marker without a measurement, or on figures with no frequency axis.
    expect(resultFigure(1, null)).toBe(STOP_FIGURES[1]!.result);
    expect(resultFigure(0, { peakRoofHz: 3 })).toBe(STOP_FIGURES[0]!.result);
  });

  it('keeps the new text within the house rules', () => {
    for (const s of STOPS) for (const t of [s.body, s.aside ?? '', s.notice]) expect(t).not.toMatch(HOUSE);
    for (const d of Object.values(GLOSSARY)) expect(d).not.toMatch(HOUSE);
  });
});
