/** Minimal vector and quaternion helpers, so the simulation core needs no three.js. */
export interface V3 { x: number; y: number; z: number }
export interface Q4 { x: number; y: number; z: number; w: number }

/** Rotates v by unit quaternion q (same result as three.js Vector3.applyQuaternion). */
export function rotate(v: V3, q: Q4, out: V3 = { x: 0, y: 0, z: 0 }): V3 {
  const { x: vx, y: vy, z: vz } = v;
  const tx = 2 * (q.y * vz - q.z * vy);
  const ty = 2 * (q.z * vx - q.x * vz);
  const tz = 2 * (q.x * vy - q.y * vx);
  out.x = vx + q.w * tx + q.y * tz - q.z * ty;
  out.y = vy + q.w * ty + q.z * tx - q.x * tz;
  out.z = vz + q.w * tz + q.x * ty - q.y * tx;
  return out;
}

/** a * b (three.js Quaternion.multiplyQuaternions). */
export function qmul(a: Q4, b: Q4, out: Q4 = { x: 0, y: 0, z: 0, w: 1 }): Q4 {
  const x = a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y;
  const y = a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z;
  const z = a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x;
  const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
  out.x = x; out.y = y; out.z = z; out.w = w;
  return out;
}

/** Inverse of a unit quaternion. */
export const qinv = (q: Q4): Q4 => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

/** Rotation taking unit vector a to unit vector b (three.js Quaternion.setFromUnitVectors). */
export function fromUnitVectors(a: V3, b: V3): Q4 {
  let r = a.x * b.x + a.y * b.y + a.z * b.z + 1;
  let x: number, y: number, z: number;
  if (r < 1e-8) {
    r = 0;
    if (Math.abs(a.x) > Math.abs(a.z)) { x = -a.y; y = a.x; z = 0; } else { x = 0; y = -a.z; z = a.y; }
  } else {
    x = a.y * b.z - a.z * b.y; y = a.z * b.x - a.x * b.z; z = a.x * b.y - a.y * b.x;
  }
  const n = Math.hypot(x, y, z, r);
  return { x: x / n, y: y / n, z: z / n, w: r / n };
}

export const qyaw = (angle: number): Q4 => ({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) });
