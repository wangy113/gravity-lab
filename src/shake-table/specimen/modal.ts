/**
 * Modal analysis of a shear building: floors are lumped masses, stories are
 * lateral springs, the ground (shake table) is fixed. Ported from the
 * prototype's `eigSym` and `computeNatBeat` (prototype/index.html).
 */

/** Eigenvalues of a symmetric matrix by cyclic Jacobi rotation, ascending. */
export function symmetricEigenvalues(matrix: readonly (readonly number[])[]): number[] {
  const n = matrix.length;
  const a = matrix.map((row) => row.slice());
  const at = (i: number, j: number): number => a[i]![j]!;
  const set = (i: number, j: number, v: number): void => {
    a[i]![j] = v;
  };
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += at(i, j) ** 2;
    if (off < 1e-12) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(at(p, q)) < 1e-14) continue;
        const theta = 0.5 * Math.atan2(2 * at(p, q), at(q, q) - at(p, p));
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        for (let k = 0; k < n; k++) {
          const akp = at(k, p);
          const akq = at(k, q);
          set(k, p, c * akp - s * akq);
          set(k, q, s * akp + c * akq);
        }
        for (let k = 0; k < n; k++) {
          const apk = at(p, k);
          const aqk = at(q, k);
          set(p, k, c * apk - s * aqk);
          set(q, k, s * apk + c * aqk);
        }
      }
    }
  }
  return a.map((_, i) => at(i, i)).sort((x, y) => x - y);
}

/**
 * Natural frequencies in Hz, lowest first.
 * @param masses floor masses in kg, bottom to top
 * @param stiffnesses story stiffnesses in N/m, bottom to top; story i joins floor i to the floor (or table) below
 */
export function shearBuildingFrequencies(masses: readonly number[], stiffnesses: readonly number[]): number[] {
  const n = masses.length;
  if (stiffnesses.length !== n) throw new Error('need one story stiffness per floor');
  const k = (i: number): number => (i < n ? stiffnesses[i]! : 0);
  // Mass-normalized stiffness M^-1/2 K M^-1/2 keeps the matrix symmetric for unequal masses.
  const a: number[][] = Array.from({ length: n }, () => Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    a[i]![i] = (k(i) + k(i + 1)) / masses[i]!;
    if (i + 1 < n) {
      const v = -k(i + 1) / Math.sqrt(masses[i]! * masses[i + 1]!);
      a[i]![i + 1] = v;
      a[i + 1]![i] = v;
    }
  }
  return symmetricEigenvalues(a).map((l) => Math.sqrt(Math.max(0, l)) / (2 * Math.PI));
}
