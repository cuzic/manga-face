import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {CHARACTERS, randomCharacter, toManifest} from '../src/index.ts';

const before = JSON.parse(readFileSync(new URL('./fixtures/before-split.json', import.meta.url), 'utf8'));

test('seeds 0 through 99 produce the same characters as before the split', () => {
  assert.equal(before.seeds.length, 100);
  for (let seed = 0; seed < 100; seed++) {
    assert.equal(JSON.stringify(randomCharacter(seed)), before.seeds[seed], `seed ${seed}`);
  }
});

test('the three reference manifests have the same SHA-256 hashes as before the split', () => {
  for (const [key, character] of Object.entries(CHARACTERS)) {
    const digest = createHash('sha256').update(JSON.stringify(toManifest(character))).digest('hex');
    assert.equal(digest, before.manifests[key], key);
  }
});
