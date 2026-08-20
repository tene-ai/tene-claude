/**
 * 상태 저장소 — D03 §8, D12 §3~5
 *
 * 원자적 쓰기 + advisory lock + 낙관적 잠금.
 * 손상 파일은 격리하고 삭제하지 않는다.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { quarantine, readTextOrNull, writeAtomic } from '../util/atomic.js'
import { parseJsonSafe, stableJson } from '../util/json.js'
import { withLock } from '../util/lock.js'
import { TeneError } from '../util/errors.js'
import { STATE_DIR, toProjectRelative } from '../util/paths.js'
import { nowIso } from '../util/time.js'
import { migrate } from './migrate.js'
import {
  computeAcSummary, findTransition, allowedFrom, GATE_BY_PHASE,
  newCurrent, newMasterPlan, newSprint, nextActionFor, sessionId,
  SPRINT_ID_RE, validateSprintShape,
} from './schema.js'

// ── 경로 ─────────────────────────────────────────────────────────────
export const paths = {
  stateDir: (root) => join(root, STATE_DIR, 'state'),
  current: (root) => join(root, STATE_DIR, 'state', 'current.json'),
  masterPlan: (root) => join(root, STATE_DIR, 'state', 'master-plan.json'),
  sprintsDir: (root) => join(root, STATE_DIR, 'state', 'sprints'),
  sprint: (root, id) => join(root, STATE_DIR, 'state', 'sprints', `${id}.json`),
  indexDir: (root) => join(root, STATE_DIR, 'index'),
  historyDir: (root) => join(root, STATE_DIR, 'history'),
  archiveDir: (root) => join(root, STATE_DIR, 'archive'),
}

const GITIGNORE = `index/
history/
archive/
*.corrupt-*
*.bak-*
.lock
`

export function ensureStateDir(root) {
  const base = join(root, STATE_DIR)
  mkdirSync(paths.sprintsDir(root), { recursive: true })
  mkdirSync(paths.indexDir(root), { recursive: true })
  mkdirSync(paths.historyDir(root), { recursive: true })
  const gi = join(base, '.gitignore')
  if (!existsSync(gi)) writeAtomic(gi, GITIGNORE, { root })
  return base
}

// ── 읽기 ─────────────────────────────────────────────────────────────

/** 손상 시 격리 후 STATE_CORRUPT — D12 §4.1 */
function readJsonOrThrow(path, root, ctx = {}) {
  const raw = readTextOrNull(path)
  if (raw === null) return null
  const parsed = parseJsonSafe(raw)
  if (parsed === null) {
    const backup = quarantine(path)
    throw new TeneError('STATE_CORRUPT', {
      path: toProjectRelative(path, root),
      backup: backup ? toProjectRelative(backup, root) : null,
      ...ctx,
    })
  }
  return parsed
}

export function readCurrent(root) {
  const raw = readJsonOrThrow(paths.current(root), root)
  return raw ? migrate(raw, paths.current(root)) : null
}

export function readSprint(root, id) {
  const p = paths.sprint(root, id)
  const raw = readJsonOrThrow(p, root, { id })
  if (!raw) return null
  const s = migrate(raw, p)
  const shapeErrors = validateSprintShape(s)
  if (shapeErrors.length) {
    const backup = quarantine(p)
    throw new TeneError('STATE_CORRUPT', {
      path: toProjectRelative(p, root),
      backup: backup ? toProjectRelative(backup, root) : null,
      id,
      fields: shapeErrors,
    })
  }
  return s
}

export function readMasterPlan(root) {
  const raw = readJsonOrThrow(paths.masterPlan(root), root)
  return raw ? migrate(raw, paths.masterPlan(root)) : null
}

export function listSprintIds(root) {
  const dir = paths.sprintsDir(root)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort()
}

// ── 쓰기 ─────────────────────────────────────────────────────────────

/**
 * rev 를 올리고 시각을 찍는다.
 *
 * updatedAt 은 초 단위라 같은 초 안의 두 변경을 구분하지 못한다.
 * 낙관적 잠금은 단조 증가 카운터 `rev` 로 한다.
 */
function stamp(obj) {
  obj.rev = (obj.rev ?? 0) + 1
  obj.updatedAt = nowIso()
  obj.updatedBy = { kind: 'claude', sessionId: sessionId() }
  return obj
}

/**
 * @param {{ expectedRev?: number }} [opts] 낙관적 잠금 (rev 비교)
 */
