import {CX, CY, dOf, flatten, n} from './geometry.ts';
import type {Pt, Seg} from './geometry.ts';
import {INK, SHADE_ROSE, WHITE, over} from './palette.ts';
import type {Base} from './params.ts';

// ---- hair: a smooth silhouette (volume on the side the hair falls to), fringe locks as tapered fills whose width and length depend on the distance from the parting
interface Hair {lockStroke: string; back: string; mass: string; locks: string; lockShade: string; skinShade: string; polys: Record<string, Pt[]>; top: number; clipDefs: string}
const VAR = [0, -5, 3, -2, 5, -3, 2];
export function hairParts(h: Base['hair'], W: number, hairHex: string): Hair {
  const bob = h.template === 'bob', lockLen = bob ? 112 : h.sideLen, foot = bob ? 24 : 14;
  const part = h.parting * W * 0.5, sp = h.parting >= 0 ? 1 : -1, heavy = -sp;
  const Wo = W + (bob ? 13 : 9), woR = Wo + (heavy === 1 ? 5 : -2), woL = Wo + (heavy === -1 ? 5 : -2), inX = W - (bob ? 6 : 10);
  const span = W - 8, N = h.strands;
  const massSegs: Seg[] = [
    ['M', [CX + woR, CY + lockLen]], ['L', [CX + woR - 1, CY + 2]], ['C', [CX + woR + 8, CY - 60], [CX + 66, CY - 114], [CX, CY - 114]], ['C', [CX - 66, CY - 114], [CX - woL - 8, CY - 60], [CX - woL - 1, CY + 2]],
    ['L', [CX - woL, CY + lockLen]], ['Q', [CX - W + 2, CY + lockLen + 6], [CX - inX, CY + lockLen - foot]], ['L', [CX - inX + 1, CY - 2]], ['L', [CX - W + 8, CY - 36]], ['Q', [CX, CY - 84], [CX + W - 8, CY - 36]],
    ['L', [CX + inX - 1, CY - 2]], ['L', [CX + inX, CY + lockLen - foot]], ['Q', [CX + W - 2, CY + lockLen + 6], [CX + woR, CY + lockLen]], ['Z'],
  ];
  // strands: the distance d from the parting (0..1) sets each lock's width (wider away from it), length (longer away from it) and lean
  const dist = (x: number): number => Math.min(1, Math.abs(x - (CX + part)) / (span * 1.2));
  const uni = Array.from({length: N}, (_, i) => CX + span - 2 * span * (N === 1 ? 0.5 : i / (N - 1)));
  const wt = uni.map(x => 0.45 + 1.3 * dist(x)), sum = wt.reduce((p, q) => p + q, 0);
  let acc = 0;
  const locks: {segs: Seg[]; tip: Pt}[] = [];
  for (let i = 0; i < N; i++) {
    // biome-ignore lint/style/noNonNullAssertion: Each strand has a weight at the same index.
    const x = CX + span - 2 * span * (acc + wt[i]! / 2) / sum; acc += wt[i]!;
    // biome-ignore lint/style/noNonNullAssertion: Each strand has a weight at the same index.
    const d = dist(x), width = Math.min(56, wt[i]! / sum * 2 * span * 1.6);
    // biome-ignore lint/style/noNonNullAssertion: The remainder is an index into the seven-entry variation table.
    const y = CY - 46 + 8 + 28 * d * Math.sqrt(d) + VAR[(i * 3 + N) % 7]!, lean = (x >= CX + part ? 1 : -1) * 6 * d;
    locks.push({tip: [x + lean, y], segs: [['M', [x + width / 2, CY - 64]], ['Q', [x + width * 0.6, (CY - 64 + y) / 2], [x + lean, y]], ['Q', [x - width * 0.5, (CY - 64 + y) / 2 + 2], [x - width / 2, CY - 64]], ['Z']]});
  }
  const order = [...locks].sort((p, q) => Math.abs(q.tip[0] - (CX + part)) - Math.abs(p.tip[0] - (CX + part)));
  const lockD = order.map(l => dOf(l.segs));
  const massD = dOf(massSegs);
  const polys: Record<string, Pt[]> & {mass: Pt[]} = {mass: flatten(massSegs)};
  order.forEach((l, i) => { polys[`lock${i}`] = flatten(l.segs); });
  const locksSvg = lockD.map(d => `<path d="${d}" fill="${hairHex}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>`).join('');
  const ring = h.highlight ? `<path d="M${n(CX - 60)} ${n(CY - 82)}Q${n(CX - 46)} ${n(CY - 96)} ${n(CX - 32)} ${n(CY - 90)}Q${n(CX - 18)} ${n(CY - 102)} ${n(CX)} ${n(CY - 97)}Q${n(CX + 18)} ${n(CY - 103)} ${n(CX + 32)} ${n(CY - 92)}Q${n(CX + 46)} ${n(CY - 94)} ${n(CX + 58)} ${n(CY - 80)}" fill="none" stroke="${WHITE}" stroke-opacity="0.45" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>` : '';
  const ahoge = h.ahoge === 'none' ? '' : (() => { const s = h.ahoge === 'right' ? 1 : -1; const d = `M${n(CX + s * 40)} ${n(CY - 104)}C${n(CX + s * 44)} ${n(CY - 114)} ${n(CX + s * 66)} ${n(CY - 114)} ${n(CX + s * 62)} ${n(CY - 104)}`; polys['ahoge'] = flatten([['M', [CX + s * 40, CY - 104]], ['C', [CX + s * 44, CY - 114], [CX + s * 66, CY - 114], [CX + s * 62, CY - 104]]]); return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${hairHex}" stroke-width="3.2" stroke-linecap="round"/>`; })();
  const backD = `M${n(CX - W - 10)} ${n(CY - 20)}C${n(CX - W - 26)} ${n(CY + 60)} ${n(CX - W - 20)} ${n(CY + 120)} ${n(CX - W + 2)} ${n(CY + 140)}Q${CX} ${n(CY + 158)} ${n(CX + W - 2)} ${n(CY + 140)}C${n(CX + W + 20)} ${n(CY + 120)} ${n(CX + W + 26)} ${n(CY + 60)} ${n(CX + W + 10)} ${n(CY - 20)}Z`;
  // the back hair is one value lighter than the front (an ink overlay of 0.25 on the base), so the inner and outer masses separate
  const back = bob ? `<path d="${backD}" fill="${hairHex}" stroke="${INK}" stroke-width="4.6" stroke-linejoin="round"/>` + over(`path d="${backD}"`, INK, 0.25) : '';
  const lockUnion = lockD.map(d => `<path d="${d}"/>`).join('');
  const clipDefs = `<clipPath id="lk">${lockUnion}</clipPath>`;
  const lockShade = `<g clip-path="url(#lk)">${over(`rect x="${CX - 100}" y="${CY - 36}" width="200" height="60"`, INK, 0.28)}</g>`;
  const skinShade = `<g fill="${SHADE_ROSE}" fill-opacity="0.28" transform="translate(0 9)"><path d="${massD}"/>${lockUnion}</g>`;
  const topInk = Math.min(Math.min(...polys['mass'].map(q => q[1])) - 2.3, polys['ahoge'] ? Math.min(...polys['ahoge'].map(q => q[1])) - 3.5 : Infinity);
  return {back, mass: `<path d="${massD}" fill="${hairHex}"/>` + ring + `<path d="${massD}" fill="none" stroke="${INK}" stroke-width="4.6" stroke-linejoin="round"/>` + ahoge, locks: locksSvg, lockStroke: `<path d="${massD}"/>${lockUnion}`, lockShade, skinShade, polys, top: topInk - 0.5, clipDefs};
}
