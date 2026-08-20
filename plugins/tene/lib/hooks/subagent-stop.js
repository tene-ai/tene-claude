/**
 * SubagentStop 훅 — D05 §3.2
 *
 * tene 에이전트가 끝났을 때 이벤트만 남긴다.
 *
 * **산출물을 파싱해 상태에 반영하지 않는다.** 에이전트 반환값은 자연어이고,
 * 그것을 훅이 해석해 상태를 바꾸면 누가 무엇을 근거로 바꿨는지 추적할 수 없다.
 * 상태 반영은 스킬이 명시적으로 한다.
 */
import { DeadlineExceeded, withDeadline } from '../util/deadline.js'
import { debug } from '../util/log.js'
import { findProjectRoot } from '../util/paths.js'
import { appendEvent } from '../state/events.js'
import { readCurrent } from '../state/store.js'

const DEADLINE_MS = 150

export function run(payload) {
  try {
    return withDeadline(DEADLINE_MS, () => {
      // 등록 이름은 `tene:<name>` 이다 (플러그인 네임스페이스가 붙는다).
      // `tene-` 로 검사하면 아무것도 안 걸린다 — 실제로 로드해보고 알았다.
      const agentType = payload?.agent_type ?? payload?.agentType ?? ''
      if (!agentType.startsWith('tene:')) return { exit: 0 }

      const root = findProjectRoot()
      const current = readCurrent(root)
      if (!current?.activeSprint) return { exit: 0 }

      appendEvent(root, {
        type: 'AgentCompleted',
        sprint: current.activeSprint,
        payload: { agent: agentType, phase: current.phase },
      })
      debug('subagent-stop:', agentType)
      return { exit: 0 }
    })
  } catch (err) {
    if (!(err instanceof DeadlineExceeded)) debug('subagent-stop failed:', String(err?.message ?? err))
    return { exit: 0 }
  }
}
