import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CHARACTERS, GENERATOR, RANGES, randomCharacter, validate} from '../src/index.ts';
import {repairCharacter} from '../src/random.ts';
import {validateWithRanges} from '../src/validate.ts';

test('generator 4 can repair only the brows without changing other groups', () => {
  assert.equal(GENERATOR, 4);
  const base = CHARACTERS.a;
  const candidate = {...base, eyes: {...base.eyes, h: 13, tilt: 5}, brows: {thick: 7, dy: 3}};
  const drawn = repairCharacter(candidate, '1');
  assert.equal(drawn.firstDrawValid, false);
  assert.deepEqual(drawn.repaired, ['brows']);
  assert.deepEqual(validate(drawn.character), []);
  assert.deepEqual(drawn.character, {...candidate, brows: {thick: 4.5, dy: 1}});
});

test('all 5,000 sampled seeds produce valid characters', () => {
  for (let seed = 0; seed < 5_000; seed++) {
    assert.deepEqual(validate(randomCharacter(seed)), [], `seed ${seed}`);
  }
});

test('repair uses the default brows after all four redraws fail', () => {
  const base = CHARACTERS.a;
  const candidate = {...base, eyes: {...base.eyes, h: 13, tilt: 5}, brows: {thick: 7, dy: 3}};
  const drawn = repairCharacter(candidate, '88');
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
  // For seed 1117 all four redraws self-intersect (sideLen snaps below the default side length), so the default hair is restored.
  const ranges = {...RANGES, 'hair.sideLen': [0, 36, 64]} as const;
  assert.deepEqual(validateWithRanges(candidate, ranges).map(v => v.code), ['hair-self-intersect']);
  const drawn = repairCharacter(candidate, '1117', ranges);
  assert.equal(drawn.firstDrawValid, false);
  assert.deepEqual(drawn.repaired, ['hair', 'hair', 'hair', 'hair', 'hair']);
  assert.deepEqual(drawn.character, base);
  assert.deepEqual(validate(drawn.character), []);
});
