/**
 * 언어 팩 레지스트리 — D06 §2.2
 *
 * 모든 팩은 같은 계약을 지킨다:
 *   stripNonCode(src)            → 같은 길이의 문자열 (라인 번호 보존)
 *   extractDefinitions(src, opt) → Definition[]
 *   extractImports(src)          → ImportRef[]
 *   extractReferences(src, opt)  → { refs: Reference[], unresolved: Unresolved[] }
 *   resolveCandidates(file, spec)→ string[]  (없으면 빈 배열)
 *
 * @typedef {Object} Definition
 * @property {string} name
 * @property {'function'|'class'|'const'|'type'|'interface'|'method'|'component'} kind
 * @property {number} line
 * @property {boolean} exported
 * @property {string} signatureText
 * @property {'high'|'medium'|'low'} confidence
 */
import * as typescript from './typescript.js'
import * as python from './python.js'
import * as go from './go.js'
import * as java from './java.js'

export const PACKS = { typescript, python, go, java }

export function packFor(lang) {
  return PACKS[lang] ?? null
}

export const SUPPORTED_LANGS = Object.keys(PACKS)

/**
 * 팩이 계약을 지키는지 본다. 새 언어를 붙일 때 여기서 걸린다.
 * @returns {string[]} 문제 목록 (비어 있으면 정상)
 */
export function validatePack(pack) {
  const problems = []
  for (const fn of ['stripNonCode', 'extractDefinitions', 'extractImports', 'extractReferences']) {
    if (typeof pack?.[fn] !== 'function') problems.push(`${fn} 없음`)
  }
  if (!Array.isArray(pack?.extensions) || !pack.extensions.length) problems.push('extensions 없음')
  if (typeof pack?.name !== 'string') problems.push('name 없음')

  // 길이 보존은 계약의 핵심이다 — 어기면 모든 라인 번호가 어긋난다
  if (typeof pack?.stripNonCode === 'function') {
    const sample = 'a\n"bb"\nc'
    const out = pack.stripNonCode(sample)
    if (out.length !== sample.length) problems.push(`stripNonCode 가 길이를 바꿈 (${sample.length} → ${out.length})`)
    if (out.split('\n').length !== sample.split('\n').length) problems.push('stripNonCode 가 줄 수를 바꿈')
  }
  return problems
}

/** 한 파일을 팩으로 분석한다. 팩이 없으면 null. */
export function analyze(lang, src, opts = {}) {
  const pack = packFor(lang)
  if (!pack) return null
  const { refs, unresolved } = pack.extractReferences(src, opts)
  return {
    lang,
    definitions: pack.extractDefinitions(src, opts),
    imports: pack.extractImports(src, opts),
    refs,
    unresolved,
  }
}
