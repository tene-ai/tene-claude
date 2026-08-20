/**
 * PostToolUse:Bash 훅 — D11 §4
 *
 * `.env` 생성을 감지해 대안을 알린다. **차단하지 않는다** —
 * `.env` 는 정당한 용도가 많고, 막으면 마찰만 크다.
 */
import { execFileSync } from 'node:child_process'
import { DeadlineExceeded, withDeadline } from '../util/deadline.js'
import { debug } from '../util/log.js'
import { findProjectRoot } from '../util/paths.js'
import { envAdvice, writeTargetsOf } from '../guard/rules.js'

const DEADLINE_MS = 100

let teneChecked = null

function teneAvailable() {
  if (teneChecked !== null) return teneChecked
  try {
    execFileSync('which', ['tene'], { timeout: 300, stdio: ['ignore', 'ignore', 'ignore'] })
    teneChecked = true
  } catch {
    teneChecked = false
  }
  return teneChecked
}

export function run(payload) {
  try {
    return withDeadline(DEADLINE_MS, () => {
      const command = payload?.tool_input?.command ?? ''
      if (!command) return { exit: 0 }

      const targets = writeTargetsOf(command)
      if (!targets.length) return { exit: 0 }

      const advice = envAdvice(targets, { teneAvailable: teneAvailable() })
      if (!advice) return { exit: 0 }

      debug('post-bash: .env 감지', targets.join(','))
      return {
        exit: 0,
        hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: advice },
      }
    })
  } catch (err) {
    if (!(err instanceof DeadlineExceeded)) debug('post-bash failed:', String(err?.message ?? err))
    return { exit: 0 }
  }
}
