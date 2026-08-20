/**
 * 문서에서 상태 복구 — D03 §10
 *
 * **`lib/state/` 가 아니라 여기 있는 이유** (dogfooding 에서 드러남):
 * 이 모듈은 문서(business-logic)와 상태(persistence)를 **잇는** 조합 로직이다.
 * `lib/state/` 에 두었더니 persistence → business-logic 참조가 되어
 * tene 자신의 계층 검사가 blocker 로 잡았다. 도구가 맞았다.
 *
 * **문서가 정본이다.** 상태 파일이 손상되거나 사라져도 문서만 있으면 복구된다.
 * 반대는 성립하지 않는다 — 그래서 상태를 신뢰할 수 없을 때 항상 이 방향으로 간다.
 *
 * phase 는 **추론**이다. 추론 근거를 함께 돌려주고, 사용자에게 확인을 요청한다.
 * 조용히 맞다고 가정하지 않는다.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { TeneError } from '../util/errors.js'
import { withLock } from '../util/lock.js'
import { nowIso } from '../util/time.js'
import { isPlaceholderOnly, parseDoc } from '../doc/parser.js'
import { extractAc, extractAnchors, extractCarry, extractIntents, extractVerdicts } from '../doc/extract.js'
import { appendEvent } from '../state/events.js'
import { newSprint, SPRINT_ID_RE } from '../state/schema.js'
import { syncCurrent, writeSprint } from '../state/store.js'

/** sprint 폴더 안의 문서 위치 — D03 §1 */
const DOC_LAYOUT = {
  prd: '00-prd/prd.md',
  plan: '01-plan/plan.md',
  design: '02-design/design.md',
  qa: '03-analysis/qa.md',
  report: '04-report/report.md',
}
const LOOP_CHECK_DIR = '03-analysis'
const LOOP_CHECK_RE = /^loop-check-(\d+)\.md$/

/**
 * `<id>-<slug>` 디렉토리를 id 로 찾는다. slug 가 바뀌어도 id 로 찾힌다 (D03 §1.1).
 * `_archive/<YYYY-MM>/` 하위도 본다 — 아카이브된 sprint 도 복구 대상이다.
 */
export function findSprintDir(root, docsRoot, id) {
  const base = join(root, docsRoot)
  const hit = scanDir(base, id)
  if (hit) return { dir: hit, archived: false }

  const archiveBase = join(base, '_archive')
  if (existsSync(archiveBase)) {
    for (const month of safeReaddir(archiveBase)) {
      const found = scanDir(join(archiveBase, month), id)
      if (found) return { dir: found, archived: true }
    }
  }
  return null
}

function scanDir(base, id) {
  for (const name of safeReaddir(base)) {
    if (name === id || name.startsWith(`${id}-`)) return join(base, name)
  }
  return null
}

function safeReaddir(p) {
  try {
    return readdirSync(p)
  } catch {
    return []
  }
}

/** 존재하는 문서만 골라낸다. 없는 것은 null 이다. */
export function detectDocs(sprintDir) {
  const docs = { prd: null, plan: null, design: null, loopCheck: [], qa: null, report: null }
  for (const [key, rel] of Object.entries(DOC_LAYOUT)) {
    const p = join(sprintDir, rel)
    if (existsSync(p)) docs[key] = rel
  }
  const loopDir = join(sprintDir, LOOP_CHECK_DIR)
  docs.loopCheck = safeReaddir(loopDir)
    .filter((f) => LOOP_CHECK_RE.test(f))
    .sort((a, b) => Number(a.match(LOOP_CHECK_RE)[1]) - Number(b.match(LOOP_CHECK_RE)[1]))
    .map((f) => `${LOOP_CHECK_DIR}/${f}`)
  return docs
}

/**
 * D03 §10.1 — 존재하는 문서에서 phase 를 역추론한다.
 *
 * design 이 있으면 `do` 로 본다: 설계가 끝났으면 구현 중이라고 보는 것이
 * 반대(design 에 머물러 있다고 보는 것)보다 틀렸을 때 손해가 작다.
 * design 으로 되돌리는 것은 한 번의 전이지만, 구현을 건너뛴 채 loop-check 로
 * 밀려가면 검증 없이 통과할 수 있다.
 */
