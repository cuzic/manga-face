import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ADR0074, CHARACTERS, PRESETS, faceFragment} from '../src/index.ts';

test('the eight comic expressions have presets', () => {
  const names = ['neutral', 'smile', 'laugh', 'surprise', 'worry', 'angry', 'think', 'sad'];
  assert.deepEqual(ADR0074, names);
  for (const name of names) assert.ok(Object.keys(PRESETS).includes(name), name);
});

test('each expression preserves relative eye width and surprise widens the eyes', () => {
  const widths = (w: number) => {
    const ch = {...CHARACTERS.a, eyes: {...CHARACTERS.a.eyes, w, gap: 36, lashes: false}};
    return Object.fromEntries(ADR0074.map(expression => {
      const eye = faceFragment(ch, expression).features.eyes[0]!;
      return [expression, eye.right - eye.left];
    }));
  };
  const narrow = widths(20), wide = widths(26);
  for (const expression of ADR0074) assert.ok(wide[expression]! > narrow[expression]!, expression);
  for (const [w, eyes] of [[20, narrow], [26, wide]] as const) {
    assert.ok(Math.abs(eyes['neutral']! / (2 * w) - 1) <= 0.1);
    assert.ok(Math.abs(eyes['surprise']! / eyes['neutral']! - 1.08) <= 0.1);
    // The bounding width of laughing eyes stays the same, but open eye height must also stay relative.
    const eye = (h: number) => faceFragment({...CHARACTERS.a, eyes: {...CHARACTERS.a.eyes, w, h}}, 'surprise').features.eyes[0]!;
    assert.ok(eye(24).bottom - eye(24).top > eye(16).bottom - eye(16).top);
  }
});

test('brow thickness scales with the character’s base thickness in all eight expressions', () => {
  for (const expression of ADR0074) {
    const thickness = (thick: number) => {
      const ch = {...CHARACTERS.a, brows: {...CHARACTERS.a.brows, thick}};
      const svg = faceFragment(ch, expression).features.brows[0]!.svg;
      const [, top, bottom] = svg.match(/d="M[\d.]+ ([\d.]+)Q[^"]+ [\d.]+ ([\d.]+)Z"/)!;
      return Number(bottom) - Number(top);
    };
    assert.ok(Math.abs(thickness(8) - 2 * thickness(4)) <= 0.3, expression);
  }
});
