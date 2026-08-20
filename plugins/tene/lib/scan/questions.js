/**
 * 6가지 질문 조립 — D06 §4
 *
 * Q1 선언·정의된 이름      Q2 정의된 파일
 * Q3 import·참조 위치      Q4 호출·사용 위치
 * Q5 입력 데이터 형태      Q6 반환·변경 데이터
 *
 * 이 여섯 질문의 목적은 "이 심볼을 안다" 를 증명하는 것이다.
 * **모르는 항목은 모른다고 답한다.** 빈칸을 그럴듯한 문장으로 채우면
 * 6질문이 검사 도구가 아니라 서술 도구가 되고, 그 순간 쓸모가 없어진다.
 */
import { callers, definitions, importedBy, references, unresolvedIn } from './query.js'
import { judgeLayer } from './layer.js'

export const QUESTION_IDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6']

export const QUESTION_LABELS = {
  q1: { ko: '선언·정의된 이름', en: 'Declared name' },
  q2: { ko: '정의 파일', en: 'Defining file' },
  q3: { ko: 'import·참조 위치', en: 'Imported/referenced at' },
  q4: { ko: '호출·사용 위치', en: 'Called/used at' },
  q5: { ko: '입력 데이터 형태', en: 'Input data shape' },
  q6: { ko: '반환·변경 데이터', en: 'Returned/mutated data' },
}

const UNKNOWN = (reason) => ({ answer: null, source: 'unknown', reason })

/**
 * 시그니처에서 매개변수를 뽑는다.
 *
 * 정규식 인덱서의 한계가 가장 크게 드러나는 곳이다. 타입을 완전히 파싱하지 않고
 * 괄호 안 텍스트를 그대로 보여준다 — 해석해서 틀리느니 원문을 보이는 편이 낫다.
 */
export function parseParams(signatureText) {
  const s = String(signatureText ?? '')
  const open = s.indexOf('(')
  if (open < 0) return null

  let depth = 0
  let close = -1
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')') { depth--; if (depth === 0) { close = i; break } }
  }
  if (close < 0) return null

  const inner = s.slice(open + 1, close).trim()
  if (!inner) return { params: [], raw: '()' }

  const params = splitTopLevel(inner).map((p) => {
    const t = p.trim()
    const colon = findTopLevelColon(t)
    return colon > 0
      ? { name: t.slice(0, colon).trim(), type: t.slice(colon + 1).trim() }
      : { name: t, type: null }
  })
  return { params, raw: `(${inner})` }
}

/** 반환 타입 — `): T {` 또는 `-> T:` (Python) */
export function parseReturn(signatureText) {
  const s = String(signatureText ?? '')
  const arrow = s.match(/->\s*([^:{]+)/)
  if (arrow) return arrow[1].trim()

  const close = s.lastIndexOf(')')
  if (close < 0) return null
  const after = s.slice(close + 1)
  const m = after.match(/^\s*:\s*([^{=]+)/)
  return m ? m[1].trim() : null
}

function splitTopLevel(s) {
  const out = []
  let depth = 0
  let cur = ''
  for (const c of s) {
    if ('<([{'.includes(c)) depth++
    else if ('>)]}'.includes(c)) depth--
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue }
    cur += c
  }
  if (cur.trim()) out.push(cur)
  return out
}

function findTopLevelColon(s) {
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if ('<([{'.includes(c)) depth++
    else if ('>)]}'.includes(c)) depth--
    else if (c === ':' && depth === 0) return i
  }
  return -1
}

/**
 * 심볼 하나에 대해 6질문을 답한다.
 *
 * @param {object} index
 * @param {string} symbol
 * @param {{ rules?: object, maxLocations?: number }} [opts]
 * @returns {{ symbol: string, answers: object, complete: boolean, unanswered: string[], tier: string }}
 */
