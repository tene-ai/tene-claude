/**
 * SessionStart 훅 — D05 §3.3
 *
 * current.json 하나만 읽는다. 활성 sprint 도 master plan 도 없으면 아무것도 주입하지 않는다.
 * "설치했다고 말을 걸지 않는다"가 설계 의도다.
 *
 * 여기서는 store.js 를 쓰지 않는다. store 는 손상 파일을 격리하고 예외를 던지는데,
 * 세션 시작에서 그건 과한 부작용이다 — 읽히지 않으면 조용히 지나가고,
 * 진짜 복구는 사용자가 /tene:status --resync 를 부를 때 한다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { withDeadline, DeadlineExceeded } from '../util/deadline.js'
import { findProjectRoot, STATE_DIR } from '../util/paths.js'
import { parseJsonSafe } from '../util/json.js'
import { buildSessionContext } from '../state/summary.js'
import { debug } from '../util/log.js'

const DEADLINE_MS = 150

function readIfExists(path) {
  if (!existsSync(path)) return null
  try {
    return parseJsonSafe(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

export function run() {
  try {
    return withDeadline(DEADLINE_MS, (check) => {
      const root = findProjectRoot()
      const stateDir = join(root, STATE_DIR, 'state')

      const current = readIfExists(join(stateDir, 'current.json'))
      check()

      // current 가 활성 sprint 를 가지면 master-plan 은 읽지 않는다 — 파일 한 개로 끝난다.
      const plan = current?.activeSprint ? null : readIfExists(join(stateDir, 'master-plan.json'))
      check()

      const ctx = buildSessionContext({ current, plan })
      if (!ctx.text) return { exit: 0 } // 조용함이 기본값이다

      const lines = [ctx.text]

      // 정리 예정이 있으면 한 줄만 덧붙인다. 여기서 정리하지는 않는다 (D03 §9.2).
      if (current?.needsCleanup) {
        const targets = current.needsCleanup.reasons?.map((r) => r.target).join(', ')
        lines.push(`  · 정리 대기: ${targets} — /tene:clear 로 정리할 수 있습니다`)
      }

      debug('session-start:', ctx.kind, ctx.tokens, 'tokens')
      return { exit: 0, stdout: `${lines.join('\n')}\n` }
    })
  } catch (err) {
    if (!(err instanceof DeadlineExceeded)) debug('session-start failed:', String(err?.message ?? err))
    return { exit: 0 } // fail-open
  }
}
