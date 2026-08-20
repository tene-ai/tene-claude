/**
 * 문서 검증 — D04 §3
 *
 * 순수 함수. 앵커 ID 로만 판정하므로 문서 언어와 무관하다.
 * `## +@` 로 시작하는 자유 섹션은 검증에 영향을 주지 않는다.
 */
import { isPlaceholderOnly } from './parser.js'
import { requiredSections } from './sections.js'
import {
  extractAc, extractCoverage, extractIntents, extractInsufficient,
  extractTransitions, extractAnchors, extractVerdicts, extractCarry,
} from './extract.js'

/** 판정 불가능한 형용사 — D04 §3.2 */
const VAGUE_RE =
  /(빠르게|빠른|직관적|적절히|적당히|충분히|자연스럽게|깔끔하게|사용자\s*친화|최적화된|안정적으로|효율적으로|잘\s+동작)|(quickly|intuitive|appropriately|properly|nicely|smoothly|user-friendly|optimized|robustly|works well)/i

const LAYER_KEYS = ['interface', 'business', 'persistence', 'infrastructure']
const LAYER_HINTS = {
  interface: /interface|entry\s*point|인터페이스|진입/i,
  business: /business\s*logic|처리\s*규칙|비즈니스/i,
  persistence: /persistence|데이터|영속/i,
  infrastructure: /infrastructure|runtime|인프라|런타임/i,
}

/**
 * @typedef {Object} Check
 * @property {string} id
 * @property {boolean} pass
 * @property {string} [detail]
 * @property {number} [line]
 * @property {string} [suggestion]
 * @property {*} [value]
 */

const ok = (id, extra = {}) => ({ id, pass: true, ...extra })
const no = (id, detail, extra = {}) => ({ id, pass: false, detail, ...extra })

