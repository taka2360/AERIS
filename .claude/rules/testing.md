---
paths:
  - '**/*.test.{ts,tsx}'
  - 'tests/**'
---

# テスト

- Vitest(jsdom, globals 有効)。React は Testing Library、HTTP はフィクスチャ(MSW は devDependency に有り)。時刻は固定し `Date.now()` に依存しない
- E2E / VRT は `?mock` + 固定時計 + `nolatency`(`tests/fixtures.ts` 参照)。外部 API を呼ばない
- 実装を通すためにテストを弱めない・スナップショットを無批判に更新しない。失敗は原因を直す