export function writeSprint(root, sprint, opts = {}) {
  const p = paths.sprint(root, sprint.id)
  if (opts.expectedRev !== undefined) {
    const onDisk = parseJsonSafe(readTextOrNull(p) ?? '')
    if (onDisk && (onDisk.rev ?? 0) !== opts.expectedRev) {
      throw new TeneError('STALE_WRITE', {
        expectedRev: opts.expectedRev,
        actualRev: onDisk.rev ?? 0,
        updatedAt: onDisk.updatedAt,
        currentPhase: onDisk.phase,
      })
    }
  }
  ensureStateDir(root)
  writeAtomic(p, stableJson(stamp(sprint)), { root })
  return sprint
}

export function writeCurrent(root, current) {
  ensureStateDir(root)
  writeAtomic(paths.current(root), stableJson(stamp(current)), { root })
  return current
}

export function writeMasterPlan(root, plan) {
  ensureStateDir(root)
  writeAtomic(paths.masterPlan(root), stableJson(stamp(plan)), { root })
  return plan
}

/** sprint 를 current.json 에 반영한다. summary 는 여기서만 계산된다. */
export function syncCurrent(root, sprint, { autoUntil } = {}) {
  const prev = readCurrent(root)
  const current = prev ?? newCurrent({ sprint, docsRoot: sprint.docsRoot, autoUntil })
  current.activeSprint = sprint.id
  current.phase = sprint.phase
  current.status = sprint.status
  current.profile = sprint.profile
  current.sprintDir = sprint.sprintDir
  current.docsRoot = sprint.docsRoot
  if (autoUntil) current.autoUntil = autoUntil

  const acSummary = computeAcSummary(sprint.ac)
  const gateId = GATE_BY_PHASE[sprint.phase]
  const gate = sprint.gates?.[gateId]

  current.summary = {
    gate: gate ? { id: gateId, result: gate.result } : null,
    ac: acSummary,
    coverage: sprint.coverage?.transitions ? { transitions: sprint.coverage.transitions } : null,
    loopChecks: { count: sprint.counters.loopChecks, max: sprint.counters.maxLoopChecks },
    blocking: buildBlocking(sprint),
  }
  current.nextAction = nextActionFor(sprint)
  return writeCurrent(root, current)
}

function buildBlocking(sprint) {
  const out = []
  for (const a of sprint.ac ?? []) {
    if (a.priority !== 'blocking') continue
    if (a.waived) continue // 승인된 예외다. blockingFailed 와 목록이 어긋나면 안 된다.
    if (a.verdict === 'failed' || a.verdict === 'stale') {
      out.push({ kind: 'ac', id: a.id, reason: a.reason ?? `verdict=${a.verdict}` })
    }
  }
  for (const g of sprint.gaps ?? []) {
    if (g.severity === 'blocker' && g.status === 'open') {
      out.push({ kind: 'gap', id: g.id, reason: g.detail ?? '' })
    }
  }
  return out.slice(0, 5) // SessionStart 예산 보호
}

/** 활성 sprint 가 이 id 면 비운다 (archive 용) */
export function clearActiveIfMatches(root, id) {
  const current = readCurrent(root)
  if (!current || current.activeSprint !== id) return current
  current.activeSprint = null
  current.phase = null
  current.summary = null
  current.nextAction = { skill: 'master-plan', reason: '다음 sprint 를 확인하세요', alternatives: [] }
  return writeCurrent(root, current)
}

// ── 고수준 조작 ────────────────────────────────────────────────────────

export async function initSprint(root, { id, slug, title, profile, docsRoot, sprintDir, startCommit, autoUntil, maxLoopChecks }) {
  if (!SPRINT_ID_RE.test(id ?? '')) throw new TeneError('INVALID_ID', { id })
  return withLock(root, async () => {
    if (existsSync(paths.sprint(root, id))) throw new TeneError('SPRINT_EXISTS', { id })
    const sprint = newSprint({ id, slug, title, profile, docsRoot, sprintDir, startCommit })
    if (maxLoopChecks) sprint.counters.maxLoopChecks = maxLoopChecks
    writeSprint(root, sprint)
    if (!readMasterPlan(root)) writeMasterPlan(root, newMasterPlan())
    syncCurrent(root, sprint, { autoUntil })
    return sprint
  })
}

/**
 * phase 전이 — D02 §7
 * @param {{ force?: boolean, gateResult?: object, expectedRev?: number, reason?: string }} opts
 */
