import {CX, CY, HEAD_R, faceHalfWidth, faceSegs, flatten} from './geometry.ts';
import type {HAIR, IRIS, SKIN, TOP} from './palette.ts';

// ---- parameters: type, range, step, default (ADR 0079 D2). `normalize` clamps, snaps and applies the dependent constraints; `validate` checks the invariants.
export interface Palette {skin: keyof typeof SKIN | string; hair: keyof typeof HAIR | string; top: keyof typeof TOP | string; iris: keyof typeof IRIS | string}
export interface Base {
  head: {cheek: number; chin: number; jaw: number; chinW: number};
  eyes: {w: number; h: number; tilt: number; iris: number; y: number; gap: number; lashes: boolean; lidW: number};
  brows: {thick: number; dy: number};
  mouth: {w: number; y: number};
  nose: 'none' | 'dot' | 'line';
  hair: {template: 'short' | 'bob'; strands: number; parting: number; ahoge: 'none' | 'left' | 'right'; highlight: boolean; sideLen: number};
}
export interface Character extends Base {id: string; name: string; palette: Palette; mirror?: boolean}
/** [min, max, step] */
export const RANGES = {
  'head.cheek': [74, 96, 2], 'head.chin': [90, 98, 1], 'head.jaw': [0, 1, 0.05], 'head.chinW': [0, 16, 2],
  'eyes.w': [18, 28, 1], 'eyes.h': [13, 26, 1], 'eyes.tilt': [-8, 10, 1], 'eyes.iris': [0.6, 1.2, 0.05], 'eyes.y': [14, 28, 1], 'eyes.gap': [36, 48, 1], 'eyes.lidW': [4.5, 7.5, 0.5],
  'brows.thick': [4, 9, 0.5], 'brows.dy': [-20, 8, 1], 'mouth.w': [10, 48, 1], 'mouth.y': [58, 70, 1],
  'hair.strands': [1, 9, 1], 'hair.parting': [-1, 1, 0.25], 'hair.sideLen': [16, 40, 2],
} as const satisfies Record<string, readonly [number, number, number]>;
export type RangeKey = keyof typeof RANGES;
type RangeGroup = RangeKey extends `${infer Group}.${string}` ? Group : never;
const rangeField = (key: RangeKey): [RangeGroup, string] => key.split('.') as [RangeGroup, string];
export function get(c: Base, key: RangeKey): number {
  const [group, field] = rangeField(key);
  return (c[group] as Record<string, number>)[field] as number;
}
function set(c: Base, key: RangeKey, value: number): void {
  const [group, field] = rangeField(key);
  (c[group] as Record<string, number>)[field] = value;
}
export const clamp = (v: number, [lo, hi, st]: readonly [number, number, number]): number => { const c = Math.min(hi, Math.max(lo, v)); const s = Math.round(c / st) * st; return Math.round(Math.min(hi, s) * 1e6) / 1e6; };
export const LASH = 11;
const EYE_WMUL_MAX = 1.08, MOUTH_WMUL_MAX = 2.6;
/**
 * Clamps every ranged field and snaps it to its step, then applies the dependent constraints (the valid set is not a box):
 *   the face inside the head circle (jaw roundness, then cheek, are lowered); eyes.gap <= half face width at the eyes - 4 - lash - 1 - 1.08 * 18;
 *   mouth.y in [eyes.y + 28, chin - 30]; eyes.w <= (half face width at the eyes - 4 - lash - gap - 1) / 1.08 (the widest preset); mouth.w <= (half face width at the mouth - 6) * 2 / 2.6.
 * Returns a copy. What still breaks an invariant (a range that cannot hold both bounds) is reported by `validate`.
 */
export function normalize<T extends Base>(ch: T): T {
  const c = structuredClone(ch);
  for (const k of Object.keys(RANGES) as RangeKey[]) set(c, k, clamp(get(c, k), RANGES[k]));
  // the face stays inside the head circle: lower the jaw's roundness, then the cheek, until it does
  const inCircle = (): boolean => Math.max(...flatten(faceSegs(c.head)).filter(p => p[1] > CY - 20).map(p => Math.sqrt((p[0] - CX) * (p[0] - CX) + (p[1] - CY) * (p[1] - CY)))) <= HEAD_R + 0.5;
  while (!inCircle() && c.head.jaw >= 0.05) c.head.jaw = Math.round((c.head.jaw - 0.05) * 100) / 100;
  while (!inCircle() && c.head.cheek > RANGES['head.cheek'][0]) c.head.cheek -= 2;
  const poly = flatten(faceSegs(c.head));
  c.mouth.y = Math.max(RANGES['mouth.y'][0], Math.min(c.mouth.y, c.head.chin - 30));
  const hwE = faceHalfWidth(poly, CY + c.eyes.y);
  c.eyes.gap = Math.max(RANGES['eyes.gap'][0], Math.min(c.eyes.gap, Math.floor(hwE - 4 - (c.eyes.lashes ? LASH : 0) - 1 - RANGES['eyes.w'][0] * EYE_WMUL_MAX)));
  c.eyes.w = Math.max(RANGES['eyes.w'][0], Math.min(c.eyes.w, Math.floor((hwE - 4 - (c.eyes.lashes ? LASH : 0) - c.eyes.gap - 1) / EYE_WMUL_MAX)));
  const hwM = faceHalfWidth(poly, CY + c.mouth.y);
  c.mouth.w = Math.max(RANGES['mouth.w'][0], Math.min(c.mouth.w, Math.floor((hwM - 6) * 2 / MOUTH_WMUL_MAX)));
  return c;
}
