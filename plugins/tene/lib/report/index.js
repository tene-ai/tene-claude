/**
 * 보고서 조립 — D10
 *
 * R1~R6 중 **기계가 만들 수 있는 부분**만 만든다.
 * 서술(구현 내용, 계층 균형 평가, 회고)은 사람/LLM 이 쓴다 —
 * 기계가 서술까지 하면 diff 를 옮겨 적은 글이 나오고 읽을 가치가 없다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDoc } from '../doc/parser.js'
import { readAnchors } from '../scan/anchors.js'
import { readIndex } from '../scan/index-builder.js'
import { findViolations, loadRules } from '../scan/layer.js'
import { pluginRoot } from '../util/paths.js'
import { buildChanges, changedFileSet, changedSymbolSet, renderChanges } from './changes.js'
import { buildLineage, renderLineage } from './lineage.js'
import { buildIntentMap, findDeviations, renderIntentMap } from './intent-map.js'
import { buildLayerReport, buildQuestionsReport, findRevelations, renderLayerReport, renderQuestionsReport, renderRevelations } from './layers-questions.js'
import { collectCarry, renderCarry, toPromotable } from './carry.js'

function readDoc(root, sprint, rel) {
  if (!rel) return null
  const p = join(root, sprint.docsRoot, sprint.sprintDir, rel)
  if (!existsSync(p)) return null
  try {
    return parseDoc(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

/** 다른 sprint 의 보고서를 읽는다 — R1 이 쓴다 */
function reportReader(root, docsRoot, listDirs) {
  return (sprintId) => {
    const dir = listDirs(sprintId)
    if (!dir) return null
    for (const rel of ['04-report/report.md']) {
      const p = join(dir, rel)
      if (existsSync(p)) {
        try {
          return parseDoc(readFileSync(p, 'utf8'))
        } catch {
          return null
        }
      }
    }
    return null
  }
}

/**
 * @param {string} root
 * @param {object} sprint
 * @param {{ masterPlan?: object, findSprintDir: Function, docsRoot?: string, questionLimit?: number }} ctx
 */
export function buildReport(root, sprint, ctx = {}) {
  const docsRoot = ctx.docsRoot ?? sprint.docsRoot
  const index = readIndex(root)
  const anchors = readAnchors(root)
  const rules = loadRules(root, {
    docsRoot,
    presetPath: join(pluginRoot(), 'templates', 'layers.default.yml'),
  })

  const docs = {
    prd: readDoc(root, sprint, sprint.docs?.prd),
    plan: readDoc(root, sprint, sprint.docs?.plan),
    design: readDoc(root, sprint, sprint.docs?.design),
    qa: readDoc(root, sprint, sprint.docs?.qa),
    loopCheck: (sprint.docs?.loopCheck ?? []).map((rel) => readDoc(root, sprint, rel)).filter(Boolean),
  }
  const lastLoop = docs.loopCheck[docs.loopCheck.length - 1] ?? null

  // R2 먼저 — R1 과 R4 가 이것을 입력으로 쓴다
  const changes = buildChanges(root, sprint, { index, rules })

  const lineage = buildLineage(sprint, ctx.masterPlan, index ?? { symbols: {}, refs: {} }, {
    changedFiles: changedFileSet(changes),
    changedSymbols: changedSymbolSet(changes),
    readReport: ctx.findSprintDir ? reportReader(root, docsRoot, ctx.findSprintDir) : () => null,
  })

  const deviations = lastLoop ? findDeviations(lastLoop) : []
  const intentMap = buildIntentMap(sprint, docs.prd, anchors)

  const layerReport = buildLayerReport(changes)

  const symbols = (changes.rows ?? []).flatMap((r) =>
    r.symbols
      .filter((s) => s.status !== 'removed')
      .map((s) => ({ ...s, anchored: Boolean(anchors?.bySymbol?.[s.name]?.length) })))
  const questions = index
    ? buildQuestionsReport(index, symbols, { rules, limit: ctx.questionLimit ?? 20 })
    : { results: [], omittedCount: symbols.length, incomplete: [], picked: [] }

  const violations = index ? findViolations(index, rules) : []
  const revelations = findRevelations(questions, violations)

  const carry = collectCarry(sprint, docs, { deviations })

  return {
    sprint: sprint.id,
    r1: { data: lineage, markdown: renderLineage(lineage) },
    r2: { data: changes, markdown: renderChanges(changes) },
    r3: { data: { map: intentMap, deviations }, markdown: renderIntentMap(intentMap, deviations) },
    r4: { data: layerReport, markdown: renderLayerReport(layerReport) },
    r5: {
      data: { questions, revelations },
      markdown: renderQuestionsReport(questions),
      revelations: renderRevelations(revelations),
    },
    r6: { data: carry, markdown: renderCarry(carry) },
    summary: buildSummary(sprint, { changes, carry, layerReport, questions }),
    promotable: toPromotable(carry, sprint.id),
    // 보고서를 쓸 수 없는 조건을 미리 알린다
    blockers: buildBlockers({ changes, carry, docs, index }),
  }
}

