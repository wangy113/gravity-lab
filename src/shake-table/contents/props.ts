import generated from './prop-sizes.json' with { type: 'json' };

/** Furniture that rides in the building and the props loose on the table. */
export type PropId = 'metal_office_desk' | 'plastic_monobloc_chair_01' | 'cardboard_box_01' | 'wooden_crate_01' | 'plastic_crate_01';

export interface PropSize { x: number; y: number; z: number }

/**
 * Bounding box sizes, m. `prop-sizes.json` is written by `npm run assets:sync` from the
 * Poly Haven models (the same box the prototype measured with Box3.setFromObject).
 * The fallback is the prototype's FALLBACK table, used when a model failed to load.
 */
export const FALLBACK: Record<PropId, PropSize & { color: number }> = {
  metal_office_desk: { x: 1.2, y: 0.75, z: 0.6, color: 0x6f7a80 },
  plastic_monobloc_chair_01: { x: 0.5, y: 0.8, z: 0.5, color: 0xeeeeee },
  cardboard_box_01: { x: 0.45, y: 0.3, z: 0.35, color: 0xb08850 },
  wooden_crate_01: { x: 0.6, y: 0.5, z: 0.6, color: 0x9a7448 },
  plastic_crate_01: { x: 0.55, y: 0.3, z: 0.38, color: 0x2a6fd0 },
};

const SIZES = generated as Partial<Record<PropId, PropSize>>;

export function propSize(id: PropId, useModels = true): PropSize {
  const s = useModels ? SIZES[id] : undefined;
  if (s) return s;
  const f = FALLBACK[id];
  return { x: f.x, y: f.y, z: f.z };
}
