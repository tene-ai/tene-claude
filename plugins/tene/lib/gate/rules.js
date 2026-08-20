/**
 * 게이트 규칙 G0~G7 — D02 §2, D08 §9
 *
 * **여기는 판단하지 않는다. 검사만 한다.**
 *
 * 게이트는 결정론이다. 같은 입력이면 같은 결과가 나와야 하고, 그래야 게이트가
 * 의미를 갖는다. "대체로 됐으니 통과" 는 게이트가 아니라 의견이다.
 * 자연어 판단은 스킬(L4)이 하고, 여기는 참·거짓만 낸다.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseDoc } from '../doc/parser.js'
import { RULES as DOC_RULES, RULES_BY_DOC } from '../doc/validate.js'
import { extractAc } from '../doc/extract.js'
import { requiredSections } from '../doc/sections.js'

/** D02 §2.1 — from → to 와 그 전이가 요구하는 검사들 */
export const GATES = {
  G0: { from: 'draft', to: 'prd', checks: ['sprint_identity'] },
  G1: { from: 'prd', to: 'plan', checks: [
    'doc_exists:prd', 'doc_sections:prd', 'nongoals_nonempty',
    'intent_count_min:1', 'ac_count_min:1', 'ac_method_tagged',
    'ac_priority_tagged', 'ac_unwanted_min:1', 'ac_no_vague',
  ] },
  G2: { from: 'plan', to: 'design', checks: [
    'doc_exists:plan', 'doc_sections:plan', 'ac_coverage_full',
  ] },
  G3: { from: 'design', to: 'do', checks: [
    'doc_exists:design', 'doc_sections:design',
    'layers_all_four', 'questions_present',
    'transitions_present_if_ux_ac', 'anchors_resolved',
  ] },
  G4: { from: 'do', to: 'loop-check', checks: [
    'changed_files_min:1',
  ] },
  G5: { from: 'loop-check', to: 'qa', checks: [
    'doc_exists:loop-check', 'blocking_gaps_zero', 'unattributed_resolved',
  ] },
  G6: { from: 'qa', to: 'report', checks: [
    'doc_exists:qa', 'all_ac_judged', 'blocking_ac_all_passed',
    'evidence_valid', 'stale_zero', 'required_layers_resolved',
  ] },
  G7: { from: 'report', to: 'archived', checks: [
    'doc_exists:report', 'r1_to_r6_present', 'r4_all_four_layers', 'r6_reasons_present',
  ] },
}

export const GATE_IDS = Object.keys(GATES)

/** 문서 종류 ↔ 게이트 */
const DOC_OF_GATE = { G1: 'prd', G2: 'plan', G3: 'design', G5: 'loop-check', G6: 'qa', G7: 'report' }

const pass = (id, detail) => ({ id, pass: true, ...(detail ? { detail } : {}) })
const fail = (id, detail, extra = {}) => ({ id, pass: false, detail, ...extra })

// ── 개별 검사 ─────────────────────────────────────────────────────────

