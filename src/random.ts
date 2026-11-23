import {HAIR, IRIS, SKIN, TOP} from './palette.ts';
import {RANGES, clamp, normalizeWithRanges} from './params.ts';
import type {Character, ParameterRanges, RangeKey} from './params.ts';
import {DIRECTIONS, HAIR_YOUNG} from './styles.ts';
import {validateWithRanges} from './validate.ts';
import type {Violation} from './validate.ts';

// ---- seeded random characters. One sub-stream per field (xmur3(world : seed : field) -> mulberry32), so adding a field or a template keeps the others' values.
// The sampler draws inside the ranges AND the dependent constraints (`normalize` applies them), so most draws are valid at once; what still fails is repaired
// group by group (eyes, brows, mouth, head, hair) from `field#k` sub-streams, then from the young direction's defaults; the other groups keep their values.
const xmur3 = (str: string): number => { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
const mulberry32 = (a: number): number => { let t = (a + 0x6d2b79f5) | 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** A seed is stable within one generator version (ADR 0001 D5). */
export const GENERATOR = 3;
type Group = Exclude<Violation['group'], 'palette'>;
const GROUPS: readonly Group[] = ['head', 'eyes', 'brows', 'mouth', 'hair'];
function drawGroup(seed: string, g: Group, k: number, cur: Character, ranges: ParameterRanges): Partial<Character> {
  const u = (field: string): number => mulberry32(xmur3(`${GENERATOR}:${seed}:${field}${k ? `#${k}` : ''}`));
  const lerp = (key: RangeKey, lo: number, hi: number): number => clamp(lo + (hi - lo) * u(key), ranges[key]);
  switch (g) {
    case 'head': return {head: {cheek: lerp('head.cheek', 76, 90), chin: lerp('head.chin', 92, 98), jaw: clamp(0.6 + 0.25 * u('jaw'), ranges['head.jaw']), chinW: lerp('head.chinW', 0, 12)}};
    case 'eyes': return {eyes: {w: lerp('eyes.w', 18, 26), h: lerp('eyes.h', 14, 24), tilt: lerp('eyes.tilt', -3, 4), iris: lerp('eyes.iris', 0.8, 1.1), y: 20, gap: clamp(38 + (cur.head.cheek - 74) / 8, ranges['eyes.gap']), lashes: u('lashes') < 0.7, lidW: lerp('eyes.lidW', 5, 7)}};
    case 'brows': return {brows: {thick: lerp('brows.thick', 4, 7), dy: lerp('brows.dy', -4, 3)}};
    case 'mouth': return {mouth: {w: lerp('mouth.w', 14, 24), y: 64}};
    case 'hair': return {hair: {template: u('template') < 0.5 ? 'short' : 'bob', strands: clamp(3 + Math.floor(u('strands') * 5), ranges['hair.strands']), parting: clamp(Math.round((u('parting') * 2 - 1) * 4) / 4, ranges['hair.parting']), ahoge: u('ahoge') < 0.15 ? (u('ahogeSide') < 0.5 ? 'left' : 'right') : 'none', highlight: u('hl') < 0.8, sideLen: lerp('hair.sideLen', 20, 36)}};
  }
}
// The sampler chooses valid palette keys up front and only redraws geometry groups.
export function repairGroups(violations: readonly Violation[]): Set<Group> {
  return new Set(violations.map(violation => violation.group).filter(group => group !== 'palette'));
}

export interface Drawn {character: Character; firstDrawValid: boolean; repaired: Group[]}
export function randomCharacterDetailed(seed: string | number, id = `mf-${seed}`): Drawn {
  const s = String(seed);
  const u = (f: string): number => mulberry32(xmur3(`${GENERATOR}:${s}:${f}`));
  // biome-ignore lint/style/noNonNullAssertion: The draw is in [0, 1) and all palette tables are nonempty.
  const choose = <T extends object>(f: string, o: T): keyof T & string => (Object.keys(o) as (keyof T & string)[])[Math.floor(u(f) * Object.keys(o).length)]!;
  // biome-ignore lint/style/noNonNullAssertion: The draw is in [0, 1), so the nose index is 0, 1 or 2.
  let ch = {id, name: s, nose: (['none', 'dot', 'line'] as const)[Math.floor(u('nose') * 3)]!, palette: {skin: choose('skin', SKIN), hair: choose('hairc', HAIR), top: choose('top', TOP), iris: choose('iris', IRIS)}} as Character;
  for (const g of GROUPS) ch = {...ch, ...drawGroup(s, g, 0, ch, RANGES)} as Character;
  return repairCharacter(ch, s);
}

/** Repairs an initial draw, preserving the other groups subject to normalization. */
export function repairCharacter(candidate: Character, seed: string, ranges: ParameterRanges = RANGES): Drawn {
  let ch = normalizeWithRanges(candidate, ranges);
  let violations = validateWithRanges(ch, ranges);
  const firstDrawValid = violations.length === 0;
  const repaired: Group[] = [];
  for (let k = 1; k <= 4 && violations.length > 0; k++) {
    for (const group of repairGroups(violations)) {
      ch = normalizeWithRanges({...ch, ...drawGroup(seed, group, k, ch, ranges)}, ranges);
      repaired.push(group);
    }
    violations = validateWithRanges(ch, ranges);
  }
  if (violations.length > 0) {
    for (const group of repairGroups(violations)) {
      const fallback = group === 'hair' ? HAIR_YOUNG : DIRECTIONS.young[group];
      ch = normalizeWithRanges({...ch, [group]: fallback}, ranges);
      repaired.push(group);
    }
    const remaining = validateWithRanges(ch, ranges);
    if (remaining.length > 0) {
      throw new Error(`manga-face: generated character ${ch.id} failed validation after repair: ${remaining.map(v => v.message).join('; ')}. Report seed ${JSON.stringify(seed)}.`);
    }
  }
  return {character: ch, firstDrawValid, repaired};
}
export const randomCharacter = (seed: string | number, id?: string): Character => randomCharacterDetailed(seed, id).character;
