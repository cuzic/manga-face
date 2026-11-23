import type {ComicExpression} from 'svg-diagram';
import {CX, CY, dOf, flatten, n} from './geometry.ts';
import type {Pt, Seg} from './geometry.ts';
import {INK, MOUTH_IN, PAPER, TONGUE, WHITE, over} from './palette.ts';
import {LASH} from './params.ts';
import type {Base} from './params.ts';
import {TRIG} from './trig.ts';

export type EyeKind = 'open' | 'arc' | 'arcDown' | 'cross' | 'dot' | 'half';
export type MouthKind = 'flat' | 'smile' | 'open' | 'o' | 'frown' | 'wave' | 'omega' | 'grit' | 'tri';

/** A preset is a delta on the character's own eyes / brows / mouth (ADR 0079 D3): multipliers and offsets, `angle` absolute (whole degrees). */
export interface Preset {
  eye: {kind?: EyeKind; wMul?: number; hMul?: number; hMulL?: number; tilt?: number; irisMul?: number; lid?: number; squint?: number; lookX?: number; lookY?: number; hl?: 1 | 2; lashes?: boolean};
  brow: {angle: number; thickMul?: number; dy?: number; raise?: [number, number]};
  mouth: {kind: MouthKind; wMul?: number; depth?: number; shift?: number};
  blush?: boolean;
}
export const PRESETS: Record<string, Preset> = {
  neutral: {eye: {}, brow: {angle: 0}, mouth: {kind: 'flat'}},
  smile: {eye: {hMul: 0.78, lid: 0.8, squint: 0.6, irisMul: 1.05}, brow: {angle: -7, dy: -4, thickMul: 1.1}, mouth: {kind: 'smile', wMul: 2.1, depth: 2.8}, blush: true},
  laugh: {eye: {kind: 'arc'}, brow: {angle: -6, dy: -8}, mouth: {kind: 'open', wMul: 2.6}, blush: true},
  surprise: {eye: {wMul: 1.08, hMul: 1.25, irisMul: 0.62, hl: 1}, brow: {angle: -4, dy: -16}, mouth: {kind: 'o', wMul: 0.7}},
  worry: {eye: {hMul: 0.9, lid: 0.85, tilt: -6, irisMul: 0.9, lookX: 4}, brow: {angle: -28, thickMul: 1.1, dy: -5}, mouth: {kind: 'wave', wMul: 2}},
  angry: {eye: {hMul: 0.74, tilt: 9, irisMul: 0.82, hl: 1}, brow: {angle: 20, thickMul: 1.3, dy: 1}, mouth: {kind: 'grit', wMul: 2.1}},
  think: {eye: {hMul: 0.95, hMulL: 0.55, lookX: 10, lookY: -9, irisMul: 0.95}, brow: {angle: -3, thickMul: 1.1, raise: [0, 26]}, mouth: {kind: 'flat', wMul: 1.2, shift: 7}},
  sad: {eye: {lid: 0.6, tilt: -7, irisMul: 1.12, lookY: 7}, brow: {angle: -32, dy: 2, thickMul: 1.1}, mouth: {kind: 'frown', wMul: 1.4, depth: 2.2}},
  // extras. Each has a same-meaning ComicExpression to stand in for (EXTRA_OF)
  shy: {eye: {hMul: 0.85, tilt: -3, lookX: 5, lookY: 6}, brow: {angle: -14, dy: -2}, mouth: {kind: 'omega', wMul: 1.4}, blush: true},
  smug: {eye: {kind: 'half'}, brow: {angle: 6, raise: [0, 6]}, mouth: {kind: 'omega', wMul: 1.7}},
  deadpan: {eye: {kind: 'half', hMul: 0.85, irisMul: 0.9, hl: 1}, brow: {angle: 2}, mouth: {kind: 'flat', wMul: 0.9}},
  clench: {eye: {kind: 'cross'}, brow: {angle: 18, thickMul: 1.2}, mouth: {kind: 'tri', wMul: 1.6}},
  cry: {eye: {kind: 'arcDown'}, brow: {angle: -24, dy: -2}, mouth: {kind: 'open', wMul: 2.2}},
  blank: {eye: {kind: 'dot'}, brow: {angle: 0, dy: -4}, mouth: {kind: 'o', wMul: 0.6}},
};
export const ADR0074: readonly ComicExpression[] = ['neutral', 'smile', 'laugh', 'surprise', 'worry', 'angry', 'think', 'sad'];
/** The same-meaning variants `expressionMap` may use (ADR 0079 D3). Anything else is refused. */
export const EXTRA_OF: Record<string, ComicExpression> = {shy: 'smile', smug: 'smile', deadpan: 'think', clench: 'angry', cry: 'sad', blank: 'surprise'};

