---
name: add-source
description: 新しいデータソース(外部 API)を AERIS に追加する手順。ソースアダプタ・レジストリ・フィクスチャ・テストの追加を依頼されたときに使う。
disable-model-invocation: true
---

追加対象: $ARGUMENTS

1. 既存の近いソース(例: `src/sources/jma-quake/`, `src/sources/usgs-quake/`)を読み、同じ構造にする
2. 利用条件(ライセンス・出典表記・再配布・CORS・API キー要否)を公式資料で確認。再配布不可・条件不明なら実装せず報告する。CORS 非対応/キー必須は `relay/` 経由を提案する
3. `src/sources/<id>/index.ts`: `fetchValidated` + Zod スキーマ + domain 変換。`SourceResult` を返す
4. 実レスポンスを最小限に切り出して `src/sources/<id>/fixtures/` に置く
5. `src/sources/registry.ts` に契約を登録(`SourceId` は `src/domain/model.ts`)し、`pnpm docs:sources` で `docs/DATA_SOURCES.md` を再生成
6. `src/providers/` の mock / live に配線。ポーリング間隔は `src/services/poll-policy.ts`
7. フィクスチャでテストを書く。最後に `/check`
