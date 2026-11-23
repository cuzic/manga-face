import {dOf, flatten, n} from './geometry.ts';
import type {Pt, Seg} from './geometry.ts';
import {KEY_W, inkLine} from './mouths.ts';
import {INK, PAPER, WHITE, over} from './palette.ts';
import {LASH} from './params.ts';
import type {Base} from './params.ts';
import type {Preset} from './presets.ts';

export type EyeKind = 'open' | 'arc' | 'arcDown' | 'cross' | 'dot' | 'half';

interface Eye {kind: EyeKind; w: number; h: number; hL: number; tilt: number; iris: number; lid: number; squint: number; lookX: number; lookY: number; hl: 1 | 2; lashes: boolean; lidW: number}
export const resolveEye = (b: Base['eyes'], p: Preset['eye']): Eye => {
  const kind = p.kind ?? 'open', h = b.h * (p.hMul ?? 1);
  return {kind, w: b.w * (p.wMul ?? 1), h, hL: h * (p.hMulL ?? 1), tilt: b.tilt + (p.tilt ?? 0), iris: b.iris * (p.irisMul ?? 1), lid: p.lid ?? (kind === 'half' ? 0.45 : 1), squint: p.squint ?? 0, lookX: p.lookX ?? 0, lookY: p.lookY ?? 0, hl: p.hl ?? 2, lashes: p.lashes ?? b.lashes, lidW: b.lidW};
};

