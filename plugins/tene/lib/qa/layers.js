/**
 * 7-Layer QA — D08 §3
 *
 * 각 레이어는 **반드시 셋 중 하나**로 기록된다.
 *   required        → 실행하고 결과를 남긴다
 *   not-applicable  → **사유 필수**
 *   waived          → **waiver id 필수**
 *
 * 셋 다 아닌 상태(= 그냥 비어 있음)가 G6 을 막는다. 비워두는 것이
 * "해당 없음" 과 구분되지 않으면, 안 한 것과 할 필요 없는 것이 섞인다.
 */

export const LAYERS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']

export const LAYER_INFO = {
  L1: { name: 'Static', question: '구조·타입·보안 규칙이 맞는가', evidence: 'lint/tsc/scan 출력' },
  L2: { name: 'Unit/Contract', question: '규칙과 경계 계약이 맞는가', evidence: '테스트 리포트' },
  L3: { name: 'Integration/Data', question: '실제 데이터 흐름과 부작용이 맞는가', evidence: 'API 응답, DB 상태' },
  L4: { name: 'System E2E', question: '시스템을 통해 완료되는가', evidence: '트레이스, 네트워크' },
  L5: { name: 'Intent/UX', question: '사용자가 목적을 달성하는가', evidence: '화면 전이, 스크린샷' },
  L6: { name: 'Adversarial/Recovery', question: '실패·권한·재시도·롤백이 안전한가', evidence: '결함 주입 결과' },
  L7: { name: 'Regression/Drift', question: '기존 의도를 깨지 않았는가', evidence: '기준선 비교' },
}

export const STATES = ['required', 'not-applicable', 'waived']
export const RESULTS = ['pass', 'fail', 'partial', 'insufficient']

/**
 * AC 하나에 필요한 레이어를 고른다 — D08 §3.2
 *
 * @param {{ method: string, pattern?: string }} ac
 * @param {{ hasReturnPaths?: boolean, touchesExistingSymbols?: boolean }} [ctx]
 */
export function selectLayers(ac, ctx = {}) {
  const layers = new Set(['L1']) // 정적 검사는 항상

  if (ac.method === 'UNIT') layers.add('L2')
  if (ac.method === 'DATA') { layers.add('L2'); layers.add('L3') }
  if (ac.method === 'UX') { layers.add('L4'); layers.add('L5') }

  // If-then 은 실패 경로다. 실패 경로를 정의해놓고 검증하지 않으면 정의한 의미가 없다.
  if (ac.pattern === 'unwanted') layers.add('L6')
  if (ctx.hasReturnPaths) layers.add('L6')
  // 기존 심볼을 고쳤으면 그것을 쓰던 것들이 깨졌을 수 있다
  if (ctx.touchesExistingSymbols) layers.add('L7')

  return LAYERS.filter((l) => layers.has(l))
}

/** sprint 전체의 레이어 계획 — AC 별 선택의 합집합 */
export function planLayers(acList, ctx = {}) {
  const required = new Set()
  const byAc = {}
  for (const ac of acList) {
    const ls = selectLayers(ac, ctx)
    byAc[ac.id] = ls
    for (const l of ls) required.add(l)
  }
  return {
    required: LAYERS.filter((l) => required.has(l)),
    byAc,
    // 선택되지 않은 레이어도 문서에 나와야 한다 — "안 골랐다" 를 기록으로 남긴다
    notSelected: LAYERS.filter((l) => !required.has(l)),
  }
}

/**
 * 레이어 처리 상태를 검증한다. **미해결을 찾는 것이 목적이다.**
 *
 * @param {Record<string, object>} handling  { L1: { state, result, reason, waiver } }
 * @param {string[]} required
 */
