---
name: impl-task
description: manga-face の実装・レビュー指摘の修正・main の取り込みを Sonnet のサブエージェントに渡す。タスク仕様(Issue か PR コメント)を書き、Agent ツール(model sonnet)で走らせ、報告を読む。「実装して」「直させて」「任せて」と言われたとき、実装してよい状態の ADR の段階(U1 など)に着手するとき、レビュー指摘の修正を渡すときに使う。
argument-hint: "[ADR の段階 | PR 番号]"
---

# Sonnet のサブエージェントに実装を渡す(manga-face)

実装者は AGENTS.md と `.agents/skills/implement-task` を読むが、この会話の文脈は知らない。
**仕様だけで作業が閉じるように書く。** 判断が要る点は先に決めて書くか、「決めずに Open questions に書いて止める」と書く。

## 1. 仕様を書く

- 新しい作業: `gh issue create --title "[impl] <要約>" --body-file <file>`。
- 既存 PR への修正・main の取り込み: その PR へのコメント(見出し `## [impl] タスク仕様`)。
  根拠のレビューファイルは PR ブランチにコミット済みのもの(`docs/reviews/prNN-roundK.md`)を指す。

```markdown
## [impl] タスク仕様

### 目的
<1〜2 文。何ができるようになるか>

### 根拠
- ADR: docs/adr/0001-manga-face.md の D3・D4、実装の順の U1(状態: 実装中)
- レビュー: docs/reviews/prNN-roundK.md の M1, m2(修正のとき)

### ブランチ
- base: <main、積み上げなら下のブランチ>
- 新規: `<prefix>/<name>`(base から作る)。PR のタイトル: `<…>(ADR NNNN U1)`、積み上げなら `stacked on #NN` を足す
- 既存 PR: `<branch>` に追加コミット。merge で追従し、force-push しない

### スコープ
- やること: <箇条書き。指摘 ID ごとに 1 行。関数名・ファイル・出力の形まで具体的に>
- やらないこと: <範囲外。次の段階に回すもの>
- 触ってよいファイル: <ファイルかディレクトリ>

### 受け入れ条件
- AGENTS.md の完了の定義
- 足すテスト: <再現テスト。直す前に落ちるもの。入力と期待値まで書く>
- 当てる変異: <落ちるべき変異の例>
- golden: <変わらない / 変わる(理由)>

### 報告
PR 本文に、ADR のどの決定を実装したか、テスト、変異、Open questions。マージはしない。
```

仕様は 1 PR = レビュー 1 回で見られる量(数百行まで)にする。大きければ段階を分ける。

## 2. 走らせる

Agent ツールで、`model: "sonnet"`、`subagent_type: "general-purpose"` のサブエージェントを**バックグラウンドで**起こす。プロンプトは次の形(本体の推測や会話の文脈は足さない):

```text
manga-face(https://github.com/cuzic/manga-face)の実装者として、Issue #NN(または PR #NN の最新の「## [impl] タスク仕様」コメント)をやって。
1. 作業用の clone をスクラッチ領域に作る:
   git clone --reference <共有の checkout>/.git https://github.com/cuzic/manga-face <scratchpad>/impl-<label>
   新しいブランチは base から `git switch -c <branch> origin/<base>`、既存 PR は `gh pr checkout NN`。
   共有の checkout や他の worktree・clone は触らない。
2. その clone の中で AGENTS.md と .agents/skills/implement-task/SKILL.md を読み、その手順で進める。
3. 最後の応答は implement-task の手順 5 の形(status・summary・branch・head_sha・pr_url・checks・mutations・open_questions)。
```

- `<label>` は作業ごとに変える。同じブランチに 2 つ走らせない。同時に走らせるのは 2 つまで。
- 走っている間は待つ(終われば通知が来る)。ポーリングしない。
- 終わった clone は、push 済みを確かめてから消してよい。

## 3. 報告を読む

- `status: done`: `pr_url` の PR があり、head が `head_sha` であることを `gh pr view` で確かめる。
  `checks` に `fail` / `not-run` があれば理由を見る。`mutations` に `NOT CAUGHT` があれば、テストを足す修正の仕様を出す。
  そのあと `review-pr` に回す。
- `status: blocked`: `open_questions` を読む。設計で決められるなら決めて ADR か仕様に書き足し、もう一度走らせる。
  owner が決めることなら AskUserQuestion でまとめて聞く。
- `status: failed` / 報告がない: 環境の問題なら Claude が片付けるか、仕様を直してもう一度走らせる。

## golden

顔にはテキストが無いので、golden(`goldens/*.svg`)はどの機械でも同じバイト列になる。Docker もフォントの固定も要らない。
見た目を変える意図のない PR で CI の `golden (goldens)` が落ちたら、バグとして実装者に戻す。意図した見た目の変更なら、PR 本文に前後の画像と理由が書かれているかを見て、
**owner の承認を取ってから**(見た目の良し悪しは owner が決める)`pnpm golden:write` の結果を受け入れる(実装者が作り直してコミットしてよい)。

## owner の確認点

ADR 0001 D7 の確認点(U0.5 の方向、U2・U3・U4・U6 のギャラリー)は、実装者の PR ではなく owner が決める。確認点の前の単位の PR をマージしたら、
`out/` のギャラリー(舞台の大きさの行を最初に)を owner に見せ、次の単位の Issue に「owner 承認済み」と書いてから実装者に渡す。