export function inferPhase(docs, { reportComplete = false, archived = false } = {}) {
  if (archived) return { phase: 'archived', basis: '_archive/ 하위에 있음' }
  if (docs.report && reportComplete) return { phase: 'report', basis: 'report.md 존재 + R1~R6 완비' }
  if (docs.report) return { phase: 'report', basis: 'report.md 존재 (R1~R6 미완)' }
  if (docs.qa) return { phase: 'qa', basis: 'qa.md 존재' }
  if (docs.loopCheck?.length) return { phase: 'loop-check', basis: `loop-check-${docs.loopCheck.length}.md 존재` }
  if (docs.design) return { phase: 'do', basis: 'design.md 존재 — 구현 중으로 가정' }
  if (docs.plan) return { phase: 'design', basis: 'plan.md 존재' }
  if (docs.prd) return { phase: 'plan', basis: 'prd.md 존재' }
  return { phase: 'draft', basis: '문서 없음' }
}

/** report 의 R1~R6 이 모두 채워졌는가 */
function isReportComplete(reportDoc) {
  if (!reportDoc) return false
  return ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].every((id) => {
    const sec = reportDoc.sections.get(id)
    return sec && !isPlaceholderOnly(sec.body)
  })
}

/**
 * D03 §10.2 — AC 는 세 문서에 흩어져 있다.
 *   prd    : id, statement, priority, method
 *   design : anchors
 *   qa     : verdict, evidence
 *
 * prd 를 기준으로 삼는다. qa 에만 있고 prd 에 없는 AC 는 **버리지 않고** 표시해서 남긴다 —
 * 조용히 사라지면 판정된 기준이 없어진 것을 아무도 모른다.
 */
export function mergeAc({ prd, design, qa }) {
  const base = prd ? extractAc(prd) : []
  const anchors = design ? extractAnchors(design) : {}
  const verdicts = new Map((qa ? extractVerdicts(qa) : []).map((v) => [v.ac, v]))

  const merged = base.map((ac) => {
    const v = verdicts.get(ac.id)
    verdicts.delete(ac.id)
    return {
      id: ac.id,
      statement: ac.statement,
      pattern: ac.pattern,
      priority: ac.priority,
      method: ac.method,
      anchors: anchors[ac.id] ?? ac.anchors ?? [],
      verdict: v?.verdict ?? 'pending',
      evidenceRef: v?.evidence || null,
      reason: v?.reason ?? null,
    }
  })

  // prd 에 없는데 qa 가 판정한 것들
  const orphans = [...verdicts.values()].map((v) => ({
    id: v.ac,
    statement: '(prd.md 에 없음 — 복구 시 발견)',
    pattern: 'unknown',
    priority: v.priority ?? 'blocking',
    method: v.method || 'UNIT',
    anchors: [],
    verdict: v.verdict,
    evidenceRef: v.evidence || null,
    reason: 'prd.md 의 AC 표에 이 id 가 없습니다',
    orphan: true,
  }))

  return { ac: [...merged, ...orphans], orphanIds: orphans.map((o) => o.id) }
}

function readDoc(sprintDir, rel) {
  if (!rel) return null
  try {
    return parseDoc(readFileSync(join(sprintDir, rel), 'utf8'))
  } catch {
    return null
  }
}

/**
 * 문서에서 sprint 상태를 재구성한다.
 *
 * 게이트는 **재판정하지 않는다.** 게이트 판정은 tene-gate 의 일이고,
 * 여기서 흉내내면 두 곳에서 다른 답이 나온다. 복구된 상태의 게이트는 전부 null 이고,
 * 다음 전이 시도에서 진짜 게이트가 판정한다.
 *
 * @param {{ dryRun?: boolean, docsRoot?: string }} [opts]
 */
