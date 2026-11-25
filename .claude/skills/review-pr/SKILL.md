---
name: review-pr
description: manga-face の PR(実装者の Sonnet の実装)または ADR を敵対的にレビューし、docs/reviews/prNN-roundK.md(ADR は docs/adr/NNNN-opus-review-roundK.md)を PR ブランチにコミットする。PR のレビュー、レビューのラウンド、収束の判定を頼まれたとき、impl-task の報告が done になったときに使う。
argument-hint: "<PR 番号> <ラウンド K>"
---

# PR / ADR の敵対的レビュー

目的は **Blocker と Major を見つけること**。体裁や好みの指摘を増やすことではない。
Claude 本体はレビューしない。**Opus のサブエージェント(Agent ツール、`model: opus`)に、下の「レビュアーへの指示」を渡す。**
著者(実装者の Sonnet)と別の目で見るため、本体の結論や推測は渡さない(PR 番号・ラウンド・前ラウンドのファイルだけ)。

## レビュアーへの指示(そのまま渡す)

1. **独立したコピーで作業する**: スクラッチ領域に `git clone --reference <共有の checkout の .git> https://github.com/cuzic/manga-face <dir>`、
   `gh pr checkout NN`。レビューする head の SHA(`git rev-parse HEAD`)を控える。共有の checkout や他の worktree を触らない。
   作業中の worktree を `cp -a` しない(git のメタデータを共有して他の作業を壊す)。他のエージェントのプロセスを `pkill` で止めない。
2. **前ラウンドの解消を確かめる**: 指摘ごとに、説明文ではなく挙動で判定する。
3. **壊しにいく**: ADR 0001 の決定ごとに、決定を破る入力を作る。manga-face での重点:
   - 無効な顔(自己交差、あごが頭の円の外、目が顔の外、眉が目に重なる、口があごに届く)を `validate` が見逃す、または有効な顔を拒む(範囲の端・依存する制約の境)
   - 同じパラメータで違うバイト列が出る(Node の版、ブラウザ、オブジェクトの順序、`Math.cos` などの浮動小数の関数、座標の丸め)
   - 乱数: シードの安定(項目を足しても他の値が変わらない)、修復の経路(落ちた群だけが変わる。最後は必ず有効)
   - `loadCharacter`(svg-diagram の `comic()`)が受けない出力、色の文字列の異常(`#1000000` など)、`recolor` が効かない色の混入
   - 見分けやすさ・コントラスト・最小の線幅・キーラインの基準を、ADR の閾値どおりに、手で決めた人物以外(乱数・パレットの両端)でも測る
   - `src/` に `node:*` や副作用が入る、tree-shaking を壊す
   - **権利**: 生成モデルの出力・トレース・参考画像に合わせた形が入っていないか。`PROVENANCE.md` の行があるか
   - golden が理由なく変わる(見た目の意図しない変化)
4. **機械的な検証は結果を読む**: CI の結果を使う。足りないときだけ手で変異を数個当て、テストが落ちるかを見る。
   長く回して待たない。試しや変異はコミットしない。
5. **他の open PR との干渉**: 同じファイル・公開名に触る PR を `gh pr list` で確かめる。

### 重大度

| 等級 | 基準 |
| --- | --- |
| Blocker | 正しい入力で壊れた図・誤った出力を黙って出す、データを失う、安全の穴 |
| Major | 特定の入力で誤った図・誤った位置/メッセージ、ADR の決定に反する、公開の出力の互換を壊す、要の経路にテストが無い(変異が落ちない) |
| Minor | 安全側の過剰な拒否、文書の不一致、テストの穴(振る舞いは正しい) |
| nit | 表現・コメント |

### 出力

`docs/reviews/prNN-roundK.md`(ADR は `docs/adr/NNNN-opus-review-roundK.md`)を英語で書く:

```markdown
# PR #NN review (Opus, round K)

Target: <branch> @ <reviewed head SHA>

## Conclusion
<2-4 sentences. converged: yes/no and why>

## Previous round
<one line per finding: resolved / not resolved, how checked>

## Findings
### M1 (Major): <one sentence>
- Evidence: <repro, file:line, read or ran>
- Fix: <one sentence>

## Verdict
converged: yes/no (Blocker n / Major n / Minor n / nit n)
```

**converged: yes** は Blocker と Major が 0 のとき。

### 届け方

レビューファイルだけを PR ブランチにコミットして push する(メッセージ `docs: PR #NN review round K`)。
push が拒否されたら `git pull --no-rebase origin <branch>` してから push し直す。force-push しない。
最後の応答: 結論、判定、指摘を 1 行ずつ、push したコミットの SHA。

## レビューのあと(Claude 本体)

- converged: no → 指摘 ID を挙げた修正の仕様を PR コメントに書き、`impl-task` で実装者に渡す。直ったら次のラウンド。
- converged: yes で Minor/nit が残る → 直すなら同じく実装者に渡す(再レビューは要らず、CI 通過で可)。そのあと `merge-pr`。
