---
paths:
  - 'src/ui/**'
  - 'src/styles/**'
---

# UI

- 表示のみ。データ取得は `src/query` のフック、型は `@/domain` から。`@/sources/*` は import 禁止
- スタイルは CSS Modules(`*.module.css`)。既存のデザイントークン(`src/styles/tokens.css`)を使い、色や間隔を直書きしない
- レイアウトは 390 / 768 / 1280 / 1440 / 1920px で崩れないこと。見た目を変えたら `pnpm vrt` で差分を確認
- スクラブ中は「その時刻に有効なデータ」だけを表示し、最新値を引き延ばさない。データなしは `NO DATA`
- AERIS 独自の判定は機関の発表と区別して表示する(ルール名を持つ)
