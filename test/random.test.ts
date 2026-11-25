import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CHARACTERS, GENERATOR, RANGES, randomCharacterDetailed, validate} from '../src/index.ts';
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

test('all 5,000 sampled seeds produce valid characters, and at least 99% are valid before any repair (ADR 0001 U5)', () => {
  let firstDrawValid = 0;
  for (let seed = 0; seed < 5_000; seed++) {
    const drawn = randomCharacterDetailed(seed);
    assert.deepEqual(validate(drawn.character), [], `seed ${seed}`);
    assert.equal(drawn.firstDrawValid, drawn.repaired.length === 0, `seed ${seed}`);
    if (drawn.firstDrawValid) firstDrawValid++;
  }
  assert.ok(firstDrawValid / 5_000 >= 0.99, `first-draw validity ${firstDrawValid / 5_000}`);
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

// The `ranges` argument must reach every step of repairCharacter. Each test below fails if one step uses the default RANGES instead.
test('repair redraws a group with the supplied ranges', () => {
  const base = CHARACTERS.a;
  const candidate = {...base, eyes: {...base.eyes, h: 13, tilt: 5}, brows: {thick: 7, dy: 3}};
  // Fine steps: a redraw snapped by RANGES (step 0.5 / 1) and re-snapped by these ranges gives a different dy than a redraw snapped by these ranges directly.
  const ranges = {...RANGES, 'brows.thick': [4, 9, 0.3], 'brows.dy': [-20, 8, 0.3]} as const;
  const drawn = repairCharacter(candidate, '1', ranges);
  assert.deepEqual(drawn.repaired, ['brows']);
  assert.deepEqual(drawn.character.brows, {thick: 4.5, dy: 1.5});
});

test('repair normalizes the fallback with the supplied ranges', () => {
  const base = CHARACTERS.a;
  const candidate = {...base, hair: {...base.hair, sideLen: 0}};
  // hair.parting step 0.4 snaps the default parting 0.5 to 0.4; the default RANGES would keep 0.5.
  const ranges = {...RANGES, 'hair.sideLen': [0, 36, 64], 'hair.parting': [-1, 1, 0.4]} as const;
  const drawn = repairCharacter(candidate, '1117', ranges);
  assert.deepEqual(drawn.repaired, ['hair', 'hair', 'hair', 'hair', 'hair']);
  assert.deepEqual(drawn.character, {...base, hair: {...base.hair, sideLen: 36, parting: 0.4}});
});

test('repair runs the final validation with the supplied ranges', () => {
  const base = CHARACTERS.a;
  const candidate = {...base, hair: {...base.hair, sideLen: 0}};
  // sideLen is pinned to 0, so even the default hair crosses itself; validating with RANGES would report a range error instead.
  const ranges = {...RANGES, 'hair.sideLen': [0, 0, 64]} as const;
  assert.throws(() => repairCharacter(candidate, '1117', ranges), (e: Error) => /hair mass crosses itself/.test(e.message) && !/outside/.test(e.message));
});
