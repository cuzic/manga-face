import type {Built} from './eyes.ts';
import {flatten, n} from './geometry.ts';
import {KEY_W} from './mouths.ts';
import {INK, PAPER} from './palette.ts';
import type {Preset} from './presets.ts';
import {TRIG} from './trig.ts';

const BROW_STROKE = 1.5;

export function browKeyline(d: string, width = BROW_STROKE + KEY_W): string {
  return `<path d="${d}" fill="${PAPER}" stroke="${PAPER}" stroke-width="${width}" stroke-linejoin="round"/>`;
}

export function browSvg(bp: Preset['brow'], thick: number, s: -1 | 1, ex: number, ey: number, eyeH: number, dy0: number): {path: string; built: Built} {
  const len = 36, raise = bp.raise ? (s === 1 ? bp.raise[1] : bp.raise[0]) : 0;
  const y0 = ey - eyeH - 16 + dy0 + (bp.dy ?? 0) - raise;
  const [cs, sn] = TRIG[Math.round(bp.angle) + 45] ?? [1, 0], dx = cs * len / 2, dy = sn * len / 2;
  const ix = ex - s * dx, iy = y0 + dy, ox = ex + s * dx, oy = y0 - dy;
  const t = thick * (bp.thickMul ?? 1) / 2, mx = (ix + ox) / 2, my = (iy + oy) / 2 - 4;
  const d = `M${n(ix)} ${n(iy - t)}Q${n(mx)} ${n(my - t)} ${n(ox)} ${n(oy)}Q${n(mx)} ${n(my + t)} ${n(ix)} ${n(iy + t)}Z`;
  const poly = flatten([['M', [ix, iy - t]], ['Q', [mx, my - t], [ox, oy]], ['Q', [mx, my + t], [ix, iy + t]]]);
  const svg = `<path d="${d}" fill="${INK}" stroke="${INK}" stroke-width="${BROW_STROKE}" stroke-linejoin="round"/>`;
  return {path: d, built: {svg, top: Math.min(...poly.map(p => p[1])), bottom: Math.max(...poly.map(p => p[1])) + BROW_STROKE / 2, left: Math.min(...poly.map(p => p[0])), right: Math.max(...poly.map(p => p[0]))}};
}
