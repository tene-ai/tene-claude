/**
 * 갭 판정 — D07 §3~4
 *
 * 판정은 넷뿐이다: implemented / partial / missing / unverifiable.
 * **넷 모두 근거를 요구한다.** 특히 `missing` 은 "확인했으나 없음" 의 근거가 필요하다 —
 * 안 찾아본 것과 찾아봤는데 없는 것은 다르다.
 *
 * `unverifiable` 이 있는 이유: 확인할 수단이 없는 것을 `missing` 으로 세면
 * 개선할 방법이 없는 갭이 영원히 남고, `implemented` 로 세면 거짓말이 된다.
 */
import { definitions, references, symbolsIn } from '../scan/query.js'
import { judgeLayer } from '../scan/layer.js'

/** @typedef {'implemented'|'partial'|'missing'|'unverifiable'} Judgment */

export const SCORE = { implemented: 1.0, partial: 0.5, missing: 0.0 }

const verdict = (judgment, evidence, extra = {}) => ({ judgment, evidence, ...extra })

// ── 출처별 판정 ───────────────────────────────────────────────────────

/**
 * AC 는 앵커된 심볼이 존재하고, 변경 집합에 포함되는지로 본다.
 *
 * "심볼이 있다" 만으로 implemented 라고 하지 않는다 — 원래 있던 심볼일 수 있다.
 * 변경 여부까지 봐야 이번 sprint 에서 한 일인지 알 수 있다.
 */
