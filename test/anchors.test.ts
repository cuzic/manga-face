import assert from 'node:assert/strict';
import {test} from 'node:test';
import {hairParts} from '../src/hair.ts';
import {BOX, CHARACTERS, normalize, toManifest} from '../src/index.ts';

test('the top anchor clears the hair outline and the head circle fits the box', () => {
  const [x, y, width, height] = BOX;
  for (const character of Object.values(CHARACTERS)) {
    const normalized = normalize(character);
    const {head, top} = toManifest(character).anchors;
    const hair = hairParts(normalized.hair, normalized.head.cheek, '#000000');
    const minY = Math.min(...hair.polys['mass']!.map(point => point[1]));
    assert.ok(top !== undefined && top <= minY - 2.3 - 0.5 && top >= 23 && top <= 40, character.id);
    assert.deepEqual(head, {cx: 150, cy: 140, r: 100});
    assert.ok(head.cx - head.r >= x && head.cx + head.r <= x + width, character.id);
    assert.ok(head.cy - head.r >= y && head.cy + head.r <= y + height, character.id);
  }
});

test('the mouth anchor uses the normalized mouth height and remains centered when mirrored', () => {
  for (const character of Object.values(CHARACTERS)) {
    const mouthY = normalize(character).mouth.y + 146;
    assert.deepEqual(toManifest({...character, mirror: false}).anchors.mouth, [150, mouthY], character.id);
    assert.deepEqual(toManifest({...character, mirror: true}).anchors.mouth, [300 - 150, mouthY], character.id);
  }
});