interface Eye {kind: EyeKind; w: number; h: number; hL: number; tilt: number; iris: number; lid: number; squint: number; lookX: number; lookY: number; hl: 1 | 2; lashes: boolean; lidW: number}
export const resolveEye = (b: Base['eyes'], p: Preset['eye']): Eye => {
  const kind = p.kind ?? 'open', h = b.h * (p.hMul ?? 1);
  return {kind, w: b.w * (p.wMul ?? 1), h, hL: h * (p.hMulL ?? 1), tilt: b.tilt + (p.tilt ?? 0), iris: b.iris * (p.irisMul ?? 1), lid: p.lid ?? (kind === 'half' ? 0.45 : 1), squint: p.squint ?? 0, lookX: p.lookX ?? 0, lookY: p.lookY ?? 0, hl: p.hl ?? 2, lashes: p.lashes ?? b.lashes, lidW: b.lidW};
};


// ---- features. `keyed`: a paper line (2 units wider on each side) under each ink line.
const KEY_W = 4;
const inkLine = (d: string, w: number, keyed: boolean): string =>
  (keyed ? `<path d="${d}" fill="none" stroke="${PAPER}" stroke-width="${n(w + KEY_W)}" stroke-linecap="round" stroke-linejoin="round"/>` : '') + `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

export function noseSvg(nose: Base['nose'], keyed: boolean): string {
  if (nose === 'none') return '';
  if (nose === 'dot') return inkLine(`M${CX - 3} ${CY + 44}q3 4 6 0`, 3.2, keyed);
  return inkLine(`M${CX - 2} ${CY + 38}l-3 8l6 0`, 3.2, keyed);
}

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

export function browSvg(bp: Preset['brow'], thick: number, s: -1 | 1, ex: number, ey: number, eyeH: number, dy0: number, keyed: boolean): Built {
  const len = 36, raise = bp.raise ? (s === 1 ? bp.raise[1] : bp.raise[0]) : 0;
  const y0 = ey - eyeH - 16 + dy0 + (bp.dy ?? 0) - raise;
  const [cs, sn] = TRIG[Math.round(bp.angle) + 45] ?? [1, 0], dx = cs * len / 2, dy = sn * len / 2;
  const ix = ex - s * dx, iy = y0 + dy, ox = ex + s * dx, oy = y0 - dy;
  const t = thick * (bp.thickMul ?? 1) / 2, mx = (ix + ox) / 2, my = (iy + oy) / 2 - 4;
  const d = `M${n(ix)} ${n(iy - t)}Q${n(mx)} ${n(my - t)} ${n(ox)} ${n(oy)}Q${n(mx)} ${n(my + t)} ${n(ix)} ${n(iy + t)}Z`;
  const poly = flatten([['M', [ix, iy - t]], ['Q', [mx, my - t], [ox, oy]], ['Q', [mx, my + t], [ix, iy + t]]]);
  const svg = (keyed ? `<path d="${d}" fill="${PAPER}" stroke="${PAPER}" stroke-width="${KEY_W + 1.5}" stroke-linejoin="round"/>` : '') + `<path d="${d}" fill="${INK}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`;
  return {svg, top: Math.min(...poly.map(p => p[1])), bottom: Math.max(...poly.map(p => p[1])) + 0.75, left: Math.min(...poly.map(p => p[0])), right: Math.max(...poly.map(p => p[0]))};
}