const CHECKS = {
  sprint_identity(ctx) {
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(ctx.sprint?.id ?? '')) {
      return fail('sprint_identity', `sprint id 형식이 올바르지 않습니다: ${ctx.sprint?.id}`,
        { remediation: '소문자로 시작하고 소문자·숫자·하이픈만 사용하세요 (최대 32자)' })
    }
    if (!String(ctx.sprint?.title ?? '').trim()) {
      return fail('sprint_identity', 'sprint 제목이 비어 있습니다',
        { remediation: '/tene:sprint init 에서 제목을 지정하세요' })
    }
    return pass('sprint_identity')
  },

  doc_exists(ctx, arg) {
    const rel = docRel(ctx.sprint, arg)
    if (!rel) {
      return fail(`doc_exists:${arg}`, `${arg} 문서가 상태에 등록되지 않았습니다`,
        { remediation: `/tene:${arg} 로 문서를 만드세요` })
    }
    // 검사한 경로를 그대로 보고한다. rel 만 찍으면 실재하는 파일 이름을 대면서
    // "없습니다" 라고 말하게 되고, 사용자는 멀쩡한 파일을 찾아 헤맨다.
    const tested = join(ctx.sprint.docsRoot, ctx.sprint.sprintDir, rel)
    return existsSync(join(ctx.root, tested))
      ? pass(`doc_exists:${arg}`, rel)
      : fail(`doc_exists:${arg}`, `파일이 없습니다: ${tested}`,
          { remediation: `/tene:${arg} 로 문서를 만드세요. docs.${arg} 는 sprint 디렉토리 기준 상대 경로여야 합니다 (현재: ${rel})` })
  },

  doc_sections(ctx, arg) {
    const doc = ctx.docs[arg]
    if (!doc) return fail(`doc_sections:${arg}`, `${arg} 문서를 읽지 못했습니다`)
    const required = requiredSections(arg, ctx.sprint.profile)
    const missing = required.filter((id) => !doc.sections.has(id))
    return missing.length
      ? fail(`doc_sections:${arg}`, `누락 섹션: ${missing.join(', ')}`,
          { remediation: 'tene-doc scaffold 로 누락 섹션을 추가할 수 있습니다', value: missing })
      : pass(`doc_sections:${arg}`, `${required.length}개 섹션`)
  },

  // 문서 검증 규칙을 그대로 쓴다. 게이트와 검증기가 다른 답을 내면 안 된다.
  nongoals_nonempty: docRule('nongoals_nonempty', 'prd'),
  intent_count_min: docRule('intent_count', 'prd', (arg) => ({ minIntents: Number(arg) })),
  ac_count_min: docRule('ac_count', 'prd', (arg) => ({ minAc: Number(arg) })),
  ac_method_tagged: docRule('ac_method_tagged', 'prd'),
  ac_priority_tagged: docRule('ac_priority_tagged', 'prd'),
  ac_unwanted_min: docRule('ac_unwanted_min', 'prd', (arg) => ({ minUnwanted: Number(arg) })),
  ac_no_vague: docRule('ac_no_vague', 'prd'),
  ac_coverage_full: docRule('ac_coverage_full', 'plan'),
  layers_all_four: docRule('layers_all_four', 'design'),
  questions_present: docRule('questions_present', 'design'),
  all_ac_judged: docRule('all_ac_judged', 'qa'),
  r1_to_r6_present: docRule('r1_to_r6_present', 'report'),
  r4_all_four_layers: docRule('layers_all_four', 'report'),
  r6_reasons_present: docRule('r6_reasons', 'report'),

  transitions_present_if_ux_ac(ctx) {
    const hasUx = (ctx.sprint.ac ?? []).some((a) => a.method === 'UX')
    if (!hasUx) return pass('transitions_present_if_ux_ac', 'UX 기준 없음 — 해당 없음')
    const r = DOC_RULES.transitions_present(ctx.docs.design ?? emptyDoc(), { hasUxAc: true })
    return r.pass
      ? pass('transitions_present_if_ux_ac', String(r.value))
      : fail('transitions_present_if_ux_ac', r.detail,
          { remediation: 'design.md 의 화면 전이 표를 채우세요. 이 표의 엣지 수가 QA 커버리지의 분모입니다' })
  },

  anchors_resolved(ctx) {
    const blocking = (ctx.sprint.ac ?? []).filter((a) => a.priority === 'blocking')
    const missing = blocking.filter((a) => !(a.anchors?.length)).map((a) => a.id)
    return missing.length
      ? fail('anchors_resolved', `앵커가 없는 blocking AC: ${missing.join(', ')}`,
          { remediation: 'design.md 앵커 표에 코드 심볼을 적으세요. 앵커가 없으면 코드가 바뀌어도 stale 이 되지 않습니다', value: missing })
      : pass('anchors_resolved', `${blocking.length}개 AC 앵커 확인`)
  },

  changed_files_min(ctx, arg) {
    const n = ctx.changedFiles?.length ?? null
    if (n === null) {
      // 확인할 수 없으면 막지 않는다. 다만 확인 못 했다고 말한다.
      return pass('changed_files_min', 'git 변경 목록을 확인할 수 없어 검사를 건너뛰었습니다')
    }
    return n >= Number(arg)
      ? pass('changed_files_min', `${n}개 파일 변경`)
      : fail('changed_files_min', `변경된 파일이 ${n}개입니다 (최소 ${arg})`,
          { remediation: '구현을 시작한 뒤 다시 시도하세요' })
  },

  blocking_gaps_zero(ctx) {
    const n = ctx.loop?.blockingGaps
    if (n === undefined) {
      return fail('blocking_gaps_zero', 'loop-check 결과가 없습니다',
        { remediation: '/tene:loop-check 를 먼저 실행하세요' })
    }
    return n === 0
      ? pass('blocking_gaps_zero')
      : fail('blocking_gaps_zero', `blocking 갭 ${n}건이 남아 있습니다`,
          { remediation: '갭을 해소하거나 /tene:sprint waiver 로 사유와 함께 예외 승인하세요' })
  },

  unattributed_resolved(ctx) {
    const n = ctx.loop?.unattributedUnresolved
    if (n === undefined) {
      return fail('unattributed_resolved', 'loop-check 결과가 없습니다',
        { remediation: '/tene:loop-check 를 먼저 실행하세요' })
    }
    return n === 0
      ? pass('unattributed_resolved')
      : fail('unattributed_resolved', `해소되지 않은 미귀속 변경 ${n}건`,
          { remediation: '각 변경을 (a) 앵커 추가 (b) 새 AC 승격 (c) 무관 표시 중 하나로 해소하세요' })
  },

  /** blocking AC 는 전부 passed 여야 한다. waiver 는 사유와 함께 예외로 인정한다. */
  blocking_ac_all_passed(ctx) {
    const waived = new Set((ctx.sprint.waivers ?? []).map((w) => w.ac))
    const bad = (ctx.sprint.ac ?? [])
      .filter((a) => a.priority === 'blocking' && !waived.has(a.id) && !a.waived)
      .filter((a) => a.verdict !== 'passed')
      .map((a) => `${a.id}(${a.verdict ?? 'pending'})`)

    return bad.length
      ? fail('blocking_ac_all_passed', `blocking AC 미통과: ${bad.join(', ')}`,
          { remediation: '검증을 다시 하거나, 통과할 수 없다면 사유와 함께 waiver 를 승인하세요', value: bad })
      : pass('blocking_ac_all_passed')
  },

  /** stale 은 "코드가 바뀌어 판정이 무효" 라는 뜻이다. 통과시킬 수 없다. */
  stale_zero(ctx) {
    const stale = (ctx.sprint.ac ?? []).filter((a) => a.verdict === 'stale').map((a) => a.id)
    return stale.length
      ? fail('stale_zero', `코드 변경으로 판정이 무효가 된 AC: ${stale.join(', ')}`,
          { remediation: '/tene:qa 로 다시 검증하세요', value: stale })
      : pass('stale_zero')
  },

  evidence_valid(ctx) {
    const passedAcs = (ctx.sprint.ac ?? []).filter((a) => a.verdict === 'passed')
    if (!passedAcs.length) return pass('evidence_valid', 'passed AC 없음')

    const problems = []
    for (const ac of passedAcs) {
      if (!ac.evidenceRef) {
        problems.push(`${ac.id}: 증거 참조 없음`)
        continue
      }
      const v = ctx.verifyEvidence?.(ac.evidenceRef, ac)
      if (v && v.ok === false) problems.push(`${ac.id}: ${v.reason}`)
    }
    return problems.length
      ? fail('evidence_valid', `증거 문제: ${problems.join('; ')}`,
          { remediation: '증거 파일이 있고 해시가 맞으며 마지막 코드 변경보다 최신인지 확인하세요', value: problems })
      : pass('evidence_valid', `${passedAcs.length}건 확인`)
  },

  required_layers_resolved(ctx) {
    const unresolved = ctx.qa?.unresolvedLayers ?? []
    return unresolved.length
      ? fail('required_layers_resolved', `처리되지 않은 레이어: ${unresolved.join(', ')}`,
          { remediation: '각 레이어를 실행하거나 not-applicable 사유를 적으세요', value: unresolved })
      : pass('required_layers_resolved')
  },
}

