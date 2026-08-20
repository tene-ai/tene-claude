/**
 * SessionEnd 훅 — D03 §9.2
 *
 * **크기만 잰다. 정리하지 않는다.**
 *
 * 세션 종료 시점에 파일을 옮기면 종료가 중간에 끊길 때 반쯤 옮겨진 상태가 남는다.
 * 그래서 여기서는 stat 만 하고 `needsCleanup` 플래그를 남긴다.
 * 실제 정리는 다음 SessionStart 이후 사용자가 /tene:clear 를 부를 때 한다.
 */
import { DeadlineExceeded, withDeadline } from '../util/deadline.js'
import { debug } from '../util/log.js'
import { findProjectRoot } from '../util/paths.js'
import { markNeedsCleanup } from '../state/retention.js'

const DEADLINE_MS = 200

export function run(payload) {
  try {
    return withDeadline(DEADLINE_MS, () => {
      const root = findProjectRoot()
      const res = markNeedsCleanup(root)
      debug('session-end:', payload?.reason ?? '(no reason)', 'needsCleanup =', res.needsCleanup)
      return { exit: 0 } // 세션 종료에는 아무것도 주입하지 않는다
    })
  } catch (err) {
    if (!(err instanceof DeadlineExceeded)) debug('session-end failed:', String(err?.message ?? err))
    return { exit: 0 }
  }
}
