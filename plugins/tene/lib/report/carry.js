/**
 * R6 — 결정 대기·이월과 사유 — D10 §6
 *
 * 이 항목이 방어하는 것: **조용히 사라지는 미결 항목.**
 *
 * 세 곳에서 모은다. 한 곳만 보면 나머지가 사라진다.
 *   ① sprint 상태의 carryOver
 *   ② QA 의 insufficient (측정하지 못한 것)
 *   ③ loop-check 의 미해결 갭 + 미승인 편차
 *
 * **사유 없는 이월은 G7 이 막는다.** "나중에" 는 사유가 아니다 —
 * 왜 이번에 못 했는지를 적어야 다음에 무엇이 필요한지 안다.
 */
import { plainCell, tableToObjects } from '../doc/parser.js'

export const CARRY_KIND = {
  DECISION: 'decision',     // 사람이 정해야 할 정책
  WORK: 'work',             // 하지 않은 작업
  WAIVER: 'waiver',         // 사유와 함께 넘긴 것
  UNMEASURED: 'unmeasured', // 측정하지 못한 것
  DEVIATION: 'deviation',   // 설계와 다르게 구현된 것
}

/** QA 문서의 미측정 표 */
function fromQaInsufficient(qaDoc) {
  const sec = qaDoc?.sections?.get('insufficient')
  if (!sec?.tables?.length) return []
  const out = []
  for (const table of sec.tables) {
    for (const row of tableToObjects(table)) {
      const item = plainCell(row['항목'] ?? row.item ?? row.id ?? '')
      if (!item || /^</.test(item)) continue
      out.push({
        kind: CARRY_KIND.UNMEASURED,
        title: item,
        reason: plainCell(row['사유'] ?? row.reason ?? ''),
        toResolve: plainCell(row['측정하려면'] ?? row.tomeasureit ?? ''),
        source: 'qa',
      })
    }
  }
  return out
}

/** 상태의 AC 중 insufficient — 문서에 표가 없어도 잡는다 */
function fromAcState(sprint) {
  return (sprint.ac ?? [])
    .filter((a) => a.verdict === 'insufficient')
    .map((a) => ({
      kind: CARRY_KIND.UNMEASURED,
      title: `${a.id} 미측정`,
      reason: a.reason ?? '',
      source: 'state',
      ref: a.id,
    }))
}

function fromWaivers(sprint) {
  return (sprint.waivers ?? []).map((w) => ({
    kind: CARRY_KIND.WAIVER,
    title: `${w.ac} 예외 승인`,
    reason: w.reason ?? '',
    approvedBy: w.approvedBy ?? 'user',
    at: w.at,
    source: 'state',
    ref: w.ac,
  }))
}

function fromSprintCarry(sprint) {
  return (sprint.carryOver ?? [])
    .filter((c) => c.status !== 'resolved')
    .map((c) => ({
      kind: c.kind ?? CARRY_KIND.WORK,
      title: c.title ?? c.id ?? '',
      reason: c.reason ?? '',
      source: 'state',
      ref: c.id,
      blocks: c.blocks ?? [],
    }))
}

/** loop-check 의 미해결 blocking 갭 */
function fromLoopGaps(sprint) {
  return (sprint.gaps ?? [])
    .filter((g) => g.status === 'open' && g.severity === 'blocker')
    .map((g) => ({
      kind: CARRY_KIND.WORK,
      title: g.detail ?? g.subject ?? '',
      reason: g.evidence ?? '',
      toResolve: g.suggestedFix ?? '',
      source: 'loop-check',
      ref: g.id,
    }))
}

function fromDeviations(deviations) {
  return (deviations ?? [])
    .filter((d) => !d.approved)
    .map((d) => ({
      kind: CARRY_KIND.DEVIATION,
      title: `${d.requirement} — 설계와 다르게 구현됨`,
      reason: d.actual ?? '',
      source: 'loop-check',
    }))
}

/** PRD 의 열린 결정 사항 */
function fromOpenDecisions(prdDoc) {
  const sec = prdDoc?.sections?.get('decisions')
  if (!sec?.tables?.length) return []
  const out = []
  for (const table of sec.tables) {
    for (const row of tableToObjects(table)) {
      const q = plainCell(row['결정할것'] ?? row.todecide ?? row['항목'] ?? '')
      if (!q || /^</.test(q)) continue
      out.push({
        kind: CARRY_KIND.DECISION,
        title: q,
        options: plainCell(row['선택지'] ?? row.options ?? ''),
        proposal: plainCell(row['기본제안'] ?? row.defaultproposal ?? ''),
        decider: plainCell(row['결정자'] ?? row.decider ?? ''),
        reason: '',
        source: 'prd',
      })
    }
  }
  return out
}