export async function advance(root, id, toPhase, opts = {}) {
  return withLock(root, async () => {
    const sprint = readSprint(root, id)
    if (!sprint) throw new TeneError('SPRINT_NOT_FOUND', { id })

    const transition = findTransition(sprint.phase, toPhase)
    if (!transition && !opts.force) {
      throw new TeneError('INVALID_TRANSITION', {
        from: sprint.phase, to: toPhase, allowed: allowedFrom(sprint.phase),
      })
    }

    const gateId = transition?.gate ?? null

    // 게이트를 평가하지 않고 --force 로 넘어간 사실은 반드시 남긴다.
    // 기록이 없으면 나중에 "이 sprint 가 게이트를 통과했는가" 를 답할 수 없다.
    if (gateId && !opts.gateResult && opts.force) {
      sprint.gates[gateId] = {
        result: 'skipped',
        at: nowIso(),
        detail: opts.reason ?? '게이트를 평가하지 않고 건너뜀',
        forced: true,
      }
    }

    if (gateId && opts.gateResult) {
      sprint.gates[gateId] = {
        result: opts.gateResult.result,
        at: nowIso(),
        detail: opts.gateResult.detail ?? null,
        ...(opts.force ? { forced: true } : {}),
      }
      if (opts.gateResult.result === 'fail' && !opts.force) {
        writeSprint(root, sprint, { expectedRev: opts.expectedRev })
        syncCurrent(root, sprint)
        throw new TeneError('GATE_BLOCKED', {
          gate: gateId,
          findings: opts.gateResult.findings ?? [],
        }, opts.gateResult.remediation)
      }
    }

    const from = sprint.phase
    sprint.phase = toPhase
    const archiving = toPhase === 'archived'
    if (archiving) {
      sprint.status = 'archived'
      sprint.archivedAt = nowIso()
    }
    writeSprint(root, sprint, { expectedRev: opts.expectedRev })

    // 아카이브된 sprint 를 활성으로 남기면 SessionStart 가 끝난 작업을 계속 보여주고,
    // 다음 sprint 를 시작할 때 무엇이 활성인지 헷갈린다.
    if (archiving) clearActiveIfMatches(root, sprint.id)
    else syncCurrent(root, sprint)

    return { from, to: toPhase, gate: gateId, forced: !!opts.force, sprint }
  })
}

/** AC 판정 일괄 갱신 */
export async function setAc(root, id, acList) {
  return withLock(root, async () => {
    const sprint = readSprint(root, id)
    if (!sprint) throw new TeneError('SPRINT_NOT_FOUND', { id })
    const byId = new Map(sprint.ac.map((a) => [a.id, a]))
    for (const incoming of acList) {
      const prev = byId.get(incoming.id) ?? {}
      byId.set(incoming.id, { ...prev, ...incoming })
    }
    sprint.ac = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
    writeSprint(root, sprint)
    syncCurrent(root, sprint)
    return sprint.ac
  })
}

export async function setIntents(root, id, intents) {
  return withLock(root, async () => {
    const sprint = readSprint(root, id)
    if (!sprint) throw new TeneError('SPRINT_NOT_FOUND', { id })
    sprint.intents = intents
    writeSprint(root, sprint)
    return sprint.intents
  })
}

/**
 * 문서 경로는 **sprint 디렉토리 기준 상대 경로**다 (`02-design/design.md`).
 * 프로젝트 기준 경로를 넣으면 게이트가 docsRoot/sprintDir 을 한 번 더 붙여
 * 없는 경로를 보게 되고, 문서가 실재하는데도 전부 fail 한다.
 * 조용히 받아 두면 그 실패가 나중에 엉뚱한 곳에서 터진다 — 여기서 막는다.
 */
function assertSprintRelative(sprint, docs) {
  const prefix = `${sprint.docsRoot}/${sprint.sprintDir}/`
  for (const [key, value] of Object.entries(docs)) {
    for (const p of Array.isArray(value) ? value : [value]) {
      if (typeof p !== 'string' || !p) continue
      if (p.startsWith('/') || p.startsWith(prefix) || p.startsWith(`${sprint.docsRoot}/`)) {
        throw new TeneError('BAD_ARGS', { doc: key, got: p, expected: `${prefix}… 를 뗀 나머지` },
          `docs.${key} 는 sprint 디렉토리 기준 상대 경로여야 합니다: "${p.replace(prefix, '')}"`)
      }
    }
  }
}

export async function setDocs(root, id, docs) {
  return withLock(root, async () => {
    const sprint = readSprint(root, id)
    if (!sprint) throw new TeneError('SPRINT_NOT_FOUND', { id })
    assertSprintRelative(sprint, docs)
    sprint.docs = { ...sprint.docs, ...docs }
    writeSprint(root, sprint)
    return sprint.docs
  })
}

