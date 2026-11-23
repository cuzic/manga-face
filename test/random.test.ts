import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CHARACTERS, GENERATOR, randomCharacter, validate} from '../src/index.ts';
import {repairCharacter} from '../src/random.ts';

test('generator 3 can repair only the brows without changing other groups', () => {
  assert.equal(GENERATOR, 3);
  const base = CHARACTERS.a;
  const candidate = {...base, eyes: {...base.eyes, h: 13, tilt: 5}, brows: {thick: 7, dy: 3}};
  const drawn = repairCharacter(candidate, '0');
  assert.equal(drawn.firstDrawValid, false);
  assert.deepEqual(drawn.repaired, ['brows']);
  assert.deepEqual(validate(drawn.character), []);
  assert.deepEqual(drawn.character, {...candidate, brows: {thick: 6.5, dy: -3}});
});

test('all 20,000 sampled seeds produce valid characters', () => {
  for (let seed = 0; seed < 20_000; seed++) {
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
