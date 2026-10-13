/** The runtime asset manifest written by scripts/assets-sync.ts into public/assets/manifest.json. */
export interface HallAsset { key: string; id: string; label: string; file: string; groundHeight: number; sun: [number, number, number]; floorTint: [number, number, number] }
export interface RuntimeManifest {
  hdris: HallAsset[];
  textures: Record<string, { diffuse: string; normal: string; arm: string }>;
  models: Record<string, string>;
  credits: { id: string; name: string; type: string; authors: string[] }[];
}

/** URL of a file in public/assets, relative to the page so the site works under any base path. */
export const assetUrl = (rel: string): string => `${import.meta.env.BASE_URL}assets/${rel}`;

export async function loadManifest(): Promise<RuntimeManifest | null> {
  try {
    const r = await fetch(assetUrl('manifest.json'));
    return r.ok ? ((await r.json()) as RuntimeManifest) : null;
  } catch {
    return null;
  }
}
