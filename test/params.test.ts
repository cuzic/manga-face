import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CHARACTERS, RANGES, normalize, validate} from '../src/index.ts';
import type {Base, Character} from '../src/index.ts';

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
