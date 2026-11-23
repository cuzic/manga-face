import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

const src = path.join(import.meta.dirname, '../src');
const files = fs.readdirSync(src).filter(f => f.endsWith('.ts'));

test('src/ is pure: no node:* import, no fs / process / Date / Math.random, no Math.cos / sin / pow / hypot (every engine must give the same bytes)', () => {
  assert.ok(files.length > 0);
  for (const f of files) {
    const text = fs.readFileSync(path.join(src, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(text, /from\s+['"]node:/, `${f}: node:* import`);
    assert.doesNotMatch(text, /\b(require|process\.|Date|Math\.random)\b/, `${f}: impure call`);
    assert.doesNotMatch(text, /\b(?:Intl|toLocale\w*|toFixed)\b/, `${f}: engine-dependent formatting`);
    assert.doesNotMatch(text, /Math\.(cos|sin|tan|pow|hypot|exp|log|atan2?)\b|\*\*/, `${f}: engine-dependent maths`);
  }
});

test('the package is tree-shakeable: ESM, sideEffects false, exports point at src/index.ts', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../package.json'), 'utf8'));
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.sideEffects, false);
  assert.equal(pkg.exports['.'].default, './src/index.ts');
});
