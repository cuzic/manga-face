import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CHARACTERS, RANGES, faceFragment, normalize, toManifest, validate, validateRaw} from '../src/index.ts';
import type {Base, Character} from '../src/index.ts';
import {normalizeWithRanges} from '../src/params.ts';

test('normalize clamps and snaps every ranged parameter and is idempotent', () => {
  for (const [name, [min, max, step]] of Object.entries(RANGES)) {
    const [group, field] = name.split('.') as ['head' | 'eyes' | 'brows' | 'mouth' | 'hair', string];
    for (const input of [min - step, min, min + step * 0.6, max, max + step]) {
      const character = structuredClone(CHARACTERS.a);
      Object.assign(character[group], {[field]: input});
      const normalized = normalize(character);
      const value = Reflect.get(normalized[group], field) as number;
      const label = `${name}=${input} normalized to ${value}`;
      assert.ok(value >= min && value <= max, label);
      const steps = (value - min) / step;
      assert.ok(Math.abs(steps - Math.round(steps)) < 1e-9, label);
      assert.deepEqual(normalize(normalized), normalized, label);
      assert.equal(Reflect.get(character[group], field), input, label);
    }
  }
});

test('normalize rounds the jaw and constrains the mouth at the parameter extremes', () => {
  const base = CHARACTERS.a;
  for (const chinW of [0, 16]) {
    for (const cheek of [74, 96]) {
      const character = {...base, head: {cheek, chin: 98, jaw: 1, chinW}, mouth: {w: 48, y: 70}};
      const normalized = normalize(character);
      const jaw = cheek === 74 ? 1 : chinW === 0 ? 0.75 : 0.7;
      assert.deepEqual(normalized.head, {cheek, chin: 98, jaw, chinW});
      assert.deepEqual(normalized.mouth, {w: cheek === 74 ? 45 : 48, y: 68});
      assert.deepEqual(validateRaw(normalized), []);
    }
  }
});

test('normalize lowers the cheek when even the straightest jaw leaves the head circle', () => {
  const range = RANGES['head.cheek'];
  // The current maximum cheek already fits with jaw = 0. Widen the test range to exercise the fallback.
  const ranges = {...RANGES, 'head.cheek': [range[0], 100, range[2]]} as const;
  const character = {...CHARACTERS.a, head: {cheek: 100, chin: 98, jaw: 1, chinW: 16}};
  const normalized = normalizeWithRanges(character, ranges);
  assert.deepEqual(normalized.head, {cheek: 96, chin: 98, jaw: 0, chinW: 16});
  assert.deepEqual(validateRaw(normalized, []), []);
});

test('normalize keeps the minimum mouth height when the chin cap is lower', () => {
  const range = RANGES['head.chin'];
  // The current minimum chin yields a cap of 60. Lower the test minimum to move the cap below 58.
  const ranges = {...RANGES, 'head.chin': [86, range[1], range[2]]} as const;
  const character = {...CHARACTERS.a, head: {...CHARACTERS.a.head, chin: 86}, mouth: {w: 48, y: 70}};
  assert.equal(normalizeWithRanges(character, ranges).mouth.y, 58);
});

test('toManifest uses the normalized values of an in-range off-step character', () => {
  const base = CHARACTERS.a;
  const character = {...base, head: {...base.head, cheek: 85.8}, mouth: {...base.mouth, y: 63.6}};
  const normalized = normalize(character);
  assert.equal(normalized.mouth.y, 64);
  assert.deepEqual(toManifest(character), toManifest(normalized));
});

test('faceFragment uses the normalized values of an in-range off-step character', () => {
  const base = CHARACTERS.a;
  const character = {...base, eyes: {...base.eyes, h: 22.6}, mouth: {...base.mouth, y: 63.6}};
  const normalized = normalize(character);
  assert.equal(normalized.eyes.h, 23);
  assert.deepEqual(faceFragment(character, 'neutral'), faceFragment(normalized, 'neutral'));
});

test('all 540 faces on the coarse grid are valid', () => {
  let count = 0;
  for (const base of [CHARACTERS.a, CHARACTERS.m]) {
    for (const template of ['short', 'bob'] satisfies Base['hair']['template'][]) {
      for (const cheek of [74, 80, 86, 92, 96]) {
        for (const chin of [90, 94, 98]) {
          for (const strands of [1, 5, 9]) {
            for (const parting of [-1, 0, 1]) {
              const character: Character = {
                ...base, head: {...base.head, cheek, chin}, hair: {...base.hair, template, strands, parting},
              };
              assert.deepEqual(validate(character), [], `${base.id}: ${[template, cheek, chin, strands, parting].join(', ')}`);
              count++;
            }
          }
        }
      }
    }
  }
  assert.equal(count, 540);
});
