import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CHARACTERS, GENERATOR, RANGES, randomCharacter, randomCharacterDetailed, validate} from '../src/index.ts';
import {repairCharacter} from '../src/random.ts';
import {validateWithRanges} from '../src/validate.ts';

test('generator 3 seed 13624 repairs only the brows and preserves the character', () => {
  assert.equal(GENERATOR, 3);
  const drawn = randomCharacterDetailed(13624);
  assert.equal(drawn.firstDrawValid, false);
  assert.deepEqual(drawn.repaired, ['brows']);
  assert.deepEqual(validate(drawn.character), []);
  assert.deepEqual(drawn.character, {
    id: 'mf-13624',
    name: '13624',
    nose: 'none',
    palette: {skin: 'medium', hair: 'black', top: 'green', iris: 'green'},
    head: {cheek: 88, chin: 94, jaw: 0.65, chinW: 10},
    eyes: {w: 18, h: 14, tilt: 4, iris: 0.95, y: 20, gap: 40, lashes: false, lidW: 6.5},
    brows: {thick: 5, dy: 3},
    mouth: {w: 15, y: 64},
    hair: {template: 'bob', strands: 7, parting: -0.25, ahoge: 'left', highlight: true, sideLen: 24},
  });
});

test('all 5,000 sampled seeds produce valid characters', () => {
  for (let seed = 0; seed < 5_000; seed++) {
    assert.deepEqual(validate(randomCharacter(seed)), [], `seed ${seed}`);
  }
});

test('repair uses the default brows after all four redraws fail', () => {
  const base = CHARACTERS.a;
  const candidate = {...base, eyes: {...base.eyes, h: 13, tilt: 5}, brows: {thick: 7, dy: 3}};
  const drawn = repairCharacter(candidate, '159');
  assert.equal(drawn.firstDrawValid, false);
  assert.deepEqual(drawn.repaired, ['brows', 'brows', 'brows', 'brows', 'brows']);
  assert.deepEqual(drawn.character, {...candidate, brows: base.brows});
  assert.deepEqual(validate(drawn.character), []);
});

test('repair throws when the character is still invalid after the fallback', () => {
  const base = CHARACTERS.a;
  const candidate = {...base, head: {cheek: 74, chin: 90, jaw: 0, chinW: 16}};
  assert.throws(() => repairCharacter(candidate, '121'), /failed validation after repair: .*the mouth anchor x is outside the mouth/);
});

test('repair uses the default hair after four self-intersecting redraws', () => {
  const base = CHARACTERS.a;
  const candidate = {...base, hair: {...base.hair, sideLen: 0}};
  // For seed 90 the four redraws choose short hair and snap below the default side length.
  const ranges = {...RANGES, 'hair.sideLen': [0, 36, 64]} as const;
  assert.deepEqual(validateWithRanges(candidate, ranges).map(v => v.code), ['hair-self-intersect']);
  const drawn = repairCharacter(candidate, '90', ranges);
  assert.equal(drawn.firstDrawValid, false);
  assert.deepEqual(drawn.repaired, ['hair', 'hair', 'hair', 'hair', 'hair']);
  assert.deepEqual(drawn.character, base);
  assert.deepEqual(validate(drawn.character), []);
});
