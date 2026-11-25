---
name: implement-task
description: manga-face の [impl] タスク仕様(Issue、または PR の「## [impl] タスク仕様」コメント)を実装して PR を出す手順。タスク仕様を渡されたとき、レビュー指摘(docs/reviews/prNN-roundK.md)を直すとき、PR に main を取り込むときに使う。
---

# タスク仕様を実装する

AGENTS.md の規則(完了の定義・コードの約束・Git の約束)が前提。ここはその順番だけを書く。

## 1. 読む

- 仕様: Issue なら `gh issue view NN`、PR コメントなら `gh pr view NN --comments`(いちばん新しい `## [impl] タスク仕様`)。
- 仕様が指す ADR の節と、その ADR の `*-opus-review-round*.md`。修正のときは `docs/reviews/prNN-roundK.md` の指摘。
- 触るコードと、その周りのテスト(`test/` で関数名を grep する)。`AGENTS.md` の権利の約束と golden のルール。

仕様と ADR とコードが食い違うとき、仕様に無い判断が要るときは、**決めずに止める**(手順 5 の blocked)。

## 2. ブランチ

- 作業は、自分で作ったスクラッチの clone の中で、仕様のブランチに切り替えて行う(`git branch --show-current` で確かめる)。共有の checkout や他の worktree・clone は触らない。
- 既存 PR のブランチなら、始める前に `git pull --no-rebase origin <branch>`。
- main の取り込み: `git merge origin/main`。手で衝突を解いたら、マージコミットのメッセージに「どのファイルを、どう解いたか」を書く。
  `goldens/` の衝突は、両方の変更を取り込んだ上で `pnpm golden:write` で作り直す。

## 3. 実装する

1. `pnpm install --frozen-lockfile`(`node_modules` が無ければ)。
2. **再現テストを先に書き、落ちることを確かめる**(落ちなければ、テストか理解が違う)。
3. 実装する。仕様の「やらないこと」と「触ってよいファイル」を守る。周りの書き方に合わせる。
4. 完了の定義を回す(`pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm golden`)。途中は `node --test test/<file>.test.ts` で絞る。
5. 変異を当てる: 新しいコードの要の 1〜3 か所を手で壊し、テストが落ちることを確かめて、元に戻す(変異はコミットしない)。
6. 見た目(`goldens/` のどれか)が変わるときは、意図した変更だけ `pnpm golden:write` で作り直し、PR 本文に前後の画像と理由を書く。意図しない変化はバグ。部品を足す・変えたら `PROVENANCE.md` の行も。

## 4. コミットと PR

- 小さなコミットに分ける。メッセージは日本語、`feat(area): …(ADR NNNN U1)`。指摘を直すコミットには指摘 ID。
  末尾に、使っているモデルの `Co-Authored-By:`(例: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`)。
- push: 新しいブランチは `git push -u origin <branch>`、既存は `git push origin <branch>`。force-push しない。
- PR: 新しければ `gh pr create --base <仕様のブランチの元。積み上げなら下のブランチ、ほかは main> --title … --body-file …`、既存なら本文を `gh pr edit` で更新。
  本文: 目的と ADR の節、変更の要点、テスト、変異(変えた所 → 落ちたテスト)、golden、指摘 → 修正の表(修正のとき)、Open questions。
- **マージしない。** レビューとマージは Claude が行う。

## 5. 最後の報告

最後の応答は、求められた JSON の形(status・summary・branch・head_sha・pr_url・checks・mutations・open_questions)で返す。

- `done`: push して PR があり、完了の定義を回した(落ちたものがあれば `checks` に正直に書く)。
- `blocked`: 仕様に無い判断で止めた。`open_questions` に、選択肢とそれぞれの影響を書く。途中までの作業は push しておく。
- `failed`: 環境などで進めなかった。`summary` に何が起きたかを書く。
