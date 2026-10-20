import { DT, STROKE } from '../constants.ts';
import { makeQuake, QUAKE_SEED, QUAKES, type QuakeKind } from './quake.ts';

export type ShakeMode = 'steady' | 'sweep' | 'quake';

/** Displacement amplitude for a sine at f Hz reaching g, limited by the stroke (prototype `ampFor`). */
export const ampFor = (f: number, g: number): number => Math.min(STROKE, (g * 9.81) / Math.pow(2 * Math.PI * f, 2));

export const SWEEP = { f0: 0.6, f1: 4.0, seconds: 32 } as const;

/**
 * The table's drive signal and run state (the prototype's `shake` object and `updateTable`).
 * Settings are read live each step, as in the prototype, so changing them mid-run takes effect.
 */
export class TableDrive {
  mode: ShakeMode = 'steady';
  f = 1.2; // steady frequency, Hz
  g = 0.25; // strength, g

  on = false;
  done = false;
  t = 0; // time since Shake, s
  private n = 0; // steps since Shake: indexes the quake record exactly
  env = 0; // ramp envelope, 0..1
  target = 0;
  phase = 0;
  x = 0; x1 = 0; x2 = 0; // displacement now and the two previous steps, m
  fNow = 0; // current drive frequency, Hz (0 in quake mode)
  accG = 0; // |table acceleration|, g
  quake: Float32Array | null = null;
  /** Which synthetic quake to play: the prototype's, or the slower one for tall buildings. */
  quakeKind: QuakeKind = 'standard';

  reset(): void {
    this.on = false; this.done = false; this.t = 0; this.n = 0; this.env = 0; this.target = 0; this.phase = 0;
    this.x = 0; this.x1 = 0; this.x2 = 0; this.fNow = 0; this.accG = 0;
  }

  start(): void {
    this.on = true; this.t = 0; this.n = 0; this.env = this.mode === 'quake' ? 1 : 0; this.target = 1; this.phase = 0; this.done = false;
    if (this.mode === 'quake') this.quake = makeQuake(this.g, DT, STROKE, QUAKE_SEED, QUAKES[this.quakeKind]);
  }

  stop(): void {
    this.target = 0; this.on = false; this.done = true;
  }

  /** Advances one step and returns the table displacement along x, m. */
  step(): number {
    let x = 0;
    if (this.mode === 'steady') {
      this.fNow = this.f;
      this.phase += 2 * Math.PI * this.f * DT;
      x = ampFor(this.f, this.g) * this.env * Math.sin(this.phase);
    } else if (this.mode === 'sweep') {
      const f = SWEEP.f0 + (SWEEP.f1 - SWEEP.f0) * Math.min(1, this.t / SWEEP.seconds);
      this.fNow = f;
      this.phase += 2 * Math.PI * f * DT;
      x = ampFor(f, this.g) * this.env * Math.sin(this.phase);
      if (this.on && this.t > SWEEP.seconds) this.stop();
    } else if (this.quake) {
      // The prototype used floor(t / DT), but t is a running sum of DT, so rounding made the
      // index repeat one step and skip the next: the table stalled for a step, then jumped
      // (a spike of about 6 g at 0.4 g). An integer step count has no drift.
      const i = Math.min(this.quake.length - 1, this.n);
      x = this.quake[i]! * this.env;
      this.fNow = 0;
      if (this.on && i >= this.quake.length - 1) this.stop();
    }
    if (this.on || this.env > 0) { this.t += DT; this.n++; }
    const rate = DT / 1.5;
    this.env += Math.sign(this.target - this.env) * Math.min(rate, Math.abs(this.target - this.env));
    if (!this.on && this.env <= 0 && this.mode !== 'quake') x = 0;
    this.x2 = this.x1; this.x1 = this.x; this.x = x;
    this.accG = Math.abs(this.signedAccG());
    return x;
  }

  /** Table acceleration from the last three displacements, g (prototype `signedAcc`). */
  signedAccG(): number {
    return -(this.x - 2 * this.x1 + this.x2) / (DT * DT) / 9.81;
  }

  get active(): boolean {
    return this.on || this.env > 0;
  }
}