function judgeAc(req, ctx) {
  const anchors = req.expectedAnchors ?? []
  if (!anchors.length) {
    return verdict('unverifiable', '앵커가 없어 어느 코드를 봐야 할지 알 수 없습니다', {
      reason: 'no_anchor',
      suggestedFix: 'design.md 앵커 표에 이 AC 의 코드 지점을 적으세요',
    })
  }

  const found = []
  const missing = []
  for (const a of anchors) {
    const bare = String(a).replace(/`/g, '').trim()
    if (!bare) continue
    // 경로 앵커
    if (bare.includes('/')) {
      const file = bare.split(':')[0]
      if (ctx.index?.files?.[file]) found.push({ anchor: bare, at: file })
      else missing.push(bare)
      continue
    }
    const defs = definitions(ctx.index, bare)
    if (defs.ok) found.push({ anchor: bare, at: `${defs.results[0].file}:${defs.results[0].line}` })
    else missing.push(bare)
  }

  if (!found.length) {
    return verdict('missing', `앵커 심볼을 인덱스에서 찾지 못했습니다: ${missing.join(', ')}`, {
      reason: 'anchor_not_found',
      suggestedFix: `${missing.join(', ')} 를 구현하거나, 앵커가 잘못됐다면 design.md 를 고치세요`,
    })
  }

  const touchedFiles = found.filter((f) => ctx.changedFiles?.has(f.at.split(':')[0]))
  if (!touchedFiles.length && ctx.changedFiles?.size) {
    // 심볼은 있는데 이번 변경에 없다 = 원래 있던 것이다
    return verdict('partial', `${found.map((f) => f.at).join(', ')} 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다`, {
      reason: 'not_changed',
      suggestedFix: '이미 구현되어 있었다면 그렇게 기록하고, 아니면 구현이 필요합니다',
    })
  }

  const partial = missing.length
    ? verdict('partial', `일부 앵커만 확인됨: 있음 ${found.map((f) => f.at).join(', ')} / 없음 ${missing.join(', ')}`, {
        reason: 'partial_anchor',
        suggestedFix: `${missing.join(', ')} 가 아직 없습니다`,
      })
    : null

  return partial ?? verdict('implemented', found.map((f) => f.at).join(', '))
}

/** 작업은 명시한 대상이 변경됐는지로 본다 */
function judgeTask(req, ctx) {
  if (!ctx.changedFiles?.size) {
    return verdict('unverifiable', 'git 변경 목록이 없어 작업 완료를 확인할 수 없습니다', {
      reason: 'no_diff',
      suggestedFix: 'sprint 시작 커밋(startCommit)이 기록되어야 합니다',
    })
  }

  // 작업이 덮는 AC 의 앵커가 변경됐으면 그 작업은 진행된 것으로 본다
  const anchors = (req.covers ?? []).flatMap((acId) => ctx.anchorsByAc?.[acId] ?? [])
  const hitFiles = anchors.filter((f) => ctx.changedFiles.has(f))

  if (hitFiles.length) return verdict('implemented', `변경됨: ${[...new Set(hitFiles)].join(', ')}`)

  if (!anchors.length) {
    return verdict('unverifiable', `이 작업이 덮는 AC(${(req.covers ?? []).join(', ') || '없음'})에 앵커가 없습니다`, {
      reason: 'no_anchor',
      suggestedFix: 'design.md 앵커 표를 채우면 자동 판정됩니다',
    })
  }
  return verdict('missing', `덮는 AC 의 앵커 파일이 변경되지 않았습니다: ${[...new Set(anchors)].join(', ')}`, {
    reason: 'not_changed',
  })
}

/**
 * 처리 로직은 설계 본문의 식별자가 코드에 있는지로 본다.
 * 분기 조건까지 검증하지는 못한다 — 그건 QA 의 일이다.
 */
function judgeLogic(req, ctx) {
  const spans = req.expectedAnchors ?? []
  if (!spans.length) {
    return verdict('unverifiable', '설계 본문에 코드 식별자(`backtick`)가 없어 대조할 대상이 없습니다', {
      reason: 'no_identifier',
      suggestedFix: '설계 본문에서 함수·심볼 이름을 `backtick` 으로 표시하세요',
    })
  }

  const found = []
  const notFound = []
  for (const s of spans) {
    const defs = definitions(ctx.index, s)
    if (defs.ok) found.push(`${s}@${defs.results[0].file}:${defs.results[0].line}`)
    else notFound.push(s)
  }

  if (!found.length) return verdict('missing', `설계에 적힌 심볼이 없습니다: ${notFound.join(', ')}`, { reason: 'symbol_missing' })
  if (notFound.length) {
    return verdict('partial', `일부만 존재: 있음 ${found.join(', ')} / 없음 ${notFound.join(', ')}`, {
      reason: 'partial_symbol',
      suggestedFix: `${notFound.join(', ')} 를 구현하세요`,
    })
  }
  return verdict('implemented', found.join(', '))
}

/** 계층 배치는 실제 파일 위치로 확인한다 — 인덱스가 답할 수 있는 몇 안 되는 구조 요구다 */
function judgeLayerPlacement(req, ctx) {
  const target = req.expectedAnchors?.[0]
  if (!target) return verdict('unverifiable', '대상이 비어 있습니다', { reason: 'no_target' })

  let file = req.expectedFile
  if (!file) {
    const defs = definitions(ctx.index, target)
    if (!defs.ok) {
      return verdict('missing', `'${target}' 를 인덱스에서 찾지 못했습니다`, {
        reason: 'symbol_missing',
        suggestedFix: `${target} 를 ${req.expectedLayer} 계층에 만드세요`,
      })
    }
    file = defs.results[0].file
  }
  if (!ctx.index?.files?.[file]) {
    return verdict('missing', `파일이 없습니다: ${file}`, { reason: 'file_missing' })
  }

  const actual = judgeLayer(file, ctx.rules, {
    imports: (ctx.index.imports?.[file] ?? []).map((im) => im.from),
  })

  if (actual.layer === req.expectedLayer) return verdict('implemented', `${file} → ${actual.layer}`)
  if (actual.layer === 'unclassified') {
    return verdict('unverifiable', `${file} 이 계층 규칙에 걸리지 않습니다`, {
      reason: 'unclassified',
      suggestedFix: `layers.yml 에 ${actual.suggestion ?? '해당 경로'} 규칙을 추가하세요`,
    })
  }
  return verdict('partial', `${file} 이 ${req.expectedLayer} 가 아니라 ${actual.layer} 에 있습니다`, {
    reason: 'layer_mismatch',
    suggestedFix: `파일을 옮기거나 설계의 계층 배치를 고치세요`,
  })
}

/**
 * 화면 전이는 정적으로 확인할 수 없다.
 *
 * 라우팅 심볼이 있다고 전이가 동작하는 것은 아니다. 여기서 implemented 를 주면
 * QA 의 전이 커버리지가 무의미해진다. **unverifiable 이 정직한 답이다.**
 */
function judgeTransition(req, ctx) {
  const hint = [req.from, req.to].filter(Boolean).join(' → ')
  const symbols = [req.from, req.to]
    .map((s) => String(s ?? '').replace(/[^\w$]/g, ''))
    .filter((s) => s.length > 2)

  const found = symbols.filter((s) => definitions(ctx.index, s).ok)
  return verdict('unverifiable', found.length
    ? `${found.join(', ')} 심볼은 있으나 전이 동작은 실행해야 확인됩니다`
    : `${hint} 를 정적으로 확인할 수 없습니다`, {
    reason: 'runtime_required',
    suggestedFix: 'QA 의 L4/L5 (E2E·UX)에서 검증됩니다',
  })
}

/** 데이터 계약은 시그니처 문자열과 대조한다. 타입 검사는 아니다. */
function judgeContract(req, ctx) {
  const target = req.expectedAnchors?.[0]
  const defs = target ? definitions(ctx.index, target) : { ok: false }
  if (!defs.ok) {
    return verdict('missing', `계약 대상 '${target}' 를 찾지 못했습니다`, {
      reason: 'symbol_missing',
      suggestedFix: `${target} 를 구현하세요`,
    })
  }

  const sig = defs.results[0].signatureText ?? ''
  const want = [req.inputSchema, req.outputSchema].filter((s) => s && !/^</.test(s))
  if (!want.length) {
    return verdict('unverifiable', '설계에 입출력 스키마가 비어 있어 대조할 수 없습니다', {
      reason: 'no_schema',
      suggestedFix: 'design.md 의 데이터 계약 표를 채우세요',
    })
  }

  const missing = want.filter((w) => !sig.includes(stripDecorations(w)))
  if (!missing.length) return verdict('implemented', `${defs.results[0].file}:${defs.results[0].line} ${sig.slice(0, 80)}`)

  return verdict('partial', `시그니처에 설계된 스키마가 보이지 않습니다: ${missing.join(', ')} (실제: ${sig.slice(0, 80)})`, {
    reason: 'schema_mismatch',
    suggestedFix: '시그니처를 설계에 맞추거나 설계를 실제에 맞추세요',
  })
}

function stripDecorations(s) {
  return String(s).replace(/[`*]/g, '').trim()
}

