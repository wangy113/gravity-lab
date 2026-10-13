/** Positions and rotations of every body, 7 floats each (x y z qx qy qz qw), indexed by body id. */
export class PoseBuffer {
  data: Float32Array;
  count = 0;
  constructor(capacity = 256) {
    this.data = new Float32Array(capacity * 7);
  }
  ensure(count: number): void {
    if (count * 7 <= this.data.length) return;
    const next = new Float32Array(Math.max(count, (this.data.length / 7) * 2) * 7);
    next.set(this.data);
    this.data = next;
  }
  copyFrom(o: PoseBuffer): void {
    this.ensure(o.count);
    this.data.set(o.data.subarray(0, o.count * 7));
    this.count = o.count;
  }
}

/** Anything with a list of bodies that can report a pose. */
export interface PoseSource {
  bodies: { body: { translation(): { x: number; y: number; z: number }; rotation(): { x: number; y: number; z: number; w: number } } }[];
}

export function readPoses(src: PoseSource, out: PoseBuffer): void {
  const n = src.bodies.length;
  out.ensure(n);
  const d = out.data;
  for (let i = 0; i < n; i++) {
    const b = src.bodies[i]!.body, t = b.translation(), r = b.rotation(), k = i * 7;
    d[k] = t.x; d[k + 1] = t.y; d[k + 2] = t.z; d[k + 3] = r.x; d[k + 4] = r.y; d[k + 5] = r.z; d[k + 6] = r.w;
  }
  out.count = n;
}
