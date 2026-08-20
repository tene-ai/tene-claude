/**
 * 크기 관리와 정리 — D03 §9
 *
 * 두 가지를 **물리적으로 분리**한다.
 *   checkSize()  — stat 만 한다. 파싱하지 않는다. SessionEnd(1.5초 예산)에서 부른다.
 *   clean()      — 실제로 파일을 옮긴다. SessionEnd 에서 절대 부르지 않는다.
 *
 * SessionEnd 에서 정리하면 세션이 종료되는 순간 파일이 반쯤 옮겨진다.
 * 그래서 SessionEnd 는 needsCleanup 플래그만 남기고, 정리는 다음 SessionStart 나
 * /tene:clear 가 한다.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { appendLine, writeAtomic } from '../util/atomic.js'
import { parseJsonSafe } from '../util/json.js'
import { toProjectRelative } from '../util/paths.js'
import { nowIso } from '../util/time.js'
import { appendEvent, eventsPath } from './events.js'
import { paths, readCurrent, writeCurrent } from './store.js'

/** D03 §9.1 상한 */
export const LIMITS = {
  eventsLines: 5000,
  eventsBytes: 256 * 1024,
  activeSprints: 50,
  symbolsBytes: 20 * 1024 * 1024,
  carryOver: 200,
}

function sizeOf(path) {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

/**
 * stat 만으로 초과 여부를 본다. 파일을 읽지 않는다.
 * 줄 수는 바이트로 추정한다 — 정확한 줄 수를 세려면 파일을 읽어야 하고,
 * 그건 이 함수가 하지 않기로 한 일이다.
 *
 * @returns {{ needsCleanup: boolean, reasons: Array<{target:string, detail:string}> }}
 */
export function checkSize(root) {
  const reasons = []

  const ev = sizeOf(eventsPath(root))
  if (ev > LIMITS.eventsBytes) {
    reasons.push({ target: 'events', detail: `${Math.round(ev / 1024)}KB > ${LIMITS.eventsBytes / 1024}KB` })
  }

  const symbols = sizeOf(join(paths.indexDir(root), 'symbols.json'))
  if (symbols > LIMITS.symbolsBytes) {
    reasons.push({ target: 'index', detail: `symbols.json ${Math.round(symbols / 1048576)}MB > 20MB` })
  }

  // sprint 개수는 readdir 한 번이면 되고 파싱은 없다
  try {
    const n = readdirSync(paths.sprintsDir(root)).filter((f) => f.endsWith('.json')).length
    if (n > LIMITS.activeSprints) {
      reasons.push({ target: 'sprints', detail: `${n}개 > ${LIMITS.activeSprints}개` })
    }
  } catch {
    /* 디렉토리가 없으면 초과도 없다 */
  }

  return { needsCleanup: reasons.length > 0, reasons }
}

/** SessionEnd 가 부른다. 플래그만 남긴다. */
export function markNeedsCleanup(root) {
  const check = checkSize(root)
  if (!check.needsCleanup) return check
  try {
    const current = readCurrent(root)
    if (!current) return check
    current.needsCleanup = { at: nowIso(), reasons: check.reasons }
    writeCurrent(root, current)
  } catch {
    /* 세션 종료 경로다. 실패해도 조용히 넘어간다. */
  }
  return check
}

export function clearNeedsCleanup(root) {
  try {
    const current = readCurrent(root)
    if (!current?.needsCleanup) return
    delete current.needsCleanup
    writeCurrent(root, current)
  } catch {
    /* 무시 */
  }
}

/** YYYY-MM — 아카이브 디렉토리 이름 */
function archiveMonth(iso = nowIso()) {
  return iso.slice(0, 7)
}

/**
 * 이벤트 로그의 오래된 절반을 아카이브로 옮긴다.
 * 잘라내는 것이 아니라 **옮긴다** — 삭제는 하지 않는다.
 */
export function compactEvents(root, { dryRun = false } = {}) {
  const p = eventsPath(root)
  if (!existsSync(p)) return { moved: 0, kept: 0, to: null }

  const lines = readFileSync(p, 'utf8').split('\n').filter(Boolean)
  const overLines = lines.length > LIMITS.eventsLines
  const overBytes = sizeOf(p) > LIMITS.eventsBytes
  if (!overLines && !overBytes) return { moved: 0, kept: lines.length, to: null }

  const cut = Math.floor(lines.length / 2)
  const old = lines.slice(0, cut)
  const keep = lines.slice(cut)

  const dir = join(paths.archiveDir(root), archiveMonth())
  const dest = join(dir, 'events.ndjson')
  if (dryRun) return { moved: old.length, kept: keep.length, to: toProjectRelative(dest, root), dryRun: true }

  mkdirSync(dir, { recursive: true })
  for (const line of old) appendLine(dest, line, { root })
  // 아카이브 쓰기가 끝난 뒤에 원본을 줄인다. 순서가 반대면 중간에 죽을 때 이벤트가 사라진다.
  writeAtomic(p, `${keep.join('\n')}\n`, { root })

  appendEvent(root, { type: 'StateCleaned', payload: { target: 'events', moved: old.length } })
  return { moved: old.length, kept: keep.length, to: toProjectRelative(dest, root) }
}

/** archived sprint 파일을 아카이브 디렉토리로 옮긴다 */
export function archiveOldSprints(root, { dryRun = false, keepRecent = 10 } = {}) {
  const dir = paths.sprintsDir(root)
  if (!existsSync(dir)) return { moved: [] }

  const archived = []
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const raw = parseJsonSafe(readFileSync(join(dir, f), 'utf8'))
    if (raw?.status === 'archived') archived.push({ file: f, at: raw.archivedAt ?? '', id: raw.id })
  }
  archived.sort((a, b) => String(b.at).localeCompare(String(a.at)))
  const targets = archived.slice(keepRecent) // 최근 것은 남긴다 — R1(이전 sprint 연결)이 읽는다

  if (dryRun) return { moved: targets.map((t) => t.id), dryRun: true }

  const destDir = join(paths.archiveDir(root), archiveMonth(), 'sprints')
  mkdirSync(destDir, { recursive: true })
  for (const t of targets) renameSync(join(dir, t.file), join(destDir, t.file))

  if (targets.length) {
    appendEvent(root, { type: 'StateCleaned', payload: { target: 'sprints', moved: targets.length } })
  }
  return { moved: targets.map((t) => t.id), to: toProjectRelative(destDir, root) }
}

