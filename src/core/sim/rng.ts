export type Rng = () => number;

/** Linear congruential generator, the same one the prototype uses for its quake (`rng`). */
export function lcg(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
