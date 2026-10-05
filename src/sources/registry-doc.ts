/**
 * Renders docs/DATA_SOURCES.md from the source registry so the document can
 * never drift from what the code actually does. Type-only imports keep this
 * loadable by Node directly (scripts/gen-data-sources.ts).
 */
import type { SourceDomain, SourceSpec } from '../domain/source-spec'

const DOMAIN_TITLE: Record<SourceDomain, string> = {
  weather: '気象コア',
  seismic: '地震',
  tsunami: '津波',
  volcano: '火山',
  atmosphere: '大気現象(雷・台風)',
  hydro: '水文・土砂',
  ocean: '海洋',
  environment: '大気環境・雪氷',
  space: '宇宙天気',
  global: '全球イベント',
  map: '地図',
  geocode: '地名・住所',
  internal: '内部',
}

const minutes = (m: number) =>
  m >= 24 * 60 && m % (24 * 60) === 0
    ? `${m / (24 * 60)}d`
    : m >= 60 && m % 60 === 0
      ? `${m / 60}h`
      : `${m}min`

/** Duration in ms for display; 0 means 'not polled'. */
const dur = (v: number) => (v === 0 ? '—' : v < 60_000 ? `${v / 1000}s` : minutes(v / 60_000))

function pollText(s: SourceSpec): string {
  const base = dur(s.poll.nominalMs)
  if (!s.poll.activeMs || !s.poll.activeWhen) return base
  return `${base}(活動時 ${dur(s.poll.activeMs)} / ${s.poll.activeWhen.signal})`
}

export function renderDataSourcesMarkdown(sources: SourceSpec[]): string {
  const lines: string[] = [
    '# データソース契約',
    '',
    '<!-- このファイルは src/sources/registry.ts から生成される。直接編集せず `pnpm docs:sources` を実行すること。 -->',
    '',
    'AERIS が利用する各データソースの利用条件・出典表記・アクセス制約・データの役割。',
    '「役割」は値の性質を示す: `observation`(観測) / `forecast`(予測) / `warning`(警報) / `assessment`(評価) / `aggregation`(集約)。',
    '「導出」は値の作り方: `measured`(実測) / `derived`(派生) / `estimated`(推定) / `modeled`(数値モデル)。',
    '',
  ]
  const domains = [...new Set(sources.map((s) => s.domain))]
  for (const d of domains) {
    lines.push(`## ${DOMAIN_TITLE[d]}`, '')
    for (const s of sources.filter((x) => x.domain === d)) {
      lines.push(`### ${s.label} — \`${s.id}\`${s.status === 'active' ? '' : ` (${s.status})`}`, '')
      lines.push(`| 項目 | 内容 |`, `| --- | --- |`)
      lines.push(`| 提供元 | ${s.owner} |`)
      lines.push(`| エンドポイント | ${s.endpoints.map((e) => `\`${e}\``).join('<br>')} |`)
      lines.push(`| ライセンス | ${s.license} |`)
      lines.push(
        `| 出典表記 | ${s.attribution.url ? `[${s.attribution.text}](${s.attribution.url})` : s.attribution.text} |`,
      )
      lines.push(`| 再配布 | ${s.redistribution} |`)
      lines.push(
        `| アクセス | ${s.cors ? 'ブラウザ直接(CORS 可)' : '中継経由'}${s.apiKey === 'relay-secret' ? '・API キーは中継の Secret' : ''} |`,
      )
      if (s.rateLimit) lines.push(`| 利用制限 | ${s.rateLimit} |`)
      lines.push(
        `| 役割 / 導出 | ${s.sourceRole} / ${s.derivation}(既定の時間区分: ${s.defaultRole}${s.defaultQuality ? `、品質: ${s.defaultQuality}` : ''}) |`,
      )
      lines.push(
        `| 鮮度 | 想定更新 ${minutes(s.freshness.expectedIntervalMin)}・${minutes(s.freshness.staleAfterMin)} 超で STALE |`,
      )
      lines.push(`| 取得間隔 | ${pollText(s)} |`)
      if (s.notes) lines.push(`| 注記 | ${s.notes} |`)
      lines.push('')
    }
  }
  return lines.join('\n')
}
