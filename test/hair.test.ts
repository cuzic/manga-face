import assert from 'node:assert/strict';
import {test} from 'node:test';
import {hairParts} from '../src/hair.ts';
import {HAIR_TEMPLATES} from '../src/params.ts';
import {selfIntersects} from '../src/geometry.ts';
import {fringeLocks} from '../src/hair/locks.ts';
import {toManifest} from '../src/index.ts';
import {assertLoads} from '../tools/conformance.ts';
import {defaultCharacter} from '../src/styles.ts';
import {validate, validateRaw} from '../src/validate.ts';

test('the four hair templates have distinct geometry and a compatible top anchor', () => {
  const base = defaultCharacter({style: 'young'});
  const templates = ['short', 'bob', 'long', 'wavy'] as const;
  const silhouettes = new Set<string>();
  for (const template of templates) {
    const character = {...base, hair: {...base.hair, template, strands: 1}};
    const hair = hairParts(character.hair, character.head.cheek, '#34281d');
    assert.ok(hair.top >= 23, template);
    silhouettes.add(hair.mass);
  }
  assert.equal(silhouettes.size, 4);
  assert.deepEqual(validate(base), []);
});

test('each template has non-intersecting hair for every strand and parting combination', () => {
  const base = defaultCharacter({style: 'young'});
  for (const template of HAIR_TEMPLATES) {
    for (let strands = 1; strands <= 9; strands++) {
      for (let parting = -1; parting <= 1; parting += 0.25) {
        const hair = {...base.hair, template, strands, parting};
        const character = {...base, hair};
        const parts = hairParts(hair, base.head.cheek, '#34281d');
        assert.ok(parts.top >= 23, JSON.stringify(hair));
        assert.ok(Object.values(parts.polys).every(poly => !selfIntersects(poly)), JSON.stringify(hair));
        for (const skin of ['fair', 'dark'] as const) {
          const colored = {...character, palette: {...character.palette, skin}};
          assert.deepEqual(validate(colored), [], JSON.stringify(hair));
          if (strands % 2 === 1 && parting % 0.5 === 0) assertLoads(toManifest(colored));
        }
      }
    }
  }
});

test('fringe gets wider and longer away from the part', () => {
  const locks = fringeLocks(7, 76, 0, 9);
  const width = (lock: (typeof locks)[number]) => {
    const first = lock.segs[0];
    const last = lock.segs[2];
    assert.ok(first?.[0] === 'M' && last?.[0] === 'Q');
    return first[1][0] - last[2][0];
  };
  const near = locks.at(-1);
  const far = locks[0];
  assert.ok(near && far);
  assert.ok(width(far) - width(near) > 15);
  assert.ok(far.tip[1] - near.tip[1] > 10);
});

test('the mature default uses a short swept style', () => {
  const young = defaultCharacter({style: 'young'});
  const mature = defaultCharacter({style: 'mature'});
  assert.equal(young.hair.sideLen, 36);
  assert.equal(mature.hair.sideLen, 20);
  assert.notEqual(hairParts(young.hair, 84, '#34281d').locks, hairParts(mature.hair, 84, '#34281d').locks);
});

test('raw validation reports a self-intersecting hair outline', () => {
  const base = defaultCharacter({style: 'young'});
  const character = {...base, hair: {...base.hair, sideLen: 0}};
  assert.ok(validateRaw(character, []).some(v => v.code === 'hair-self-intersect'));
});
