/**
 * PreCompact / PostCompact 훅 — D05 §3.2
 *
 * 압축은 대화를 요약해 앞부분을 버린다. 그때 sprint 가 무엇이었고 무엇이 막혀 있었는지가
 * 함께 사라진다. 이 훅의 유일한 일은 **그 사실을 압축 뒤에 다시 넣는 것**이다.
 *
 * PreCompact  — 상태를 디스크에 확정한다 (flush). 주입하지 않는다.
 * PostCompact — 세션 시작과 같은 요약을 다시 주입한다.
 *
 * 두 이벤트가 같은 모듈을 쓰는 이유는 읽는 상태가 같기 때문이다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DeadlineExceeded, withDeadline } from '../util/deadline.js'
import { parseJsonSafe } from '../util/json.js'
import { debug } from '../util/log.js'
import { findProjectRoot, STATE_DIR } from '../util/paths.js'
import { buildSessionContext } from '../state/summary.js'

const DEADLINE_MS = 150

/** 압축 뒤 주입은 세션 시작보다 짧게 — 이미 요약된 대화에 덧붙는 것이다 */
const POST_COMPACT_BUDGET = 300

function readIfExists(path) {
  if (!existsSync(path)) return null
  try {
    return parseJsonSafe(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

export function run(payload, event) {
  try {
    return withDeadline(DEADLINE_MS, (check) => {
      const root = findProjectRoot()
      const stateDir = join(root, STATE_DIR, 'state')
      const current = readIfExists(join(stateDir, 'current.json'))
      check()

      if (event === 'pre-compact') return preCompact(current)
      return postCompact(root, current, stateDir, check)
    })
  } catch (err) {
    if (!(err instanceof DeadlineExceeded)) debug('compact hook failed:', String(err?.message ?? err))
    return { exit: 0 } // fail-open
  }
}

/**
 * 상태는 이미 매 조작마다 원자적으로 저장된다 (D12 §3.1).
 * 그래서 여기서 따로 쓸 것이 없다 — 확인만 하고 조용히 지나간다.
 * 훅에서 쓰기를 시도하면 lock 경합만 만든다.
 */
function preCompact(current) {
  debug('pre-compact: active =', current?.activeSprint ?? '(none)')
  return { exit: 0 }
}

function postCompact(root, current, stateDir, check) {
  const plan = current?.activeSprint ? null : readIfExists(join(stateDir, 'master-plan.json'))
  check()

  const ctx = buildSessionContext({ current, plan, budget: POST_COMPACT_BUDGET })
  if (!ctx.text) return { exit: 0 }

  // 압축 직후임을 밝힌다. 그래야 이 문맥이 대화에서 온 것이 아님을 구분할 수 있다.
  const text = `[tene] 대화가 압축되었습니다. 진행 중인 작업 상태를 다시 싣습니다.\n${ctx.text}`
  debug('post-compact:', ctx.kind, ctx.tokens, 'tokens')

  return {
    exit: 0,
    hookSpecificOutput: { hookEventName: 'PostCompact', additionalContext: text },
  }
}
