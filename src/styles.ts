import {normalize} from './params.ts';
import type {Base, Character, Palette} from './params.ts';

// ---- the two directions of the look (ADR 0079 Q2). `young` is the round-eyed baseline. `mature`: a narrower face with a square chin, small eyes with a small iris, a thin upper lid and no lashes, short sides.
export const DIRECTIONS = {
  young: {head: {cheek: 86, chin: 96, jaw: 0.65, chinW: 4}, eyes: {w: 25, h: 23, tilt: 0, iris: 1, y: 20, gap: 42, lashes: true, lidW: 7}, brows: {thick: 6, dy: 0}, mouth: {w: 16, y: 64}, nose: 'dot'} satisfies Omit<Base, 'hair'>,
  mature: {head: {cheek: 76, chin: 98, jaw: 0.85, chinW: 14}, eyes: {w: 20, h: 15, tilt: 1, iris: 0.8, y: 27, gap: 37, lashes: false, lidW: 5.5}, brows: {thick: 5.5, dy: 2}, mouth: {w: 14, y: 68}, nose: 'line'} satisfies Omit<Base, 'hair'>,
};
export const HAIR_YOUNG = {template: 'short', strands: 4, parting: 0.5, ahoge: 'none', highlight: true, sideLen: 36} as const;
const HAIR_MATURE = {template: 'short', strands: 5, parting: 0.5, ahoge: 'none', highlight: true, sideLen: 20} as const;
/** The two styles of the look (ADR 0001 Q2). `young` is the default; `mature` is chosen with `style: 'mature'`. */
export type Style = keyof typeof DIRECTIONS;
export const DEFAULT_STYLE: Style = 'young';
export interface DefaultCharacterOpts {id?: string; name?: string; style?: Style; palette?: Partial<Palette>; hair?: Partial<Base['hair']>}
/** A valid character of the given style (default `young`): the style's face, eyes, brows, mouth and hair, with the reference palette. */
export function defaultCharacter(opts: DefaultCharacterOpts = {}): Character {
  const style = opts.style ?? DEFAULT_STYLE;
  const hair = style === 'mature' ? HAIR_MATURE : HAIR_YOUNG;
  return normalize({
    id: opts.id ?? `mf-${style}`, name: opts.name ?? style, ...structuredClone(DIRECTIONS[style]),
    hair: {...hair, ...opts.hair}, palette: {skin: 'fair', hair: 'brown', top: 'blue', iris: 'blue', ...opts.palette},
  } as Character);
}

/** Reference characters: the fixtures of the goldens and the measurements (a: young short, b: young bob, mirrored, m: mature). */
export const CHARACTERS = {
  a: {id: 'mf-a', name: '私', ...DIRECTIONS.young, hair: {...HAIR_YOUNG}, palette: {skin: 'fair', hair: 'brown', top: 'blue', iris: 'blue'}} satisfies Character,
  b: {id: 'mf-b', name: '同僚', ...DIRECTIONS.young, head: {cheek: 88, chin: 98, jaw: 0.7, chinW: 4}, nose: 'line', hair: {template: 'bob', strands: 6, parting: -0.5, ahoge: 'none', highlight: true, sideLen: 36}, palette: {skin: 'medium', hair: 'black', top: 'red', iris: 'brown'}, mirror: true} satisfies Character,
  m: {id: 'mf-m', name: '同僚(成熟)', ...DIRECTIONS.mature, hair: {...HAIR_MATURE}, palette: {skin: 'light', hair: 'chestnut', top: 'teal', iris: 'brown'}} satisfies Character,
};
