import assert from 'node:assert/strict';
import {test} from 'node:test';
import {faceSegs, flatten} from '../src/geometry.ts';
import {CHARACTERS, normalize, selfIntersects, toManifest, validate} from '../src/index.ts';
import type {Character} from '../src/index.ts';
import {repairGroups} from '../src/random.ts';
import {validateRaw} from '../src/validate.ts';

const a = CHARACTERS.a;

test('validate reports the original strands, range and palette violations with their groups and codes', () => {
  const cases = [
    ['strands', {...a, hair: {...a.hair, strands: 0}}, [
      {group: 'hair', code: 'strands', message: 'hair.strands must be an integer >= 1'},
      {group: 'hair', code: 'range', message: 'hair.strands=0 is outside 1..9'},
    ]],
    ['chin', {...a, head: {...a.head, chin: 110}}, [
      {group: 'head', code: 'range', message: 'head.chin=110 is outside 90..98'},
    ]],
    ['skin', {...a, palette: {...a.palette, skin: '#12345'}}, [
      {group: 'palette', code: 'palette', message: 'palette.skin="#12345" is neither a known key nor #rrggbb'},
    ]],
    ['hair', {...a, palette: {...a.palette, hair: 'green'}}, [
      {group: 'palette', code: 'palette', message: 'palette.hair="green" is neither a known key nor #rrggbb'},
    ]],
  ] as const;

  for (const [label, character, violations] of cases) {
    assert.deepEqual(validate(character), violations, label);
    assert.throws(() => toManifest(character), {
      message: `manga-face: invalid character ${character.id}: ${violations.map(violation => violation.message).join('; ')}`,
    });
  }
});

test('validate checks geometry after normalize narrows the eyes on a narrow face', () => {
  const character: Character = {...a, head: {...a.head, cheek: 74}, eyes: {...a.eyes, w: 28}};
  assert.ok(normalize(character).eyes.w < 28);
  assert.deepEqual(validate(character), []);
});

test('validateRaw catches eyes outside the face before dependent constraints are applied', () => {
  const character: Character = {...a, head: {...a.head, cheek: 74}, eyes: {...a.eyes, gap: 48}};
  assert.ok(validateRaw(character).some(violation => violation.group === 'eyes' && violation.code === 'eye-outside-face'));
  const normalized = normalize(character);
  assert.deepEqual(validateRaw(normalized), []);
  assert.deepEqual(validate(character), validateRaw(normalized));
});

test('a face outline crosses itself when its chin points swap sides', () => {
  const head = {...a.head, chinW: -4};
  assert.equal(selfIntersects(flatten(faceSegs(head))), true);
  assert.equal(selfIntersects(flatten(faceSegs(a.head))), false);
  assert.ok(validateRaw({...a, head}).some(violation => violation.group === 'head' && violation.code === 'face-self-intersect'));
});

test('an expression violation includes its expression and the brow repair group', () => {
  const character: Character = {...a, brows: {thick: 9, dy: 8}};
  const violations = validate(character, ['angry']);
  assert.ok(violations.length > 0);
  for (const violation of violations) {
    assert.partialDeepStrictEqual(violation, {group: 'brows', code: 'brow-into-eye', expression: 'angry'});
  }
});

test('the sampler chooses the brow repair group even when the message only mentions the eye', () => {
  const character: Character = {...a, brows: {thick: 9, dy: 8}};
  const violations = validate(character, ['angry']).map(violation => ({...violation, message: 'angry: overlaps the eye'}));
  assert.deepEqual([...repairGroups(violations)], ['brows']);
});
