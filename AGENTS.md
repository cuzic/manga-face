# manga-face — エージェント共通ガイド(実装者・Claude 共通)

パラメトリックなマンガ風の顔を SVG で出す TypeScript のライブラリ。出力は svg-diagram の `CharacterManifest`(`comic()` がそのまま受ける)。
設計は `docs/adr/` にある(最初の ADR は `0001-manga-face.md`)。作業の前に、担当する ADR の節と、その `*-opus-review-round*.md` を読む。
実装してよい ADR は、状態が 決定・承認・採用・実装中・一部実装済み・実装済み のもの(提案・起草・起票は、まだ実装しない)。

## 役割分担

| 担当 | 仕事 |
| --- | --- |
| Claude(Opus) | ADR の設計と試し(spike)、owner への質問の整理、タスク仕様を書く、PR の敵対的レビュー、マージ |
| 実装者(Claude Sonnet のサブエージェント) | 実装してよい状態の ADR に沿った実装、レビュー指摘の修正、main の取り込みと衝突解消、テストの追加 |
| owner | 見た目の好み(目標の方向、確認点での承認)、権利の判断、ライセンス。**見た目の良し悪しは owner が決める。機械の検査は「壊れていない」まで** |
| CI | typecheck・lint・テスト(Node 22 と 24)・golden の再生成の一致 |

- 仕事は「タスク仕様」(目的・根拠・スコープ・触ってよいファイル・受け入れ条件)で渡す。
  新しい作業は `[impl] …` の Issue、既存 PR への修正や main の取り込みはその PR の `## [impl] タスク仕様` コメント。
  渡し方は `.claude/skills/impl-task`(Agent ツールで `model: sonnet` のサブエージェントを起こす)。
- レビュー指摘の根拠は、PR ブランチにコミットされた `docs/reviews/prNN-roundK.md`(ADR は `docs/adr/NNNN-opus-review-roundK.md`)。
- **仕様に無い判断が要るときは、実装で決めない。** PR 本文の「Open questions」に書いて、そこで止める。
- **owner の確認点(ADR 0001 D7)の前に、次の単位へ進まない。** 特に U3 は、U2 の舞台の大きさのギャラリーを owner が承認してから。
- 実装者は、スクラッチ領域に自分で作った clone(`impl-task` の手順)の中で、仕様のブランチに切り替えて作業する。
  共有の checkout や他の worktree・clone は触らない。

## 完了の定義(どの PR も)

```sh
pnpm typecheck
pnpm lint
pnpm test                                   # node --test "test/*.test.ts"
pnpm golden                                 # goldens/*.svg が再生成と 1 バイトも違わない
```

- 4 つとも通ること。CI(`.github/workflows/test.yml`)も同じことをする。
- **先に再現テストを書く**。直す前の main で落ちることを確かめてから直す。
- 新しいコードには、それを壊す変異(手書きでよい)を最低 1 つ当て、テストが落ちることを確かめる。PR 本文に書く。
- **golden のルール**(顔にはテキストが無いので、フォントは関係しない。どの機械でも同じバイト列になる):
  - 見た目を変える意図のない PR で golden が変わったら、それはバグ。直す。
  - 意図して見た目を変えるときだけ `pnpm golden:write` で作り直し、**PR 本文に前後の画像(`out/` のギャラリーの切り抜き)と理由**を書く。見た目の変更は owner が承認する。
  - `goldens/*.svg` を手で直さない。
- 公開の振る舞い(関数・型・出力の形)を変えたら README と、該当 ADR の状態の行を直す。
- `PROVENANCE.md`: 部品(輪郭・目・眉・口・鼻・髪・プリセット)を足す・変えるときは、その行を足す・直す(`test/provenance.test.ts` が見る)。

## 権利の約束(ADR 0001 D6。破らない)

- **出荷する絵はすべて、独自の幾何をコードとして書いたもの。** 生成モデルの出力(画像・SVG のどれも)、既存の絵のトレース、参考画像に合わせた形を、そのまま出荷物に入れない。
  **例外(ADR 0002。承認済み 2026-11-23): 参考(reference)として、パラメータの当てはめと評価にだけ使う**。生成した画像は非公開の置き場に置き、1 枚ごとに人が確認して `PROVENANCE.md` に記録する。**画像は必ず、最小のサイズ・最も低い品質で作る**(`generate.py` が強制する。上書きしない)。PD / CC0 の絵は、出所の記録つきで参考に使える。**トレースした曲線は、どの出どころのものも、v1 では出荷しない**(髪は、生成した参考に当てはめたパラメータから描き直す)。API は、R1 の道具が入り、owner が最初の実行を承認するまで呼ばない。**API キーは `.env`(gitignore 済み)か環境変数だけに置き、読まない・出力しない・コミットしない**。
