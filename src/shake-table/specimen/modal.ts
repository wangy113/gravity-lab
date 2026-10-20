/**
 * Modal analysis of a shear building: floors are lumped masses, stories are
 * lateral springs, the ground (shake table) is fixed. Ported from the
 * prototype's `eigSym` and `computeNatBeat` (prototype/index.html).
 */

/** Eigenvalues (ascending) and unit eigenvectors of a symmetric matrix, by cyclic Jacobi rotation. */
export function symmetricEigen(matrix: readonly (readonly number[])[]): { values: number[]; vectors: number[][] } {
  const n = matrix.length;
  const a = matrix.map((row) => row.slice());
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const at = (i: number, j: number): number => a[i]![j]!;
  const set = (i: number, j: number, x: number): void => {
    a[i]![j] = x;
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
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
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
  const order = a.map((_, i) => i).sort((x, y) => at(x, x) - at(y, y));
  return { values: order.map((i) => at(i, i)), vectors: order.map((i) => v.map((row) => row[i]!)) };
}

/** Eigenvalues of a symmetric matrix, ascending. */
export function symmetricEigenvalues(matrix: readonly (readonly number[])[]): number[] {
  return symmetricEigen(matrix).values;
}

/**
 * A chain of masses joined by springs, the first spring tied to a fixed base, as a
 * mass-normalized matrix M^-1/2 X M^-1/2 (X is the stiffness or damping of each link).
 */
export function chainMatrix(masses: readonly number[], links: readonly number[]): number[][] {
  const n = masses.length;
  if (links.length !== n) throw new Error('need one link per mass');
  const k = (i: number): number => (i < n ? links[i]! : 0);
  const a: number[][] = Array.from({ length: n }, () => Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    a[i]![i] = (k(i) + k(i + 1)) / masses[i]!;
    if (i + 1 < n) {
      const v = -k(i + 1) / Math.sqrt(masses[i]! * masses[i + 1]!);
      a[i]![i + 1] = v;
      a[i + 1]![i] = v;
    }
  }
  return a;
}

/**
 * Natural frequencies in Hz, lowest first.
 * @param masses floor masses in kg, bottom to top
 * @param stiffnesses story stiffnesses in N/m, bottom to top; story i joins floor i to the floor (or table) below
 */
export function shearBuildingFrequencies(masses: readonly number[], stiffnesses: readonly number[]): number[] {
  if (stiffnesses.length !== masses.length) throw new Error('need one story stiffness per floor');
  return symmetricEigenvalues(chainMatrix(masses, stiffnesses)).map((l) => Math.sqrt(Math.max(0, l)) / (2 * Math.PI));
}

/**
 * Model 2: natural frequencies in Hz, lowest first, with sideways sway along x and twisting
 * about the vertical axis coupled. Each floor has two freedoms (x and twist). Each story is a
 * stiffness `k` acting at its centre of rigidity, `ecc` from the middle along z, plus a twisting
 * stiffness `kt` about that point. With `ecc` = 0 sway and twist are independent.
 */
export function coupledFrequencies(masses: readonly number[], inertias: readonly number[], stories: readonly { k: number; ecc: number; kt: number }[]): number[] {
  const n = masses.length;
  if (inertias.length !== n || stories.length !== n) throw new Error('need one mass, inertia and story per floor');
  const K: number[][] = Array.from({ length: 2 * n }, () => Array<number>(2 * n).fill(0));
  const add = (i: number, j: number, v: number): void => { K[i]![j]! += v; };
  stories.forEach((s, i) => {
    // relative motion across story i: [x_i - x_{i-1}, twist_i - twist_{i-1}]
    const ks = [[s.k, s.k * s.ecc], [s.k * s.ecc, s.k * s.ecc * s.ecc + s.kt]];
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      add(2 * i + a, 2 * i + b, ks[a]![b]!);
      if (i > 0) {
        add(2 * (i - 1) + a, 2 * (i - 1) + b, ks[a]![b]!);
        add(2 * i + a, 2 * (i - 1) + b, -ks[a]![b]!);
        add(2 * (i - 1) + a, 2 * i + b, -ks[a]![b]!);
      }
    }
  });
  const m = Array.from({ length: 2 * n }, (_, d) => (d % 2 === 0 ? masses[d >> 1]! : inertias[d >> 1]!));
  const A = K.map((row, i) => row.map((v, j) => v / Math.sqrt(m[i]! * m[j]!)));
  return symmetricEigenvalues(A).map((l) => Math.sqrt(Math.max(0, l)) / (2 * Math.PI));
}