/** 문서 검증 규칙을 게이트 검사로 감싼다 */
function docRule(ruleId, docType, argMapper) {
  return (ctx, arg) => {
    const doc = ctx.docs[docType]
    if (!doc) {
      return fail(ruleId, `${docType} 문서를 읽지 못했습니다`, { remediation: `/tene:${docType} 로 문서를 만드세요` })
    }
    const extra = argMapper ? argMapper(arg) : {}
    const r = DOC_RULES[ruleId](doc, {
      docType,
      profile: ctx.sprint.profile,
      acIds: (ctx.sprint.ac ?? []).map((a) => a.id),
      hasUxAc: (ctx.sprint.ac ?? []).some((a) => a.method === 'UX'),
      ...extra,
    })
    return r.pass
      ? pass(r.id, r.value !== undefined ? String(r.value) : undefined)
      : fail(r.id, r.detail, { remediation: r.suggestion, value: r.value, line: r.line })
  }
}

function emptyDoc() {
  return { sections: new Map(), freeSections: [], autoBlocks: [], errors: [], tene: {} }
}

function docRel(sprint, type) {
  const d = sprint?.docs ?? {}
  if (type === 'loop-check') {
    const list = d.loopCheck ?? []
    return list.length ? list[list.length - 1] : null
  }
  return d[type] ?? null
}

