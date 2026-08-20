/**
 * Stop 훅 — D05 §3.7
 *
 * 세션이 끝나려 할 때 다음 행동을 알린다.
 *
 * **막지 않는다.** 사용자가 그만두려는 것을 훅이 붙잡으면 플러그인을 끄게 된다.
 * 대신 무엇이 미완인지 한 번 말한다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DeadlineExceeded, withDeadline } from '../util/deadline.js'
import { parseJsonSafe } from '../util/json.js'
import { debug } from '../util/log.js'
import { findProjectRoot, STATE_DIR } from '../util/paths.js'

const DEADLINE_MS = 200

export function run() {
  try {
    return withDeadline(DEADLINE_MS, (check) => {
      const root = findProjectRoot()
      const p = join(root, STATE_DIR, 'state', 'current.json')
      if (!existsSync(p)) return { exit: 0 }

      const current = parseJsonSafe(readFileSync(p, 'utf8'))
      if (!current?.activeSprint) return { exit: 0 }
      check()

      const s = current.summary ?? {}
      const lines = []

      // 막힌 것이 있을 때만 말한다. 잘 되고 있으면 조용히 끝낸다.
      if (s.ac?.blockingFailed) {
        lines.push(`[tene] ${current.activeSprint}: blocking 수용 기준 ${s.ac.blockingFailed}건이 미충족입니다.`)
      }
      if (s.ac?.stale) {
        lines.push(`[tene] 코드 변경으로 판정이 무효가 된 기준 ${s.ac.stale}건이 있습니다 — /tene:qa 로 재검증하세요.`)
      }
      if (s.gate?.result === 'fail') {
        lines.push(`[tene] ${s.gate.id} 게이트가 fail 상태입니다.`)
      }
      if (!lines.length) return { exit: 0 }

      if (current.nextAction?.skill) {
        lines.push(`  다음: /tene:${current.nextAction.skill}`)
      }
      debug('stop: 안내', lines.length, '줄')

      return {
        exit: 0,
        hookSpecificOutput: { hookEventName: 'Stop', additionalContext: lines.join('\n') },
      }
    })
  } catch (err) {
    if (!(err instanceof DeadlineExceeded)) debug('stop hook failed:', String(err?.message ?? err))
    return { exit: 0 }
  }
}
