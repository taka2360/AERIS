# AERIS — Earth Observation Terminal

いま地球上で起きていることを「観測する」ための端末風 Web アプリ。監視地点の大気に加えて、地震・津波・火山・雷・台風・顕著現象・水文・土砂・海洋・大気環境・雪氷・山火事・宇宙天気・全球の自然現象を、ひとつの観測システムとして表示する。日本を主対象とし、世界の現象も扱う。

## 開発

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # Vitest(アプリ + 中継 Worker)
pnpm lint && pnpm typecheck
pnpm build        # dist/ を静的ホスティング(Cloudflare Pages 等)へ
pnpm docs:sources # docs/DATA_SOURCES.md をソースレジストリから再生成
```

### データモード

| URL / 環境変数                            | 動作                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| (既定)                                    | ライブデータ(ブラウザから各公開 API へ直接。中継対象のみ中継経由)                             |
| `?mock` / `VITE_DATA_MODE=mock`           | シミュレーションデータ                                                                        |
| `?mock&fail=openmeteo,jma-warning`        | 指定ソースを失敗させる(縮退表示の確認)                                                        |
| `?mock&clock=2026-10-04T16:24:00%2B09:00` | 時計を固定                                                                                    |
| `?mock&nolatency`                         | 擬似遅延なし                                                                                  |
| `?mock&scenario=quake`                    | 地球観測シナリオ(`quiet` / `quake` / `tsunami` / `typhoon` / `storm` / `eruption` / `geomag`) |
| `VITE_RELAY_BASE=https://…`               | 中継 Worker の URL(未設定なら FIRMS・NHC は `NOT CONFIGURED`)                                 |

### E2E / ビジュアルリグレッション

```sh
pnpm e2e          # Playwright E2E(モックデータ・固定時計・外部 API なし)
pnpm vrt          # 390 / 768 / 1280 / 1440 / 1920px のスクリーンショット比較
pnpm vrt:update   # ローカル(OS 別)ベースライン更新
pnpm vrt:linux    # CI 用 Linux ベースラインを Playwright 公式 Docker イメージで生成(Docker 要起動)
```

ベースラインはフォント描画が OS で異なるため `*-win32.png` / `*-linux.png` を分けて保持する。

## 画面

| パネル             | 内容                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-01 SPATIAL SCOPE | 地図(LOCAL / REGION / GLOBE)。`LAYERS` メニューでレイヤーを切替(面のレイヤーは同時に1つ)。地図上のイベントをクリックすると引き出し線つきの要約ポップアップ。風の矢印は表示範囲全体に、ズームに応じた間隔で表示(取得済みの点は1時間キャッシュ)。下部は全体の時間スクラバ(中央が現在、過去側は遠いほど速く巻き戻る)。ズームインすると近傍アメダス・注目観測点・観測網の概況がスライドして現れる |
| E-01 EVENT MONITOR | 分野ごとの状態(NOMINAL / ACTIVE / ELEVATED / WARNING / CRITICAL / NO DATA)。**AERIS 独自の判定**で、機関の発表とは別。注意が必要な分野を重い順に行で、平常の分野はタイルで表示                                                                                                                                                                                                                |
| E-02 EVENT LOG     | 全自然現象の一覧。スクラブ中はその時刻までに起きたものだけ                                                                                                                                                                                                                                                                                                                                    |
| E-03 EVENT DETAIL  | 各機関の値を出典つきで並記(例: 気象庁 Mj と USGS Mw)、機関の発表、AERIS の判定とそのルール、ソース間の関連づけの根拠                                                                                                                                                                                                                                                                          |
| N-01 ENVIRONMENT   | 監視地点の 雨→キキクル→河川 の連鎖、大気質、海洋、雪                                                                                                                                                                                                                                                                                                                                          |
| S-03 SPACE WEATHER | 太陽風・IMF・Kp・X 線・NOAA スケール・アラート                                                                                                                                                                                                                                                                                                                                                |
| T-01 24H TIMELINE  | 大気の時系列。`Enter` / ダブルクリックで端末全体をその時刻へ                                                                                                                                                                                                                                                                                                                                  |

時間カーソルを過去や未来に合わせると、黄色の `SCRUB` 帯が出て、全ビューがその時刻の状態を表示する。その時刻に有効なデータがなければ `NO DATA` とし、最新の観測を引き延ばさない。

## アーキテクチャ

```
ui → query (TanStack Query) → services → domain ← sources
                                  ↑
                     providers (mock / live) が sources を束ねる
```

