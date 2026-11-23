import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

test('blind-quiz is the only artifact containing the quiz and uploads only the quiz', () => {
  const workflow = readFileSync(new URL('../.github/workflows/test.yml', import.meta.url), 'utf8');
  const uploads = [...workflow.matchAll(/^ {6}- uses: actions\/upload-artifact@[^\n]+\n((?: {8}[^\n]*\n)*)/gm)];
  const paths = uploads.map(([, step]) => {
    assert.ok(step);
    const name = step.match(/^ {10}name: (\S+)$/m)?.[1];
    const path = step.match(/^ {10}path: (.+)((?:\n {12}\S[^\n]*)*)/m);
    assert.ok(name && path, step);
    return [name, path[1] === '|' ? path[2]!.trim().split(/\s+/) : [path[1]]];
  });
  assert.equal(paths.length, 4);
  assert.deepEqual(Object.fromEntries(paths), {
    gallery: ['out/*.svg'],
    measurements: ['out/measurements.json'],
    'stage-review': ['out/stage.svg', 'out/brows-*.png'],
    'blind-quiz': ['out/blind.html'],
  });
});
