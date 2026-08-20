/**
 * master plan 집계와 이월 승격 — D10 §7~8
 *
 * sprint 는 끝나면 아카이브되지만, **미결 항목은 사라지면 안 된다.**
 * archive 시점에 R6 의 이월 항목이 master-plan 으로 승격된다.
 *
 * 이 경로가 없으면 각 sprint 의 보고서에 미결이 적히고, 아무도 다시 읽지 않는다.
 */

/** sprint 상태들을 master plan 관점으로 집계 */
export function aggregate(masterPlan, sprints) {
  const byId = new Map(sprints.map((s) => [s.id, s]))
  const rows = []

  for (const entry of masterPlan?.sprints ?? []) {
    const s = byId.get(entry.id)
    rows.push({
      id: entry.id,
      order: entry.order ?? 0,
      dependsOn: entry.dependsOn ?? [],
      status: s?.status ?? entry.status ?? 'planned',
      phase: s?.phase ?? null,
      blockingFailed: s ? countBlockingFailed(s) : null,
      insufficient: s ? (s.ac ?? []).filter((a) => a.verdict === 'insufficient').length : null,
      archivedAt: s?.archivedAt ?? entry.archivedAt ?? null,
    })
  }

  // master plan 에 없는데 상태가 있는 sprint — 등록되지 않은 것
  const unregistered = sprints
    .filter((s) => !(masterPlan?.sprints ?? []).some((e) => e.id === s.id))
    .map((s) => s.id)

  return {
    rows: rows.sort((a, b) => a.order - b.order),
    unregistered,
    counts: {
      total: rows.length,
      archived: rows.filter((r) => r.status === 'archived').length,
      active: rows.filter((r) => r.status === 'active').length,
      planned: rows.filter((r) => r.status === 'planned').length,
    },
    openCarry: (masterPlan?.carryOver ?? []).filter((c) => c.status === 'open').length,
  }
}

function countBlockingFailed(sprint) {
  return (sprint.ac ?? []).filter(
    (a) => a.priority === 'blocking' && !a.waived && ['failed', 'stale'].includes(a.verdict),
  ).length
}

/**
 * 다음에 할 sprint 를 고른다.
 *
 * **선행이 끝나지 않으면 추천하지 않는다.** 순서를 무시하면 의존이 깨진 채로 시작된다.
 */
export function recommendNext(aggregated, { carryOver = [] } = {}) {
  const done = new Set(aggregated.rows.filter((r) => r.status === 'archived').map((r) => r.id))

  const active = aggregated.rows.find((r) => r.status === 'active' || r.status === 'paused')
  if (active) return { next: active, reason: 'active', blocking: [] }

  const ready = aggregated.rows
    .filter((r) => r.status === 'planned')
    .filter((r) => r.dependsOn.every((d) => done.has(d)))
    .sort((a, b) => a.order - b.order)

  // 이 sprint 를 막는 이월 항목
  const blockersFor = (id) => carryOver.filter((c) => c.status === 'open' && (c.blocks ?? []).includes(id))

  for (const cand of ready) {
    const blocking = blockersFor(cand.id)
    if (!blocking.length) return { next: cand, reason: 'ready', satisfied: cand.dependsOn, blocking: [] }
    // 막혀 있어도 후보로는 낸다 — 무엇을 먼저 해결해야 하는지 알려준다
    return { next: cand, reason: 'blocked_by_carry', blocking }
  }

  const waiting = aggregated.rows
    .filter((r) => r.status === 'planned')
    .map((r) => ({ id: r.id, missing: r.dependsOn.filter((d) => !done.has(d)) }))

  return { next: null, reason: waiting.length ? 'waiting' : 'empty', waiting, blocking: [] }
}

/**
 * 이월 항목을 master plan 으로 승격한다.
 *
 * **중복 승격을 막는다.** 같은 항목이 매 archive 마다 쌓이면 목록이 쓸모없어진다.
 */
export function promote(masterPlan, promotable, { at } = {}) {
  const existing = new Set((masterPlan.carryOver ?? []).map((c) => c.id))
  const added = []

  for (const item of promotable) {
    if (existing.has(item.id)) continue
    masterPlan.carryOver = masterPlan.carryOver ?? []
    masterPlan.carryOver.push({ ...item, promotedAt: at ?? null })
    added.push(item.id)
  }
  return { added, total: masterPlan.carryOver?.length ?? 0 }
}

/** sprint 를 master plan 에 등록하거나 상태를 갱신한다 */
export function upsertSprint(masterPlan, sprint) {
  masterPlan.sprints = masterPlan.sprints ?? []
  const idx = masterPlan.sprints.findIndex((s) => s.id === sprint.id)
  const entry = {
    id: sprint.id,
    order: idx >= 0 ? masterPlan.sprints[idx].order : masterPlan.sprints.length + 1,
    dependsOn: idx >= 0 ? masterPlan.sprints[idx].dependsOn ?? [] : [],
    status: sprint.status,
    phase: sprint.phase,
    ...(sprint.archivedAt ? { archivedAt: sprint.archivedAt } : {}),
  }
  if (idx >= 0) masterPlan.sprints[idx] = { ...masterPlan.sprints[idx], ...entry }
  else masterPlan.sprints.push(entry)
  return entry
}

/** master-plan.md 의 현황 표 */
export function renderStatus(aggregated, { lang = 'ko' } = {}) {
  const head = lang === 'ko'
    ? ['| Sprint | 상태 | Phase | blocking AC | 미측정 | 기간 |', '|---|---|---|---|---|---|']
    : ['| Sprint | Status | Phase | Blocking AC | Unmeasured | Period |', '|---|---|---|---|---|---|']

  const rows = aggregated.rows.map((r) => {
    const blocking = r.blockingFailed === null ? '—' : (r.blockingFailed || '0')
    const insuf = r.insufficient === null ? '—' : (r.insufficient || '0')
    return `| ${r.id} | ${r.status} | ${r.phase ?? '—'} | ${blocking} | ${insuf} | ${r.archivedAt?.slice(0, 10) ?? '—'} |`
  })

  const lines = [...head, ...rows]
  if (aggregated.unregistered.length) {
    lines.push('', lang === 'ko'
      ? `> ⚠️ master plan 에 등록되지 않은 sprint: ${aggregated.unregistered.join(', ')}`
      : `> ⚠️ Unregistered sprints: ${aggregated.unregistered.join(', ')}`)
  }
  return lines.join('\n')
}

/** 이월 집계 표 */
export function renderCarryTable(carryOver, { lang = 'ko' } = {}) {
  const open = (carryOver ?? []).filter((c) => c.status === 'open')
  if (!open.length) return lang === 'ko' ? '(열린 이월 항목 없음)' : '(no open carry-over)'

  const head = lang === 'ko'
    ? ['| 출처 | 종류 | 항목 | 사유 | 차단 대상 |', '|---|---|---|---|---|']
    : ['| From | Kind | Item | Reason | Blocks |', '|---|---|---|---|---|']

  return [
    ...head,
    ...open.map((c) => `| ${c.from} | ${c.kind} | ${c.title} | ${c.reason || '**사유 없음**'} | ${(c.blocks ?? []).join(', ') || '—'} |`),
  ].join('\n')
}