function buildSummary(sprint, { changes, carry, layerReport, questions }) {
  const ac = sprint.ac ?? []
  return {
    phase: sprint.phase,
    profile: sprint.profile,
    ac: {
      total: ac.length,
      passed: ac.filter((a) => a.verdict === 'passed').length,
      failed: ac.filter((a) => a.verdict === 'failed').length,
      insufficient: ac.filter((a) => a.verdict === 'insufficient').length,
      waived: ac.filter((a) => a.waived).length,
    },
    files: changes.stats?.files ?? 0,
    symbolsAdded: changes.stats?.symbolsAdded ?? 0,
    symbolsRemoved: changes.stats?.symbolsRemoved ?? 0,
    layers: layerReport.counts,
    layerSkew: layerReport.skew,
    carryOver: carry.items.length,
    loopChecks: sprint.counters?.loopChecks ?? 0,
    questionsAnswered: questions.results?.length ?? 0,
  }
}

function buildBlockers({ changes, carry, docs, index }) {
  const out = []
  if (!changes.available) out.push({ id: 'no_changes', detail: changes.hint })
  if (!carry.ok) {
    out.push({
      id: 'carry_no_reason',
      detail: `사유가 없는 이월 항목 ${carry.missingReason.length}건 — G7 이 막습니다`,
      items: carry.missingReason.map((i) => i.title),
    })
  }
  if (!docs.prd) out.push({ id: 'no_prd', detail: 'prd.md 가 없어 R3 를 만들 수 없습니다' })
  if (!index) out.push({ id: 'no_index', detail: '코드 인덱스가 없어 R1/R5 가 비어 있습니다' })
  return out
}

/** 요약 표 (보고서 §0) */
export function renderSummary(summary, { lang = 'ko' } = {}) {
  const rows = [
    ['phase', summary.phase],
    ['profile', summary.profile],
    ['수용 기준', `${summary.ac.total}건 (passed ${summary.ac.passed} / failed ${summary.ac.failed} / 미측정 ${summary.ac.insufficient}${summary.ac.waived ? ` / 예외 ${summary.ac.waived}` : ''})`],
    ['변경 파일', `${summary.files}개`],
    ['심볼', `+${summary.symbolsAdded} / -${summary.symbolsRemoved}`],
    ['loop-check', `${summary.loopChecks}회`],
    ['이월', `${summary.carryOver}건`],
  ]
  if (summary.layerSkew) {
    rows.push(['계층 쏠림', `${summary.layerSkew.layer} ${Math.round(summary.layerSkew.ratio * 100)}%`])
  }
  return [
    lang === 'ko' ? '| 항목 | 값 |' : '| Item | Value |',
    '|---|---|',
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
  ].join('\n')
}

export { collectCarry, toPromotable } from './carry.js'
