/**
 * R4 / R5 — Understanding Layer 와 6가지 질문 — D10 §4~5
 *
 * **이 둘이 이 제품의 기술부채 방어 본체다.**
 *   R4 는 숲을 본다 — 계층 쏠림과 위반
 *   R5 는 나무를 본다 — 심볼 하나하나의 연결
 *
 * 둘 중 하나만 있으면 방어가 반쪽이 된다. 계층만 보면 개별 심볼의 단절을 놓치고,
 * 6질문만 보면 전체 구조의 쏠림을 놓친다.
 */
import { LAYERS, LAYER_INFO } from '../qa/layers.js'
import { answerMany, renderQuestionsTable } from '../scan/questions.js'

const LAYER_TITLE = {
  interface: 'Interface (Entry Point)',
  'business-logic': 'Business Logic (Processing rules)',
  persistence: 'Persistence (Data)',
  infrastructure: 'Infrastructure (Runtime)',
}

const FOUR = ['interface', 'business-logic', 'persistence', 'infrastructure']

/**
 * R4 — 변경된 파일을 계층별로 묶는다.
 *
 * **네 계층을 모두 낸다.** 비어 있으면 "해당 없음" 으로 적는다 —
 * 빈칸은 "이 계층에서 일한 게 없다" 와 "이 계층을 생각 안 했다" 를 구분하지 못한다.
 */
export function buildLayerReport(changes) {
  const byLayer = Object.fromEntries([...FOUR, 'test', 'unclassified'].map((l) => [l, []]))

  for (const r of changes.rows ?? []) {
    const key = byLayer[r.layer] ? r.layer : 'unclassified'
    byLayer[key].push(r)
  }

  const counts = Object.fromEntries(Object.entries(byLayer).map(([k, v]) => [k, v.length]))
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return {
    byLayer,
    counts,
    total,
    empty: FOUR.filter((l) => !byLayer[l].length),
    // 쏠림은 판단이 필요한 사실이지 결함이 아니다. 숫자만 내고 해석은 사람이 한다.
    skew: total ? detectSkew(counts, total) : null,
  }
}

function detectSkew(counts, total) {
  const entries = FOUR.map((l) => [l, counts[l] ?? 0]).filter(([, n]) => n > 0)
  if (entries.length <= 1) return entries.length === 1 ? { layer: entries[0][0], ratio: 1 } : null
  const [top] = entries.sort((a, b) => b[1] - a[1])
  const ratio = top[1] / total
  return ratio >= 0.7 ? { layer: top[0], ratio: Number(ratio.toFixed(2)) } : null
}

export function renderLayerReport(report, { lang = 'ko' } = {}) {
  const lines = []

  for (const layer of FOUR) {
    lines.push(`### ${LAYER_TITLE[layer]}`)
    const rows = report.byLayer[layer]
    if (!rows.length) {
      lines.push('', lang === 'ko' ? '해당 없음' : 'Not applicable', '')
      continue
    }
    lines.push('', lang === 'ko' ? '| 파일 | 변경 | 심볼 |' : '| File | Change | Symbols |', '|---|---|---|')
    for (const r of rows) {
      const syms = r.symbols.length ? r.symbols.map((s) => `${s.name} (${s.status})`).join(', ') : '—'
      lines.push(`| \`${r.path}\` | ${r.change} ${r.diff} | ${syms} |`)
    }
    lines.push('')
  }

  lines.push(lang === 'ko' ? '### 미분류' : '### Unclassified')
  const un = report.byLayer.unclassified
  if (!un.length) {
    lines.push('', lang === 'ko' ? '해당 없음' : 'None')
  } else {
    lines.push('', lang === 'ko'
      ? '계층 규칙에 걸리지 않은 파일입니다. 추측으로 배정하지 않았습니다.'
      : 'Files no layer rule matched. Not assigned by guesswork.', '')
    for (const r of un) lines.push(`- \`${r.path}\``)
  }

  return lines.join('\n')
}

/**
 * R5 — 6가지 질문.
 *
 * 상한을 둔다. 심볼 50개에 6질문을 붙이면 보고서를 아무도 안 읽는다.
 * **잘라낸 사실을 함께 낸다** — 조용히 20개만 보여주면 그게 전부인 줄 안다.
 */
