/** Geometry and physics constants, unchanged from the prototype (prototype/index.html). */
export const DT = 1 / 240;          // physics step, s
export const TOP = 0.85;            // table top height, m
export const TX = 3.5;              // table half size along x, m
export const TZ = 3.0;              // table half size along z, m
export const X0 = -1.0;             // tower centre on the table, m
export const HALF = 1.5;            // slab half size, m
export const ST = 0.2;              // slab thickness, m
export const CH = 1.8;              // clear column height, used for drift, m
export const STORY = 2.0;           // floor to floor, m
export const ISO_H = 0.3;           // isolator height, m
export const ISO_LIMIT = 0.45;      // isolator moat gap, m
export const M = 4000;              // slab mass, kg
export const NS = 3;                // stories
export const STROKE = 0.5;          // table stroke, m

export type BuildingType = 'bare' | 'braced' | 'isolated';
export interface BuildingSpec {
  label: string;
  k: number; zeta: number; yieldR: number; ultR: number; braced: boolean; iso: boolean;
  kIso?: number; zIso?: number;
}
export const BUILDINGS: Record<BuildingType, BuildingSpec> = {
  bare:     { label: 'Bare frame', k: 1.14e6, zeta: 0.02, yieldR: 0.02, ultR: 0.06, braced: false, iso: false },
  braced:   { label: 'Braced', k: 6.84e6, zeta: 0.05, yieldR: 0.015, ultR: 0.045, braced: true, iso: false },
  isolated: { label: 'Isolated', k: 6.84e6, zeta: 0.05, yieldR: 0.015, ultR: 0.045, braced: true, iso: true, kIso: 1.01e5, zIso: 0.25 },
};

// Numerical support springs (vertical and rotational), see docs/ARCHITECTURE.md 5.3.
export const KV = M * NS * Math.pow(2 * Math.PI * 10, 2);
export const CV = 2 * 0.3 * Math.sqrt(KV * M);
export const IR = (M * (3 * 3 + ST * ST)) / 12;
export const KR = IR * Math.pow(2 * Math.PI * 8, 2);
export const CR = 2 * 0.3 * Math.sqrt(KR * IR);

/** Static colliders around the pit, [cx, cy, cz, hx, hy, hz] (the prototype's RIM). */
export const RIM: readonly (readonly [number, number, number, number, number, number])[] = [
  [-0.5, TOP / 2, 3.6, 5.3, TOP / 2, 0.35],
  [-0.5, TOP / 2, -3.6, 5.3, TOP / 2, 0.35],
  [4.4, TOP / 2, 0, 0.375, TOP / 2, 3.25],
  [-5.2, 0.775, 0, 0.6, 0.775, 4.3],
];
