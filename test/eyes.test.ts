import assert from 'node:assert/strict';
import {test} from 'node:test';
import {eyeSvg, resolveEye} from '../src/eyes.ts';
import {CHARACTERS, CX, CY, faceFragment, normalize} from '../src/index.ts';

test('the vertices of cross eyes point inward', () => {
  const e = resolveEye(CHARACTERS.a.eyes, {kind: 'cross'});
  for (const side of [-1, 1] as const) {
    const x = CX + side * CHARACTERS.a.eyes.gap;
    const eye = eyeSvg(e, side, x, CY, '#000000', 'eye', false);
    const vertex = Number(eye.svg.match(/L([\d.]+) /)?.[1]);
    assert.ok(side * (vertex - x) < 0, eye.svg);
  }
});

test('the lash extends each open eye 11 units outward', () => {
  const ch = normalize(CHARACTERS.a);
  const [left, right] = faceFragment(ch, 'neutral').features.eyes;
  assert.equal(left!.left, CX - ch.eyes.gap - ch.eyes.w - 11);
  assert.equal(right!.right, CX + ch.eyes.gap + ch.eyes.w + 11);
  assert.match(left!.svg, new RegExp(`L${left!.left} `));
  assert.match(right!.svg, new RegExp(`L${right!.right} `));
});

test('half eyes default to a lid of 0.45', () => {
  assert.equal(resolveEye(CHARACTERS.a.eyes, {kind: 'half'}).lid, 0.45);
});
