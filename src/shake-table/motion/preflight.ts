/**
 * Before shaking, compare what was asked for with what the table can do. The table has a
 * stroke of 0.5 m, so at low frequencies it cannot reach high accelerations. The prototype
 * clipped silently; the lab says so (docs/ARCHITECTURE.md 5.5).
 */
import { DT, STROKE } from '../constants.ts';
import { makeQuake } from './quake.ts';
import { SWEEP, type ShakeMode } from './table.ts';

/** Peak table acceleration the run will actually reach, in g. */
export function achievableG(mode: ShakeMode, g: number, f: number): number {
  const sineMax = (hz: number): number => (STROKE * Math.pow(2 * Math.PI * hz, 2)) / 9.81;
  if (mode === 'steady') return Math.min(g, sineMax(f));
  if (mode === 'sweep') return Math.min(g, sineMax(SWEEP.f0));
  const xs = makeQuake(g, DT, STROKE);
  let pk = 0;
  for (let n = 1; n < xs.length - 1; n++) pk = Math.max(pk, Math.abs((xs[n + 1]! - 2 * xs[n]! + xs[n - 1]!) / (DT * DT)));
  return pk / 9.81;
}

/** A plain message when the table cannot deliver the requested strength, or null. */
export function preflightNote(mode: ShakeMode, g: number, f: number): string | null {
  const got = achievableG(mode, g, f);
  if (got >= g * 0.98) return null;
  const where = mode === 'steady' ? ` at ${f.toFixed(2)} Hz` : mode === 'sweep' ? ` at the start of the sweep` : '';
  return `The table can only move 50 cm each way, so${where} it reaches about ${got.toFixed(2)} g, not ${g.toFixed(2)} g.`;
}
