import assert from 'node:assert/strict';
import {test} from 'node:test';
import {judgePixels} from '../tools/measure-check.ts';

const pixels = (worst: number, totalFraction: number) => ({worst: {id: 'case', fraction: worst}, totalFraction, cases: 1512});
const features = pixels(0.85, 0.95);
const control = pixels(0.5, 0.8);
const keyChanges = {hairFace: [100, 110], faceNeck: [100, 110]};

test('⑤ and ⑥ accept the inclusive pixel floors with a failing control', () => {
  assert.ok(judgePixels(features, control, keyChanges).every(row => row.pass));
});

test('⑤ requires both feature floors and rejects a control that meets both', () => {
  assert.equal(judgePixels(pixels(0.8499, 0.96), control, keyChanges)[0].pass, false);
  assert.equal(judgePixels(pixels(0.89, 0.9499), control, keyChanges)[0].pass, false);
  assert.equal(judgePixels(features, features, keyChanges)[0].pass, false);
  assert.equal(judgePixels(features, pixels(0.8499, 0.96), keyChanges)[0].pass, true);
  assert.equal(judgePixels(features, pixels(0.89, 0.9499), keyChanges)[0].pass, true);
});

test('⑤ requires all 1512 cases in the pixel grid and its negative control', () => {
  assert.equal(judgePixels({...features, cases: 252}, control, keyChanges)[0].pass, false);
  assert.equal(judgePixels(features, {...control, cases: 252}, keyChanges)[0].pass, false);
});

test('⑥ requires at least 100 changed pixels for every boundary on every face', () => {
  assert.equal(judgePixels(features, control, {...keyChanges, hairFace: [99, 110]})[1].pass, false);
  assert.equal(judgePixels(features, control, {...keyChanges, faceNeck: [110, 99]})[1].pass, false);
});
