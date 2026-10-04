/**
 * Regenerate docs/DATA_SOURCES.md from the source registry.
 * Run with `pnpm docs:sources` (Node's built-in TypeScript type stripping).
 */
import { writeFileSync } from 'node:fs'
import { SOURCES } from '../src/sources/registry.ts'
import { renderDataSourcesMarkdown } from '../src/sources/registry-doc.ts'

const out = new URL('../docs/DATA_SOURCES.md', import.meta.url)
writeFileSync(out, renderDataSourcesMarkdown(SOURCES))
console.log(`wrote ${out.pathname}`)
