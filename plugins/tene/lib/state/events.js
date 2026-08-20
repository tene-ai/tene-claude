/**
 * 이벤트 저널 — D03 §7
 *
 * 한 줄 = 한 이벤트. 부분 쓰기가 그 줄만 손상시킨다.
 * 해시 체인은 MVP 에서 하지 않는다 (01-plan/03 §2.7).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appendLine } from '../util/atomic.js'
import { lineJson, parseJsonSafe } from '../util/json.js'
import { STATE_DIR } from '../util/paths.js'
import { nowIso } from '../util/time.js'
import { sessionId } from './schema.js'

export const EVENT_TYPES = [
  'SprintCreated', 'PhaseTransitioned', 'PhaseForced', 'GateEvaluated',
  'IntentCaptured', 'AcJudged', 'AcStaled', 'GapRecorded', 'WaiverGranted',
  'EvidenceRegistered', 'SprintPaused', 'SprintResumed', 'SprintArchived',
  'StateResynced', 'StateCleaned', 'TaskLinked', 'AgentCompleted',
]

export function eventsPath(root) {
  return join(root, STATE_DIR, 'history', 'events.ndjson')
}

let seqCache = null

function nextSeq(root) {
  if (seqCache !== null) return ++seqCache
  const p = eventsPath(root)
  if (!existsSync(p)) {
    seqCache = 0
    return ++seqCache
  }
  const lines = readFileSync(p, 'utf8').trimEnd().split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const e = parseJsonSafe(lines[i])
    if (e?.seq) {
      seqCache = e.seq
      return ++seqCache
    }
  }
  seqCache = 0
  return ++seqCache
}

export function appendEvent(root, { type, sprint, payload = {} }) {
  try {
    appendLine(eventsPath(root), lineJson({
      seq: nextSeq(root),
      ts: nowIso(),
      type,
      sprint: sprint ?? null,
      by: { kind: 'claude', sessionId: sessionId() },
      payload,
    }), { root })
  } catch {
    // 이벤트 기록 실패가 작업을 막지 않는다
  }
}

/** 손상된 줄은 건너뛰고 경고한다 — D12 §4.3 */
export function readEvents(root, { limit = 100, sprint = null } = {}) {
  const p = eventsPath(root)
  if (!existsSync(p)) return { events: [], skipped: 0 }
  const lines = readFileSync(p, 'utf8').trimEnd().split('\n').filter(Boolean)
  const events = []
  let skipped = 0
  for (const line of lines.slice(-limit * 2)) {
    const e = parseJsonSafe(line)
    if (!e) { skipped++; continue }
    if (sprint && e.sprint !== sprint) continue
    events.push(e)
  }
  return { events: events.slice(-limit), skipped }
}
