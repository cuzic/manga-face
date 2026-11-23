import {CX, CY} from '../geometry.ts';
import type {Pt, Seg} from '../geometry.ts';

const VAR = [0, -5, 3, -2, 5, -3, 2];

export function fringeLocks(N: number, span: number, part: number, sweep: number) {
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
    const y = CY - 46 + 8 + 28 * d * Math.sqrt(d) + VAR[(i * 3 + N) % 7]!, lean = (x >= CX + part ? 1 : -1) * sweep * d;
    locks.push({tip: [x + lean, y], segs: [['M', [x + width / 2, CY - 64]], ['Q', [x + width * 0.6, (CY - 64 + y) / 2], [x + lean, y]], ['Q', [x - width * 0.5, (CY - 64 + y) / 2 + 2], [x - width / 2, CY - 64]], ['Z']]});
  }
  return [...locks].sort((p, q) => Math.abs(q.tip[0] - (CX + part)) - Math.abs(p.tip[0] - (CX + part)));
}
