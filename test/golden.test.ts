import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {goldens} from '../tools/golden.ts';

test('the goldens match a rebuild, byte for byte (node tools/golden.ts --write after an intended change of the look)', () => {
  const dir = path.join(import.meta.dirname, '../goldens');
  for (const [file, svg] of Object.entries(goldens())) assert.equal(fs.readFileSync(path.join(dir, file), 'utf8'), svg, file);
});
