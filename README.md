# manga-face

Parametric manga-style faces as SVG. The output is a `CharacterManifest` that [svg-diagram](https://github.com/cuzic/svg-diagram)'s `comic()` takes as it is
(`comic(sheet, {characters: {id: manifest}})`).

- A front-facing head from numbers (face outline, eyes, brows, mouth, nose, hair) in two styles: `young` (the default) and `mature` (`style: 'mature'`).
- Expressions are presets: deltas on the character's own eyes, brows and mouth. The 8 expressions of svg-diagram's `comic()` and 6 extras.
- Deterministic: the same parameters give byte-identical SVG on every Node and in the browser. Seeded random characters.
- Pure ESM, no `node:*`, `sideEffects: false` (tree-shakeable). Runs in the browser.

Status: **in development**, started from the spike of svg-diagram's ADR 0079. The design is `docs/adr/0001-manga-face.md`. Nothing is published to npm yet.

```ts
import {defaultCharacter, toManifest} from 'manga-face';   // not published yet: import from ./src/index.ts

const manifest = toManifest(defaultCharacter({style: 'young', palette: {skin: 'medium', hair: 'black'}}));
// comic(sheet, {characters: {[manifest.id]: manifest}})
```

`validate(character)` returns an array of violations with a `group`, a `code`, a human-readable `message`, and an `expression` when the check applies to a specific expression. An empty array means the character is valid. Validation checks numeric fields, strand counts, and palette values on the input, then checks geometry after normalization. Numeric fields must be finite numbers, and range bounds allow floating-point error up to `1e-9`. `toManifest(character)` throws with the violation messages if validation fails.

`validateRaw(character, expressions?)` checks the supplied geometry directly, without normalization or range, strand-count, and palette validation. It checks the eight comic expressions by default.

## Development

```sh
pnpm install
pnpm typecheck && pnpm lint && pnpm test
pnpm golden          # compare goldens/*.svg with a rebuild (pnpm golden:write after an intended change of the look)
pnpm gallery         # out/gallery.svg, out/extras.svg, out/directions.svg
pnpm measure --check # needs Playwright Chromium. Writes out/measurements.json and fails if a check fails.
node tools/stage.ts  # out/stage.svg at stage size and 2×
node tools/blind.ts "$BLIND_QUIZ_SEED"  # out/blind.html and the organizer's out/blind-key.json
```

`pnpm measure --check` checks stage-scale distinguishability and pixels, top anchors, minimum stroke width, determinism, sampler validity, the comic sample, and compatibility when replacing built-in faces. The pixel grid covers young short hair, mirrored young bob, and mature, each with every named skin and hair colour.

For each stage-size blind review, the organizer chooses a fresh unsigned 32-bit integer seed and passes it to `tools/blind.ts`. Each card draws an expression independently, so an expression can repeat. Share only `blind.html` with reviewers. Keep `blind-key.json` with the organizer, who loads it after all cards have been answered.

When the organizer supplies the `BLIND_QUIZ_SEED` Actions secret, CI publishes `blind.html` in `blind-quiz`. Reviewers should download only `blind-quiz`. To score that quiz, the organizer generates the key locally from the same commit, the run's `measurements.json`, and the same seed.

Work is done by agents from task specs (Issues titled `[codex] …`): see `AGENTS.md`.

## Licences

- **Code: MIT** (`LICENSE`).
- **The art that the code generates (the SVG, the manifests, the goldens): CC0-1.0** (public domain dedication). The manifests carry `license: {spdx: 'CC0-1.0', …}`.
- All art is original geometry written as code. No generative-model output, no tracing, no reference-matched art; `PROVENANCE.md` records each part.

## 参考用の表情シートを生成する

ADR 0002 R1 の開発者用ツール。初回の本番生成は owner の予算承認後に実行する。

- `python3 tools/fit/generate.py submit` で費用を確認し、承認後に `--yes` を付けて送信する。送信と取得は環境変数 `OPENAI_API_KEY` を使う。
- 表示された ID を `python3 tools/fit/generate.py collect <batch-id>` に渡す。処理中は同じ ID で再実行できる。
- PNG と確認前の来歴記録は `refs/ai/pending/<batch-id>/` に保存される。送信の成否が不明なときは、再送信の前にローカルの `submission-*` の記録と API ダッシュボードを確認する。

## 参考画像の採否を記録する

ADR 0002 R2 の開発者用ツール。Python の依存バージョンは `tools/fit/requirements.txt` を参照。

- `python3 tools/fit/review_reference.py list refs/ai/pending` で未審査のシートを表示する。
- `review_reference.py review <sheet.png> <draft.json> <reviewed.json> --id ai-0001 --reviewer owner --reviewed-at YYYY-MM-DD --decision accepted` で採用結果を記録する。判断が異なるマスは `--discard-cell 2:quality` のように指定する。シート全体を不採用にする場合は `--decision discarded --reason quality` を指定する。採用した画像と記録は非公開の置き場に保管する。
- `reference_record.py <sheet.png> <reviewed.json> --public-row` は `PROVENANCE.md` に載せる公開用の行を生成する。`--for-fit` は中立の採否と採用マスのしきい値を追加で検査する。
- 当てはめには `fit.py <pass1.json> <pass2.json> <outdir> --reference-image <sheet.png> --record <reviewed.json>` を使う。先に記録と座標の対応を検査し、当てはめ実行時は `fit.json` と `derived.json` に方向と来歴のハッシュを保存する。既存 PD の回帰確認は `--fixture` を付ける。数値評価の依存は ADR 0002 R5 を参照。

### AI によるランドマーク計測

ADR 0002 R4 の開発用ツール。次のコマンドで、座標が既知の校正用 SVG と 408 × 408 px の PNG を作る。Python の計測ツールには Pillow が必要。

```sh
python3 tools/fit/landmark_calibration.py generate out/landmark-fixtures
node tools/fit/render_landmark_fixtures.ts out/landmark-fixtures
```

`run_landmark_calibration.py --fixtures <directory> --model <model-version> --output <report.json> --adapter <command>` は、校正画像を各 2 回読み取り、正解座標を使って誤差と欠測を集計する。実行モデルには画像とランドマークの定義を渡す。既定は中立・平行移動・拡大と遮蔽の 3 枚。`--expanded` を指定すると笑顔・怒りと左右の遮蔽ケースが加わる。

`landmark_inference.py <sheet.png> <prepared-manifest.json> <output-directory> --model <model-version> --adapter <command>` は、R2/R3 の採用記録と前処理マニフェストに紐づく座標候補を出力する。シート、来歴、出力は非公開の作業場所に置く。`--adapter` 以降には、標準入力と標準出力を使うアダプターの実行コマンドを指定する。OpenAI 用アダプターは `python3 tools/fit/openai_landmark_adapter.py`。環境変数 `OPENAI_API_KEY` を使い、実 API の試験は予算承認後に行う。

AI 参考の当てはめには校正レポートを `--calibration`、同じマスの拡大読取りを `--zoom` で渡す。推論ランナーは各マスの独立した 2 回と拡大画像 1 回の読取りを出力する。

校正の `--expanded` では、笑顔・怒りに加えて左右の頬、耳、目尻、眉の遮蔽も検査する。同じ出力先に同じ条件で再実行すると保存済み応答を使う。失敗した応答や送信結果が不明な試行は同じ出力先から再送しない。応答 ID と利用量を調べ、再送が必要と確認できた場合に限り、該当のチェックポイント 1 件を監査用の別ディレクトリへ移してから、承認の範囲内で同じコマンドを実行する。他の成功済みチェックポイントはそのまま使う。
