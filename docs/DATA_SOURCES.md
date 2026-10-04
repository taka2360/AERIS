# データソース契約

<!-- このファイルは src/sources/registry.ts から生成される。直接編集せず `pnpm docs:sources` を実行すること。 -->

AERIS が利用する各データソースの利用条件・出典表記・アクセス制約・データの役割。
「役割」は値の性質を示す: `observation`(観測) / `forecast`(予測) / `warning`(警報) / `assessment`(評価) / `aggregation`(集約)。
「導出」は値の作り方: `measured`(実測) / `derived`(派生) / `estimated`(推定) / `modeled`(数値モデル)。

## 気象コア

### FORECAST MODEL — `openmeteo`

| 項目 | 内容 |
| --- | --- |
| 提供元 | Open-Meteo |
| エンドポイント | `https://api.open-meteo.com/v1/forecast` |
| ライセンス | CC BY 4.0(無料枠は非商用・1日1万回まで) |
| 出典表記 | [Weather data by Open-Meteo.com](https://open-meteo.com/) |
| 再配布 | 出典明記で可 |
| アクセス | ブラウザ直接(CORS 可) |
| 利用制限 | 10,000 calls/day(非商用) |
| 役割 / 導出 | forecast / modeled(既定の時間区分: forecast) |
| 鮮度 | 想定更新 1h・3h 超で STALE |
| 取得間隔 | 10min |

### AMeDAS OBS — `jma-amedas`

| 項目 | 内容 |
| --- | --- |
| 提供元 | 気象庁 |
| エンドポイント | `https://www.jma.go.jp/bosai/amedas/data/` |
| ライセンス | 気象庁ホームページ利用規約(政府標準利用規約 第2.0版準拠) |
| 出典表記 | [出典：気象庁ホームページ](https://www.jma.go.jp/) |
| 再配布 | 出典明記で複製・加工・再配布可。加工時は加工した旨を明記 |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | observation / measured(既定の時間区分: observed) |
| 鮮度 | 想定更新 10min・40min 超で STALE |
| 取得間隔 | 5min |
| 注記 | bosai JSON は正式 API ではなく、予告なく構造が変わる可能性がある |

### JMA WARNING — `jma-warning`

| 項目 | 内容 |
| --- | --- |
| 提供元 | 気象庁 |
| エンドポイント | `https://www.jma.go.jp/bosai/warning/data/r8/` |
| ライセンス | 気象庁ホームページ利用規約(政府標準利用規約 第2.0版準拠) |
| 出典表記 | [出典：気象庁ホームページ](https://www.jma.go.jp/) |
| 再配布 | 出典明記で複製・加工・再配布可。加工時は加工した旨を明記 |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | warning / measured(既定の時間区分: forecast) |
| 鮮度 | 想定更新 10min・30min 超で STALE |
| 取得間隔 | 3min |
| 注記 | bosai JSON は正式 API ではなく、予告なく構造が変わる可能性がある |

### JMA FORECAST — `jma-forecast`

| 項目 | 内容 |
| --- | --- |
| 提供元 | 気象庁 |
| エンドポイント | `https://www.jma.go.jp/bosai/forecast/data/forecast/` |
| ライセンス | 気象庁ホームページ利用規約(政府標準利用規約 第2.0版準拠) |
| 出典表記 | [出典：気象庁ホームページ](https://www.jma.go.jp/) |
| 再配布 | 出典明記で複製・加工・再配布可。加工時は加工した旨を明記 |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | forecast / modeled(既定の時間区分: forecast) |
| 鮮度 | 想定更新 6h・1d 超で STALE |
| 取得間隔 | 30min |
| 注記 | bosai JSON は正式 API ではなく、予告なく構造が変わる可能性がある |

### RADAR NOWCAST — `jma-nowcast`

| 項目 | 内容 |
| --- | --- |
| 提供元 | 気象庁 |
| エンドポイント | `https://www.jma.go.jp/bosai/jmatile/data/nowc/` |
| ライセンス | 気象庁ホームページ利用規約(政府標準利用規約 第2.0版準拠) |
| 出典表記 | [出典：気象庁ホームページ](https://www.jma.go.jp/) |
| 再配布 | 出典明記で複製・加工・再配布可。加工時は加工した旨を明記 |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | observation / measured(既定の時間区分: nowcast) |
| 鮮度 | 想定更新 5min・20min 超で STALE |
| 取得間隔 | 5min |
| 注記 | 観測フレームは観測、予測フレームはナウキャスト予測。タイルは AERIS 配色に再着色(加工) |

## 地震

### JMA SEISMIC — `jma-quake`

| 項目 | 内容 |
| --- | --- |
| 提供元 | 気象庁 |
| エンドポイント | `https://www.jma.go.jp/bosai/quake/data/list.json` |
| ライセンス | 気象庁ホームページ利用規約(政府標準利用規約 第2.0版準拠) |
| 出典表記 | [出典：気象庁ホームページ](https://www.jma.go.jp/) |
| 再配布 | 出典明記で複製・加工・再配布可。加工時は加工した旨を明記 |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | observation / measured(既定の時間区分: observed、品質: confirmed) |
| 鮮度 | 想定更新 1h・15min 超で STALE |
| 取得間隔 | 2min(活動時 30s / recent-earthquake) |
| 注記 | 震度速報のみの段階は震源未確定(PRELIM)。鮮度は最終確認時刻で判定。bosai JSON は正式 API ではなく、予告なく構造が変わる可能性がある |

### USGS SEISMIC — `usgs-quake`

| 項目 | 内容 |
| --- | --- |
| 提供元 | U.S. Geological Survey |
| エンドポイント | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/` |
| ライセンス | Public domain (U.S. Government) |
| 出典表記 | [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/) |
| 再配布 | 制限なし(出典表記推奨) |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | observation / measured(既定の時間区分: observed) |
| 鮮度 | 想定更新 5min・30min 超で STALE |
| 取得間隔 | 2min |
| 注記 | status=automatic は PRELIM、reviewed は CONFIRMED として扱う |

## 津波

### JMA TSUNAMI — `jma-tsunami`

| 項目 | 内容 |
| --- | --- |
| 提供元 | 気象庁 |
| エンドポイント | `https://www.jma.go.jp/bosai/tsunami/data/list.json`<br>`https://www.jma.go.jp/bosai/common/const/geojson/tsunami.json` |
| ライセンス | 気象庁ホームページ利用規約(政府標準利用規約 第2.0版準拠) |
| 出典表記 | [出典：気象庁ホームページ](https://www.jma.go.jp/) |
| 再配布 | 出典明記で複製・加工・再配布可。加工時は加工した旨を明記 |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | warning / measured(既定の時間区分: forecast) |
| 鮮度 | 想定更新 1h・10min 超で STALE |
| 取得間隔 | 2min(活動時 30s / tsunami-assessment) |
| 注記 | 鮮度はデータ時刻ではなく最終確認時刻で判定(平時は発表がない)。bosai JSON は正式 API ではなく、予告なく構造が変わる可能性がある |

## 火山

### JMA VOLCANO — `jma-volcano`

| 項目 | 内容 |
| --- | --- |
| 提供元 | 気象庁 |
| エンドポイント | `https://www.jma.go.jp/bosai/volcano/const/volcano_list.json`<br>`https://www.jma.go.jp/bosai/volcano/data/warning.json` |
| ライセンス | 気象庁ホームページ利用規約(政府標準利用規約 第2.0版準拠) |
| 出典表記 | [出典：気象庁ホームページ](https://www.jma.go.jp/) |
| 再配布 | 出典明記で複製・加工・再配布可。加工時は加工した旨を明記 |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | warning / measured(既定の時間区分: forecast) |
| 鮮度 | 想定更新 1h・30min 超で STALE |
| 取得間隔 | 10min |
| 注記 | warning.json に載る火山(警報中または最近変更)のみ発表内容を表示。載らない火山のレベルは推定しない。eruption.json(噴火の観測)は構造未確認のため未対応。鮮度は最終確認時刻で判定。bosai JSON は正式 API ではなく、予告なく構造が変わる可能性がある |

## 大気現象(雷・台風)

### LIGHTNING / TORNADO — `jma-thunder` (planned)

| 項目 | 内容 |
| --- | --- |
| 提供元 | 気象庁 |
| エンドポイント | `https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N3.json` |
| ライセンス | 気象庁ホームページ利用規約(政府標準利用規約 第2.0版準拠) |
| 出典表記 | [出典：気象庁ホームページ](https://www.jma.go.jp/) |
| 再配布 | 出典明記で複製・加工・再配布可。加工時は加工した旨を明記 |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | observation / derived(既定の時間区分: nowcast) |
| 鮮度 | 想定更新 10min・25min 超で STALE |
| 取得間隔 | 5min |
| 注記 | 雷活動度(1km 格子・4段階)は雷監視システムからの解析値。個別落雷位置ではない |

### JMA INFORMATION — `jma-information`

| 項目 | 内容 |
| --- | --- |
| 提供元 | 気象庁 |
| エンドポイント | `https://www.jma.go.jp/bosai/information/data/r8/information.json` |
| ライセンス | 気象庁ホームページ利用規約(政府標準利用規約 第2.0版準拠) |
| 出典表記 | [出典：気象庁ホームページ](https://www.jma.go.jp/) |
| 再配布 | 出典明記で複製・加工・再配布可。加工時は加工した旨を明記 |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | warning / measured(既定の時間区分: forecast) |
| 鮮度 | 想定更新 1h・30min 超で STALE |
| 取得間隔 | 5min |
| 注記 | 気象解説情報・顕著な大雨に関する情報など。見出しの現象名で分類(分類はAERIS)。鮮度は最終確認時刻で判定。bosai JSON は正式 API ではなく、予告なく構造が変わる可能性がある |

### JMA TYPHOON — `jma-typhoon`

| 項目 | 内容 |
| --- | --- |
| 提供元 | 気象庁 |
| エンドポイント | `https://www.jma.go.jp/bosai/typhoon/data/` |
| ライセンス | 気象庁ホームページ利用規約(政府標準利用規約 第2.0版準拠) |
| 出典表記 | [出典：気象庁ホームページ](https://www.jma.go.jp/) |
| 再配布 | 出典明記で複製・加工・再配布可。加工時は加工した旨を明記 |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | forecast / measured(既定の時間区分: analysis) |
| 鮮度 | 想定更新 3h・6h 超で STALE |
| 取得間隔 | 10min(活動時 5min / cyclone-active) |
| 注記 | bosai JSON は正式 API ではなく、予告なく構造が変わる可能性がある |

## 水文・土砂

### KIKIKURU — `jma-risk` (planned)

| 項目 | 内容 |
| --- | --- |
| 提供元 | 気象庁 |
| エンドポイント | `https://www.jma.go.jp/bosai/jmatile/data/risk/targetTimes.json` |
| ライセンス | 気象庁ホームページ利用規約(政府標準利用規約 第2.0版準拠) |
| 出典表記 | [出典：気象庁ホームページ](https://www.jma.go.jp/) |
| 再配布 | 出典明記で複製・加工・再配布可。加工時は加工した旨を明記 |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | assessment / derived(既定の時間区分: nowcast) |
| 鮮度 | 想定更新 10min・30min 超で STALE |
| 取得間隔 | 10min |
| 注記 | キキクルは危険度の評価(ASSESSMENT)であり、水位・土壌水分の観測値ではない |

### RIVER DISCHARGE — `openmeteo-flood` (planned)

| 項目 | 内容 |
| --- | --- |
| 提供元 | Open-Meteo / Copernicus GloFAS |
| エンドポイント | `https://flood-api.open-meteo.com/v1/flood` |
| ライセンス | CC BY 4.0(無料枠は非商用・1日1万回まで)。GloFAS は Copernicus 利用条件 |
| 出典表記 | [Open-Meteo.com / Copernicus Emergency Management Service (GloFAS)](https://open-meteo.com/en/docs/flood-api) |
| 再配布 | 出典明記で可 |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | forecast / modeled(既定の時間区分: forecast) |
| 鮮度 | 想定更新 1d・2d 超で STALE |
| 取得間隔 | 1h |
| 注記 | 5km 格子のモデル値。最寄りの河川が正しく選ばれない場合がある(観測値として表示しない) |

### RIVER GAUGE — `relay-hydro` (planned)

| 項目 | 内容 |
| --- | --- |
| 提供元 | 国土交通省 水文水質データベース |
| エンドポイント | `(relay) /hydro` |
| ライセンス | 要確認(実装時に利用規約を確認し、再配信不可なら実装しない) |
| 出典表記 | [国土交通省 水文水質データベース](http://www1.river.go.jp/) |
| 再配布 | 要確認 |
| アクセス | 中継経由 |
| 役割 / 導出 | observation / measured(既定の時間区分: observed) |
| 鮮度 | 想定更新 10min・1h 超で STALE |
| 取得間隔 | 10min |

## 大気環境・雪氷

### SNOW ANALYSIS — `jma-snow` (planned)

| 項目 | 内容 |
| --- | --- |
| 提供元 | 気象庁 |
| エンドポイント | `https://www.jma.go.jp/bosai/jmatile/data/snow/targetTimes.json` |
| ライセンス | 気象庁ホームページ利用規約(政府標準利用規約 第2.0版準拠) |
| 出典表記 | [出典：気象庁ホームページ](https://www.jma.go.jp/) |
| 再配布 | 出典明記で複製・加工・再配布可。加工時は加工した旨を明記 |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | observation / estimated(既定の時間区分: analysis) |
| 鮮度 | 想定更新 1h・3h 超で STALE |
| 取得間隔 | 30min |
| 注記 | 解析積雪深は観測とモデルから推定した面的な値(EST) |

### AIR QUALITY — `openmeteo-air` (planned)

| 項目 | 内容 |
| --- | --- |
| 提供元 | Open-Meteo / Copernicus CAMS |
| エンドポイント | `https://air-quality-api.open-meteo.com/v1/air-quality` |
| ライセンス | CC BY 4.0(無料枠は非商用・1日1万回まで)。CAMS は Copernicus 利用条件 |
| 出典表記 | [Open-Meteo.com / Contains modified Copernicus Atmosphere Monitoring Service information](https://open-meteo.com/en/docs/air-quality-api) |
| 再配布 | 出典明記で可 |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | forecast / modeled(既定の時間区分: forecast) |
| 鮮度 | 想定更新 1h・12h 超で STALE |
| 取得間隔 | 1h |
| 注記 | CAMS モデル値(MODEL)。日本域の花粉データはない |

## 海洋

### MARINE MODEL — `openmeteo-marine` (planned)

| 項目 | 内容 |
| --- | --- |
| 提供元 | Open-Meteo |
| エンドポイント | `https://marine-api.open-meteo.com/v1/marine` |
| ライセンス | CC BY 4.0(無料枠は非商用・1日1万回まで) |
| 出典表記 | [Weather data by Open-Meteo.com](https://open-meteo.com/) |
| 再配布 | 出典明記で可 |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | forecast / modeled(既定の時間区分: forecast) |
| 鮮度 | 想定更新 1h・6h 超で STALE |
| 取得間隔 | 1h |
| 注記 | 波浪・SST・海流はモデル値。沿岸域では精度が限られる |

### TIDE GAUGE — `noaa-tides` (planned)

| 項目 | 内容 |
| --- | --- |
| 提供元 | NOAA CO-OPS |
| エンドポイント | `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter` |
| ライセンス | Public domain (U.S. Government) |
| 出典表記 | [NOAA Tides & Currents](https://tidesandcurrents.noaa.gov/) |
| 再配布 | 制限なし |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | observation / measured(既定の時間区分: observed、品質: preliminary) |
| 鮮度 | 想定更新 6min・1h 超で STALE |
| 取得間隔 | 10min |
| 注記 | 米国管理の検潮所のみ(太平洋の一部を含む)。リアルタイム値は暫定 |

## 宇宙天気

### NOAA SWPC — `swpc` (planned)

| 項目 | 内容 |
| --- | --- |
| 提供元 | NOAA Space Weather Prediction Center |
| エンドポイント | `https://services.swpc.noaa.gov/json/`<br>`https://services.swpc.noaa.gov/products/` |
| ライセンス | Public domain (U.S. Government) |
| 出典表記 | [NOAA SWPC](https://www.swpc.noaa.gov/) |
| 再配布 | 制限なし |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | observation / measured(既定の時間区分: observed) |
| 鮮度 | 想定更新 1min・20min 超で STALE |
| 取得間隔 | 5min(活動時 1min / geomagnetic) |
| 注記 | 太陽風・IMF・X線は観測、OVATION オーロラは予測モデル、G/S/R スケールは評価 |

## 全球イベント

### NASA EONET — `eonet` (planned)

| 項目 | 内容 |
| --- | --- |
| 提供元 | NASA Earth Observatory |
| エンドポイント | `https://eonet.gsfc.nasa.gov/api/v3/events` |
| ライセンス | NASA open data |
| 出典表記 | [NASA EONET](https://eonet.gsfc.nasa.gov/) |
| 再配布 | 制限なし(出典表記推奨) |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | aggregation / derived(既定の時間区分: observed) |
| 鮮度 | 想定更新 1h・6h 超で STALE |
| 取得間隔 | 15min |
| 注記 | 自然現象の追跡カタログ(集約)。影響評価ではない |

### GDACS — `gdacs` (planned)

| 項目 | 内容 |
| --- | --- |
| 提供元 | GDACS (UN OCHA / European Commission JRC) |
| エンドポイント | `https://www.gdacs.org/gdacsapi/api/events/geteventlist/` |
| ライセンス | GDACS 利用条件(出典明記で利用可) |
| 出典表記 | [GDACS](https://www.gdacs.org/) |
| 再配布 | 出典明記で可 |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | assessment / derived(既定の時間区分: observed) |
| 鮮度 | 想定更新 1h・6h 超で STALE |
| 取得間隔 | 15min |
| 注記 | Green/Orange/Red は人的影響の評価(ASSESSMENT) |

### NASA FIRMS — `relay-firms` (planned)

| 項目 | 内容 |
| --- | --- |
| 提供元 | NASA FIRMS (LANCE) |
| エンドポイント | `(relay) /firms` |
| ライセンス | NASA open data |
| 出典表記 | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) |
| 再配布 | 制限なし(出典表記推奨) |
| アクセス | 中継経由・API キーは中継の Secret |
| 利用制限 | MAP_KEY あたり 10分 5,000 transactions(中継 cron で上限を固定) |
| 役割 / 導出 | observation / measured(既定の時間区分: observed、品質: preliminary) |
| 鮮度 | 想定更新 30min・6h 超で STALE |
| 取得間隔 | 10min |
| 注記 | 衛星による熱異常の検出(1検出=1観測)。火災イベントは AERIS がクラスタ化した派生 |

### NOAA NHC — `relay-nhc` (planned)

| 項目 | 内容 |
| --- | --- |
| 提供元 | NOAA National Hurricane Center |
| エンドポイント | `(relay) /nhc` |
| ライセンス | Public domain (U.S. Government) |
| 出典表記 | [NOAA NHC](https://www.nhc.noaa.gov/) |
| 再配布 | 制限なし |
| アクセス | 中継経由 |
| 役割 / 導出 | forecast / measured(既定の時間区分: analysis) |
| 鮮度 | 想定更新 3h・8h 超で STALE |
| 取得間隔 | 15min |

## 地図

### BASEMAP — `basemap`

| 項目 | 内容 |
| --- | --- |
| 提供元 | OpenFreeMap / OpenStreetMap |
| エンドポイント | `https://tiles.openfreemap.org/planet` |
| ライセンス | ODbL (OpenStreetMap) / OpenMapTiles |
| 出典表記 | OpenFreeMap © OpenMapTiles © OpenStreetMap contributors |
| 再配布 | ODbL に従う |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | observation / measured(既定の時間区分: observed) |
| 鮮度 | 想定更新 7d・30d 超で STALE |
| 取得間隔 | — |

## 地名・住所

### GSI GEOCODER — `gsi-geocoder`

| 項目 | 内容 |
| --- | --- |
| 提供元 | 国土地理院 |
| エンドポイント | `https://mreversegeocoder.gsi.go.jp/`<br>`https://msearch.gsi.go.jp/` |
| ライセンス | 国土地理院コンテンツ利用規約(政府標準利用規約準拠) |
| 出典表記 | [国土地理院](https://www.gsi.go.jp/) |
| 再配布 | 出典明記で可 |
| アクセス | ブラウザ直接(CORS 可) |
| 役割 / 導出 | observation / measured(既定の時間区分: observed) |
| 鮮度 | 想定更新 1d・365d 超で STALE |
| 取得間隔 | — |