/** 격리 파일(.corrupt-*, .bak-*) 중 오래된 것을 지운다 — 명시 요청에서만 */
export function pruneQuarantine(root, { dryRun = false, olderThanDays = 30 } = {}) {
  const cutoff = Date.now() - olderThanDays * 86400000
  const removed = []
  for (const dir of [paths.stateDir(root), paths.sprintsDir(root)]) {
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir)) {
      if (!/\.(corrupt|bak)-/.test(f)) continue
      const full = join(dir, f)
      let mtime = 0
      try {
        mtime = statSync(full).mtimeMs
      } catch {
        continue
      }
      if (mtime > cutoff) continue
      removed.push(toProjectRelative(full, root))
      if (!dryRun) {
        try {
          unlinkSync(full)
        } catch {
          /* 무시 */
        }
      }
    }
  }
  return { removed, dryRun }
}

/**
 * /tene:clear 의 실행부.
 * 기본은 dry-run 이다 — 상태 삭제는 되돌릴 수 없으므로 먼저 보여준다.
 *
 * @param {{ dryRun?: boolean, history?: boolean, archived?: boolean, quarantine?: boolean }} opts
 */
export function clean(root, opts = {}) {
  const dryRun = opts.dryRun !== false
  const all = !opts.history && !opts.archived && !opts.quarantine
  const result = { dryRun, actions: {} }

  if (all || opts.history) result.actions.events = compactEvents(root, { dryRun })
  if (all || opts.archived) result.actions.sprints = archiveOldSprints(root, { dryRun })
  if (opts.quarantine) result.actions.quarantine = pruneQuarantine(root, { dryRun })

  if (!dryRun) clearNeedsCleanup(root)
  return result
}

/** master-plan 의 resolved carryOver 정리 제안 (자동 삭제하지 않는다) */
export function carryOverPressure(plan) {
  const items = plan?.carryOver ?? []
  const resolved = items.filter((c) => c.status === 'resolved').length
  return {
    total: items.length,
    resolved,
    over: items.length > LIMITS.carryOver,
    suggestion: items.length > LIMITS.carryOver
      ? `이월 항목 ${items.length}개 중 resolved ${resolved}개를 정리할 수 있습니다`
      : null,
  }
}
