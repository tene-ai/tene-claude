/**
 * PostToolUse:Edit|Write 훅 — D06 §5.4, D12 §3.4
 *
 * 코드가 바뀌면 그 코드에 걸린 AC 의 판정은 더 이상 유효하지 않다.
 * 이 훅이 그것을 `stale` 로 바꾼다.
 *
 * 지키는 규칙:
 * · **lock 을 잡지 않는다.** 훅은 5초를 기다릴 수 없다.
 * · **인덱스를 다시 만들지 않는다.** 미리 만들어 둔 anchors.json 을 조회만 한다.
 * · **passed 만 바꾼다.** failed/insufficient 는 이미 미통과이므로 가릴 이유가 없다.
 * · 실패하면 조용히 넘어간다. 놓친 stale 은 다음 loop-check/qa 에서 재계산된다.
 */
import { DeadlineExceeded, withDeadline } from '../util/deadline.js'
import { debug } from '../util/log.js'
import { findProjectRoot, isDocOrState, isVaultPath, relativeInProject } from '../util/paths.js'
import { groupBySprint, readAnchors, touched } from '../scan/anchors.js'
import { markStaleNoLock } from '../state/store.js'

const DEADLINE_MS = 150

/** 편집된 파일 경로를 페이로드에서 꺼낸다 */
export function pathsFrom(payload) {
  const input = payload?.tool_input ?? {}
  const out = []
  if (typeof input.file_path === 'string') out.push(input.file_path)
  if (Array.isArray(input.edits)) {
    for (const e of input.edits) if (typeof e?.file_path === 'string') out.push(e.file_path)
  }
  if (Array.isArray(input.file_paths)) out.push(...input.file_paths.filter((x) => typeof x === 'string'))
  return [...new Set(out)]
}

export function run(payload) {
  try {
    return withDeadline(DEADLINE_MS, (check) => {
      const absPaths = pathsFrom(payload)
      if (!absPaths.length) return { exit: 0 }

      const root = findProjectRoot()
      const paths = absPaths
        .map((p) => relativeInProject(p, root))
        .filter(Boolean)
        // 문서와 상태 파일의 편집은 코드 변경이 아니다. 볼트는 애초에 읽지 않는다.
        .filter((p) => !isDocOrState(p) && !isVaultPath(p))
      if (!paths.length) return { exit: 0 }
      check()

      const anchors = readAnchors(root)
      if (!anchors) return { exit: 0 } // 인덱스가 없으면 할 일이 없다
      check()

      const hit = touched(anchors, paths)
      if (!hit.acs.length) {
        // 앵커에 걸리지 않은 변경이다. 여기서 막지 않는다 —
        // 미귀속 변경은 loop-check 가 한꺼번에 다룬다 (D07 §4).
        debug('post-edit: 앵커 없음', paths.join(','))
        return { exit: 0 }
      }
      check()

      const staled = []
      for (const [sprintId, acIds] of Object.entries(groupBySprint(hit.acs))) {
        const cause = paths[0]
        const done = markStaleNoLock(root, sprintId, acIds, cause)
        for (const id of done) staled.push(`${sprintId}:${id}`)
      }

      if (!staled.length) return { exit: 0 } // 이미 passed 가 아니었다
      debug('post-edit: stale', staled.join(','))

      return {
        exit: 0,
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext:
            `[tene] 이 변경으로 수용 기준 ${staled.length}건의 판정이 무효가 되었습니다: ${staled.join(', ')}. ` +
            `다시 검증하려면 /tene:qa 를 실행하세요.`,
        },
      }
    })
  } catch (err) {
    if (!(err instanceof DeadlineExceeded)) debug('post-edit failed:', String(err?.message ?? err))
    return { exit: 0 } // fail-open — 놓친 stale 은 loop-check 가 잡는다
  }
}
