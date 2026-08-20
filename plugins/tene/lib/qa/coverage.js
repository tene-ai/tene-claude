/**
 * 전이 커버리지와 되돌아오는 경로 — D08 §7
 *
 * 분모는 **design.md 화면 전이 표의 행 수**다. mermaid 다이어그램이 아니다 —
 * 표가 정본인 이유는 파싱이 안정적이고 사람이 고치기 쉬워서다.
 *
 * 분모가 설계에서 온다는 것이 중요하다. QA 가 스스로 분모를 정하면
 * 확인한 것만 세어 항상 100% 가 나온다.
 */
import { extractTransitions } from '../doc/extract.js'

export function edgeId(e) {
  return `${e.from}→${e.to}`
}

/**
 * @param {object} design 파싱된 design.md
 * @param {{ cases?: object[] }} evidence
 */
export function computeTransitionCoverage(design, evidence) {
  const edges = design ? extractTransitions(design) : []
  if (!edges.length) {
    return {
      total: 0, measured: 0, percent: null,
      unmeasured: [],
      // 분모가 0 이면 비율을 만들지 않는다. 100% 로 표시하면 거짓말이다.
      note: design
        ? 'design.md 에 화면 전이 표가 없습니다 — 커버리지를 잴 수 없습니다'
        : 'design.md 가 없습니다',
    }
  }

  const measured = new Map() // edgeId → 결과
  for (const c of evidence?.cases ?? []) {
    for (const o of c.observed ?? []) {
      if (typeof o === 'string') continue
      if (o.kind === 'ui-state' && o.edge) measured.set(o.edge, o.result ?? 'observed')
    }
    if (c.edge) measured.set(c.edge, c.result ?? 'observed')
  }

  const unmeasured = edges
    .map((e) => ({ id: edgeId(e), label: `${e.from} → ${e.to}`, trigger: e.trigger, targetAc: e.targetAc }))
    .filter((e) => !measured.has(e.id))

  return {
    total: edges.length,
    measured: measured.size,
    percent: Math.round((measured.size / edges.length) * 100),
    // 측정하지 못한 엣지를 목록으로 낸다. 숫자만 내면 무엇이 빠졌는지 모른다.
    unmeasured,
    byEdge: Object.fromEntries(measured),
  }
}

/**
 * 되돌아오는 경로 — D08 §7.2
 *
 * **설계 엣지에 없어도 검증한다.** 설계에서 가장 자주 빠지는 영역이기 때문이다.
 * 빠졌다는 이유로 검증 대상에서 제외하면, 빠뜨린 것이 영원히 안 보인다.
 */
export const RETURN_PATHS = [
  { id: 'back_preserves_state', label: '뒤로가기 후 상태 보존', when: (ctx) => ctx.hasUxAc },
  { id: 'refresh_recovers', label: '새로고침 후 복구', when: () => true },
  { id: 'duplicate_submit_blocked', label: '중복 제출 방지', when: (ctx) => ctx.hasFormSubmit },
  { id: 'retry_after_failure', label: '실패 후 재시도', when: (ctx) => ctx.hasFailurePath },
]

export function planReturnPaths(ctx) {
  return RETURN_PATHS.filter((p) => p.when(ctx)).map((p) => ({ id: p.id, label: p.label }))
}

/**
 * 되돌아오는 경로 검증 결과를 집계한다.
 * 측정하지 않은 것은 `insufficient` 다 — passed 도 failed 도 아니다.
 */
export function summarizeReturnPaths(planned, results = {}) {
  const rows = planned.map((p) => {
    const r = results[p.id]
    if (!r) return { ...p, result: 'insufficient', reason: '측정하지 않았습니다' }
    return { ...p, result: r.result, reason: r.reason ?? null, evidence: r.evidence ?? null }
  })
  return {
    rows,
    measured: rows.filter((r) => r.result !== 'insufficient').length,
    total: rows.length,
    failed: rows.filter((r) => r.result === 'fail').length,
    insufficient: rows.filter((r) => r.result === 'insufficient').length,
  }
}

/** qa.md 의 UX 흐름 검증 블록 */
export function renderCoverage(cov, returnSummary, { lang = 'ko' } = {}) {
  const lines = []

  lines.push(lang === 'ko' ? '### 전이 커버리지' : '### Transition coverage')
  if (cov.total === 0) {
    lines.push('', `> ⚠️ ${cov.note}`)
  } else {
    lines.push('', `**${cov.measured} / ${cov.total}** (${cov.percent}%)`, '')
    lines.push(lang === 'ko' ? '| 엣지 | 측정 | 결과 |' : '| Edge | Measured | Result |')
    lines.push('|---|---|---|')
    for (const [id, result] of Object.entries(cov.byEdge ?? {})) {
      lines.push(`| ${id} | ✅ | ${result} |`)
    }
    for (const e of cov.unmeasured) {
      lines.push(`| ${e.label} | ⬜ | ${lang === 'ko' ? '미측정' : 'unmeasured'} |`)
    }
  }

  lines.push('', lang === 'ko' ? '### 되돌아오는 경로' : '### Return paths')
  lines.push('', lang === 'ko' ? '| 시나리오 | 결과 | 비고 |' : '| Scenario | Result | Note |')
  lines.push('|---|---|---|')
  for (const r of returnSummary.rows) {
    const mark = { pass: '✅ pass', fail: '❌ fail', insufficient: '⬜ insufficient' }[r.result] ?? r.result
    lines.push(`| ${r.label} | ${mark} | ${r.reason ?? '—'} |`)
  }

  return lines.join('\n')
}

/**
 * 데이터 흐름 교차 판정 — D08 §8.1
 *
 * 정적 확인(코드에 쓰기가 있다)과 동적 확인(실제로 행이 생겼다)을 교차한다.
 * **정적만으로 passed 를 주지 않는다** — 코드에 있다는 것과 실행됐다는 것은 다르다.
 */
export function crossJudgeDataFlow(staticFound, dynamicFound) {
  if (staticFound && dynamicFound) return { result: 'pass', detail: '정적·동적 모두 확인' }
  if (!staticFound && dynamicFound) {
    return { result: 'pass', detail: '동적으로 확인 (정적 추적 실패 — 동적 디스패치 가능성)' }
  }
  if (staticFound && !dynamicFound) {
    return {
      result: 'insufficient',
      detail: '코드에는 있으나 실행 결과를 확인하지 못했습니다',
      reason: '정적 확인만으로는 실제 데이터 변경을 증명할 수 없습니다',
    }
  }
  return { result: 'fail', detail: '정적·동적 모두 확인되지 않음' }
}
