import { PoseBuffer } from './poses.ts';

interface Slot {
  t: number;
  poses: PoseBuffer;
  extra: Float32Array; // lab-specific state, for example story damage and failure
  extraLen: number;
}

/**
 * Keeps the last `seconds` of simulation frames in a preallocated ring, keyed by body id,
 * so replay does not depend on scene-graph order and does not allocate per frame.
 */
export class Recorder {
  private readonly slots: Slot[];
  private head = 0; // next slot to write
  private size = 0;

  constructor(readonly seconds: number, readonly rate: number) {
    const n = Math.ceil(seconds * rate) + 1;
    this.slots = Array.from({ length: n }, () => ({ t: 0, poses: new PoseBuffer(64), extra: new Float32Array(16), extraLen: 0 }));
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
  }

  get length(): number {
    return this.size;
  }

  record(t: number, poses: PoseBuffer, extra: ArrayLike<number>): void {
    const s = this.slots[this.head]!;
    s.t = t;
    s.poses.copyFrom(poses);
    if (s.extra.length < extra.length) s.extra = new Float32Array(extra.length * 2);
    s.extra.set(extra);
    s.extraLen = extra.length;
    this.head = (this.head + 1) % this.slots.length;
    this.size = Math.min(this.size + 1, this.slots.length);
  }

  private at(i: number): Slot {
    // i = 0 is the oldest frame
    return this.slots[(this.head - this.size + i + this.slots.length) % this.slots.length]!;
  }

  get t0(): number {
    return this.size ? this.at(0).t : 0;
  }

  get t1(): number {
    return this.size ? this.at(this.size - 1).t : 0;
  }

  /** The two frames around time t and how far t is between them. */
  sample(t: number): { a: Slot; b: Slot; alpha: number } | null {
    if (!this.size) return null;
    let lo = 0, hi = this.size - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.at(mid).t <= t) lo = mid; else hi = mid;
    }
    const a = this.at(lo), b = this.at(hi);
    const alpha = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    return { a, b, alpha };
  }
}
