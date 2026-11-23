// node tools/blind.ts [outdir] — run pnpm measure --check first, then open blind.html at 100% zoom.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ADR0074} from '../src/index.ts';
import type {Character} from '../src/index.ts';
import {stageCell} from './stage.ts';
import {OUT, reviewCases} from './stage-cases.ts';

const SEED = 2075;
const PASS_SCORE = 7;

export function blind(rows: readonly {id: string; ch: Character}[]) {
  let state = SEED;
  const targets = rows.map(({id, ch}, row) => {
    const order = ADR0074.map(() => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return ADR0074[Math.floor(state / 0x100000000 * ADR0074.length)]!;
    });
    const cards = order.map((expression, i) => stageCell(ch, expression, `q${row}-${i}`));
    return {id, order, cards};
  });
  const key = {seed: SEED, targets: targets.map(({id, order}) => ({id, order}))};
  // Script data holds the anonymous SVG cards in display order. Only the separate key has the expression labels.
  const cards = JSON.stringify(targets.map(target => target.cards)).replaceAll('<', '\\u003c');
  const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Stage expression check</title>
<style>
  body { max-width: 32rem; margin: 2rem auto; padding: 0 1rem; font: 1rem system-ui, sans-serif; color: #22201b; }
  #portrait { margin: 1rem 0; }
  #choices { display: grid; grid-template-columns: repeat(4, 1fr); gap: .5rem; margin-bottom: 1rem; }
  #choices[hidden] { display: none; }
  button { padding: .5rem; }
</style>
<h1>Stage expression check</h1>
<p>Use 100% zoom. Choose a name for each face. Some expressions may appear more than once.</p>
<p id="progress" aria-live="polite"></p>
<div id="portrait" role="img" aria-label="Face to identify"></div>
<div id="choices">${ADR0074.map(expression => `<button type="button" value="${expression}">${expression}</button>`).join('')}</div>
<section id="grade" hidden>
  <label>Load blind-key.json to score your answers <input id="key" type="file" accept=".json,application/json"></label>
  <div id="results" aria-live="polite"></div>
</section>
<script type="application/json" id="cards">${cards}</script>
<script>
  const cards = JSON.parse(document.getElementById('cards').textContent);
  const names = ${JSON.stringify(ADR0074)};
  const choices = document.getElementById('choices');
  const portrait = document.getElementById('portrait');
  const progress = document.getElementById('progress');
  const results = document.getElementById('results');
  const answers = cards.map(() => []);
  let person = 0, question = 0;

  function show() {
    progress.textContent = 'Person ' + (person + 1) + '/' + cards.length + ', face ' + (question + 1) + '/' + names.length;
    portrait.innerHTML = cards[person][question];
  }

  choices.addEventListener('click', event => {
    if (!(event.target instanceof HTMLButtonElement)) return;
    answers[person].push(event.target.value);
    question++;
    if (question === names.length) {
      question = 0;
      person++;
    }
    if (person < cards.length) {
      show();
    } else {
      progress.textContent = 'All faces answered.';
      portrait.remove();
      choices.hidden = true;
      document.getElementById('grade').hidden = false;
      document.getElementById('key').focus();
    }
  });

  document.getElementById('key').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    results.replaceChildren();
    try {
      const key = JSON.parse(await file.text());
      if (key.seed !== ${SEED} || key.targets.length !== cards.length) throw new Error();
      const list = document.createElement('ul');
      key.targets.forEach(({id, order}, i) => {
        if (typeof id !== 'string' || !Array.isArray(order) || order.length !== names.length
          || !order.every(name => names.includes(name))) throw new Error();
        const score = order.filter((name, j) => answers[i][j] === name).length;
        const item = document.createElement('li');
        item.textContent = id + ' — ' + score + '/' + names.length + ' ' + (score >= ${PASS_SCORE} ? 'Pass' : 'Fail');
        list.append(item);
      });
      results.append(list);
    } catch {
      results.textContent = 'Choose the blind-key.json generated with this quiz.';
    }
  });
  show();
</script>
</html>
`;
  return {html, key};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] ?? OUT;
  const {showcase, worst} = reviewCases(dir);
  const {html, key} = blind([showcase[0]!, showcase[1]!, showcase[3]!, ...worst]);
  fs.writeFileSync(path.join(dir, 'blind.html'), html);
  fs.writeFileSync(path.join(dir, 'blind-key.json'), `${JSON.stringify(key, null, 2)}\n`);
}
