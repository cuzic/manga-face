import type {Base} from './params.ts';

// Coordinates: the head centre is (150, 140); the head circle (the anchor) has r = 100. The stage scales the circle to r = 36 px (0.36).
export const CX = 150, CY = 140, HEAD_R = 100, SCALE = 0.36;
/** The box is cropped to the artwork's width (shoulders 20..280) and top (hair top ~23). */
export const BOX = [20, 16, 260, 344] as const;
export const n = (v: number): number => Math.round(v * 10) / 10;

// ---- geometry: segments, flattening, intersection
export type Pt = [number, number];
export type Seg = ['M', Pt] | ['L', Pt] | ['Q', Pt, Pt] | ['C', Pt, Pt, Pt] | ['Z'];
export const dOf = (segs: Seg[]): string => segs.map(s => s[0] + s.slice(1).map(p => `${n((p as Pt)[0])} ${n((p as Pt)[1])}`).join(' ')).join('');
export function flatten(segs: Seg[], steps = 10): Pt[] {
  const out: Pt[] = []; let cur: Pt = [0, 0];
  for (const s of segs) {
    if (s[0] === 'M' || s[0] === 'L') { cur = s[1]; out.push(cur); } else if (s[0] === 'Q') {
      const [c, e] = [s[1], s[2]]; for (let i = 1; i <= steps; i++) { const t = i / steps, u = 1 - t; out.push([u * u * cur[0] + 2 * u * t * c[0] + t * t * e[0], u * u * cur[1] + 2 * u * t * c[1] + t * t * e[1]]); } cur = e;
    } else if (s[0] === 'C') {
      const [a, b, e] = [s[1], s[2], s[3]]; for (let i = 1; i <= steps; i++) { const t = i / steps, u = 1 - t; out.push([u * u * u * cur[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t * t * t * e[0], u * u * u * cur[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * e[1]]); } cur = e;
    }
  }
  return out;
}
/** True if the closed polyline crosses itself (non-adjacent segments intersect). */
export function selfIntersects(poly: Pt[]): boolean {
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const hit = (p1: Pt, p2: Pt, p3: Pt, p4: Pt) => cross(p1, p2, p3) * cross(p1, p2, p4) < 0 && cross(p3, p4, p1) * cross(p3, p4, p2) < 0;
  const m = poly.length;
  // biome-ignore lint/style/noNonNullAssertion: The loop bounds and wraparound keep every index within the polyline.
  for (let i = 0; i < m; i++) for (let j = i + 2; j < m; j++) { if (i === 0 && j === m - 1) continue; if (hit(poly[i]!, poly[(i + 1) % m]!, poly[j]!, poly[(j + 1) % m]!)) return true; }
  return false;
}

// ---- the face outline: temple -> cheekbone -> jaw corner -> chin, mirrored (jaw roundness and chin width are independent)
export function faceSegs(h: Base['head']): Seg[] {
  const W = h.cheek, H = h.chin, j = h.jaw, cw = h.chinW;
  const jx = cw + (W * 0.8 - cw) * j, jy = H * (0.6 + 0.2 * j);
  const half = (s: -1 | 1) => ({
    a: [CX + s * W, CY - 14] as Pt, b: [CX + s * W * 0.985, CY + 30] as Pt, j: [CX + s * jx, CY + jy] as Pt, e: [CX + s * cw, CY + H] as Pt,
    c1: [CX + s * W, CY - 2] as Pt, c2: [CX + s * W, CY + 16] as Pt, c3: [CX + s * W * 0.96, CY + 30 + (jy - 30) * 0.5] as Pt, c4: [CX + s * (jx + (W - jx) * 0.2), CY + jy + 2] as Pt,
  });
  const L = half(-1), R = half(1);
  return [
    ['M', L.a], ['C', L.c1, L.c2, L.b], ['C', L.c3, L.c4, L.j], ['Q', [CX - (jx + cw) / 2, CY + H - 1], L.e], ['Q', [CX, CY + H + 2], R.e],
    ['Q', [CX + (jx + cw) / 2, CY + H - 1], R.j], ['C', R.c4, R.c3, R.b], ['C', R.c2, R.c1, R.a],
    ['C', [CX + W, CY - 80], [CX + 64, CY - 104], [CX, CY - 104]], ['C', [CX - 64, CY - 104], [CX - W, CY - 80], L.a], ['Z'],
  ];
}
/** Half the face width at height y (from the flattened outline). */
export function faceHalfWidth(poly: Pt[], y: number): number {
  let best = 0;
  // biome-ignore lint/style/noNonNullAssertion: The loop bounds and wraparound keep both indices within the polyline.
  for (let i = 0; i < poly.length; i++) { const a = poly[i]!, b = poly[(i + 1) % poly.length]!; if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) { const x = a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]); best = Math.max(best, Math.abs(x - CX)); } }
  return best;
}