/** 검증 규칙 — D04 §3 */
export const RULES = {
  frontmatter(doc) {
    if (!doc.tene || Object.keys(doc.tene).length === 0) {
      return no('frontmatter', 'YAML frontmatter 의 tene 블록이 없습니다')
    }
    return ok('frontmatter')
  },

  sections(doc, ctx) {
    const required = requiredSections(ctx.docType, ctx.profile)
    const missing = required.filter((id) => !doc.sections.has(id))
    return missing.length
      ? no('sections', `누락 섹션: ${missing.join(', ')}`, { value: missing })
      : ok('sections', { value: required.length })
  },

  auto_blocks_paired(doc) {
    const bad = doc.autoBlocks.filter((b) => b.endLine === null)
    return bad.length
      ? no('auto_blocks_paired', `end 마커가 없는 블록: ${bad.map((b) => b.name).join(', ')}`, { line: bad[0].startLine })
      : ok('auto_blocks_paired')
  },

  nongoals_nonempty(doc) {
    const sec = doc.sections.get('nongoals')
    if (!sec) return no('nongoals_nonempty', '범위 밖 섹션이 없습니다')
    return isPlaceholderOnly(sec.body)
      ? no('nongoals_nonempty', '범위 밖이 비어 있습니다. "없음" 이라도 명시적으로 적으세요', { line: sec.startLine })
      : ok('nongoals_nonempty')
  },

  intent_count(doc, ctx) {
    const n = extractIntents(doc).length
    const min = ctx.minIntents ?? 1
    return n >= min ? ok('intent_count', { value: n }) : no('intent_count', `확정된 의도가 ${n}개입니다 (최소 ${min})`)
  },

  ac_count(doc, ctx) {
    const n = extractAc(doc).length
    const min = ctx.minAc ?? 1
    return n >= min ? ok('ac_count', { value: n }) : no('ac_count', `수용 기준이 ${n}개입니다 (최소 ${min})`)
  },

  ac_method_tagged(doc) {
    const bad = extractAc(doc).filter((a) => !['UNIT', 'DATA', 'UX'].includes(a.method))
    return bad.length
      ? no('ac_method_tagged', `검증 방식이 없거나 잘못됨: ${bad.map((a) => a.id).join(', ')} (UNIT|DATA|UX)`)
      : ok('ac_method_tagged')
  },

  ac_priority_tagged(doc) {
    const bad = extractAc(doc).filter((a) => !['blocking', 'non-blocking'].includes(a.priority))
    return bad.length
      ? no('ac_priority_tagged', `우선도가 없거나 잘못됨: ${bad.map((a) => a.id).join(', ')} (blocking|non-blocking)`)
      : ok('ac_priority_tagged')
  },

  ac_unwanted_min(doc, ctx) {
    const n = extractAc(doc).filter((a) => a.pattern === 'unwanted').length
    const min = ctx.minUnwanted ?? 1
    return n >= min
      ? ok('ac_unwanted_min', { value: n })
      : no('ac_unwanted_min',
          `실패 조건(If-then) 기준이 ${n}개입니다 (최소 ${min}). 바이브 코딩이 가장 잘 빠뜨리는 영역입니다`,
          { suggestion: '"If <조건>, then 시스템은 <응답> 해야 한다" 형태로 최소 1개를 추가하세요' })
  },

  ac_no_vague(doc) {
    const bad = extractAc(doc).filter((a) => VAGUE_RE.test(a.statement))
    if (!bad.length) return ok('ac_no_vague')
    const first = bad[0]
    const word = first.statement.match(VAGUE_RE)?.[0]
    return no('ac_no_vague', `${first.id} 의 "${word}" 는 판정할 수 없습니다`, {
      suggestion: '측정 가능한 수치나 관찰 가능한 상태로 바꾸세요. 예: "3초 이내에 응답해야 한다"',
      value: bad.map((a) => a.id),
    })
  },

  ac_coverage_full(doc) {
    const rows = extractCoverage(doc)
    if (!rows.length) return no('ac_coverage_full', 'AC 커버리지 표가 비어 있습니다')
    const uncovered = rows.filter((r) => /uncovered|미커버|없음/.test(r.status) || !r.covers || r.covers === '—')
    return uncovered.length
      ? no('ac_coverage_full', `커버되지 않은 AC: ${uncovered.map((r) => r.ac).join(', ')}`)
      : ok('ac_coverage_full', { value: rows.length })
  },

  layers_all_four(doc) {
    const sec = doc.sections.get('layers') ?? doc.sections.get('r4')
    if (!sec) return no('layers_all_four', '계층 섹션이 없습니다')
    const missing = LAYER_KEYS.filter((k) => !LAYER_HINTS[k].test(sec.body))
    return missing.length
      ? no('layers_all_four',
          `기재되지 않은 계층: ${missing.join(', ')} — "해당 없음" 이라도 명시해야 합니다`,
          { line: sec.startLine, value: missing })
      : ok('layers_all_four')
  },

  questions_present(doc) {
    const sec = doc.sections.get('questions') ?? doc.sections.get('r5')
    if (!sec) return no('questions_present', '6가지 질문 섹션이 없습니다')
    return sec.tables.length
      ? ok('questions_present', { value: sec.tables.length })
      : no('questions_present', '6가지 질문 표가 없습니다', { line: sec.startLine })
  },

  transitions_present(doc, ctx) {
    if (!ctx.hasUxAc) return ok('transitions_present', { detail: 'UX 기준 없음 — 해당 없음' })
    const n = extractTransitions(doc).length
    return n > 0
      ? ok('transitions_present', { value: n })
      : no('transitions_present', 'UX 수용 기준이 있는데 화면 전이 표가 없습니다')
  },

  anchors_resolved(doc, ctx) {
    const anchors = extractAnchors(doc)
    const missing = (ctx.acIds ?? []).filter((id) => !(anchors[id]?.length))
    return missing.length
      ? no('anchors_resolved', `앵커가 없는 AC: ${missing.join(', ')}`)
      : ok('anchors_resolved', { value: Object.keys(anchors).length })
  },

  all_ac_judged(doc, ctx) {
    const verdicts = extractVerdicts(doc)
    const judged = new Set(verdicts.filter((v) => v.verdict !== 'pending').map((v) => v.ac))
    const missing = (ctx.acIds ?? []).filter((id) => !judged.has(id))
    return missing.length
      ? no('all_ac_judged', `판정되지 않은 AC: ${missing.join(', ')}`)
      : ok('all_ac_judged', { value: judged.size })
  },

  insufficient_reason(doc) {
    const bad = extractInsufficient(doc).filter((x) => !x.reason)
    return bad.length
      ? no('insufficient_reason', `사유가 없는 미측정 항목: ${bad.map((x) => x.item).join(', ')}`)
      : ok('insufficient_reason')
  },

  r1_to_r6_present(doc) {
    const ids = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']
    const missing = ids.filter((id) => !doc.sections.has(id))
    if (missing.length) return no('r1_to_r6_present', `누락: ${missing.join(', ').toUpperCase()}`)
    const empty = ids.filter((id) => isPlaceholderOnly(doc.sections.get(id).body))
    return empty.length
      ? no('r1_to_r6_present', `비어 있음: ${empty.join(', ').toUpperCase()} — "해당 없음" 이라도 적으세요`)
      : ok('r1_to_r6_present')
  },

  r6_reasons(doc) {
    const bad = extractCarry(doc).filter((c) => !c.reason)
    return bad.length
      ? no('r6_reasons', `사유가 없는 이월 항목: ${bad.map((c) => c.id).join(', ')}`)
      : ok('r6_reasons')
  },
}

