import type {ComicExpression} from 'svg-diagram';
import type {EyeKind} from './eyes.ts';
import type {MouthKind} from './mouths.ts';

/** A preset is a delta on the character's own eyes / brows / mouth (ADR 0079 D3): multipliers and offsets, `angle` absolute (whole degrees). */
export interface Preset {
  eye: {kind?: EyeKind; wMul?: number; hMul?: number; hMulL?: number; tilt?: number; irisMul?: number; lid?: number; squint?: number; lookX?: number; lookY?: number; hl?: 1 | 2; lashes?: boolean};
  brow: {angle: number; thickMul?: number; dy?: number; raise?: [number, number]};
  mouth: {kind: MouthKind; wMul?: number; depth?: number; shift?: number};
  blush?: boolean;
}
export const PRESETS: Record<string, Preset> = {
  neutral: {eye: {}, brow: {angle: 0}, mouth: {kind: 'flat'}},
  smile: {eye: {hMul: 0.72, lid: 0.8, squint: 0.6, tilt: 4, irisMul: 1.05}, brow: {angle: -7, dy: -4, thickMul: 1.1}, mouth: {kind: 'smile', wMul: 2.1, depth: 2.8}, blush: true},
  laugh: {eye: {kind: 'arc'}, brow: {angle: -6, dy: -8}, mouth: {kind: 'open', wMul: 2.6}, blush: true},
  surprise: {eye: {wMul: 1.08, hMul: 1.25, irisMul: 0.62, hl: 1}, brow: {angle: -4, dy: -16}, mouth: {kind: 'o', wMul: 0.7}},
  worry: {eye: {hMul: 0.9, lid: 0.85, tilt: -6, irisMul: 0.9, lookX: 4}, brow: {angle: -28, thickMul: 1.1, dy: -5}, mouth: {kind: 'wave', wMul: 2}},
  angry: {eye: {hMul: 0.74, tilt: 9, irisMul: 0.82, hl: 1}, brow: {angle: 20, thickMul: 1.3, dy: 1}, mouth: {kind: 'grit', wMul: 2.1}},
  think: {eye: {hMul: 0.95, hMulL: 0.55, lookX: 10, lookY: -9, irisMul: 0.95}, brow: {angle: -12, dy: -8, thickMul: 1.1, raise: [0, 26]}, mouth: {kind: 'flat', wMul: 1.2, shift: 7}},
  sad: {eye: {lid: 0.52, tilt: -7, irisMul: 1.12, lookY: 11}, brow: {angle: -32, dy: 2, thickMul: 1.1}, mouth: {kind: 'frown', wMul: 1.7, depth: 2.2}},
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
