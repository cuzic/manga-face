// node tools/measure.ts [--check] [outdir] — manifests, loadCharacter, sizes, determinism (Node and Chromium), anchors (raster), distinguishability at stage scale,
// pixel checks of the feature lines and the keylines, contrast over the palette, minimum stroke width, the sampler's validity, swap compatibility with the
// built-in faces, and the 4-panel comic() sample. See ADR 0001 D7.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Page} from 'playwright-chromium';
import {execFileSync} from 'node:child_process';
import {comic, diagram, renderInBrowser} from 'svg-diagram/browser';
import type {ComicWorksheet} from 'svg-diagram';
import {assertLoads} from './conformance.ts';
import {ADR0074, BOX, CHARACTERS, CX, CY, HAIR, HEAD_R, INK, KEY_BELOW, SCALE, SKIN, GENERATOR, contrast, faceFragment, needsKeyline, normalize, randomCharacter, randomCharacterDetailed, toManifest, validate, RANGES, type Character} from '../src/index.ts';
import {sheet} from './gallery.ts';
import {judge, lowest, median} from './measure-check.ts';
import type {Distribution, Person} from './measure-check.ts';
import {OUT, STAGE_HEIGHT, STAGE_WIDTH, extremes, randomCases, showcase} from './stage-cases.ts';

export {judge} from './measure-check.ts';

interface Raster {w: number; h: number; d: Uint8ClampedArray}
type RasterWindow = Window & {__ras: (box: readonly number[], frag: string, scale: number, background: boolean) => Promise<Raster>};

const rasterJs = `window.__ras = async (box, frag, sc, bg) => {
  const w = Math.round(box[2] * sc), h = Math.round(box[3] * sc);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + box.join(' ') + '" width="' + w + '" height="' + h + '">' + (bg ? '<rect x="' + box[0] + '" y="' + box[1] + '" width="' + box[2] + '" height="' + box[3] + '" fill="#ffffff"/>' : '') + frag + '</svg>';
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', {willReadFrequently: true});
  g.drawImage(img, 0, 0);
  return {w, h, d: g.getImageData(0, 0, w, h).data};
};`;

async function distinct(page: Page, ch: Character, id: string): Promise<Person> {
  const frags = ADR0074.map(e => faceFragment(ch, e).fragment);
  const rect = {
    x0: Math.round((CX - HEAD_R - BOX[0]) * SCALE),
    x1: Math.round((CX + HEAD_R - BOX[0]) * SCALE),
    y0: Math.round((CY - HEAD_R - BOX[1]) * SCALE),
    y1: Math.round((CY + HEAD_R - BOX[1]) * SCALE),
  };
  const pairs = await page.evaluate(async ({box, frags, rect, scale}) => {
    const px: Float64Array[] = [];
    const ras = (window as unknown as RasterWindow).__ras;
    for (const frag of frags) {
      const {d} = await ras(box, frag, scale, true);
      const grey = new Float64Array(d.length / 4);
      for (let i = 0; i < grey.length; i++) {
        grey[i] = 0.299 * d[i * 4]! + 0.587 * d[i * 4 + 1]! + 0.114 * d[i * 4 + 2]!;
      }
      px.push(grey);
    }

    const width = Math.round(box[2] * scale), area = (rect.x1 - rect.x0) * (rect.y1 - rect.y0);
    const pairs: {difference: number; i: number; j: number}[] = [];
    for (let i = 0; i < px.length; i++) {
      for (let j = i + 1; j < px.length; j++) {
        const a = px[i]!, b = px[j]!;
        let sum = 0;
        for (let y = rect.y0; y < rect.y1; y++) {
          for (let x = rect.x0; x < rect.x1; x++) {
            const at = y * width + x;
            sum += Math.abs(a[at]! - b[at]!);
          }
        }
        pairs.push({difference: sum / area, i, j});
      }
    }
    return pairs.sort((a, b) => a.difference - b.difference);
  }, {box: BOX, frags, rect, scale: SCALE});
  const {difference: min, i, j} = pairs[0]!;
  return {id, min, median: median(pairs.map(pair => pair.difference)), pair: `${ADR0074[i]}/${ADR0074[j]}`};
}

