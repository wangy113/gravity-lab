/** Materials and geometry helpers, ported from the prototype (phMat, loadMaterials, tiledBox). */
import * as THREE from 'three';
import { assetUrl, type RuntimeManifest } from '../../core/assets/manifest.ts';

const texLoader = new THREE.TextureLoader();

/** PBR material from a Poly Haven texture set (color, normal, packed AO/roughness/metalness). */
export async function polyMaterial(manifest: RuntimeManifest | null, id: string, opts: THREE.MeshStandardMaterialParameters & { fallback?: number } = {}): Promise<THREE.MeshStandardMaterial> {
  const { fallback, ...rest } = opts;
  const set = manifest?.textures[id];
  try {
    if (!set) throw new Error(`texture ${id} not in manifest`);
    const [map, nor, arm] = await Promise.all([set.diffuse, set.normal, set.arm].map((f) => texLoader.loadAsync(assetUrl(f))));
    map!.colorSpace = THREE.SRGBColorSpace;
    for (const t of [map!, nor!, arm!]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
    return new THREE.MeshStandardMaterial({ map, normalMap: nor, aoMap: arm, roughnessMap: arm, metalnessMap: arm, roughness: 1, metalness: 1, ...rest });
  } catch (e) {
    console.warn('texture failed', id, e);
    return new THREE.MeshStandardMaterial({ color: fallback ?? 0x8a8a8a, roughness: 0.8, metalness: 0.1 });
  }
}

/** Box with UVs in world units, so textures keep a real-world scale. */
export function tiledBox(w: number, h: number, d: number, tile: number, off: [number, number] = [0, 0]): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]] as const;
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, (uv.getX(k) * dims[f]![0]) / tile + off[0], (uv.getY(k) * dims[f]![1]) / tile + off[1]);
  }
  return g;
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true, recv = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = recv;
  return m;
}

export interface Materials {
  slab: THREE.MeshStandardMaterial;
  found: THREE.MeshStandardMaterial;
  plate: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  blocks: THREE.MeshStandardMaterial[];
  chrome: THREE.MeshStandardMaterial;
  hyd: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  brace: THREE.MeshStandardMaterial;
  debris: THREE.MeshStandardMaterial;
  hazard: (len: number) => THREE.MeshStandardMaterial;
}

export async function loadMaterials(manifest: RuntimeManifest | null): Promise<Materials> {
  const [slab, found, plate, steel, floor] = await Promise.all([
    polyMaterial(manifest, 'brushed_concrete', { fallback: 0x9a958c }),
    polyMaterial(manifest, 'concrete_floor_worn_001', { fallback: 0x8d8780 }),
    polyMaterial(manifest, 'metal_plate', { fallback: 0x6d7378 }),
    polyMaterial(manifest, 'blue_metal_plate', { fallback: 0x355a8a }),
    polyMaterial(manifest, 'concrete_floor_02', { fallback: 0x8d8780 }),
  ]);
  const blocks = [0xd9d6d0, 0xc4c0b8, 0xb0aca4].map((c) => {
    const m = slab.clone();
    m.color = new THREE.Color(c);
    return m;
  });
  plate.color = new THREE.Color(0xc4c8cc);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 32;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f2b51d'; x.fillRect(0, 0, 256, 32); x.fillStyle = '#151515';
  for (let i = -2; i < 12; i++) { x.beginPath(); x.moveTo(i * 32, 32); x.lineTo(i * 32 + 16, 32); x.lineTo(i * 32 + 32, 0); x.lineTo(i * 32 + 16, 0); x.fill(); }
  const ht = new THREE.CanvasTexture(c);
  ht.colorSpace = THREE.SRGBColorSpace; ht.wrapS = THREE.RepeatWrapping; ht.anisotropy = 8;
  return {
    slab, found, plate, steel, floor, blocks,
    chrome: new THREE.MeshStandardMaterial({ color: 0xf2f4f7, metalness: 1, roughness: 0.07 }),
    hyd: new THREE.MeshStandardMaterial({ color: 0x23384d, metalness: 0.55, roughness: 0.32 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0, roughness: 0.75 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x16191c, metalness: 0.2, roughness: 0.6 }),
    brace: new THREE.MeshStandardMaterial({ color: 0xc9cdd2, metalness: 0.9, roughness: 0.3 }),
    debris: slab,
    hazard: (len) => {
      const t = ht.clone();
      t.repeat.set(len / 1.2, 1);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 });
    },
  };
}
