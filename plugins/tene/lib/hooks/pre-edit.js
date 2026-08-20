/**
 * PreToolUse:Edit|Write 훅 — D05 §3.6
 *
 * phase 가드. **막지 않고 알린다.**
 *
 * 설계 전에 구현을 시작하는 것은 사용자의 선택일 수 있다 —
 * 급한 수정이나 실험일 수 있고, 그것까지 막으면 플러그인이 방해물이 된다.
 * 다만 그 선택이 무엇을 잃는지는 말한다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DeadlineExceeded, withDeadline } from '../util/deadline.js'
import { parseJsonSafe } from '../util/json.js'
import { debug } from '../util/log.js'
import { findProjectRoot, isDocOrState, isVaultPath, relativeInProject, STATE_DIR } from '../util/paths.js'
import { PHASES } from '../state/schema.js'

const DEADLINE_MS = 100

/** 이 phase 이전의 코드 편집은 근거가 없다 */
const CODE_READY_PHASE = 'design'

export function run(payload) {
  try {
    return withDeadline(DEADLINE_MS, (check) => {
      const file = payload?.tool_input?.file_path
      if (!file) return { exit: 0 }

      const root = findProjectRoot()
      const rel = relativeInProject(file, root)
      if (!rel) return { exit: 0 } // 프로젝트 밖

      // 볼트는 가드가 막는다. 여기서는 문서·상태 편집만 통과시킨다.
      if (isVaultPath(rel)) return { exit: 0 }
      if (isDocOrState(rel)) return { exit: 0 }
      check()

      const p = join(root, STATE_DIR, 'state', 'current.json')
      if (!existsSync(p)) return { exit: 0 }
      const current = parseJsonSafe(readFileSync(p, 'utf8'))
      if (!current?.activeSprint) return { exit: 0 }
      check()

      const idx = PHASES.indexOf(current.phase)
      const ready = PHASES.indexOf(CODE_READY_PHASE)
      if (idx < 0 || idx >= ready) return { exit: 0 }

      debug('pre-edit: phase', current.phase, '에서 코드 편집')
      return {
        exit: 0,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext:
            `[tene] 아직 ${current.phase} 단계인데 코드를 고치고 있습니다. ` +
            `설계 없이 구현하면 loop-check 가 대조할 기준이 없고 QA 가 무엇을 검증할지 모릅니다. ` +
            `계속하려면 그대로 진행하되, 나중에 이 변경은 "미귀속 변경" 으로 잡힙니다.`,
        },
      }
    })
  } catch (err) {
    if (!(err instanceof DeadlineExceeded)) debug('pre-edit failed:', String(err?.message ?? err))
    return { exit: 0 }
  }
}
