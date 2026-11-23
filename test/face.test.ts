import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ADR0074, CHARACTERS, DEFAULT_STYLE, defaultCharacter, faceFragment, normalize, randomCharacter, toManifest, validate, type Character} from '../src/index.ts';
import {assertLoads} from '../tools/conformance.ts';

test('the starting point: the 3 reference characters are valid and svg-diagram loads their manifests', () => {
  for (const c of [CHARACTERS.a, CHARACTERS.b, CHARACTERS.m]) {
    assert.deepEqual(validate(c), []);
    assertLoads(toManifest(c));
  }
});

test('young is the default style; mature is chosen with style: mature', () => {
  assert.equal(DEFAULT_STYLE, 'young');
  assert.equal(defaultCharacter().eyes.h, 23);
  assert.equal(defaultCharacter({style: 'mature'}).eyes.h, 15);
  for (const style of ['young', 'mature'] as const) assert.deepEqual(validate(defaultCharacter({style})), []);
});

test('normalize is idempotent and keeps the face inside the head circle', () => {
  const c = {...structuredClone(CHARACTERS.a), head: {cheek: 96, chin: 98, jaw: 1, chinW: 0}} as Character;
  assert.equal(JSON.stringify(normalize(normalize(c))), JSON.stringify(normalize(c)));
  assert.deepEqual(validate(c), []);
});

test('the sampler returns a valid character for every seed, and the same one for the same seed', () => {
  for (let i = 0; i < 100; i++) assert.deepEqual(validate(randomCharacter(i)), [], `seed ${i}`);
  assert.equal(JSON.stringify(randomCharacter(7)), JSON.stringify(randomCharacter(7)));
});

test('every expression keeps the stated ink and paper: no named colours, no text, no use, no filter', () => {
  for (const e of ADR0074) {
    const f = faceFragment(CHARACTERS.a, e).fragment;
    assert.doesNotMatch(f, /<(text|use|filter|mask|style|image)\b/);
    assert.doesNotMatch(f, /(fill|stroke)="(?!none|#|url\()[a-z]+"/);
  }
});
