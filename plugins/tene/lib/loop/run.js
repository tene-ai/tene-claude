/**
 * loop-check 실행 — D07 §7
 *
 * 문서를 읽고 → 요구를 뽑고 → 판정하고 → 갭과 미귀속을 낸다.
 * 문서를 쓰지 않는다. 쓰는 것은 스킬의 일이다 (판정과 서술의 분리).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDoc } from '../doc/parser.js'
import { readAnchors } from '../scan/anchors.js'
import { readIndex } from '../scan/index-builder.js'
import { loadRules } from '../scan/layer.js'
import { pluginRoot } from '../util/paths.js'
import { judgeAll } from './judge.js'
import { diffRounds, gateInputs, judgeRound, formatProgress } from './progress.js'
import { extractRequirements } from './requirements.js'
import {
  applyResolutions, changedFiles, detectUnattributed, unresolvedCount, workingChanges,
} from './unattributed.js'

function readDocIfExists(root, rel) {
  if (!rel) return null
  const p = join(root, rel)
  if (!existsSync(p)) return null
  try {
    return parseDoc(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

/** sprint.docs 의 상대 경로를 sprintDir 기준으로 푼다 */
function docPaths(sprint) {
  const base = join(sprint.docsRoot, sprint.sprintDir)
  const d = sprint.docs ?? {}
  return {
    prd: d.prd ? join(base, d.prd) : null,
    plan: d.plan ? join(base, d.plan) : null,
    design: d.design ? join(base, d.design) : null,
  }
}

/** AC → 앵커 파일 목록 (plan:task 판정이 쓴다) */
function anchorFilesByAc(anchors, sprintId) {
  const out = {}
  for (const [key, entry] of Object.entries(anchors?.byAc ?? {})) {
    if (!key.startsWith(`${sprintId}:`)) continue
    const acId = key.slice(sprintId.length + 1)
    out[acId] = [...new Set(entry.anchors.map((a) => a.file).filter(Boolean))]
  }
  return out
}

/**
 * @param {string} root
 * @param {object} sprint  상태의 sprint 객체
 * @param {{ round?: number, previous?: object[], history?: object[], resolutions?: object[],
 *           includeWorking?: boolean, docsRoot?: string }} [opts]
 */
export function runLoopCheck(root, sprint, opts = {}) {
  const round = opts.round ?? (sprint.counters?.loopChecks ?? 0) + 1
  const maxRounds = sprint.counters?.maxLoopChecks ?? 3

  // ── 입력 수집
  const paths = docPaths(sprint)
  const docs = {
    prd: readDocIfExists(root, paths.prd),
    plan: readDocIfExists(root, paths.plan),
    design: readDocIfExists(root, paths.design),
  }
  const index = readIndex(root)
  const anchors = readAnchors(root)
  const rules = loadRules(root, {
    docsRoot: opts.docsRoot ?? sprint.docsRoot,
    presetPath: join(pluginRoot(), 'templates', 'layers.default.yml'),
  })

  // 커밋된 변경 + 작업 중 변경. 구현 직후 실행하는 것이 보통이라 둘 다 본다.
  const committed = changedFiles(root, sprint.startCommit)
  const working = opts.includeWorking === false ? [] : (workingChanges(root) ?? [])
  const changed = committed === null && !working.length
    ? null
    : [...new Set([...(committed ?? []), ...working])]

  // ── 요구 추출
  const { requirements, bySource, warnings } = extractRequirements(docs)

  // ── 판정
  const ctx = {
    index,
    rules,
    changedFiles: changed ? new Set(changed) : new Set(),
    anchorsByAc: anchorFilesByAc(anchors, sprint.id),
  }
  const { judged, gaps, ...summary } = judgeAll(requirements, ctx, {
    round,
    previous: opts.previous,
  })

  // ── 미귀속 변경
  const un = detectUnattributed({
    root, changed, anchors, index, rules,
    startCommit: sprint.startCommit,
    docsRoot: sprint.docsRoot,
  })
  const unItems = applyResolutions(un.items, opts.resolutions ?? sprint.unattributedResolutions ?? [])
  const unresolved = unresolvedCount(unItems)

  // ── 회차 판정
  const history = opts.history ?? sprint.loopHistory ?? []
  const verdict = judgeRound(
    { blockingGaps: summary.blockingGaps, unattributedUnresolved: unresolved, progress: summary.progress },
    history,
    { round, maxRounds },
  )

  const delta = diffRounds(opts.previous, judged)

  return {
    round,
    maxRounds,
    requirements: { total: requirements.length, bySource, warnings },
    judged,
    gaps,
    summary,
    unattributed: { ...un, items: unItems, unresolved },
    delta,
    verdict,
    gate: gateInputs(summary, unresolved),
    progressText: formatProgress(summary),
    // 인덱스가 없거나 오래되면 판정 전체의 신뢰가 낮다. 숨기지 않는다.
    caveats: buildCaveats({ index, anchors, changed, docs, warnings }),
  }
}

function buildCaveats({ index, anchors, changed, docs, warnings }) {
  const out = [...warnings]
  if (!index) out.push('코드 인덱스가 없어 대부분의 항목이 unverifiable 입니다 (tene-scan build)')
  if (!anchors) out.push('앵커 인덱스가 없어 AC 를 코드에 연결하지 못했습니다')
  if (changed === null) out.push('git 변경 목록을 읽지 못해 미귀속 변경을 확인하지 못했습니다')
  if (index?.unresolved?.length) {
    out.push(`인덱서가 추적하지 못한 지점 ${index.unresolved.length}건이 있습니다 (동적 디스패치·리플렉션)`)
  }
  if (!docs.design) out.push('design.md 가 없어 계층·전이·계약 검증을 건너뛰었습니다')
  return out
}

/** 회차 기록 — sprint 상태에 남겨 다음 회차가 수렴을 판단한다 */
export function historyEntry(result) {
  return {
    round: result.round,
    at: undefined, // 호출자가 채운다 (순수성 유지)
    blockingGaps: result.summary.blockingGaps,
    progress: result.summary.progress,
    unverifiable: result.summary.unverifiableCount,
    unattributed: result.unattributed.unresolved,
    verdict: result.verdict.verdict,
  }
}