/** 문서 종류별 적용 규칙 — 게이트와 1:1 대응 (D02 §2.1) */
export const RULES_BY_DOC = {
  prd: ['frontmatter', 'sections', 'auto_blocks_paired', 'nongoals_nonempty',
        'intent_count', 'ac_count', 'ac_method_tagged', 'ac_priority_tagged',
        'ac_unwanted_min', 'ac_no_vague'],
  plan: ['frontmatter', 'sections', 'auto_blocks_paired', 'ac_coverage_full'],
  design: ['frontmatter', 'sections', 'auto_blocks_paired', 'layers_all_four',
           'questions_present', 'transitions_present', 'anchors_resolved'],
  'loop-check': ['frontmatter', 'sections', 'auto_blocks_paired'],
  qa: ['frontmatter', 'sections', 'auto_blocks_paired', 'all_ac_judged', 'insufficient_reason'],
  report: ['frontmatter', 'sections', 'auto_blocks_paired', 'r1_to_r6_present',
           'layers_all_four', 'r6_reasons'],
  'master-plan': ['frontmatter', 'sections', 'auto_blocks_paired'],
}

/**
 * @param {ReturnType<typeof import('./parser.js').parseDoc>} doc
 * @param {{ docType: string, profile?: string, acIds?: string[], hasUxAc?: boolean,
 *           minAc?: number, minIntents?: number, minUnwanted?: number, strict?: boolean }} ctx
 */
export function validateDoc(doc, ctx) {
  const ruleIds = RULES_BY_DOC[ctx.docType] ?? ['frontmatter', 'sections']
  const checks = ruleIds.map((id) => {
    try {
      return RULES[id](doc, ctx)
    } catch (err) {
      return no(id, `검증 중 오류: ${err.message}`)
    }
  })

  // 파서가 보고한 구조 오류를 합친다
  for (const e of doc.errors) {
    if (e.code === 'AUTO_BLOCK_UNPAIRED') continue // auto_blocks_paired 가 이미 본다
    checks.push(no(e.code.toLowerCase(), e.detail, { line: e.line }))
  }

  const failed = checks.filter((c) => !c.pass)
  return {
    valid: failed.length === 0,
    checks,
    failed: failed.map((c) => c.id),
    freeSections: doc.freeSections,
  }
}
