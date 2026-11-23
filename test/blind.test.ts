import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ADR0074, CHARACTERS} from '../src/index.ts';
import {blind} from '../tools/blind.ts';
import {stageCell} from '../tools/stage.ts';

test('blind cards are drawn with replacement and are keyed in display order', () => {
  const rows = [{id: 'young a', ch: CHARACTERS.a}, {id: 'young b', ch: CHARACTERS.b}];
  const {html, key} = blind(rows);
  assert.deepEqual(blind(rows), {html, key});
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
