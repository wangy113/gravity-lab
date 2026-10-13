import { lcg } from '../../core/sim/rng.ts';

export const QUAKE_SEED = 20261012;

/**
 * The prototype's synthetic quake: 20 sine components weighted around 1.25 Hz under a
 * build-up, strong-motion and decay envelope, 24 s long, scaled to the requested peak
 * acceleration and clipped to the table stroke. Returns table displacement per step, m.
 */
export function makeQuake(peakG: number, dt: number, stroke: number, seed = QUAKE_SEED): Float32Array {
  const N = Math.round(24 / dt);
  const xs = new Float32Array(N);
  const r = lcg(seed);
  const comps: [number, number, number][] = [];
  for (let i = 0; i < 20; i++) {
    const f = 0.7 + 2.5 * r();
    const w = Math.exp(-Math.pow((f - 1.25) / 0.4, 2)) + 0.08;
    const om = 2 * Math.PI * f;
    comps.push([om, (w * (0.6 + 0.4 * r())) / (om * om), r() * Math.PI * 2]);
  }
  for (let n = 0; n < N; n++) {
    const t = n * dt;
    let env = t < 2.5 ? Math.pow(t / 2.5, 2) : t < 11 ? 1 : Math.exp(-(t - 11) / 3.5);
    if (t > 22) env *= (24 - t) / 2;
    let x = 0;
    for (const [om, a, p] of comps) x += a * Math.sin(om * t + p);
    xs[n] = x * env;
  }
  const off = xs[0]!;
  for (let n = 0; n < N; n++) xs[n] = xs[n]! - off * Math.max(0, 1 - (n * dt) / 2.5);
  let pk = 0;
  for (let n = 1; n < N - 1; n++) pk = Math.max(pk, Math.abs((xs[n + 1]! - 2 * xs[n]! + xs[n - 1]!) / (dt * dt)));
  let sc = (peakG * 9.81) / pk;
  let mx = 0;
  for (const v of xs) mx = Math.max(mx, Math.abs(v));
  if (mx * sc > stroke) sc = stroke / mx;
  for (let n = 0; n < N; n++) xs[n] = xs[n]! * sc;
  return xs;
}
