import assert from 'node:assert/strict';
import {test} from 'node:test';
import {judge} from '../tools/measure-check.ts';

const person = (id: string, min: number, median: number) => ({id, min, median, pair: 'neutral/think'});
const valid = {
  showcase: [person('a', 6, 12)],
  random: [person('0', 3.5, 7)],
  extremes: [person('m/dark/black', 4, 7)],
};

test('①–④ pass at the inclusive floors and report the raw distribution', () => {
  const [a, b, c, d] = judge(valid);
  assert.ok([a, b, c, d].every(row => row.pass));
  assert.deepEqual(d.distribution, {
    showcase: {n: 1, min: 6, p10: 6, median: 6, below6: 0},
    random: {n: 1, min: 3.5, p10: 3.5, median: 3.5, below6: 1},
    extremes: {n: 1, min: 4, p10: 4, median: 4, below6: 1},
  });
});

test('① rejects showcase minima below 6 before rounding', () => {
  const [a, , , d] = judge({...valid, showcase: [person('a', 5.9, 10), person('b', 5.99, 11)]});
  assert.equal(a.pass, false);
  assert.equal(d.distribution.showcase.below6, 2);
});

test('② rejects a random or palette minimum below 3.5', () => {
  assert.equal(judge({...valid, random: [person('0', 3.4, 6)]})[1].pass, false);
  assert.equal(judge({...valid, extremes: [person('m/dark/black', 3.4, 6)]})[1].pass, false);
});

test('③ compares each person’s minimum to their own median', () => {
  const [a, b, c] = judge({...valid, showcase: [person('a', 7.35, 15), person('b', 8, 10)]});
  assert.ok(a.pass && b.pass);
  assert.equal(c.pass, false);
});

for (const [group, id] of [['random', '0'], ['extremes', 'm/dark/black']] as const) {
  test(`③ rejects a collapsed pair in ${group} above the absolute floor`, () => {
    const [a, b, c] = judge({...valid, [group]: [person(id, 3.6, 8)]});
    assert.ok(a.pass && b.pass);
    assert.equal(c.pass, false);
    assert.match(c.value, /3\.600 \(neutral\/think\) \/ 8\.000 = 0\.450/);
  });
}
