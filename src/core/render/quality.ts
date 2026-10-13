/**
 * Quality tiers change only what students see, never the physics (docs/ARCHITECTURE.md 6.6).
 */
export type Tier = 'low' | 'medium' | 'high';
export type TierChoice = Tier | 'auto';

export interface TierSettings {
  label: string;
  maxPixelRatio: number;
  shadowMap: number; // 0 = off
  hdri: 'low' | 'high'; // 1k or 2k
  dust: number; // particles
}

export const TIERS: Record<Tier, TierSettings> = {
  low: { label: 'Low', maxPixelRatio: 1, shadowMap: 0, hdri: 'low', dust: 60 },
  medium: { label: 'Medium', maxPixelRatio: 1.5, shadowMap: 1024, hdri: 'high', dust: 150 },
  high: { label: 'High', maxPixelRatio: 2, shadowMap: 2048, hdri: 'high', dust: 220 },
};

const KEY = 'shake-table-lab.quality';

export function savedChoice(): TierChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'low' || v === 'medium' || v === 'high' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveChoice(c: TierChoice): void {
  try {
    if (c === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, c);
  } catch {
    // ignore: the choice just will not persist
  }
}

/** A first guess from device hints. Most school Chromebooks have 4 GB and 4 cores. */
export function guessTier(): Tier {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mem <= 4 || cores <= 4) return 'low';
  if (mem >= 8 && cores >= 8) return 'high';
  return 'medium';
}

export const lowerTier = (t: Tier): Tier | null => (t === 'high' ? 'medium' : t === 'medium' ? 'low' : null);