async function measure(dir: string, check: boolean) {
  fs.mkdirSync(dir, {recursive: true});
  const bytes = (s: string) => Buffer.byteLength(s, 'utf8');
  const stat: Record<string, unknown> = {};
  const checks: {criterion: string; pass: boolean; value: string}[] = [];
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const EXTRA = ['shy', 'smug', 'deadpan', 'clench', 'cry', 'blank'];

  // 1. manifests accepted by loadCharacter (a: young, b: young bob and mirrored, m: mature)
  const a = toManifest(CHARACTERS.a), b = toManifest(CHARACTERS.b), m = toManifest(CHARACTERS.m);
  for (const x of [a, b, m]) assertLoads(x);
  fs.writeFileSync(path.join(dir, 'character-a.json'), `${JSON.stringify(a)}\n`);
  stat['loadCharacter'] = 'accepted a, b (mirror), m (mature)';
  stat['fragmentBytes'] = Object.fromEntries(ADR0074.map(e => [e, bytes(a.expressions[e]!)]));
  stat['extrasFragmentBytes'] = Object.fromEntries(EXTRA.map(e => [e, bytes(faceFragment(CHARACTERS.a, e).fragment)]));
  stat['manifestBytes'] = {a: bytes(JSON.stringify(a)), b: bytes(JSON.stringify(b)), mature: bytes(JSON.stringify(m))};
  stat['pathCount'] = (a.expressions.neutral!.match(/<path/g) ?? []).length;

  // 2. determinism: twice, from a deep copy, and in Chromium (the generator bundled with esbuild and run in the page)
  stat['deterministic'] = JSON.stringify(a) === JSON.stringify(toManifest(structuredClone(CHARACTERS.a)));
  const g1 = sheet(ADR0074);
  stat['galleryDeterministic'] = g1 === sheet(ADR0074);
  stat['galleryBytes'] = bytes(g1);
  const bundle = execFileSync(path.join(import.meta.dirname, '../node_modules/.bin/esbuild'), [path.join(import.meta.dirname, '../src/index.ts'), '--bundle', '--format=iife', '--global-name=MF', '--platform=browser', '--log-level=error'], {encoding: 'utf8'});
  const {chromium} = await import('playwright-chromium');
  const br = await chromium.launch();
  try {
    const page = await br.newPage({deviceScaleFactor: 1});
    await page.setContent('<body></body>');
    await page.addScriptTag({content: bundle});
    const rnd = Array.from({length: 40}, (_, i) => randomCharacter(i));
    const inNode = JSON.stringify([a, b, m, ...rnd.map(c => toManifest(c))]);
    const inChromium = await page.evaluate(({cs, seeds}) => JSON.stringify([...cs.map((c: any) => (window as any).MF.toManifest(c)), ...seeds.map((s: number) => (window as any).MF.toManifest((window as any).MF.randomCharacter(s)))]), {cs: [CHARACTERS.a, CHARACTERS.b, CHARACTERS.m], seeds: rnd.map((_, i) => i)});
    stat['chromiumIdentical'] = {characters: 3 + rnd.length, identical: inNode === inChromium};

    await page.addScriptTag({content: rasterJs});

    // 3. anchors by raster: the first non-transparent row of every expression, against the declared `top` (no tolerance)
    const SC = 4;
    const anchors: Record<string, unknown> = {};
    for (const [k, x] of [['a', a], ['b', b], ['mature', m]] as const) {
      const tops: number[] = [];
      for (const e of ADR0074) {
        const r = await page.evaluate(async ({box, frag, sc}) => { const q = await (window as unknown as RasterWindow).__ras(box, frag, sc, false); for (let y = 0; y < q.h; y++) for (let x2 = 0; x2 < q.w; x2++) if (q.d[(y * q.w + x2) * 4 + 3]! > 8) return box[1]! + y / sc; return null; }, {box: [...x.box], frag: x.expressions[e]!, sc: SC});
        tops.push(r as number);
      }
      const minTop = Math.min(...tops);
      anchors[k] = {declaredTop: x.anchors.top, rasterTop: minTop, ok: x.anchors.top! <= minTop, atLeast23: x.anchors.top! >= 23};
    }
    stat['anchors'] = anchors;

    // 4. The 28 expression pairs at stage scale (DPR 1), over the head circle’s bounding square.
    const collect = (rows: readonly {id: string; ch: Character}[]) => Promise.all(rows.map(({id, ch}) => distinct(page, ch, id)));
    const distribution: Distribution = {
      showcase: await collect(showcase),
      random: await collect(randomCases()),
      extremes: await collect(extremes),
    };
    const gated = judge(distribution);
    stat['distinguishability'] = {
      stage: `${STAGE_WIDTH}x${STAGE_HEIGHT}px`,
      rect: 'head circle bounding square',
      ...gated[3].distribution,
      people: distribution,
      worstRandom: lowest(distribution.random),
      worstExtreme: lowest(distribution.extremes),
    };

    // 5. pixel checks (stage scale x3 = 1.08 px per unit): (a) every line feature's ink edge sees paper or a fill with >= 3:1 against ink;
    //    (b) each boundary keyline changes the picture (>= 100 px); with a negative control (feature keylines off)
    const lineCheck = async (chs: Character[], exprs: string[], noKey: boolean) => {
      const pairs = chs.flatMap(c => exprs.map(e => ({full: faceFragment(c, e, {features: 'lines', noFeatureKeyline: noKey}).fragment, bare: faceFragment(c, e, {features: false}).fragment, c: c.id, e})));
      return page.evaluate(async ({box, pairs, ink}) => {
        const lumv = (r: number, g: number, b: number) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const li = lumv(ink[0]!, ink[1]!, ink[2]!); const cr = (r: number, g: number, b: number) => { const l = lumv(r, g, b); return (Math.max(l, li) + 0.05) / (Math.min(l, li) + 0.05); };
        let worst = {id: '', fraction: Infinity}, edgeTotal = 0, passTotal = 0;
        const failing: string[] = [];
        for (const p of pairs) {
          const A = await (window as unknown as RasterWindow).__ras(box, p.full, 1.08, false), B = await (window as unknown as RasterWindow).__ras(box, p.bare, 1.08, false);
          const w = A.w, h = A.h; let pass = 0, edge = 0;
          const isInk = (i: number) => Math.abs(A.d[i]! - ink[0]!) + Math.abs(A.d[i + 1]! - ink[1]!) + Math.abs(A.d[i + 2]! - ink[2]!) < 70 && A.d[i + 3]! > 200;
          for (let y = 4; y < h - 4; y++) for (let x = 4; x < w - 4; x++) {
            const i = (y * w + x) * 4;
            if (!isInk(i)) continue;
            if (Math.abs(A.d[i]! - B.d[i]!) + Math.abs(A.d[i + 1]! - B.d[i + 1]!) + Math.abs(A.d[i + 2]! - B.d[i + 2]!) < 24) continue; // not a feature pixel
            let sees = false, hasOut = false;
            for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [3, 0], [-3, 0], [0, 3], [0, -3], [4, 0], [-4, 0], [0, 4], [0, -4], [2, 2], [-2, -2], [2, -2], [-2, 2]] as const) {
              const j = ((y + dy) * w + x + dx) * 4;
              if (isInk(j)) continue;
              hasOut = true;
              if (cr(A.d[j]!, A.d[j + 1]!, A.d[j + 2]!) >= 3) sees = true;
            }
            if (!hasOut) continue;
            edge++; if (sees) pass++;
          }
          edgeTotal += edge;
          passTotal += pass;
          const frac = edge ? pass / edge : 0;
          const id = `${p.c}/${p.e}`;
          if (frac < worst.fraction) worst = {id, fraction: frac};
          if (frac < 0.85) failing.push(`${id}=${(frac * 100).toFixed(2)}%`);
        }
        return {worst, failing, edgePixels: edgeTotal, passingPixels: passTotal, totalFraction: edgeTotal ? passTotal / edgeTotal : 0, cases: pairs.length};
      }, {box: [...BOX], pairs, ink: [0x22, 0x20, 0x1b]});
    };
    const skins = Object.keys(SKIN), hairs = ['black', 'blond', 'navy'];
    const grid: Character[] = skins.flatMap(s => hairs.map(h => ({...structuredClone(CHARACTERS.a), id: `${s}-${h}`, mirror: false, palette: {...CHARACTERS.a.palette, skin: s, hair: h}} as Character)));
    const exprs = [...ADR0074, ...EXTRA];
    const features = await lineCheck(grid, exprs, false);
    const control = await lineCheck(grid, exprs, true);
    stat['featurePixels'] = {...features, grid: `${skins.length} skins x ${hairs.length} hairs x ${exprs.length} expressions`};
    stat['featurePixelsControlNoKeyline'] = control;
    const keyChanges = async (kind: 'hairFace' | 'faceNeck') => page.evaluate(async ({box, pairs}) => { const out: number[] = []; for (const p of pairs) { const A = await (window as unknown as RasterWindow).__ras(box, p.on, 1.08, true), B = await (window as unknown as RasterWindow).__ras(box, p.off, 1.08, true); let n = 0; for (let i = 0; i < A.d.length; i += 4) if (Math.abs(A.d[i]! - B.d[i]!) + Math.abs(A.d[i + 1]! - B.d[i + 1]!) + Math.abs(A.d[i + 2]! - B.d[i + 2]!) > 24) n++; out.push(n); } return out; },
      {box: [...BOX], pairs: [CHARACTERS.a, CHARACTERS.b, CHARACTERS.m].map(c => ({on: faceFragment(c, 'neutral').fragment, off: faceFragment(c, 'neutral', {noKeyline: kind}).fragment}))});
    const hairFace = await keyChanges('hairFace'), faceNeck = await keyChanges('faceNeck');
    stat['keylineChangesPixels'] = {hairFace, faceNeck, requireAtLeast: 100};

    const pixelPass = (result: typeof features) => result.worst.fraction >= 0.85 && result.totalFraction >= 0.95;
    const percent = (value: number) => `${(100 * value).toFixed(2)}%`;
    const pixelValues = (result: typeof features) =>
      `${percent(result.worst.fraction)} (${result.worst.id}), total ${percent(result.totalFraction)}`;
    checks.push(
      ...gated.map(({criterion, pass, value}) => ({criterion, pass, value})),
      {criterion: '⑤ Feature lines ≥ 85% each and ≥ 95% overall, control fails',
        pass: pixelPass(features) && !pixelPass(control),
        value: `${pixelValues(features)}; control: ${pixelValues(control)}`},
      {criterion: '⑥ Boundary keylines change ≥ 100 px each',
        pass: [...hairFace, ...faceNeck].every(pixels => pixels >= 100),
        value: `hair/face: ${hairFace.join(', ')} px; face/neck: ${faceNeck.join(', ')} px`},
    );
  } finally {
    await br.close();
  }

  // 6. which skins are keyed (feature lines get a paper line under them): ink under 3:1 against the skin
  stat['contrast'] = {inkOnPaper: r1(contrast(INK, '#ffffff')), keylineBelow: KEY_BELOW, skins: Object.entries(SKIN).map(([k, v]) => ({skin: k, ink: r1(contrast(INK, v)), keyed: needsKeyline(v)})), hairs: Object.entries(HAIR).map(([k, v]) => ({hair: k, ink: r1(contrast(INK, v)), browsKeyed: needsKeyline(v)})),
    hairOnSkinBelow3: Object.entries(HAIR).flatMap(([h, hv]) => Object.entries(SKIN).map(([s, sv]) => ({h, s, c: contrast(hv, sv)}))).filter(p => p.c < 3).length + ' of 36 (not guaranteed; the hair-face boundary has a keyline)'};

  // 7. minimum stroke width at stage scale: every open line (fill none) is >= 2.8 units (1 px at 0.36)
  const strokes = (frag: string) => [...frag.matchAll(/<(?:path|ellipse|circle)[^>]*?fill="none"[^>]*?stroke-width="([0-9.]+)"/g)].map(x => Number(x[1]));
  const minStroke = Math.min(...[a, b, m].flatMap(x => Object.values(x.expressions).flatMap(f => strokes(f!))));
  stat['minStrokeUnits'] = {min: minStroke, px: r1(minStroke * SCALE), ok: minStroke * SCALE >= 1};

  // 8. the sampler: first-draw validity, repair, totality; the coarse grid; invalid input
  const N = 1000; let first = 0, repairedN = 0, invalidAfter = 0; const repairGroups: Record<string, number> = {};
  for (let i = 0; i < N; i++) { const d = randomCharacterDetailed(i); if (d.firstDrawValid) first++; else { repairedN++; for (const g of d.repaired) repairGroups[g] = (repairGroups[g] ?? 0) + 1; } if (validate(d.character).length) invalidAfter++; else assertLoads(toManifest(d.character)); }
  stat['randomSeeds'] = {generator: GENERATOR, tried: N, firstDrawValid: first, firstDrawRate: `${(first / N * 100).toFixed(1)}%`, repaired: repairedN, repairedGroups: repairGroups, invalidAfterRepair: invalidAfter};
  const seed7 = JSON.stringify(randomCharacter(7)); stat['seedStable'] = seed7 === JSON.stringify(randomCharacter(7));
  stat['seedSnapshot'] = Object.fromEntries([0, 1, 2].map(i => { const c = randomCharacter(i); return [String(i), `cheek ${c.head.cheek} chin ${c.head.chin} jaw ${c.head.jaw} eyes ${c.eyes.w}x${c.eyes.h} ${c.hair.template}/${c.hair.strands} ${c.palette.skin}/${c.palette.hair}`]; }));
  // coarse grid: 'normalize' applies the dependent constraints; how much of the grid is still invalid, and why
  let gridN = 0, gridBad = 0; const gridWhy: Record<string, number> = {};
  for (const cheek of [74, 80, 86, 92, 96]) for (const chin of [90, 94, 98]) for (const strands of [1, 5, 9]) for (const parting of [-1, 0, 1]) for (const template of ['short', 'bob'] as const) for (const dirn of ['a', 'm'] as const) {
    const c = {...structuredClone(CHARACTERS[dirn]), mirror: false, head: {...CHARACTERS[dirn].head, cheek, chin}, hair: {...CHARACTERS[dirn].hair, strands, parting, template}} as Character;
    gridN++; const bad = validate(c); if (bad.length) { gridBad++; for (const x of new Set(bad.map(v => v.message.replace(/^[a-z]+: /, '').replace(/[-0-9.]+/g, '#').slice(0, 45)))) gridWhy[x] = (gridWhy[x] ?? 0) + 1; }
  }
  stat['coarseGrid'] = {points: gridN, invalid: gridBad, rate: `${(gridBad / gridN * 100).toFixed(1)}%`, why: gridWhy};
  const invalidMessages = (character: Character): string[] => validate(character).map(violation => violation.message);
  stat['invalidInputs'] = {strands0: invalidMessages({...CHARACTERS.a, hair: {...CHARACTERS.a.hair, strands: 0}}),
    chin110: invalidMessages({...CHARACTERS.a, head: {...CHARACTERS.a.head, chin: 110}}),
    badHex: invalidMessages({...CHARACTERS.a, palette: {...CHARACTERS.a.palette, skin: '#12345'}}),
    unknownKey: invalidMessages({...CHARACTERS.a, palette: {...CHARACTERS.a.palette, hair: 'green'}})};
  let threw = false; try { toManifest({...CHARACTERS.a, hair: {...CHARACTERS.a.hair, strands: 0}} as Character); } catch { threw = true; }
  stat['toManifestThrowsOnInvalid'] = threw;
  // a palette hex that equals paper or ink is moved by one unit and stays a 6-digit hex that loadCharacter accepts (the bug was #1000000)
  const edge = toManifest({...CHARACTERS.a, id: 'edge', palette: {skin: '#ffffff', hair: '#22201b', top: '#fffff0', iris: '#ffffff'}} as Character);
  assertLoads(edge);
  stat['edgeHex'] = {allSixDigit: !/#[0-9a-f]{7,}/i.test(JSON.stringify(edge)), loaded: true};
  let mapErr = ''; try { toManifest(CHARACTERS.a, ADR0074, {think: 'cry'}); } catch (e) { mapErr = String((e as Error).message).slice(0, 80); }
  stat['expressionMapRejectsDifferentMeaning'] = mapErr;
  stat['expressionMapAcceptsSameMeaning'] = (() => { const x = toManifest(CHARACTERS.a, ADR0074, {sad: 'cry', angry: 'clench'}); assertLoads(x); return Object.keys(x.expressions).length; })();
  stat['normalizeIdempotent'] = JSON.stringify(normalize(normalize(CHARACTERS.a))) === JSON.stringify(normalize(CHARACTERS.a));
  stat['ranges'] = Object.keys(RANGES).length;

  // 9. the 4-panel sample with the two characters (renderInBrowser + comic())
  const sample: ComicWorksheet = {version: 1, title: '確認の会話', layout: '2x2', cast: {me: {name: '私', asset: 'mf-a'}, col: {name: '同僚', asset: 'mf-b'}}, panels: [
    {id: 'p1', stage: [{who: 'me', at: 'left', expression: 'neutral'}, {who: 'col', at: 'right', expression: 'smile'}], dialogue: [{id: 'd1', who: 'me', kind: 'say', tpl: 'ここが変更点です。'}]},
    {id: 'p2', stage: [{who: 'me', at: 'left', expression: 'surprise'}, {who: 'col', at: 'right', expression: 'think'}], dialogue: [{id: 'd1', who: 'col', kind: 'say', tpl: '要確認ですね。'}]},
    {id: 'p3', stage: [{who: 'me', at: 'left', expression: 'worry'}, {who: 'col', at: 'right', expression: 'angry'}], dialogue: [{id: 'd1', who: 'me', kind: 'think', tpl: '間に合うかな…'}]},
    {id: 'p4', stage: [{who: 'me', at: 'left', expression: 'laugh'}, {who: 'col', at: 'right', expression: 'sad'}], dialogue: [{id: 'd1', who: 'col', kind: 'say', tpl: 'あとで見ます。'}]},
  ]};
  // a full-width character is 1 em, a half-width one 0.55 em (no font files: the numbers are an approximation, enough to compare cast against cast)
  const hb = ({text, size}: {text: string; size: number}) => ({w: [...text].reduce((w, c) => w + (c.charCodeAt(0) < 0x300 ? 0.55 : 1) * size, 0), h: size});
  const render = () => renderInBrowser(diagram({theme: 'blue', title: sample.title, width: 780, legend: false}).add(comic(sample, {aspect: '6:5', characters: {'mf-a': a, 'mf-b': b}})), {measure: hb});
  const c1 = await render(), c2 = await render();
  fs.writeFileSync(path.join(dir, 'comic-sample.svg'), c1.svg);
  stat['comic'] = {deterministic: c1.svg === c2.svg, svgBytes: bytes(c1.svg), verdictOk: c1.verdict.ok, faces: (c1.svg.match(/data-character=/g) ?? []).length};

  // 10. swap compatibility (ADR 0079 D7): 1x2 with two stacked bubbles per panel, lines of 8..66 characters; built-in vs manga (no tuft, with a side tuft, mature)
  const tuft: Character = {...structuredClone(CHARACTERS.a), id: 'mf-t', hair: {...CHARACTERS.a.hair, ahoge: 'right'}};
  const mt = toManifest(tuft), mm = toManifest({...CHARACTERS.m, id: 'mf-mm'} as Character);
  const chars = {'mf-a': a, 'mf-b': b, 'mf-t': mt, 'mf-mm': mm};
  const base = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソ';
  const swap: Record<string, {ok: number; fail: number}> = {builtin: {ok: 0, fail: 0}, manga: {ok: 0, fail: 0}, mangaTuft: {ok: 0, fail: 0}, mangaMature: {ok: 0, fail: 0}};
  const regress: string[] = [];
  for (const [layout, aspect] of [['1x2', '6:5'], ['2x2', '6:5'], ['1x3', '6:5']] as const) for (let len = 8; len <= 66; len += 4) {
    const lines = base.slice(0, len), res: Record<string, boolean> = {};
    for (const [label, cast] of [['builtin', {me: {name: '私', face: {hue: 200}}, col: {name: '同僚', face: {hue: 20}}}], ['manga', {me: {name: '私', asset: 'mf-a'}, col: {name: '同僚', asset: 'mf-b'}}], ['mangaTuft', {me: {name: '私', asset: 'mf-t'}, col: {name: '同僚', asset: 'mf-b'}}], ['mangaMature', {me: {name: '私', asset: 'mf-mm'}, col: {name: '同僚', asset: 'mf-b'}}]] as const) {
      const pan = (id: string, two: boolean) => ({id, stage: two ? [{who: 'me', at: 'left' as const, expression: 'neutral' as const}, {who: 'col', at: 'right' as const, expression: 'smile' as const}] : [{who: 'me', at: 'left' as const, expression: 'neutral' as const}], dialogue: two ? [{id: 'd1', who: 'me', kind: 'say' as const, tpl: lines}, {id: 'd2', who: 'col', kind: 'say' as const, tpl: lines}] : []});
      const count = layout === '1x2' ? 2 : layout === '1x3' ? 3 : 4;
      const ws: ComicWorksheet = {version: 1, title: 'Zone', layout, cast, panels: Array.from({length: count}, (_, i) => pan(`p${i}`, i === count - 1))};
      const r = await renderInBrowser(diagram({theme: 'blue', width: 500, legend: false}).add(comic(ws, {aspect, characters: chars})), {measure: hb});
      const ok = r.verdict.problems.filter((x: string) => !x.includes('text-budget')).length === 0;
      res[label] = ok; swap[label]![ok ? 'ok' : 'fail']++;
    }
    for (const k of ['manga', 'mangaTuft', 'mangaMature']) if (res['builtin'] && !res[k]) regress.push(`${k}@${layout}/${len}`);
  }
  stat['swapCompatibility'] = {layouts: '1x2, 2x2, 1x3 (6:5)', lengths: '8..66 step 4', ...swap, regressions: regress};
  stat['topAnchors'] = {a: a.anchors.top, tuft: mt.anchors.top, b: b.anchors.top, mature: m.anchors.top, limit: 23};

  stat['checks'] = checks;
  fs.writeFileSync(path.join(dir, 'measurements.json'), `${JSON.stringify(stat, null, 2)}\n`);
  if (check) {
    console.table(checks.map(({pass, ...row}) => ({...row, result: pass ? 'PASS' : 'FAIL'})));
    if (checks.some(row => !row.pass)) process.exitCode = 1;
  } else {
    console.log(JSON.stringify(stat, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const dirs = args.filter(arg => arg !== '--check');
  if (dirs.length > 1 || dirs.some(dir => dir.startsWith('-'))) {
    throw new Error('Usage: node tools/measure.ts [--check] [outdir]');
  }
  await measure(dirs[0] ?? OUT, args.includes('--check'));
}
