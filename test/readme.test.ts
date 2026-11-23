import assert from 'node:assert/strict';
import {test} from 'node:test';
import {defaultCharacter, toManifest} from '../src/index.ts';

test('the README example creates a manifest for comic()', () => {
  const manifest = toManifest(defaultCharacter({style: 'young', palette: {skin: 'medium', hair: 'black'}}));
  // comic(sheet, {characters: {[manifest.id]: manifest}})
  assert.equal(manifest.id, 'mf-young');
  assert.match(manifest.expressions.neutral!, /fill="#e2ab7c"/);
  assert.match(manifest.expressions.neutral!, /fill="#1f1f24"/);
});
