import { describe, expect, it } from 'vitest';
import { shearBuildingFrequencies, symmetricEigenvalues } from '../../src/shake-table/specimen/modal.ts';

// Constants from prototype/index.html (TYPES, M, NS).
const M = 4000;
const BARE_K = 1.14e6;
const BRACED_K = 6.84e6;
const ISO_K = 1.01e5;

// Expected values: docs/ARCHITECTURE.md section 3.3.
const cases: [string, number[], number[], number[]][] = [
  ['bare frame', [M, M, M], [BARE_K, BARE_K, BARE_K], [1.196, 3.35, 4.842]],
  ['braced', [M, M, M], [BRACED_K, BRACED_K, BRACED_K], [2.929, 8.207, 11.859]],
  ['isolated', [M, M, M, M], [ISO_K, BRACED_K, BRACED_K, BRACED_K], [0.397, 5.064, 9.316, 12.163]],
];

describe('shearBuildingFrequencies', () => {
  it.each(cases)('reproduces the prototype modes for the %s', (_name, masses, ks, expected) => {
    const f = shearBuildingFrequencies(masses, ks);
    expect(f).toHaveLength(expected.length);
    f.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 3));
  });

  it('matches the closed form for a single story', () => {
    const [f] = shearBuildingFrequencies([1000], [4e5]);
    expect(f).toBeCloseTo(Math.sqrt(4e5 / 1000) / (2 * Math.PI), 10);
  });

  it('handles unequal floor masses symmetrically', () => {
    // Two-floor closed form: eigenvalues of [[(k1+k2)/m1, -k2/m1], [-k2/m2, k2/m2]].
    const m1 = 3000, m2 = 1500, k1 = 2e6, k2 = 1e6;
    const tr = (k1 + k2) / m1 + k2 / m2;
    const det = (k1 * k2) / (m1 * m2);
    const disc = Math.sqrt(tr * tr - 4 * det);
    const expected = [(tr - disc) / 2, (tr + disc) / 2].map((l) => Math.sqrt(l) / (2 * Math.PI));
    const f = shearBuildingFrequencies([m1, m2], [k1, k2]);
    f.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 9));
  });

  it('rejects mismatched inputs', () => {
    expect(() => shearBuildingFrequencies([M, M], [BARE_K])).toThrow();
  });
});

describe('symmetricEigenvalues', () => {
  it('returns sorted eigenvalues of a known matrix', () => {
    expect(symmetricEigenvalues([[2, 1], [1, 2]]).map((v) => +v.toFixed(12))).toEqual([1, 3]);
  });
});
