/**
 * 세션 복원 요약 — D05 §3.3
 *
 * `current.json` **한 파일**만 읽고 ≤600 토큰을 만든다.
 * 순수 함수다. I/O 는 호출자(훅)가 한다.
 *
 * 줄은 우선순위 내림차순으로 만들고 예산 초과분을 잘라낸다.
 * 잘릴 줄이 뒤에 오도록 배치하는 것이 이 모듈의 전부다 —
 * "차단 사유" 가 잘리고 "문서 경로" 가 남는 일은 없어야 한다.
 */
import { truncateToBudget } from '../util/budget.js'

export const SESSION_BUDGET_TOKENS = 600

const PHASE_LABEL = {
  draft: 'draft', prd: 'prd', plan: 'plan', design: 'design',
  do: 'do', 'loop-check': 'loop-check', qa: 'qa', report: 'report', archived: 'archived',
}

/** 사람이 읽는 게이트 결과 */
function gateLine(gate) {
  if (!gate?.id) return null
  const mark = { pass: 'PASS', fail: 'FAIL', warn: 'WARN', skipped: 'SKIP' }[gate.result] ?? gate.result
  return `  · ${gate.id} ${mark}`
}

function acLine(ac) {
  if (!ac || !ac.total) return null
  // total 은 전체 AC 다. blocking 만 센 숫자가 아니다 — 헷갈리게 쓰면 통과율을 부풀려 읽는다.
  const parts = []
  if (ac.blockingFailed) parts.push(`blocking 미충족 ${ac.blockingFailed}`)
  // 미판정은 "통과도 실패도 아닌 것" 이다. 빼고 세면 passed 0 이
  // "다 떨어졌다" 로도 "아직 안 봤다" 로도 읽혀 구분이 사라진다.
  if (ac.pending) parts.push(`미판정 ${ac.pending}`)
  if (ac.insufficient) parts.push(`미측정 ${ac.insufficient}`)
  if (ac.stale) parts.push(`stale ${ac.stale}`)
  if (!parts.length) parts.push(`passed ${ac.passed}`)
  // waived 는 "통과" 가 아니라 "사유와 함께 넘긴 것" 이다. 항상 따로 보인다.
  if (ac.waived) parts.push(`예외 승인 ${ac.waived}`)
  return `  · AC ${ac.total}건 — ${parts.join(', ')}`
}

function blockingLines(blocking = []) {
  return blocking.slice(0, 3).map((b) => {
    const reason = truncateText(b.reason ?? '', 60)
    return `  · 차단: ${b.id}${b.kind === 'gap' ? ' (gap)' : ''}${reason ? ` — ${reason}` : ''}`
  })
}

function loopLine(loop) {
  if (!loop || !loop.count) return null
  return `  · loop-check ${loop.count}/${loop.max}회`
}

function coverageLine(coverage) {
  const t = coverage?.transitions
  if (!t || t.total == null) return null
  return `  · 전이 커버리지 ${t.covered ?? 0}/${t.total}`
}

function nextLine(nextAction) {
  if (!nextAction) return null
  const cmd = nextAction.skill ? `/tene:${nextAction.skill}` : '구현 계속'
  const alt = nextAction.alternatives?.length ? ` (또는 ${nextAction.alternatives[0]})` : ''
  return `  · 다음: ${cmd}${alt} — ${truncateText(nextAction.reason ?? '', 70)}`
}

function truncateText(s, max) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/**
 * 활성 sprint 요약.
 * @param {object} current   current.json
 * @param {{ budget?: number }} [opts]
 * @returns {{ text: string, tokens: number, truncated: boolean }}
 */