// ── 평가 ──────────────────────────────────────────────────────────────

/**
 * 게이트 하나를 평가한다.
 *
 * @param {string} gateId
 * @param {{ root: string, sprint: object, docs: object, loop?: object, qa?: object,
 *           changedFiles?: string[], verifyEvidence?: Function }} ctx
 * @returns {{ gate: string, result: 'pass'|'fail', checks: object[], findings: object[], remediation: string[] }}
 */
export function evaluateGate(gateId, ctx) {
  const gate = GATES[gateId]
  if (!gate) {
    return { gate: gateId, result: 'fail', checks: [], findings: [{ id: 'unknown_gate', detail: `알 수 없는 게이트: ${gateId}` }], remediation: [] }
  }

  const checks = gate.checks.map((spec) => {
    const [id, arg] = spec.split(':')
    const fn = CHECKS[id]
    if (!fn) return fail(id, `검사가 구현되지 않았습니다: ${id}`)
    try {
      return fn(ctx, arg)
    } catch (err) {
      // 검사 중 오류를 통과로 넘기지 않는다
      return fail(id, `검사 중 오류: ${err.message}`)
    }
  })

  const findings = checks.filter((c) => !c.pass)
  return {
    gate: gateId,
    from: gate.from,
    to: gate.to,
    result: findings.length ? 'fail' : 'pass',
    checks,
    findings,
    remediation: [...new Set(findings.map((f) => f.remediation).filter(Boolean))],
    // 막지는 않지만 보고서에 남아야 하는 것
    insufficient: (ctx.sprint?.ac ?? []).filter((a) => a.verdict === 'insufficient').map((a) => a.id),
  }
}

/** phase 를 벗어날 때 검사하는 게이트 */
export function gateForTransition(from, to) {
  return GATE_IDS.find((id) => GATES[id].from === from && GATES[id].to === to) ?? null
}