export interface Built {svg: string; top: number; bottom: number; left: number; right: number}
export function eyeSvg(e: Eye, s: -1 | 1, ex: number, ey: number, iris: string, id: string, keyed: boolean): Built {
  const P = (x: number, y: number): Pt => [ex + s * x, ey + y];
  const q = (p: Pt): string => `${n(p[0])} ${n(p[1])}`;
  const a = e.w, b = s === -1 ? e.hL : e.h, oy = -e.tilt;
  if (e.kind === 'arc' || e.kind === 'arcDown') {
    const d = e.kind === 'arc' ? -1 : 1, y = e.kind === 'arc' ? 3 : -3;
    return {svg: inkLine(`M${q(P(-a, y))}Q${q(P(0, y + d * b * 1.25))} ${q(P(a, y))}`, 6.5, keyed), top: ey + y + Math.min(0, d * b * 0.62) - 3, bottom: ey + y + Math.max(0, d * b * 0.62) + 3, left: ex - a, right: ex + a};
  }
  if (e.kind === 'cross') {
    // `><`: the vertex is on the inner side (the left eye is `>`, the right eye is `<`)
    return {svg: inkLine(`M${q(P(a * 0.7, -b * 0.8))}L${q(P(-a * 0.7, 0))}L${q(P(a * 0.7, b * 0.8))}`, 6, keyed), top: ey - b * 0.8 - 3, bottom: ey + b * 0.8 + 3, left: ex - a, right: ex + a};
  }
  if (e.kind === 'dot') {
    const el = `cx="${n(ex)}" cy="${n(ey + 2)}" rx="${n(a * 0.34)}" ry="${n(b * 0.5)}"`;
    return {svg: (keyed ? `<ellipse ${el} fill="${PAPER}" stroke="${PAPER}" stroke-width="${KEY_W}"/>` : '') + `<ellipse ${el} fill="${INK}"/>`, top: ey + 2 - b * 0.5, bottom: ey + 2 + b * 0.5, left: ex - a * 0.34, right: ex + a * 0.34};
  }
  const lid = e.lid;
  const top = (y: number): number => y * lid;
  const sq = e.squint;
  const upperSegs: Seg[] = [['M', P(-a, 2)], ['C', P(-a * 0.7, top(-b * 1.2)), P(a * 0.35, top(-b * 1.3)), P(a, oy)]];
  const lowerSegs: Seg[] = [['C', P(a * 0.55, b * (0.85 - sq * 0.8) - sq * 5), P(-a * 0.5, b * (0.95 - sq * 0.8) - sq * 5), P(-a, 2)], ['Z']];
  const upper = dOf(upperSegs), shape = upper + dOf(lowerSegs);
  const poly = flatten([...upperSegs, ...lowerSegs]);
  const rx = a * 0.64 * e.iris, ry = Math.min(b * 0.98, b * 0.98 * e.iris), ix = e.lookX * s, iy = 3 + e.lookY;
  const icx = ex + s * ix, icy = (k: number): number => ey + iy + k;
  const hi = `<ellipse cx="${n(ex + s * (ix - rx * 0.3))}" cy="${n(icy(-ry * 0.38))}" rx="${n(rx * 0.3)}" ry="${n(ry * 0.26)}" fill="${WHITE}"/>`
    + (e.hl === 2 ? `<circle cx="${n(ex + s * (ix + rx * 0.38))}" cy="${n(icy(ry * 0.42))}" r="${n(rx * 0.14)}" fill="${WHITE}"/>` : '');
  const lash = e.lashes ? `<path d="M${q(P(a + 1, oy - 1))}L${q(P(a + LASH, oy - 9 - Math.max(0, e.tilt) * 0.2))}L${q(P(a - 5, oy - 4))}Z" fill="${INK}"/>` : '';
  const lidTop = Math.min(...poly.map(p => p[1]));
  const lw = e.lidW;
  const lidPath = lid === 1 ? upper : `M${q(P(-a - 1, 2))}C${q(P(-a * 0.7, top(-b * 1.2)))} ${q(P(a * 0.35, top(-b * 1.3)))} ${q(P(a + 1, oy))}`;
  const svg = `<clipPath id="${id}"><path d="${shape}"/></clipPath><path d="${shape}" fill="${WHITE}"/>`
    // the iris: the base colour, an ink overlay for the dark rim, the base colour again as the lit part, a white overlay for the glow, the pupil and the highlights
    + `<g clip-path="url(#${id})"><ellipse cx="${n(icx)}" cy="${n(icy(0))}" rx="${n(rx)}" ry="${n(ry)}" fill="${iris}"/>`
    + over(`ellipse cx="${n(icx)}" cy="${n(icy(0))}" rx="${n(rx)}" ry="${n(ry)}"`, INK, 0.5)
    + `<ellipse cx="${n(icx)}" cy="${n(icy(ry * 0.3))}" rx="${n(rx * 0.86)}" ry="${n(ry * 0.62)}" fill="${iris}"/>`
    + over(`ellipse cx="${n(icx)}" cy="${n(icy(ry * 0.52))}" rx="${n(rx * 0.55)}" ry="${n(ry * 0.3)}"`, WHITE, 0.5)
    + `<ellipse cx="${n(icx)}" cy="${n(icy(-ry * 0.05))}" rx="${n(rx * 0.42)}" ry="${n(ry * 0.5)}" fill="${INK}"/>${hi}</g>`
    + `<path d="${lidPath}" fill="none" stroke="${INK}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"/>`
    // the lower lid lies next to the eye white, so it needs no keyline
    + lash + inkLine(`M${q(P(a * 0.9, 1))}C${q(P(a * 0.55, b * (0.8 - sq * 0.8) - sq * 5))} ${q(P(-a * 0.2, b * (0.95 - sq * 0.8) - sq * 5))} ${q(P(-a * 0.6, b * (0.7 - sq * 0.6) - sq * 4))}`, 3, false);
  const xs = poly.map(p => p[0]);
  // the lash is on the outer side: the right of the right eye (s = 1), the left of the left eye (s = -1)
  const lashOut = e.lashes ? LASH : 0;
  return {svg, top: lidTop - lw / 2, bottom: Math.max(...poly.map(p => p[1])), left: Math.min(...xs) - (s === -1 ? lashOut : 0), right: Math.max(...xs) + (s === 1 ? lashOut : 0)};
}