/**
 * 세 출처를 병합한다. 중복은 ref 로 제거한다.
 *
 * @param {object} sprint
 * @param {{ prd?: object, qa?: object }} docs
 * @param {{ deviations?: object[] }} [extra]
 */
export function collectCarry(sprint, docs = {}, extra = {}) {
  const all = [
    ...fromOpenDecisions(docs.prd),
    ...fromSprintCarry(sprint),
    ...fromLoopGaps(sprint),
    ...fromQaInsufficient(docs.qa),
    ...fromAcState(sprint),
    ...fromWaivers(sprint),
    ...fromDeviations(extra.deviations),
  ]

  const seen = new Set()
  const items = []
  for (const it of all) {
    const key = `${it.kind}:${it.ref ?? it.title}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push(it)
  }

  // 사유 없는 항목이 G7 을 막는다
  const missingReason = items.filter((i) => i.kind !== CARRY_KIND.DECISION && !String(i.reason).trim())

  return {
    items,
    byKind: Object.fromEntries(
      Object.values(CARRY_KIND).map((k) => [k, items.filter((i) => i.kind === k)]),
    ),
    missingReason,
    ok: missingReason.length === 0,
  }
}

/** R6 섹션 마크다운 */
export function renderCarry(carry, { lang = 'ko' } = {}) {
  const lines = []
  const { byKind } = carry

  lines.push(lang === 'ko' ? '### 결정이 필요한 정책' : '### Policy decisions needed')
  const decisions = byKind[CARRY_KIND.DECISION]
  if (!decisions.length) {
    lines.push('', lang === 'ko' ? '해당 없음' : 'None')
  } else {
    lines.push('', '| # | 결정할 것 | 선택지 | 기본 제안 | 결정자 |', '|---|---|---|---|---|')
    decisions.forEach((d, i) => {
      lines.push(`| ${i + 1} | ${d.title} | ${d.options || '—'} | ${d.proposal || '—'} | ${d.decider || '사용자'} |`)
    })
  }

  lines.push('', lang === 'ko' ? '### 이월 작업' : '### Carried over')
  const work = [...byKind[CARRY_KIND.WORK], ...byKind[CARRY_KIND.DEVIATION], ...byKind[CARRY_KIND.UNMEASURED]]
  if (!work.length) {
    lines.push('', lang === 'ko' ? '해당 없음' : 'None')
  } else {
    lines.push('', '| # | 작업 | 왜 이번에 하지 않았나 | 언제 할 것인가 |', '|---|---|---|---|')
    work.forEach((w, i) => {
      const reason = String(w.reason).trim() || '**사유 없음 — G7 이 막습니다**'
      lines.push(`| ${i + 1} | ${w.title} | ${reason} | ${w.toResolve || '미정'} |`)
    })
  }

  lines.push('', lang === 'ko' ? '### 예외 승인 (waiver)' : '### Waivers granted')
  const waivers = byKind[CARRY_KIND.WAIVER]
  if (!waivers.length) {
    lines.push('', lang === 'ko' ? '해당 없음' : 'None')
  } else {
    lines.push('', '| # | 대상 | 사유 | 승인자 |', '|---|---|---|---|')
    waivers.forEach((w, i) => {
      lines.push(`| ${i + 1} | ${w.ref ?? w.title} | ${w.reason} | ${w.approvedBy} |`)
    })
  }

  if (carry.missingReason.length) {
    lines.push('', lang === 'ko'
      ? `> ⛔ 사유가 없는 이월 항목 ${carry.missingReason.length}건이 있습니다. G7 이 막습니다.`
      : `> ⛔ ${carry.missingReason.length} carried items lack a reason. G7 blocks.`)
  }
  return lines.join('\n')
}

/** master-plan 으로 승격할 항목 — archive 시 쓴다 */
export function toPromotable(carry, sprintId) {
  return carry.items
    .filter((i) => i.kind !== CARRY_KIND.WAIVER) // waiver 는 그 sprint 의 기록으로 남는다
    .map((i, idx) => ({
      id: `${sprintId}:${i.ref ?? `c${idx + 1}`}`,
      from: sprintId,
      kind: i.kind,
      title: i.title,
      reason: i.reason,
      status: 'open',
      blocks: i.blocks ?? [],
    }))
}
