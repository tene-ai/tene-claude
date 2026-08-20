/**
 * UserPromptSubmit 훅 — D05 §5
 *
 * 키워드로 스킬을 **제안**한다. 차단하지 않는다.
 * 사용자가 무시하고 다른 일을 해도 막지 않는다 — 막으면 플러그인을 끄게 된다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DeadlineExceeded, withDeadline } from '../util/deadline.js'
import { parseJsonSafe } from '../util/json.js'
import { debug } from '../util/log.js'
import { findProjectRoot, STATE_DIR } from '../util/paths.js'
import { sessionId } from '../state/schema.js'
import { formatSuggestion, route } from '../router/match.js'

const DEADLINE_MS = 100

export function run(payload) {
  try {
    return withDeadline(DEADLINE_MS, (check) => {
      const prompt = payload?.prompt ?? ''
      if (!prompt) return { exit: 0 }

      // 사용자 설정으로 끌 수 있다
      if (process.env.CLAUDE_PLUGIN_OPTION_AUTO_TRIGGER === 'false') return { exit: 0 }

      const root = findProjectRoot()
      check()

      const p = join(root, STATE_DIR, 'state', 'current.json')
      const current = existsSync(p) ? parseJsonSafe(readFileSync(p, 'utf8')) : null
      check()

      const state = {
        activeSprint: current?.activeSprint ?? null,
        phase: current?.phase ?? null,
      }

      const result = route(prompt, state, { root, sessionId: sessionId() })
      if (!result) return { exit: 0 }

      debug('router:', result.rule, '→', result.skill)
      return {
        exit: 0,
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: formatSuggestion(result, state, { lang: result.lang }),
        },
      }
    })
  } catch (err) {
    if (!(err instanceof DeadlineExceeded)) debug('user-prompt failed:', String(err?.message ?? err))
    return { exit: 0 }
  }
}
