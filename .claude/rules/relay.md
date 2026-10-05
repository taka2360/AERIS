---
paths:
  - 'relay/**'
---

# 中継 Worker

- GET のみ・ルート許可リスト・CORS は `ALLOWED_ORIGINS` のみ・IP 単位レート制限・上流のタイムアウトとサイズ上限を維持する
- 上流 API は cron(10 分ごと)だけが叩く。リクエスト処理中に上流を呼ばない
- 秘密情報(`FIRMS_MAP_KEY`)をログ・レスポンス・コードに出さない
- 変更後は `pnpm vitest run relay` と `pnpm typecheck`(`tsconfig.relay.json` を含む)
