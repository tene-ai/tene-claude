/**
 * 진행률과 수렴 판정 — D07 §6
 *
 * 반복에는 상한이 있다. 상한이 없으면 개선이 멈춘 상태로 영원히 돈다.
 *
 * 더 중요한 것은 **수렴 감지**다. 회차를 거듭해도 갭이 줄지 않으면
 * 같은 방법으로는 안 되는 것이고, 그때는 반복을 늘릴 게 아니라
 * 접근을 바꾸거나 사람이 결정해야 한다.
 */

export const VERDICT = {
  PASS: 'pass',                 // blocking 갭 0 + 미귀속 해소
  CONTINUE: 'continue',         // 개선 중 — 다음 회차로
  STALLED: 'stalled',           // 진전 없음 — 접근을 바꿔야 한다
  EXHAUSTED: 'exhausted',       // 반복 상한 도달
}

/**
 * 이번 회차 결과로 판정한다.
 *
 * @param {{ blockingGaps: number, unattributedUnresolved: number, progress: number|null }} current
 * @param {Array<{ round: number, blockingGaps: number, progress: number|null }>} history 이전 회차들
 * @param {{ round: number, maxRounds: number }} ctx
 */
export function judgeRound(current, history, ctx) {
  const { round, maxRounds } = ctx
  const clear = current.blockingGaps === 0 && current.unattributedUnresolved === 0

  if (clear) {
    return {
      verdict: VERDICT.PASS,
      reason: 'blocking 갭 0건, 미귀속 변경 전부 해소',
      canAdvance: true,
    }
  }

  const stall = detectStall(current, history)
  if (stall.stalled) {
    return {
      verdict: VERDICT.STALLED,
      reason: stall.reason,
      canAdvance: false,
      // 반복을 더 도는 것이 답이 아니다. 무엇을 바꿔야 하는지 말한다.
      options: [
        '설계를 고친다 (요구가 현재 구조로 구현 불가능한 경우)',
        '요구를 조정한다 (PRD 로 돌아가 범위를 다시 정한다)',
        'waiver 로 예외 승인한다 (사유 필수)',
      ],
      stalledRounds: stall.rounds,
    }
  }

  if (round >= maxRounds) {
    return {
      verdict: VERDICT.EXHAUSTED,
      reason: `반복 상한 ${maxRounds}회에 도달했으나 blocking 갭 ${current.blockingGaps}건이 남았습니다`,
      canAdvance: false,
      options: [
        'waiver 로 남은 갭을 예외 승인한다 (사유 필수, 보고서 R6 에 기록됨)',
        '상한을 올린다 (max_loop_checks 설정)',
        '설계나 요구를 조정한다',
      ],
    }
  }

  return {
    verdict: VERDICT.CONTINUE,
    reason: `blocking 갭 ${current.blockingGaps}건 남음`,
    canAdvance: false,
    nextRound: round + 1,
    remaining: maxRounds - round,
  }
}

/**
 * 수렴 감지 — blocking 갭이 2회 연속 줄지 않으면 멈춘 것으로 본다.
 *
 * **기준은 blocking 갭이다. 진행률이 아니다.**
 *
 * 목표는 blocking 0 이므로, blocking 이 안 줄면 목표에 다가가지 않은 것이다.
 * 진행률로 판단하면 non-blocking 을 고쳐 숫자만 올리고 blocking 은 그대로인
 * 상태가 "진전 중" 으로 잡힌다 — 그게 정확히 반복이 헛도는 모습이다.
 *
 * 진행률은 사용자에게 보여주는 값이지 판정 입력이 아니다.
 */
export function detectStall(current, history, { window = 2 } = {}) {
  const recent = history.slice(-window)
  if (recent.length < window) return { stalled: false, rounds: 0 }

  const series = [...recent.map((h) => h.blockingGaps), current.blockingGaps]
  // 한 번이라도 줄었으면 진전이다
  const improved = series.some((b, i) => i > 0 && b < series[i - 1])

  if (!improved && current.blockingGaps > 0) {
    return {
      stalled: true,
      rounds: series.length,
      reason: `${series.length}회 연속 blocking 갭이 줄지 않았습니다 (${series.join(' → ')})`,
    }
  }
  return { stalled: false, rounds: 0 }
}

/**
 * 회차 간 비교. 무엇이 나아지고 무엇이 나빠졌는지.
 *
 * 나빠진 것(회귀)을 앞에 놓는다 — 개선하다 깨뜨린 것이 가장 급하다.
 */
export function diffRounds(previous, current) {
  if (!previous) return { first: true, fixed: [], broken: [], unchanged: [] }

  const prevByReq = new Map(previous.map((j) => [j.requirementId, j]))
  const fixed = []
  const broken = []
  const unchanged = []

  for (const c of current) {
    const p = prevByReq.get(c.requirementId)
    if (!p) continue
    if (p.judgment === c.judgment) { unchanged.push(c.requirementId); continue }
    if (c.judgment === 'implemented') fixed.push({ id: c.requirementId, from: p.judgment })
    else if (p.judgment === 'implemented') broken.push({ id: c.requirementId, to: c.judgment, subject: c.refId })
    else unchanged.push(c.requirementId)
  }

  const newIds = current.filter((c) => !prevByReq.has(c.requirementId)).map((c) => c.requirementId)
  return { first: false, fixed, broken, unchanged, added: newIds }
}

/**
 * 사람이 읽는 진행 표시.
 *
 * 백분율만 크게 쓰지 않는다. 분모와 확인 불가 건수를 항상 함께 낸다 —
 * 87% 라는 숫자보다 "13/15, 확인 불가 2건" 이 정확하다.
 */
export function formatProgress(summary) {
  if (summary.progress === null) {
    return `진행률 산출 불가 (확인 가능한 항목 0건 / 전체 ${summary.total}건)`
  }
  const pct = Math.round(summary.progress * 100)
  const base = `${pct}% (${summary.score} / ${summary.denominator})`
  const unver = summary.unverifiableCount ? ` · 확인 불가 ${summary.unverifiableCount}건` : ''
  return `진행률 ${base}${unver}`
}

/** 게이트가 보는 것은 백분율이 아니라 이것이다 */
export function gateInputs(summary, unattributedUnresolved) {
  return {
    blockingGaps: summary.blockingGaps,
    unattributedUnresolved,
    regressions: summary.regressions,
    // 백분율은 게이트 입력이 아니다. 표시용으로만 넘긴다.
    display: formatProgress(summary),
  }
}
