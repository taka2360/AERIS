// PostToolUse hook: run Prettier on the file Claude just edited so that
// `pnpm format:check` (part of CI) never fails on formatting alone.
import { execFileSync } from 'node:child_process'

let input = ''
for await (const chunk of process.stdin) input += chunk

const file = JSON.parse(input || '{}').tool_input?.file_path
if (file && /\.(tsx?|css|json|md|html|ya?ml)$/.test(file)) {
  try {
    execFileSync(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['exec', 'prettier', '--write', '--ignore-unknown', file],
      {
        stdio: 'ignore',
      },
    )
  } catch {
    // Unparsable file or ignored path — leave it to lint/typecheck to report.
  }
}
