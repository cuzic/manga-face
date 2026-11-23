import assert from 'node:assert/strict';
import {test} from 'node:test';
import {faceSegs, flatten} from '../src/geometry.ts';
import {CHARACTERS, normalize, selfIntersects, toManifest, validate, validateRaw} from '../src/index.ts';
import type {Character} from '../src/index.ts';
import {repairGroups} from '../src/random.ts';

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

test('validate accepts floating-point noise at the range bounds', () => {
  for (const iris of [0.6 - Number.EPSILON, 24 * 0.05]) {
    assert.deepEqual(validate({...a, eyes: {...a.eyes, iris}}), []);
  }
  for (const iris of [0.599999, 1.200001]) {
    const violations = validate({...a, eyes: {...a.eyes, iris}});
    assert.equal(violations.length, 1);
    assert.partialDeepStrictEqual(violations[0], {group: 'eyes', code: 'range'});
  }
});

test('validate rejects NaN strands and numeric strings as invalid numbers', () => {
  const stringCheek = {...a, head: {...a.head, cheek: '86' as unknown as number}};
  const nanStrands = {...a, hair: {...a.hair, strands: NaN}};
  assert.deepEqual(validate(stringCheek), [
    {group: 'head', code: 'range', message: 'head.cheek must be a finite number'},
  ]);
  assert.deepEqual(validate(nanStrands), [
    {group: 'hair', code: 'strands', message: 'hair.strands must be an integer >= 1'},
    {group: 'hair', code: 'range', message: 'hair.strands must be a finite number'},
  ]);
});

test('validate reports an in-range fractional strand count', () => {
  assert.deepEqual(validate({...a, hair: {...a.hair, strands: 2.5}}), [
    {group: 'hair', code: 'strands', message: 'hair.strands must be an integer >= 1'},
  ]);
});

test('validate reports an invalid palette before checking geometry', () => {
  const character = {...a, palette: {...a.palette, skin: 'green'}, brows: {thick: 9, dy: 8}};
  assert.ok(validateRaw(character, ['angry']).some(violation => violation.code === 'brow-into-eye'));
  assert.deepEqual(validate(character, ['angry']), [
    {group: 'palette', code: 'palette', message: 'palette.skin="green" is neither a known key nor #rrggbb'},
  ]);
});

const rawCases = [
  {code: 'head-circle', group: 'head', character: {...a, head: {...a.head, cheek: 96, jaw: 1}}},
  {code: 'hair-self-intersect', group: 'hair', character: {...a, hair: {...a.hair, sideLen: -40}}},
  {code: 'mouth-reaches-chin', group: 'mouth', expression: 'laugh', character: {...a, mouth: {...a.mouth, y: 82}}},
  {code: 'eyes-touch', group: 'eyes', expression: 'neutral', character: {...a, eyes: {...a.eyes, gap: 26}}, count: 2},
  {code: 'brow-outside-head', group: 'brows', expression: 'think', character: {...a, brows: {...a.brows, dy: -55}}},
  {code: 'mouth-anchor', group: 'mouth', expression: 'think', character: {...a, mouth: {...a.mouth, w: 10}}},
  {code: 'mouth-near-eyes', group: 'mouth', expression: 'neutral', character: {...a, mouth: {...a.mouth, y: a.eyes.y}}},
  {code: 'mouth-outside-face', group: 'mouth', expression: 'laugh', character: {...a, head: {...a.head, cheek: 74}, mouth: {...a.mouth, w: 48}}},
];

for (const {code, group, expression, character, count = 1} of rawCases) {
  test(`validateRaw reports only ${code}`, () => {
    const violations = validateRaw(character, expression ? [expression] : undefined);
    assert.deepEqual(violations.map(v => ({group: v.group, code: v.code, expression: v.expression})),
      Array.from({length: count}, () => ({group, code, expression})));
  });
}

test('validateRaw catches eyes outside the face before dependent constraints are applied', () => {
  const character: Character = {...a, head: {...a.head, cheek: 74}, eyes: {...a.eyes, gap: 48}};
  assert.ok(validateRaw(character).some(violation => violation.group === 'eyes' && violation.code === 'eye-outside-face'));
  const normalized = normalize(character);
  assert.deepEqual(validateRaw(normalized), []);
  assert.deepEqual(validate(character), validateRaw(normalized));
});

test('selfIntersects checks segments two edges apart, including the closing segment', () => {
  assert.equal(selfIntersects([[0, 0], [2, 2], [2, 0], [0, 2]]), true);
  assert.equal(selfIntersects([[2, 2], [2, 0], [0, 2], [0, 0]]), true);
  assert.equal(selfIntersects([[0, 0], [2, 0], [2, 2], [0, 2]]), false);
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

test('brow overlap is assigned to eyes when the default brow still overlaps', () => {
  const character = {...a, eyes: {...a.eyes, h: 13, tilt: 10}};
  const violations = validate(character, ['angry']);
  assert.equal(violations.length, 2);
  for (const violation of violations) {
    assert.partialDeepStrictEqual(violation, {group: 'eyes', code: 'brow-into-eye', expression: 'angry'});
  }
  assert.deepEqual([...repairGroups(violations)], ['eyes']);
  assert.deepEqual(validate({...character, eyes: a.eyes}, ['angry']), []);
});

test('the sampler chooses the brow repair group even when the message only mentions the eye', () => {
  const character: Character = {...a, brows: {thick: 9, dy: 8}};
  const violations = validate(character, ['angry']).map(violation => ({...violation, message: 'angry: overlaps the eye'}));
  assert.deepEqual([...repairGroups(violations)], ['brows']);
});
