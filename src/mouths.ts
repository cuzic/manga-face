import type {Built} from './eyes.ts';
import {CX, CY, n} from './geometry.ts';
import {INK, MOUTH_IN, PAPER, TONGUE, WHITE} from './palette.ts';
import type {Base} from './params.ts';
import type {Preset} from './presets.ts';

export type MouthKind = 'flat' | 'smile' | 'open' | 'o' | 'frown' | 'wave' | 'omega' | 'grit' | 'tri';

// A keyed ink line has a paper underlay 2 units wider on each side.
export const KEY_W = 4;
export const inkLine = (d: string, w: number, keyed: boolean): string =>
  (keyed ? `<path d="${d}" fill="none" stroke="${PAPER}" stroke-width="${n(w + KEY_W)}" stroke-linecap="round" stroke-linejoin="round"/>` : '') + `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

export function noseSvg(nose: Base['nose'], keyed: boolean): string {
  if (nose === 'none') return '';
  if (nose === 'dot') return inkLine(`M${CX - 3} ${CY + 44}q3 4 6 0`, 3.2, keyed);
  return inkLine(`M${CX - 2} ${CY + 38}l-3 8l6 0`, 3.2, keyed);
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
