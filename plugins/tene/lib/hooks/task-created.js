/**
 * TaskCreated 훅 — D05 §3.6, PRD A5.2
 *
 * 태스크 제목의 `[Phase]` 접두어를 읽어 sprint 상태와 연결한다.
 *
 * **태스크를 만들지도 고치지도 않는다.** 여기서 하는 일은 기록뿐이다.
 * 태스크 구조는 사용자와 모델이 정하고, tene 는 그것을 사이클에 비춰볼 뿐이다.
 * 훅이 태스크를 조작하면 누가 무엇을 만들었는지 추적할 수 없게 된다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DeadlineExceeded, withDeadline } from '../util/deadline.js'
import { parseJsonSafe } from '../util/json.js'
import { debug } from '../util/log.js'
import { findProjectRoot, STATE_DIR } from '../util/paths.js'
import { appendEvent } from '../state/events.js'
import { PHASES } from '../state/schema.js'

const DEADLINE_MS = 150

/** `[QA] AC 검증` → 'qa' — 대소문자와 하이픈 표기를 모두 받는다 */
const PREFIX_RE = /^\s*\[([A-Za-z-]+)\]/

const ALIASES = {
  prd: 'prd', plan: 'plan', design: 'design', do: 'do',
  loopcheck: 'loop-check', 'loop-check': 'loop-check', check: 'loop-check',
  qa: 'qa', report: 'report', archive: 'archived', sprint: null,
}

export function parsePhaseFromTitle(title) {
  const m = String(title ?? '').match(PREFIX_RE)
  if (!m) return null
  const key = m[1].toLowerCase()
  const phase = ALIASES[key]
  return phase && PHASES.includes(phase) ? phase : null
}

/** 제목에서 AC 참조를 뽑는다: "(AC-2)" / "(ac_2, ac_3)" 둘 다 받는다 */
export function parseAcRefs(title) {
  const out = new Set()
  for (const m of String(title ?? '').matchAll(/\bac[-_ ]?(\d+[a-z0-9]*)\b/gi)) out.add(`ac_${m[1].toLowerCase()}`)
  return [...out]
}

export function run(payload) {
  try {
    return withDeadline(DEADLINE_MS, (check) => {
      const title = payload?.task?.title ?? payload?.task?.description ?? ''
      const phase = parsePhaseFromTitle(title)
      if (!phase) return { exit: 0 } // tene 태스크가 아니다. 조용히 지나간다.
      check()

      const root = findProjectRoot()
      const currentPath = join(root, STATE_DIR, 'state', 'current.json')
      if (!existsSync(currentPath)) return { exit: 0 }
      const current = parseJsonSafe(readFileSync(currentPath, 'utf8'))
      if (!current?.activeSprint) return { exit: 0 }
      check()

      const acRefs = parseAcRefs(title)
      appendEvent(root, {
        type: 'TaskLinked',
        sprint: current.activeSprint,
        payload: { taskId: payload?.task?.id ?? null, phase, ac: acRefs },
      })
      debug('task-created:', phase, acRefs.join(','))

      // 현재 phase 보다 앞선 단계의 태스크가 만들어지면 알린다.
      // 막지는 않는다 — 사용자가 미리 계획을 세우는 것일 수도 있다.
      const ahead = PHASES.indexOf(phase) > PHASES.indexOf(current.phase)
      if (!ahead) return { exit: 0 }

      return {
        exit: 0,
        hookSpecificOutput: {
          hookEventName: 'TaskCreated',
          additionalContext:
            `[tene] 이 태스크는 ${phase} 단계인데 현재 sprint 는 ${current.phase} 입니다. ` +
            `순서를 건너뛰면 QA 가 비교할 기준이 없습니다.`,
        },
      }
    })
  } catch (err) {
    if (!(err instanceof DeadlineExceeded)) debug('task-created failed:', String(err?.message ?? err))
    return { exit: 0 } // fail-open
  }
}