- `src/domain` — 外部 API 非依存のデータモデル。すべての値は出自 (`Provenance`) を持つ
- `src/domain/earth` — 地球観測モデル。意味の違うものを型で分ける
  - `NaturalEvent`(地震・津波・火山・台風・山火事…の判別共用体)、`EnvironmentalField`(雷活動度・降水・積雪・大気質などの連続場)、`HazardAssessment`(津波警報・噴火警報・キキクル・GDACS・NOAA スケールなど機関の評価)
  - 共通軸は混ぜない: `TemporalRole`(観測/ナウキャスト/解析/予測)・`Derivation`(実測/派生/推定/モデル)・`DataQuality`(速報/確定)・`DecodeStatus`(解読可/不可/一部)・`SourceRole`(観測/予測/警報/評価/集約)
  - `derive.ts` / `status.ts` は AERIS 自身の判定で、すべてルール名を持つ
- `src/services/fusion` — `SourceObservation`(各機関の発表そのもの)→ 関連づけ(信頼度と根拠つき、1対1、曖昧なら統合しない)→ 正規化イベント。フィールド単位の優先方針(例: 日本域の震源は気象庁、マグニチュードは全ソース保持)
- `src/sources/*` — 1 ソース 1 ディレクトリ。fetch → Zod 検証 → domain 変換。例外は投げず `SourceResult` を返す
- `src/sources/registry.ts` — ソース契約レジストリ(ライセンス・出典表記・再配布・アクセス・役割・鮮度・ポーリング)。ヘルス判定・取得間隔・出典表示・`docs/DATA_SOURCES.md` がここを読む
- `src/ui` — 表示のみ。`sources` の import は ESLint で禁止
- `relay/` — 中継用の Cloudflare Worker(後述)

気象庁のタイル(降水・雷活動度・竜巻・キキクル・積雪)は偶数ズームにしか画像がないため、奇数ズームは親タイルの該当区画から作る。色から値への変換は凡例の色との完全一致のみで行い、未知の色は `NOT DECODED` とする(近似しない)。

## データソース

一覧と利用条件は [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)(レジストリから生成)。主なもの:

- 気象庁: アメダス、府県予報、警報・注意報(r8)、気象情報、地震、津波、火山、台風、降水・雷・竜巻ナウキャスト、LIDEN(個別の雷)、キキクル、解析積雪深・降雪量
- USGS(地震)、NOAA SWPC(宇宙天気)、NASA EONET(全球イベント)、GDACS(影響評価)
- Open-Meteo: 数値予報、Marine、Air Quality(CAMS)、Flood(GloFAS)— いずれも **MODEL** として表示
- 中継経由: NASA FIRMS(山火事検出)、NOAA NHC(大西洋・東太平洋のハリケーン)
- 国土地理院(地名)、OpenFreeMap / © OpenStreetMap contributors(背景地図)

未対応: 河川水位・ダム(国交省 水文水質DB は再配布条件を確認するまで `NOT AVAILABLE`)、GNSS 変位、検潮所の観測値(NOAA CO-OPS は日本を含まない)、噴火の観測情報(構造未確認)、日本域の花粉。

## 中継 Worker(任意)

CORS 非対応や API キーが必要なソース用。静的フロントとは別の Cloudflare Worker として動かす。

```sh
npx wrangler kv namespace create SNAPSHOTS          # relay/wrangler.toml の id を置き換える
npx wrangler secret put FIRMS_MAP_KEY --config relay/wrangler.toml
npx wrangler deploy --config relay/wrangler.toml
# フロントのビルド時に VITE_RELAY_BASE=https://aeris-relay.<account>.workers.dev
```

- 上流(FIRMS・NHC)は 10 分ごとの cron だけが取得して KV に保存し、リクエストには保存値を返す。FIRMS の MAP_KEY の消費量は利用者数に依存しない
- ルート許可リスト・GET のみ・CORS は `ALLOWED_ORIGINS` のみ・IP 単位のレート制限(Workers Rate Limiting)・上流のタイムアウトとサイズ上限・エラーの正規化
- 中継が無くても他のソースはそのまま動き、該当チャンネルは `STANDBY / NOT CONFIGURED` になる

## プライバシー

- GPS の最終測位は小数 2 桁(約 1km)に丸めて localStorage に保存し、次回起動時の初期地点にする(位置情報の許可が取り消されていれば起動時に破棄)。手動地点は「記憶する」を選んだ場合のみ保存。両方あるときは新しい方を使う
- 外部 API へ送る座標は小数 2 桁(約 1km)に丸める
- 気象データキャッシュは localStorage(丸めた座標をキーに含む)。SYS パネルの `CLEAR LOCAL DATA` で全消去
- 地図の風矢印も取得から 1 時間 localStorage に保持する(地点は地図上の固定格子で、利用者の位置は含まない)。同じく `CLEAR LOCAL DATA` で消去