export function formatSummary(current, opts = {}) {
  const budget = opts.budget ?? SESSION_BUDGET_TOKENS
  const s = current?.summary ?? {}

  // 우선순위: 정체성 → 차단 사유 → 다음 행동 → 부가 지표 → 경로
  // 잘려도 되는 것이 뒤로 간다.
  const candidates = [
    { key: 'head', text: `[tene] 진행 중: ${current.activeSprint} (phase: ${PHASE_LABEL[current.phase] ?? current.phase}, profile: ${current.profile})` },
    { key: 'gate', text: gateLine(s.gate) },
    { key: 'ac', text: acLine(s.ac) },
    ...blockingLines(s.blocking).map((text, i) => ({ key: `blocking${i}`, text })),
    { key: 'next', text: nextLine(current.nextAction) },
    { key: 'loop', text: loopLine(s.loopChecks) },
    { key: 'coverage', text: coverageLine(s.coverage) },
    { key: 'docs', text: current.sprintDir ? `  · 문서: ${current.docsRoot}/${current.sprintDir}/` : null },
  ].filter((c) => c.text)

  const { text, tokens } = truncateToBudget(candidates, budget)
  const kept = text ? text.split('\n').length : 0
  return { text, tokens, truncated: kept < candidates.length }
}

/**
 * 활성 sprint 가 없을 때의 추천.
 * @param {object} plan   master-plan.json
 */
export function recommendNext(plan) {
  const sprints = plan?.sprints ?? []
  const done = new Set(sprints.filter((s) => s.status === 'archived').map((s) => s.id))

  const active = sprints.find((s) => s.status === 'active' || s.status === 'paused')
  if (active) return { next: active, reason: 'active', blocked: [] }

  const ready = sprints
    .filter((s) => s.status === 'planned')
    .filter((s) => (s.dependsOn ?? []).every((d) => done.has(d)))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const blockedCarry = (plan?.carryOver ?? []).filter((c) => c.status === 'open')

  if (!ready.length) {
    const waiting = sprints
      .filter((s) => s.status === 'planned')
      .map((s) => ({ id: s.id, missing: (s.dependsOn ?? []).filter((d) => !done.has(d)) }))
    return { next: null, reason: waiting.length ? 'blocked' : 'empty', waiting, blocked: blockedCarry }
  }

  const next = ready[0]
  const satisfied = (next.dependsOn ?? []).filter((d) => done.has(d))
  return { next, reason: 'ready', satisfied, blocked: blockedCarry }
}

export function formatNextSuggestion(rec, opts = {}) {
  const budget = opts.budget ?? SESSION_BUDGET_TOKENS

  if (rec.reason === 'empty') return { text: '', tokens: 0, truncated: false }

  const lines = [{ key: 'head', text: '[tene] 진행 중인 sprint 가 없습니다.' }]

  if (rec.next) {
    const dep = rec.satisfied?.length ? ` (선행 ${rec.satisfied.join(', ')} 완료됨)` : ''
    lines.push({ key: 'next', text: `  · 다음 추천: ${rec.next.id}${dep}` })
    lines.push({ key: 'cmd', text: `  · 시작: /tene:sprint start ${rec.next.id}` })
  } else if (rec.reason === 'blocked') {
    const w = rec.waiting?.[0]
    if (w) lines.push({ key: 'wait', text: `  · 대기 중: ${w.id} — 선행 ${w.missing.join(', ')} 미완료` })
  }

  // 이월 항목은 다음 sprint 의 설계를 바꾸므로 세션 시작에서 보여야 한다.
  for (const [i, c] of (rec.blocked ?? []).slice(0, 2).entries()) {
    lines.push({ key: `carry${i}`, text: `  · 이월: ${c.id} — ${truncateText(c.title ?? c.reason ?? '', 60)}` })
  }

  const { text, tokens } = truncateToBudget(lines, budget)
  return { text, tokens, truncated: false }
}

/**
 * 훅이 부르는 단일 진입점. current 가 없으면 plan 으로 넘어간다.
 * @param {{ current: object|null, plan: object|null, budget?: number }} input
 */
export function buildSessionContext({ current, plan, budget }) {
  if (current?.activeSprint) return { kind: 'sprint', ...formatSummary(current, { budget }) }
  if (plan?.sprints?.length) {
    return { kind: 'suggestion', ...formatNextSuggestion(recommendNext(plan), { budget }) }
  }
  return { kind: 'silent', text: '', tokens: 0, truncated: false } // 조용함이 기본값이다
}