export async function setGate(root, id, gateId, result) {
  return withLock(root, async () => {
    const sprint = readSprint(root, id)
    if (!sprint) throw new TeneError('SPRINT_NOT_FOUND', { id })
    sprint.gates[gateId] = { result: result.result, at: nowIso(), detail: result.detail ?? null }
    writeSprint(root, sprint)
    syncCurrent(root, sprint)
    return sprint.gates[gateId]
  })
}

/**
 * 일시 중지 — D02 §1.1 PAUSE
 *
 * pause 는 phase 전이가 아니다. phase 는 그대로 두고 status 만 바꾼다.
 * phase 로 모델링하면 "어디로 돌아가야 하는지" 를 따로 저장해야 하고,
 * 그 값이 어긋나는 순간 복귀할 곳을 잃는다.
 */
export async function pauseSprint(root, id, reason) {
  return withLock(root, async () => {
    const sprint = readSprint(root, id)
    if (!sprint) throw new TeneError('SPRINT_NOT_FOUND', { id })
    if (sprint.status === 'archived') {
      throw new TeneError('INVALID_TRANSITION', { from: 'archived', to: 'paused', allowed: [] })
    }
    sprint.status = 'paused'
    sprint.pausedAt = nowIso()
    sprint.pauseReason = reason ?? null
    writeSprint(root, sprint)
    syncCurrent(root, sprint)
    return sprint
  })
}

export async function resumeSprint(root, id) {
  return withLock(root, async () => {
    const sprint = readSprint(root, id)
    if (!sprint) throw new TeneError('SPRINT_NOT_FOUND', { id })
    if (sprint.status !== 'paused') {
      throw new TeneError('INVALID_TRANSITION', { from: sprint.status, to: 'active', allowed: ['paused → active'] })
    }
    sprint.status = 'active'
    sprint.pausedAt = null
    sprint.pauseReason = null
    writeSprint(root, sprint)
    syncCurrent(root, sprint)
    return sprint
  })
}

/**
 * 예외 승인 — blocking AC 를 사유와 함께 넘긴다.
 *
 * AC 를 지우지 않고 waiver 를 **더한다.** 지우면 무엇을 포기했는지가 사라지고,
 * 보고서의 R6(정책 결정과 이월)에 쓸 근거도 함께 사라진다.
 */
export async function grantWaiver(root, id, { acId, reason, approvedBy }) {
  return withLock(root, async () => {
    const sprint = readSprint(root, id)
    if (!sprint) throw new TeneError('SPRINT_NOT_FOUND', { id })
    if (!reason) throw new TeneError('WAIVER_NO_REASON', { ac: acId })
    const ac = sprint.ac?.find((a) => a.id === acId)
    if (!ac) throw new TeneError('AC_NOT_FOUND', { id: acId })

    sprint.waivers.push({
      ac: acId, reason, approvedBy: approvedBy ?? 'user',
      at: nowIso(), verdictAtWaiver: ac.verdict,
    })
    ac.waived = true
    writeSprint(root, sprint)
    syncCurrent(root, sprint)
    return sprint.waivers
  })
}

export async function addCarryOver(root, id, item) {
  return withLock(root, async () => {
    const sprint = readSprint(root, id)
    if (!sprint) throw new TeneError('SPRINT_NOT_FOUND', { id })
    if (!item.reason) throw new TeneError('DOC_INVALID', { failed: ['reason'] }, '이월 항목에는 사유가 필요합니다')
    sprint.carryOver.push({ status: 'open', raisedAt: nowIso(), ...item })
    writeSprint(root, sprint)
    return sprint.carryOver
  })
}

/**
 * 코드 변경으로 AC 를 stale 로 — D06 §5.4
 * passed 인 것만 바꾼다. failed/insufficient 는 이미 미통과이므로 가리지 않는다.
 * 훅에서 호출하므로 lock 을 잡지 않는다 (D12 §3.4).
 */
export function markStaleNoLock(root, id, acIds, causeFile) {
  try {
    const p = paths.sprint(root, id)
    const raw = parseJsonSafe(readTextOrNull(p) ?? '')
    if (!raw) return []
    const staled = []
    for (const acId of acIds) {
      const ac = raw.ac?.find((a) => a.id === acId)
      if (ac?.verdict === 'passed') {
        ac.verdict = 'stale'
        ac.staledBy = causeFile
        ac.staledAt = nowIso()
        staled.push(acId)
      }
    }
    if (!staled.length) return []
    raw.rev = (raw.rev ?? 0) + 1
    raw.updatedAt = nowIso()
    writeAtomic(p, stableJson(raw), { root })
    return staled
  } catch {
    return [] // 실패해도 조용히. 다음 loop-check/qa 에서 재계산된다.
  }
}

export { computeAcSummary, nextActionFor }
