import assert from 'node:assert/strict';
import {test} from 'node:test';
import {hairParts} from '../src/hair.ts';
import {CHARACTERS, HAIR, faceFragment, normalize} from '../src/index.ts';

const ch = (skin: string, hair: string) => ({...CHARACTERS.a, palette: {...CHARACTERS.a.palette, skin, hair}});
const paths = (svg: string, color: string, width: number) => Array.from(svg.matchAll(
  new RegExp(`<path d="([^"]+)"[^>]*stroke="${color}" stroke-width="${width}"[^>]*/>`, 'g'),
), match => match[1]!);

test('neutral brows, nose and mouth get a 4-unit paper underlay on dark skin only', () => {
  const dark = faceFragment(ch('dark', 'blond'), 'neutral').fragment;
  const brown = faceFragment(ch('brown', 'blond'), 'neutral').fragment;
  for (const [width, expected] of [[1.5, 2], [3.2, 1], [3.6, 1]] as const) {
    const ink = paths(dark, '#22201b', width);
    assert.equal(ink.length, expected);
    assert.deepEqual(paths(dark, '#ffffff', width + 4), ink);
    assert.deepEqual(paths(brown, '#ffffff', width + 4), []);
    for (const d of ink) {
      const matching = dark.split('<path ').filter(path => path.startsWith(`d="${d}"`));
      assert.match(matching[0]!, /stroke="#ffffff"/);
      assert.match(matching[1]!, /stroke="#22201b"/);
    }
  }
});

test('the 8.6-unit paper brow underlay is clipped to the actual union of the hair mass and locks', () => {
  const black = normalize(ch('fair', 'black'));
  const hair = hairParts(black.hair, black.head.cheek, HAIR.black);
  for (const expression of ['neutral', 'surprise', 'think']) {
    const result = faceFragment(black, expression);
    const {fragment} = result;
    const clip = fragment.match(/<clipPath id="([^"]+)">([^<]*(?:<path [^>]+\/>)+)<\/clipPath>/g)!
      .find(s => s.endsWith(`>${hair.lockStroke}</clipPath>`));
    assert.ok(clip, expression);
    const id = clip.match(/id="([^"]+)"/)![1]!;
    const group = fragment.match(new RegExp(`<g clip-path="url\\(#${id}\\)">(.+?)</g>`))?.[1];
    assert.ok(group, expression);
    const paper = paths(group, '#ffffff', 8.6);
    assert.deepEqual(paper, paths(result.features.brows.map(b => b.svg).join(''), '#22201b', 1.5));
    assert.equal(paths(fragment, '#ffffff', 8.6).filter(d => paper.includes(d)).length, 2);
  }

  assert.ok(!faceFragment(ch('fair', 'blond'), 'neutral').fragment.includes(hair.lockStroke + '</clipPath>'));
  assert.ok(!faceFragment(black, 'surprise', {noFeatureKeyline: true}).fragment.includes(hair.lockStroke + '</clipPath>'));
});
