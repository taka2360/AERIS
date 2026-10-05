---
name: check
description: CI と同じ検査(lint / format / typecheck / test / build)を実行して結果を報告する。コード変更後、コミット前、「確認して」と言われたときに使う。
---

CI(`.github/workflows/ci.yml` の `check` ジョブ)と同じ順で実行し、最初の失敗で止めて原因を直す。

1. `pnpm lint`
2. `pnpm format:check`(失敗したら `pnpm exec prettier --write <該当ファイル>`)
3. `pnpm typecheck`
4. `pnpm test`
5. `pnpm build`

見た目に影響する変更なら追加で `pnpm e2e` と `pnpm vrt` を実行する。
エラーを抑制・テストを弱めて通さない。報告には実行したコマンドと結果(件数・失敗内容)を日本語で含める。
