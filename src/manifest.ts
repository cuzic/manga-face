import type {CharacterManifest, ComicExpression} from 'svg-diagram';
import {ADR0074, EXTRA_OF} from './features.ts';
import {faceFragment} from './fragment.ts';
import {BOX, CX, CY, HEAD_R, n} from './geometry.ts';
import {normalize} from './params.ts';
import type {Character} from './params.ts';
import {validate} from './validate.ts';

// ---- the manifest
/** The manifest: every expression, anchors computed from the parameters. Throws, listing the violations, if the geometry is invalid. */
export function toManifest(chIn: Character, expressions: readonly ComicExpression[] = ADR0074, expressionMap: Partial<Record<ComicExpression, string>> = {}): CharacterManifest {
  for (const [k, v] of Object.entries(expressionMap)) if (EXTRA_OF[String(v)] !== k && v !== k) throw new Error(`expressionMap: ${v} cannot stand for ${k} (allowed: ${Object.entries(EXTRA_OF).filter(([, m]) => m === k).map(([e]) => e).join(', ') || 'none'})`);
  const names = expressions.map(e => expressionMap[e] ?? e);
  const bad = validate(chIn, names);
  if (bad.length) throw new Error(`manga-face: invalid character ${chIn.id}: ${bad.map(violation => violation.message).join('; ')}`);
  const ch = normalize(chIn);
  const built = expressions.map(e => [e, faceFragment(ch, expressionMap[e] ?? e)] as const);
  const top = Math.min(...built.map(([, b]) => b.top));
  const mouthX = ch.mirror ? 300 - CX : CX;
  return {
    id: ch.id, name: ch.name, box: [...BOX],
    anchors: {head: {cx: CX, cy: CY, r: HEAD_R}, mouth: [mouthX, CY + ch.mouth.y + 6], top: n(top)},
    bubbleSides: ['top-left', 'top', 'top-right'],
    expressions: Object.fromEntries(built.map(([k, v]) => [k, v.fragment])) as CharacterManifest['expressions'],
    license: {spdx: 'CC0-1.0', author: 'manga-face contributors', url: 'https://github.com/cuzic/manga-face'},
  };
}