export function validateHandling(handling, required) {
  const problems = []
  const unresolved = []

  for (const l of LAYERS) {
    const h = handling?.[l]

    if (!h || !h.state) {
      if (required.includes(l)) {
        unresolved.push(l)
        problems.push({ layer: l, kind: 'missing', detail: `${l} 처리 상태가 없습니다` })
      } else {
        // required 가 아니어도 기록은 있어야 한다
        problems.push({ layer: l, kind: 'unrecorded', detail: `${l} 을 기록하지 않았습니다 (not-applicable 이라도 적으세요)` })
      }
      continue
    }

    if (!STATES.includes(h.state)) {
      problems.push({ layer: l, kind: 'bad_state', detail: `알 수 없는 상태: ${h.state}` })
      continue
    }

    if (h.state === 'not-applicable' && !h.reason) {
      problems.push({ layer: l, kind: 'no_reason', detail: `${l} 이 not-applicable 인데 사유가 없습니다` })
      continue
    }
    if (h.state === 'waived' && !h.waiver) {
      problems.push({ layer: l, kind: 'no_waiver', detail: `${l} 이 waived 인데 waiver id 가 없습니다` })
      continue
    }
    if (h.state === 'required') {
      if (!h.result) {
        unresolved.push(l)
        problems.push({ layer: l, kind: 'no_result', detail: `${l} 이 required 인데 결과가 없습니다` })
      } else if (!RESULTS.includes(h.result)) {
        problems.push({ layer: l, kind: 'bad_result', detail: `알 수 없는 결과: ${h.result}` })
      } else if (h.result === 'insufficient' && !h.reason) {
        // 미측정을 사유 없이 넘기면 다음에 무엇을 준비해야 할지 모른다
        problems.push({ layer: l, kind: 'no_reason', detail: `${l} 이 insufficient 인데 사유가 없습니다` })
      }
    }
  }

  return {
    ok: unresolved.length === 0,
    unresolved,          // G6 을 막는 것
    problems,            // 전부 (막지 않는 것 포함)
    blocking: problems.filter((p) => ['missing', 'no_result'].includes(p.kind)),
  }
}

/**
 * capability 로 실행할 수 없는 레이어를 insufficient 로 미리 표시한다.
 *
 * **not-applicable 로 바꾸지 않는다.** 도구가 없는 것과 해당 없는 것은 다르다 —
 * 전자는 도구를 갖추면 검증되지만 후자는 영영 검증 대상이 아니다.
 *
 * @param {string[]} required
 * @param {Record<string, boolean>} runnable  레이어별 실행 가능 여부 (capability.layerCapability 의 결과)
 * @param {object} [cap] 원본 capability — 무엇이 없어서 못 하는지 적기 위해 쓴다
 */
export function applyCapability(required, runnable, cap) {
  const out = {}
  for (const l of required) {
    if (runnable?.[l]) continue // 실행 가능하면 미리 정하지 않는다
    const need = LAYER_TOOLS[l] ?? []
    const missing = cap ? need.filter((k) => !hasTool(cap, k)) : need
    out[l] = {
      state: 'required',
      result: 'insufficient',
      reason: `${(missing.length ? missing : need).join(' 또는 ')} 가 없어 실행할 수 없습니다`,
      missingCapability: missing.length ? missing : need,
    }
  }
  return out
}

function hasTool(cap, key) {
  if (key === 'browser') {
    const k = cap.browser?.kind
    return Boolean(k) && k !== 'unknown' && k !== 'none'
  }
  return Boolean(cap[key])
}

/** 레이어가 필요로 하는 capability 키 */
export const LAYER_TOOLS = {
  L1: ['linter', 'typechecker'],
  L2: ['testRunner'],
  L3: ['testRunner', 'httpClient'],
  L4: ['browser', 'httpClient'],
  L5: ['browser'],
  L6: ['browser', 'httpClient'],
  L7: ['testRunner'],
}

/** qa.md 의 7-Layer 표 */
export function renderLayerTable(handling, required, { lang = 'ko' } = {}) {
  const head = lang === 'ko'
    ? ['| Layer | 처리 | 결과 | 사유 |', '|---|---|---|---|']
    : ['| Layer | State | Result | Reason |', '|---|---|---|---|']

  const rows = LAYERS.map((l) => {
    const h = handling?.[l]
    const info = LAYER_INFO[l]
    const label = `${l} ${info.name}`
    if (!h?.state) {
      const mark = required.includes(l)
        ? (lang === 'ko' ? '**미해결**' : '**unresolved**')
        : '—'
      return `| ${label} | ${mark} | — | — |`
    }
    const result = h.result ?? '—'
    const reason = h.reason ?? (h.waiver ? `waiver: ${h.waiver}` : '—')
    return `| ${label} | ${h.state} | ${result} | ${reason} |`
  })

  return [...head, ...rows].join('\n')
}