export async function resync(root, id, opts = {}) {
  if (!SPRINT_ID_RE.test(id ?? '')) throw new TeneError('INVALID_ID', { id })
  const docsRoot = opts.docsRoot ?? 'docs/sprints'

  const found = findSprintDir(root, docsRoot, id)
  if (!found) {
    throw new TeneError('SPRINT_DIR_NOT_FOUND', { id, docsRoot },
      `${docsRoot}/ 아래에 ${id} 로 시작하는 디렉토리가 없습니다`)
  }

  const sprintDirName = found.dir.slice(join(root, docsRoot).length + 1)
  const docs = detectDocs(found.dir)

  const prd = readDoc(found.dir, docs.prd)
  const design = readDoc(found.dir, docs.design)
  const qa = readDoc(found.dir, docs.qa)
  const report = readDoc(found.dir, docs.report)

  const inferred = inferPhase(docs, {
    reportComplete: isReportComplete(report),
    archived: found.archived,
  })
  const { ac, orphanIds } = mergeAc({ prd, design, qa })

  const fm = prd?.tene ?? {}
  const sprint = newSprint({
    id,
    slug: sprintDirName.replace(new RegExp(`^${id}-?`), ''),
    title: fm.title ?? sprintDirName,
    profile: fm.profile ?? 'standard',
    docsRoot,
    sprintDir: sprintDirName,
  })

  sprint.phase = inferred.phase
  sprint.status = found.archived ? 'archived' : 'active'
  if (found.archived) sprint.archivedAt = nowIso()
  sprint.docs = docs
  sprint.intents = prd ? extractIntents(prd) : []
  sprint.ac = ac
  sprint.counters.loopChecks = docs.loopCheck.length
  sprint.carryOver = report ? extractCarry(report).map((c) => ({ status: 'open', ...c })) : []
  sprint.resyncedAt = nowIso()

  const summary = {
    id,
    sprintDir: sprintDirName,
    phase: inferred.phase,
    phaseBasis: inferred.basis,
    docsFound: Object.entries(docs)
      .filter(([, v]) => (Array.isArray(v) ? v.length : v))
      .map(([k]) => k),
    ac: {
      total: ac.length,
      passed: ac.filter((a) => a.verdict === 'passed').length,
      failed: ac.filter((a) => a.verdict === 'failed').length,
      insufficient: ac.filter((a) => a.verdict === 'insufficient').length,
      pending: ac.filter((a) => a.verdict === 'pending').length,
    },
    orphanIds,
    gatesReset: true,
    warnings: buildWarnings({ prd, docs, orphanIds }),
  }

  if (opts.dryRun) return { sprint, summary, applied: false }

  await withLock(root, async () => {
    writeSprint(root, sprint)
    syncCurrent(root, sprint)
  })
  appendEvent(root, {
    type: 'StateResynced',
    sprint: id,
    payload: { recoveredFrom: 'docs', phase: inferred.phase, ac: summary.ac.total, orphans: orphanIds.length },
  })

  return { sprint, summary, applied: true }
}

function buildWarnings({ prd, docs, orphanIds }) {
  const w = []
  if (!prd) w.push('prd.md 가 없어 의도와 AC 를 복구하지 못했습니다')
  if (orphanIds.length) w.push(`qa.md 에만 있는 AC ${orphanIds.length}건: ${orphanIds.join(', ')}`)
  if (docs.qa && !docs.design) w.push('qa.md 는 있는데 design.md 가 없습니다 — 문서 누락 가능성')
  w.push('게이트는 복구하지 않았습니다. 다음 전이에서 다시 판정됩니다')
  return w
}

/** 사용자 확인용 출력 — 추론임을 분명히 말한다 */
export function formatResyncReport(summary) {
  const lines = [
    '[tene] 문서에서 상태를 재구성했습니다.',
    `  추정 phase: ${summary.phase} (${summary.phaseBasis})`,
    `  복구된 AC: ${summary.ac.total}건 (passed ${summary.ac.passed} / failed ${summary.ac.failed} / insufficient ${summary.ac.insufficient} / pending ${summary.ac.pending})`,
    `  발견된 문서: ${summary.docsFound.join(', ') || '없음'}`,
  ]
  for (const warn of summary.warnings) lines.push(`  ⚠ ${warn}`)
  lines.push('이 상태가 맞습니까? 다르면 /tene:sprint phase --to <phase> 로 조정하세요.')
  return lines.join('\n')
}