export function answerSix(index, symbol, opts = {}) {
  const max = opts.maxLocations ?? 10
  const answers = {}

  const defs = definitions(index, symbol)

  // Q1 — 이름 자체는 질문이 아니라 확인이다. 정의를 못 찾으면 답할 게 없다.
  answers.q1 = defs.ok
    ? {
        answer: symbol,
        kinds: [...new Set(defs.results.map((d) => d.kind))],
        exported: defs.results.some((d) => d.exported),
        source: 'indexed',
        confidence: worstConfidence(defs.results),
      }
    : UNKNOWN(defs.hint)

  // Q2
  answers.q2 = defs.ok
    ? {
        answer: defs.results.map((d) => `${d.file}:${d.line}`),
        source: 'indexed',
        confidence: worstConfidence(defs.results),
        ...(defs.ambiguous ? { ambiguous: true, note: defs.note } : {}),
        ...(opts.rules
          ? { layers: [...new Set(defs.results.map((d) => judgeLayer(d.file, opts.rules).layer))] }
          : {}),
      }
    : UNKNOWN(defs.hint)

  // Q3 — import 하는 곳
  const imp = importedBy(index, symbol)
  answers.q3 = imp.ok
    ? imp.results.length
      ? { answer: imp.results.slice(0, max).map((r) => `${r.file}:${r.line}`), total: imp.results.length, source: 'indexed', confidence: 'high' }
      : { answer: [], source: 'indexed', confidence: 'medium', note: 'import 하는 파일이 없습니다 (같은 파일 안에서만 쓰이거나 진입점)' }
    : UNKNOWN(imp.hint)

  // Q4 — 호출하는 곳
  const call = callers(index, symbol)
  answers.q4 = call.ok
    ? call.results.length
      ? {
          answer: call.results.slice(0, max).map((r) => `${r.file}:${r.line}${r.kind !== 'call' ? ` (${r.kind})` : ''}`),
          total: call.results.length,
          source: 'indexed',
          confidence: call.lowConfidence ? 'medium' : 'high',
          ...(call.lowConfidence ? { note: `${call.lowConfidence}건은 확신도가 낮습니다` } : {}),
        }
      : { answer: [], source: 'indexed', confidence: 'medium', orphanCandidate: true, note: '호출하는 곳이 없습니다 (orphan 후보)' }
    : UNKNOWN(call.hint)

  // Q5 / Q6 — 시그니처에서. 정규식으로 뽑으므로 medium 이 상한이다.
  const primary = defs.ok ? defs.results[0] : null
  const sig = primary?.signatureText

  const parsed = sig ? parseParams(sig) : null
  answers.q5 = parsed
    ? {
        answer: parsed.params.map((p) => (p.type ? `${p.name}: ${p.type}` : p.name)),
        raw: parsed.raw,
        source: 'signature',
        confidence: parsed.params.some((p) => p.type) ? 'medium' : 'low',
        ...(parsed.params.every((p) => !p.type) ? { note: '타입 표기가 없어 형태를 알 수 없습니다' } : {}),
      }
    : UNKNOWN(sig ? '시그니처에서 매개변수를 읽지 못했습니다' : '정의를 찾지 못해 시그니처가 없습니다')

  const ret = sig ? parseReturn(sig) : null
  answers.q6 = ret
    ? { answer: ret, source: 'signature', confidence: 'medium' }
    : UNKNOWN(sig ? '반환 타입 표기가 없습니다. 본문을 읽어야 합니다' : '정의를 찾지 못했습니다')

  const unanswered = QUESTION_IDS.filter((q) => answers[q].answer === null || answers[q].source === 'unknown')

  return {
    symbol,
    answers,
    complete: unanswered.length === 0,
    unanswered,
    // 어느 Tier 가 답했는지 항상 표기한다 (D06 §1)
    tier: defs.ok ? 'indexed' : 'needs-investigation',
    // 미해결로 기록된 것이 있으면 이 답이 불완전할 수 있다
    caveats: collectCaveats(index, defs),
  }
}

function worstConfidence(results) {
  if (results.some((r) => r.confidence === 'low')) return 'low'
  if (results.some((r) => r.confidence === 'medium')) return 'medium'
  return 'high'
}

function collectCaveats(index, defs) {
  if (!defs.ok) return []
  const files = new Set(defs.results.map((d) => d.file))
  const out = []
  for (const u of index.unresolved ?? []) {
    if (files.has(u.file)) out.push(`${u.file}:${u.line} ${u.reason}`)
  }
  return out.slice(0, 5)
}

/** 여러 심볼을 한 번에. 상한을 두고, 잘라낸 사실을 함께 돌려준다. */
export function answerMany(index, symbols, opts = {}) {
  const limit = opts.limit ?? 20
  const targets = symbols.slice(0, limit)
  const results = targets.map((s) => answerSix(index, s, opts))
  return {
    results,
    truncated: symbols.length > limit,
    // 상한 때문에 빠진 것을 조용히 숨기지 않는다
    omitted: symbols.length > limit ? symbols.slice(limit) : [],
    incomplete: results.filter((r) => !r.complete).map((r) => ({ symbol: r.symbol, unanswered: r.unanswered })),
  }
}

/** 마크다운 표로 — design.md / report.md 의 자동 생성 블록에 들어간다 */
export function renderQuestionsTable(result, { lang = 'ko' } = {}) {
  const lines = [`### \`${result.symbol}\``, '']
  lines.push(lang === 'ko' ? '| 질문 | 답변 | 출처 |' : '| Question | Answer | Source |')
  lines.push('|---|---|---|')

  for (const [i, q] of QUESTION_IDS.entries()) {
    const a = result.answers[q]
    const label = `Q${i + 1} ${QUESTION_LABELS[q][lang]}`
    const value = formatAnswer(a, lang)
    const src = a.answer === null
      ? (lang === 'ko' ? '❓ 조사 필요' : '❓ needs investigation')
      : `${a.source}${a.confidence ? ` (${a.confidence})` : ''}`
    lines.push(`| ${label} | ${value} | ${src} |`)
  }

  if (result.caveats?.length) {
    lines.push('', lang === 'ko'
      ? `> ⚠️ 이 파일에 정적으로 추적되지 않는 지점이 있습니다: ${result.caveats.join(', ')}`
      : `> ⚠️ Statically untraceable spots in this file: ${result.caveats.join(', ')}`)
  }
  return lines.join('\n')
}

function formatAnswer(a, lang) {
  if (a.answer === null) return lang === 'ko' ? `_${a.reason}_` : `_${a.reason}_`
  if (Array.isArray(a.answer)) {
    if (!a.answer.length) return a.note ? `_${a.note}_` : '—'
    const shown = a.answer.map((x) => `\`${x}\``).join(', ')
    const more = a.total && a.total > a.answer.length ? ` 외 ${a.total - a.answer.length}건` : ''
    return shown + more + (a.note ? ` — ${a.note}` : '')
  }
  return `\`${a.answer}\``
}
