import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {ADR0074, CHARACTERS} from '../src/index.ts';
import {blind} from '../tools/blind.ts';
import {stageCell} from '../tools/stage.ts';

const rows = [{id: 'young a', ch: CHARACTERS.a}, {id: 'young b', ch: CHARACTERS.b}];
const seed = 30741241;

test('blind cards are drawn with replacement and are keyed in display order for a given seed', () => {
  const {html, key} = blind(rows, seed);
  assert.deepEqual(blind(rows, seed), {html, key});
  assert.notDeepEqual(blind(rows, seed + 1).key.targets, key.targets);
  const cards = JSON.parse(html.match(/<script type="application\/json" id="cards">(.+)<\/script>/)![1]!);
  assert.equal(cards.length, rows.length);
  key.targets.forEach(({id, order}, row) => {
    assert.equal(id, rows[row]!.id);
    assert.equal(order.length, 8);
    assert.ok(order.every(name => ADR0074.includes(name)));
    assert.deepEqual(cards[row], order.map((name, i) => stageCell(rows[row]!.ch, name, `q${row}-${i}`)));
  });
  assert.ok(key.targets.some(({order}) => new Set(order).size < 8));
});

test('the quiz seed appears only in the key', () => {
  const {html, key} = blind(rows, seed);
  assert.equal(key.seed, seed);
  assert.ok(!html.includes(String(seed)));
  assert.doesNotMatch(html, /\bseed\b/);
});

test('the blind CLI requires an explicit unsigned 32-bit integer seed', () => {
  for (const args of [[], [''], ['abc'], ['-1'], ['1.5'], ['4294967296']]) {
    const result = spawnSync(process.execPath, ['tools/blind.ts', ...args], {encoding: 'utf8'});
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.match(result.stderr, /seed.*integer/i);
  }
});
