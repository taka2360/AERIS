---
paths:
  - 'src/sources/**'
---

# データソースアダプタ

- 1 ソース 1 ディレクトリ。`fetch → Zod 検証 → domain 変換` の順。取得は `../http` を使う。単発 fetch のアダプタは `fetchSourceResult`(取得→検証→build→`SourceResult`。`retrievedAt` は 1 回だけ読む)、それ以外は `fetchValidated`。ページング・複数 API 合成・座標丸めはアダプタ側に残す
- 例外を投げず `SourceResult` を返す。失敗は `SourceError`(retryable を正しく設定)
- 新規・変更のソースは `registry.ts` に契約(ライセンス・出典・再配布・役割・鮮度・ポーリング)を必ず登録。`registry.ts` はランタイム import を持たない(Node から直接読まれる)
- 再配布条件が未確認のソースは `NOT AVAILABLE` とし、勝手に使わない
- フィクスチャは実レスポンスから最小限に切り出して `fixtures/` に置く(prettier 対象外)
- 値の出自(`Provenance`)・`TemporalRole`・`Derivation` を混ぜない。数値予報は MODEL として表示
- テストはフィクスチャで行い、実ネットワークに触れない