export function mouthSvg(m: Preset['mouth'], baseW: number, y: number, id: string, keyed: boolean): Built {
  const w = baseW * (m.wMul ?? 1), dp = m.depth ?? 1, h = w / 2, x = CX + (m.shift ?? 0);
  const st = (d: string, sw = 3.6): string => inkLine(d, sw, keyed);
  const box = (): Pick<Built, 'left' | 'right'> => ({left: x - h, right: x + h});
  const KW = KEY_W + 3.6; // a closed shape: its outline's width + the keyline
  const closed = (d: string, fill: string, extra = ''): string => `${keyed ? `<path d="${d}" fill="none" stroke="${PAPER}" stroke-width="${KW}" stroke-linejoin="round"/>` : ''}<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/>${extra}`;
  switch (m.kind) {
    case 'flat': return {svg: st(`M${n(x - h)} ${n(y)}Q${n(x)} ${n(y + 3 * dp)} ${n(x + h)} ${n(y - (m.shift ? 3 : 0))}`), top: y - 3, bottom: y + 4, ...box()};
    case 'smile': return {svg: st(`M${n(x - h)} ${n(y - 3)}Q${n(x)} ${n(y + 8 * dp)} ${n(x + h)} ${n(y - 3)}`), top: y - 5, bottom: y + 5 * dp, ...box()};
    case 'frown': return {svg: st(`M${n(x - h)} ${n(y + 6)}Q${n(x)} ${n(y + 6 - 14 * dp)} ${n(x + h)} ${n(y + 6)}`), top: y - 2 - 4 * dp, bottom: y + 8, ...box()};
    case 'wave': return {svg: st(`M${n(x - h)} ${n(y + 2)}q${n(h / 2)} -11 ${n(h)} 0t${n(h)} 0`), top: y - 8, bottom: y + 6, ...box()};
    case 'omega': return {svg: st(`M${n(x - h)} ${n(y - 2)}q${n(h / 2)} 12 ${n(h)} 0q${n(h / 2)} 12 ${n(h)} 0`, 3.4), top: y - 4, bottom: y + 8, ...box()};
    case 'o': { const d = `M${n(x - h * 0.85)} ${n(y + 4)}a${n(h * 0.85)} ${n(h * 1.15)} 0 1 0 ${n(h * 1.7)} 0a${n(h * 0.85)} ${n(h * 1.15)} 0 1 0 ${n(-h * 1.7)} 0Z`; return {svg: closed(d, MOUTH_IN), top: y + 4 - h * 1.15 - 2, bottom: y + 4 + h * 1.15 + 2, ...box()}; }
    case 'open': {
      const dd = `M${n(x - h)} ${n(y - 6)}Q${n(x)} ${n(y - 2)} ${n(x + h)} ${n(y - 6)}Q${n(x + h * 0.7)} ${n(y + 24)} ${n(x)} ${n(y + 24)}Q${n(x - h * 0.7)} ${n(y + 24)} ${n(x - h)} ${n(y - 6)}Z`;
      return {svg: `${keyed ? `<path d="${dd}" fill="none" stroke="${PAPER}" stroke-width="${KW}" stroke-linejoin="round"/>` : ''}<clipPath id="${id}"><path d="${dd}"/></clipPath><path d="${dd}" fill="${MOUTH_IN}"/><g clip-path="url(#${id})"><ellipse cx="${n(x)}" cy="${n(y + 23)}" rx="${n(h * 0.6)}" ry="9" fill="${TONGUE}"/></g><path d="${dd}" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/>`, top: y - 8, bottom: y + 26, ...box()};
    }
    case 'grit': { const d = `M${n(x - h)} ${n(y + 2)}Q${n(x)} ${n(y - 6)} ${n(x + h)} ${n(y + 2)}L${n(x + h * 0.8)} ${n(y + 16)}Q${n(x)} ${n(y + 10)} ${n(x - h * 0.8)} ${n(y + 16)}Z`; return {svg: closed(d, WHITE, `<path d="M${n(x - h * 0.3)} ${n(y - 1)}v10M${n(x + h * 0.3)} ${n(y - 1)}v10" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>`), top: y - 6, bottom: y + 18, ...box()}; }
    case 'tri': { const d = `M${n(x - h)} ${n(y)}L${n(x + h)} ${n(y)}L${n(x)} ${n(y + 20)}Z`; return {svg: closed(d, MOUTH_IN), top: y - 2, bottom: y + 22, ...box()}; }
  }
}
