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

test('the same parameters give the same bytes, also from a deep copy', () => {
  const a = JSON.stringify(toManifest(CHARACTERS.a));
  assert.equal(a, JSON.stringify(toManifest(CHARACTERS.a)));
  assert.equal(a, JSON.stringify(toManifest(structuredClone(CHARACTERS.a))));
});

test('validate reports strands 0, chin 110, a bad hex and an unknown palette key, and toManifest refuses', () => {
  const bad = (f: (c: Character) => Character) => f(structuredClone(CHARACTERS.a) as Character);
  assert.match(validate(bad(c => ({...c, hair: {...c.hair, strands: 0}}))).join(), /strands/);
  assert.match(validate(bad(c => ({...c, head: {...c.head, chin: 110}}))).join(), /head\.chin=110/);
  assert.match(validate(bad(c => ({...c, palette: {...c.palette, skin: '#12345'}}))).join(), /palette\.skin/);
  assert.match(validate(bad(c => ({...c, palette: {...c.palette, hair: 'green'}}))).join(), /palette\.hair/);
  assert.throws(() => toManifest(bad(c => ({...c, hair: {...c.hair, strands: 0}}))), /invalid character/);
});

test('normalize is idempotent and keeps the face inside the head circle', () => {
  const c = {...structuredClone(CHARACTERS.a), head: {cheek: 96, chin: 98, jaw: 1, chinW: 0}} as Character;
  assert.equal(JSON.stringify(normalize(normalize(c))), JSON.stringify(normalize(c)));
  assert.deepEqual(validate(c), []);
});

test('a base colour that equals paper or ink stays a 6-digit hex that svg-diagram loads', () => {
  const m = toManifest({...structuredClone(CHARACTERS.a), id: 'edge', palette: {skin: '#ffffff', hair: '#22201b', top: '#fffff0', iris: '#ffffff'}} as Character);
  assert.doesNotMatch(JSON.stringify(m), /#[0-9a-f]{7,}/i);
  assertLoads(m);
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
