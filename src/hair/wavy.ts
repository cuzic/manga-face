export function wavyHair(sideLen: number) {
  return {length: sideLen + 15, foot: 19, width: 16, inset: 13, tip: 18, sweep: 11, back: 0};
}

import {CX, CY} from '../geometry.ts';
import type {Pt, Seg} from '../geometry.ts';

export function waveSide(sign: -1 | 1, edge: number, length: number, tip: number, upward: boolean): Seg {
  const upper: Pt = [CX + sign * (edge + tip), CY + length * 0.20];
  const lower: Pt = [CX + sign * (edge - tip), CY + length * 0.75];
  return upward
    ? ['C', lower, upper, [CX + sign * (edge - 1), CY + 2]]
    : ['C', upper, lower, [CX + sign * (edge - tip * 0.35), CY + length]];
}
