import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CHARACTERS, GENERATOR, randomCharacter, randomCharacterDetailed, validate} from '../src/index.ts';
import {repairCharacter} from '../src/random.ts';

test('generator 2 seed 3484 repairs only the brows and preserves the character', () => {
  assert.equal(GENERATOR, 2);
  const drawn = randomCharacterDetailed(3484);
  assert.equal(drawn.firstDrawValid, false);
  assert.deepEqual(drawn.repaired, ['brows']);
  assert.deepEqual(validate(drawn.character), []);
  assert.deepEqual(drawn.character, {
    id: 'mf-3484',
    name: '3484',
    nose: 'dot',
    palette: {skin: 'dark', hair: 'black', top: 'teal', iris: 'blue'},
    head: {cheek: 82, chin: 98, jaw: 0.65, chinW: 4},
    eyes: {w: 24, h: 14, tilt: 4, iris: 0.95, y: 20, gap: 39, lashes: true, lidW: 7},
    brows: {thick: 5.5, dy: -2},
    mouth: {w: 23, y: 64},
    hair: {template: 'bob', strands: 7, parting: -0.25, ahoge: 'none', highlight: true, sideLen: 26},
  });
});

test('all 20,000 sampled seeds produce valid characters', () => {
  for (let seed = 0; seed < 20_000; seed++) {
    assert.deepEqual(validate(randomCharacter(seed)), [], `seed ${seed}`);
  }
});

test('repair uses the default brows after all four redraws fail', () => {
  const base = CHARACTERS.a;
  const candidate = {...base, eyes: {...base.eyes, h: 13, tilt: 5}, brows: {thick: 7, dy: 3}};
  const drawn = repairCharacter(candidate, '121');
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
