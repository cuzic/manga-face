import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {CHARACTERS, randomCharacter, toManifest} from '../src/index.ts';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/face-snapshots.json', import.meta.url), 'utf8'));

test('seeds 0 through 99 match the generator 3 snapshots', () => {
  assert.equal(baseline.seeds.length, 100);
  for (let seed = 0; seed < 100; seed++) {
    assert.equal(JSON.stringify(randomCharacter(seed)), baseline.seeds[seed], `seed ${seed}`);
  }
});

test('the three reference manifests have the expected SHA-256 hashes after the U2 rendering changes', () => {
  for (const [key, character] of Object.entries(CHARACTERS)) {
    const digest = createHash('sha256').update(JSON.stringify(toManifest(character))).digest('hex');
    assert.equal(digest, baseline.manifests[key], key);
  }
});