// ── 진입점 ────────────────────────────────────────────────────────────

const JUDGES = {
  'prd:ac': judgeAc,
  'plan:task': judgeTask,
  'design:logic': judgeLogic,
  'design:layer': judgeLayerPlacement,
  'design:transition': judgeTransition,
  'design:contract': judgeContract,
}

/**
 * @param {object} req
 * @param {{ index: object, rules: object, changedFiles?: Set<string>, anchorsByAc?: Record<string,string[]> }} ctx
 */
export function judgeRequirement(req, ctx) {
  const fn = JUDGES[req.source]
  if (!fn) return verdict('unverifiable', `알 수 없는 출처: ${req.source}`, { reason: 'unknown_source' })

  if (!ctx.index) {
    return verdict('unverifiable', '코드 인덱스가 없습니다', {
      reason: 'no_index',
      suggestedFix: 'tene-scan build 를 실행하세요',
    })
  }

  try {
    return fn(req, ctx)
  } catch (err) {
    // 판정 중 오류를 implemented 로 넘기지 않는다
    return verdict('unverifiable', `판정 중 오류: ${err.message}`, { reason: 'judge_error' })
  }
}

// ── Gap ───────────────────────────────────────────────────────────────

export function severityOf(req, judgment) {
  if (judgment === 'unverifiable') return 'info'
  if (req.priority === 'blocking' && judgment !== 'implemented') return 'blocker'
  if (judgment === 'missing') return 'warning'
  if (judgment === 'partial') return 'warning'
  return 'info'
}

export function kindOf(judgment, reason, wasImplemented) {
  if (wasImplemented && judgment !== 'implemented') return 'regression'
  if (judgment === 'unverifiable') return 'unverified'
  if (judgment === 'missing') return 'missing'
  if (judgment === 'partial') return reason === 'layer_mismatch' ? 'debt' : 'mismatch'
  return null
}

/**
 * 요구 항목 전부를 판정하고 갭을 만든다.
 *
 * @param {object[]} requirements
 * @param {object} ctx
 * @param {{ round?: number, previous?: object[] }} [opts] previous 는 이전 회차 판정 (회귀 탐지용)
 */
export function judgeAll(requirements, ctx, opts = {}) {
  const round = opts.round ?? 1
  const prevByReq = new Map((opts.previous ?? []).map((p) => [p.requirementId ?? p.id, p]))

  const judged = []
  const gaps = []
  let gapSeq = 0

  for (const req of requirements) {
    const v = judgeRequirement(req, ctx)
    const prev = prevByReq.get(req.id)
    const wasImplemented = prev?.judgment === 'implemented'

    judged.push({
      requirementId: req.id,
      source: req.source,
      refId: req.refId,
      statement: req.statement,
      priority: req.priority,
      judgment: v.judgment,
      evidence: v.evidence,
      reason: v.reason,
    })

    if (v.judgment === 'implemented' && !wasImplemented) continue
    if (v.judgment === 'implemented') continue

    const kind = kindOf(v.judgment, v.reason, wasImplemented)
    gaps.push({
      id: `gap_${++gapSeq}`,
      severity: severityOf(req, v.judgment),
      kind,
      requirementId: req.id,
      subject: req.refId,
      detail: `${req.statement} — ${v.judgment}`,
      evidence: v.evidence,
      suggestedFix: v.suggestedFix ?? null,
      status: 'open',
      round,
    })
  }

  return { judged, gaps, ...summarize(judged, gaps) }
}

/**
 * 진행률은 **표시용**이다. 게이트는 blocking 갭 수만 본다.
 *
 * unverifiable 을 분모에서 뺀다 — 확인할 수 없는 것을 0 으로 세면
 * 진행률이 영원히 100% 가 되지 않는다. 대신 개수를 항상 병기한다.
 */
export function summarize(judged, gaps) {
  const counts = { implemented: 0, partial: 0, missing: 0, unverifiable: 0 }
  for (const j of judged) counts[j.judgment] = (counts[j.judgment] ?? 0) + 1

  const denominator = judged.length - counts.unverifiable
  const score = judged.reduce((a, j) => a + (SCORE[j.judgment] ?? 0), 0)

  return {
    counts,
    total: judged.length,
    denominator,
    score: Number(score.toFixed(1)),
    // 분모가 0이면 비율을 만들지 않는다 — 0/0 을 100% 로 표시하면 거짓말이다
    progress: denominator > 0 ? Number((score / denominator).toFixed(3)) : null,
    blockingGaps: gaps.filter((g) => g.severity === 'blocker' && g.status === 'open').length,
    regressions: gaps.filter((g) => g.kind === 'regression').length,
    unverifiableCount: counts.unverifiable,
  }
}