export function buildQuestionsReport(index, symbols, { rules, limit = 20 } = {}) {
  const picked = pickImportant(symbols, limit)
  const result = answerMany(index, picked.map((s) => s.name), { rules, limit })

  return {
    ...result,
    picked: picked.map((s) => s.name),
    // 왜 이것들을 골랐는지 밝힌다
    selectionBasis: '신규 심볼 → AC 앵커 → 수정된 심볼 순',
    omittedCount: Math.max(0, symbols.length - picked.length),
  }
}

/** 신규 > 앵커된 것 > 수정된 것 순으로 고른다 */
function pickImportant(symbols, limit) {
  const score = (s) => (s.status === 'added' ? 3 : 0) + (s.anchored ? 2 : 0) + (s.status === 'modified' ? 1 : 0)
  return [...symbols].sort((a, b) => score(b) - score(a)).slice(0, limit)
}

export function renderQuestionsReport(report, { lang = 'ko' } = {}) {
  const lines = []

  if (!report.results.length) {
    return lang === 'ko'
      ? '변경된 심볼이 없어 6질문을 만들지 못했습니다.'
      : 'No changed symbols to answer for.'
  }

  for (const r of report.results) {
    lines.push(renderQuestionsTable(r, { lang }), '')
  }

  if (report.omittedCount) {
    lines.push(lang === 'ko'
      ? `> 심볼 ${report.omittedCount}개는 지면 관계로 생략했습니다 (선정 기준: ${report.selectionBasis}). 전체는 \`tene-scan questions\` 로 볼 수 있습니다.`
      : `> ${report.omittedCount} symbols omitted. See \`tene-scan questions\` for all.`)
  }

  if (report.incomplete?.length) {
    lines.push('', lang === 'ko'
      ? `> ⚠️ 답하지 못한 질문이 있는 심볼: ${report.incomplete.map((i) => i.symbol).join(', ')}`
      : `> ⚠️ Symbols with unanswered questions: ${report.incomplete.map((i) => i.symbol).join(', ')}`)
  }
  return lines.join('\n')
}

/**
 * R5 에서 드러난 것 — 이것이 6질문의 목적이다.
 *
 * 표를 채우는 것이 목적이 아니라, 채우다 발견되는 것이 목적이다.
 */
export function findRevelations(questionsReport, violations = []) {
  const out = []

  for (const r of questionsReport.results ?? []) {
    if (r.answers?.q2?.ambiguous) {
      out.push({
        kind: 'ambiguous_definition',
        symbol: r.symbol,
        detail: `정의가 ${r.answers.q2.answer.length}곳에 있습니다: ${r.answers.q2.answer.join(', ')}`,
      })
    }
    if (r.answers?.q4?.orphanCandidate) {
      out.push({ kind: 'orphan', symbol: r.symbol, detail: '호출하는 곳이 없습니다' })
    }
    if (r.unanswered?.includes('q6')) {
      out.push({ kind: 'unknown_effect', symbol: r.symbol, detail: '반환·변경 데이터를 확인하지 못했습니다' })
    }
    if (r.caveats?.length) {
      out.push({ kind: 'untraceable', symbol: r.symbol, detail: r.caveats.join(', ') })
    }
  }

  for (const v of violations) {
    out.push({ kind: 'layer_violation', symbol: v.file, detail: `${v.detail} (${v.kind})`, severity: v.severity })
  }
  return out
}

export function renderRevelations(revelations, { lang = 'ko' } = {}) {
  if (!revelations.length) {
    return lang === 'ko'
      ? '드러난 문제가 없습니다. (설계에 없던 경로·orphan·계층 위반을 각각 확인했습니다)'
      : 'Nothing surfaced.'
  }
  const KIND = {
    ambiguous_definition: '정의 모호',
    orphan: 'orphan',
    unknown_effect: '영향 불명',
    untraceable: '추적 불가',
    layer_violation: '계층 위반',
  }
  return revelations.map((r) => `- **${KIND[r.kind] ?? r.kind}** \`${r.symbol}\` — ${r.detail}`).join('\n')
}