- 特定の作品・作家・キャラクターに似せない。Open Peeps と DiceBear は**構造(スロットの分け方、色のスロット)の参考**にとどめ、パーツの形(path)は写さない。
- コードを書くのにコーディングアシスタントを使うのはよい(幾何の説明から、参考画像なしで書く)。`PROVENANCE.md` の「Written by」に残す。
- 出力(マニフェスト・SVG)のライセンスは CC0-1.0、ソースは MIT。マニフェストの `license` は `{spdx: 'CC0-1.0', author: 'manga-face contributors', url: <このリポジトリ>}`。

## コードの約束

- **Node が `.ts` を型の取り除き(type stripping)でそのまま動かす**(`engines` は `>=22.18`。ビルドなしでテストも道具も動く)。
  そのため次は書かない: `enum`、`namespace`、コンストラクタの引数プロパティ、`import x = require()`。
  import は拡張子つき(`./foo.ts`)。型だけの import は `import type`(lint が見る)。
- **`src/` は純粋**: `node:*` を import しない。`fs`・`process`・`Date`・`Math.random` を使わない。ESM、`sideEffects: false`(tree-shaking は目標。`test/purity.test.ts` が見る)。
  ブラウザでそのまま動くこと。
- **決定性**: 同じパラメータは、どの Node でもブラウザでも、バイト単位で同じ SVG。そのため `Math.cos` / `sin` / `pow`(`**`)/ `hypot` などの浮動小数の関数を使わない
  (定数の表と四則演算と `Math.sqrt` だけ)。出す座標は 0.1 に丸める。オブジェクトの列挙順に依存しない。
- svg-diagram は **devDependency**(型の `import type` と、`tools/conformance.ts` の適合テストだけ)。`src/` から実行時に import しない。
  `package.json` の固定は、npm の最新(0.9.0)が `comic()` と `CharacterManifest` の型を含まないため、svg-diagram の main の commit への git 依存にしている。
  npm に載ったら、その版に替える(Issue を立てる)。
- 利用者に見せる文(README・ADR・エラーの案内)は日本語でも英語でもよいが、既存の文体に合わせる。コードのコメントは英語。
  エラーは「何が悪いか」と「どう直すか」を 1 行で言う。
- 既存の書き方に合わせる。周りに無い抽象化・依存を足さない。

## 安全の約束

- 試しのファイルや一時ファイルはリポジトリの外に置く。コミットに残さない。`out/` は生成物(コミットしない)。
- コミット・コメント・PR に、マシン固有の情報(ユーザー名・絶対パス・トークン)を書かない。
- `.codex/` と `.pnpmfile.cjs` をコミットしない(後でそのブランチで pnpm やエージェントを走らせる人の手元で動くため)。
- **このリポジトリは公開**。例の文言は中立なもの(「ここが変更点です。」「要確認ですね。」)だけ。実在の会社・製品・計画・個人の語を書かない。**ただし、`PROVENANCE.md` と ADR 0002 D2 が求める出所の記録(作者・アップロード者の名前、出典の URL)は書く(外さない・断らない)**。

## Git の約束

- 1 つの作業に 1 つの `git worktree` とブランチ(`feat/… fix/… docs/… chore/… test/… refactor/…`)。
  **共有の checkout でブランチを切り替えない**(別のセッションが同じリポジトリで動いている)。
- **merge で追従し、rebase と force-push はしない。** 既存 PR で始める前と push が拒否されたときは
  `git pull --no-rebase origin <branch>`(ブランチ名を必ず書く)。最初の push は `git push -u origin <branch>`。
- コミットメッセージは日本語または英語で `feat(area): …` / `fix(area): …`。ADR の段階があれば `(ADR 0001 U1)` のように書く。
  レビュー指摘を直すコミットには指摘 ID(`M1` `m2` など)を書く。
- コミット末尾に、使っているツールの `Co-Authored-By:` トレーラーを付ける。
- **実装者は PR を作って更新するが、マージしない。** マージは Claude が `.claude/skills/merge-pr` の手順で行う(owner でもよい)。
- PR 本文: 何を・なぜ(ADR と節)、テスト、当てた変異、指摘 → 修正の表(修正のとき)、Open questions。
- `main` には ruleset(force-push と削除の禁止、PR 必須、CI の必須)が掛かっている。直接 push しない。

## リポジトリの地図

| 場所 | 中身 |
| --- | --- |
| `src/` | ライブラリ(純粋)。`index.ts` が公開の入口。`face.ts` は U1 で分けたパラメータ・幾何・描画・検査・生成などのモジュールを再エクスポートする |
| `test/` | `node --test`。`golden.test.ts`(goldens と一致)、`purity.test.ts`(純粋・tree-shaking)、`provenance.test.ts`(権利の記録) |
| `tools/` | ギャラリー・見た目の方向・測定・golden・適合テストの道具(`pnpm gallery` / `pnpm measure` / `pnpm golden`)。ライブラリの一部ではない |
| `goldens/` | 基準の絵(`tools/golden.ts` が作る。手で直さない) |
| `docs/adr/`, `docs/reviews/` | 設計とそのレビュー記録(`docs/reviews/` は最初のレビューで作られる) |
| `PROVENANCE.md` | 部品ごとの出所の記録 |
