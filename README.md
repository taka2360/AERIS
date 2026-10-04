# AERIS — Atmospheric Monitoring Terminal

現在の大気状態を「監視する」ための気象観測端末風 Web アプリ。日本向け。

## 開発

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # Vitest
pnpm lint && pnpm typecheck
pnpm build        # dist/ を静的ホスティング(Cloudflare Pages 等)へ
```

### データモード

| URL / 環境変数                            | 動作                                        |
| ----------------------------------------- | ------------------------------------------- |
| (既定)                                    | ライブデータ(ブラウザから各公開 API へ直接) |
| `?mock` / `VITE_DATA_MODE=mock`           | シミュレーションデータ                      |
| `?mock&fail=openmeteo,jma-warning`        | 指定ソースを失敗させる(縮退表示の確認)      |
| `?mock&clock=2026-10-04T16:24:00%2B09:00` | 時計を固定                                  |
| `?mock&nolatency`                         | 擬似遅延なし                                |

### E2E / ビジュアルリグレッション

```sh
pnpm e2e          # Playwright E2E(モックデータ・固定時計・外部 API なし)
pnpm vrt          # 390 / 768 / 1280 / 1440 / 1920px のスクリーンショット比較
pnpm vrt:update   # ローカル(OS 別)ベースライン更新
pnpm vrt:linux    # CI 用 Linux ベースラインを Playwright 公式 Docker イメージで生成(Docker 要起動)
```

ベースラインはフォント描画が OS で異なるため `*-win32.png` / `*-linux.png` を分けて保持する。

## アーキテクチャ

```
ui → query (TanStack Query) → services → domain ← sources
                                  ↑
                     providers (mock / live) が sources を束ねる
```

- `src/domain` — 外部 API 非依存のデータモデル。すべての値は出自 (`Provenance`: observation / model / forecast / official) を持つ
- `src/sources/*` — 1 ソース 1 ディレクトリ。fetch → Zod 検証 → domain 変換。例外は投げず `SourceResult` を返す
- `src/services` — 統合ロジック(現在値は AMeDAS 実測優先・項目単位でモデル補完)、ヘルス判定
- `src/ui` — 表示のみ。`sources` の import は ESLint で禁止

## データソース

- 気象庁: アメダス、府県天気予報、警報・注意報(2026-05-28 以降の新形式 `warning/data/r8`)、高解像度降水ナウキャスト
- [Open-Meteo](https://open-meteo.com/) (CC BY 4.0): 数値予報(best match / 日本は JMA MSM・GSM 主体)、英字地名検索。無料枠は非商用前提
- 国土地理院: 逆ジオコーディング、地名検索
- 背景地図(予定): OpenFreeMap / © OpenStreetMap contributors

警報コード表は `src/sources/jma-warning/kinds.ts`(`KIND_DEFINITIONS_VERSION`)。気象庁の制度変更時に要確認。

## プライバシー

- GPS 座標はメモリ上のみ。手動地点は「記憶する」を選んだ場合のみ localStorage に保存
- 外部 API へ送る座標は小数 2 桁(約 1km)に丸める
- 気象データキャッシュは localStorage(丸めた座標をキーに含む)。SYS パネルの `CLEAR LOCAL DATA` で全消去
