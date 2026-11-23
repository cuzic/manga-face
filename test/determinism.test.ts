import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CHARACTERS, defaultCharacter, toManifest} from '../src/index.ts';

test('both styles and all reference characters produce the same manifest bytes on every build', () => {
  const characters = [defaultCharacter({style: 'young'}), defaultCharacter({style: 'mature'}), ...Object.values(CHARACTERS)];
  for (const character of characters) {
    const bytes = JSON.stringify(toManifest(character));
    assert.equal(JSON.stringify(toManifest(character)), bytes, character.id);
    assert.equal(JSON.stringify(toManifest(structuredClone(character))), bytes, character.id);
  }
});
