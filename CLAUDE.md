# AERIS

地球観測端末風 Web アプリ(React 19 + Vite + TanStack Query + MapLibre)と、任意の中継 Cloudflare Worker(`relay/`)。
概要・データモード・アーキテクチャは @README.md、データソース一覧は `docs/DATA_SOURCES.md`(生成物)。

## コマンド(pnpm のみ。npm / yarn は使わない)

- 全検査: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`(CI と同じ。変更後は `/check`)
- 単体テスト 1 件: `pnpm vitest run src/path/to/file.test.ts`(アプリと `relay/` の両方が対象)
- E2E: `pnpm e2e` / VRT: `pnpm vrt`(モック + 固定時計。外部 API は呼ばない)
- `docs/DATA_SOURCES.md` は手編集しない。`src/sources/registry.ts` を変えたら `pnpm docs:sources`

## 依存の向き(ESLint で強制)

`ui → query → services → domain ← sources`。`ui` から `sources` を import しない。`domain` は React・外部 API 非依存。
`query` / `services` も `sources` を import しない(例外は宣言データの `@/sources/registry` のみ)。ソースが述べた内容の正規化済み型は `domain/earth/reports.ts` に置き、アダプタがそれを返す。`providers/` と `main.tsx` は合成ルートで `sources` と `services` の両方を知ってよい。

## 規約(コードから読み取れないもの)

- import は `@/` エイリアス(`src/`)。TypeScript は strict + `noUncheckedIndexedAccess`
- コード内コメントは英語、README / docs / ユーザー向け報告は日本語
- ソースアダプタは例外を投げず `SourceResult` を返す。外部 JSON は必ず Zod で検証する
- 色から値への変換は凡例との完全一致のみ。未知の色は `NOT DECODED`(近似しない)
- 外部 API へ送る座標は小数 2 桁に丸める(プライバシー方針)
- ライブ API を叩くテストを書かない。フィクスチャ(`src/sources/*/fixtures/`)か MSW を使う

## 注意点

- VRT のベースラインは OS 別(`*-win32.png` / `*-linux.png`)。Linux 用は `pnpm vrt:linux`(Docker)で作る。画面を変えたら両方の更新要否を確認
- `relay/wrangler.toml` の `ALLOWED_ORIGINS` / KV id、`FIRMS_MAP_KEY` などの秘密情報を勝手に変更・出力しない。`wrangler deploy` は依頼があるまで実行しない
- コミットは Conventional Commits(`feat(map): …`)。依頼があるまで commit / push しない
