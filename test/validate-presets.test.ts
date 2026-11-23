import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CHARACTERS, PRESETS, SKIN, validate} from '../src/index.ts';

test('all presets validate for the three showcase characters on every skin, including angry brows', () => {
  for (const character of Object.values(CHARACTERS)) {
    for (const skin of Object.keys(SKIN)) {
      const ch = {...character, palette: {...character.palette, skin}};
      assert.deepEqual(validate(ch, Object.keys(PRESETS)), [], `${character.id}/${skin}`);
    }
  }
});
