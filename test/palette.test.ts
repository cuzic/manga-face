import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CHARACTERS, HAIR, SKIN, contrast, needsKeyline, toManifest} from '../src/index.ts';
import {assertLoads} from '../tools/conformance.ts';

test('base colors that collide with fragment colors remain distinct six-digit hexes', () => {
  for (const [top, expectedTop] of [['#fffff0', '#fffff0'], ['#8a3340', '#8a3341'], ['#ffffff', '#fffffd']] as const) {
    const manifest = toManifest({
      ...CHARACTERS.a, id: 'edge', palette: {skin: '#ffffff', hair: '#22201b', top, iris: '#ffffff'},
    });
    assert.doesNotMatch(JSON.stringify(manifest), /#[0-9a-f]{7,}/i);
    const fills = new Set([...manifest.expressions.neutral!.matchAll(/fill="(#[0-9a-f]{6})"/g)].map(match => match[1]));
    assert.ok(fills.has('#fffffe'), 'skin has its own color');
    assert.ok(fills.has('#22201c'), 'hair has its own color');
    assert.ok(fills.has(expectedTop), 'top has its own color');
    assertLoads(manifest);
  }
});

test('only dark skin and black, brown, chestnut and navy hair need a keyline', () => {
  for (const [key, hex] of Object.entries(SKIN)) {
    assert.equal(needsKeyline(hex), key === 'dark', key);
  }
  for (const [key, hex] of Object.entries(HAIR)) {
    assert.equal(needsKeyline(hex), ['black', 'brown', 'chestnut', 'navy'].includes(key), key);
  }
  assert.ok(Math.abs(contrast('#22201b', '#ffffff') - 16.3) <= 0.05);
});
