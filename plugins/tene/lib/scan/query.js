/**
 * 질의 API — D06 §1.1, §4
 *
 * Tier 1(LSP)은 모델이 담당한다. 이 모듈은 **Tier 2** 다.
 *
 * 인덱스로 답할 수 없으면 `needs-investigation` 을 돌려준다.
 * 억지로 낮은 신뢰 결과를 주면 그것이 문서에 확정처럼 실린다 —
 * 그게 이 플러그인이 막으려는 바로 그 실패다.
 */

/** 답을 낼 수 없는 이유 */
export const MISS = {
  NOT_INDEXED: 'not_indexed',   // 인덱스 자체가 없다
  NO_MATCH: 'no_match',         // 인덱스에 그 이름이 없다
  AMBIGUOUS: 'ambiguous',       // 같은 이름의 정의가 여럿이라 하나로 정할 수 없다
  LOW_CONFIDENCE: 'low_confidence',
}

const found = (results, extra = {}) => ({
  ok: true, source: 'indexed', results, count: results.length, ...extra,
})

const miss = (reason, hint, extra = {}) => ({
  ok: false, source: 'needs-investigation', results: [], count: 0, reason, hint, ...extra,
})

function requireIndex(index) {
  if (!index?.symbols) {
    return miss(MISS.NOT_INDEXED, 'tene-scan build 로 인덱스를 만드세요')
  }
  return null
}

/** 심볼 정의 위치 */
export function definitions(index, name) {
  const bad = requireIndex(index)
  if (bad) return bad

  const defs = index.symbols[name]
  if (!defs?.length) {
    return miss(MISS.NO_MATCH, `인덱스에 '${name}' 정의가 없습니다. 동적 생성이거나 미지원 언어일 수 있습니다`)
  }
  // 같은 이름이 여러 파일에 있으면 전부 돌려주되 모호함을 표시한다.
  // 하나를 골라주면 그게 틀렸을 때 아무도 모른다.
  const ambiguous = defs.length > 1
  return found(defs, {
    ambiguous,
    ...(ambiguous ? { note: `같은 이름의 정의가 ${defs.length}곳에 있습니다` } : {}),
  })
}

/** 심볼을 참조하는 위치 */
export function references(index, name, { kinds = null } = {}) {
  const bad = requireIndex(index)
  if (bad) return bad

  let refs = index.refs[name] ?? []
  if (kinds) refs = refs.filter((r) => kinds.includes(r.kind))
  if (!refs.length) {
    // 정의는 있는데 참조가 없다 = orphan 후보. "못 찾음" 과 다르다.
    const hasDefs = Boolean(index.symbols[name]?.length)
    return hasDefs
      ? found([], { orphanCandidate: true, note: '정의는 있으나 참조가 없습니다 (orphan 후보)' })
      : miss(MISS.NO_MATCH, `'${name}' 에 대한 참조가 인덱스에 없습니다`)
  }
  return found(refs, { lowConfidence: refs.filter((r) => r.confidence !== 'high').length })
}

/** 호출하는 쪽 — 참조 중 call/member-call 만 */
export function callers(index, name) {
  return references(index, name, { kinds: ['call', 'member-call', 'jsx', 'instantiation'] })
}

/** 이 파일이 import 하는 것 */
export function importsOf(index, path) {
  const bad = requireIndex(index)
  if (bad) return bad
  const list = index.imports?.[path]
  if (!list) return miss(MISS.NO_MATCH, `'${path}' 가 인덱스에 없습니다`)
  return found(list)
}

/** 이 심볼을 import 하는 파일들 */
export function importedBy(index, name) {
  const bad = requireIndex(index)
  if (bad) return bad
  const out = []
  for (const [file, list] of Object.entries(index.imports ?? {})) {
    for (const im of list) {
      if (im.names?.some((n) => n.name === name || n.local === name)) {
        out.push({ file, line: im.line, from: im.from, resolved: im.resolved })
      }
    }
  }
  return out.length ? found(out) : found([], { note: `'${name}' 를 import 하는 파일이 없습니다` })
}

/** 이 파일을 import 하는 파일들 */
export function dependents(index, path) {
  const bad = requireIndex(index)
  if (bad) return bad
  const out = []
  for (const [file, list] of Object.entries(index.imports ?? {})) {
    for (const im of list) {
      if (im.resolved === path) out.push({ file, line: im.line, from: im.from })
    }
  }
  return found(out)
}

/** 이 파일이 정의하는 심볼 */
export function symbolsIn(index, path) {
  const bad = requireIndex(index)
  if (bad) return bad
  const out = []
  for (const [name, defs] of Object.entries(index.symbols ?? {})) {
    for (const d of defs) if (d.file === path) out.push({ name, ...d })
  }
  return found(out.sort((a, b) => a.line - b.line))
}

/**
 * 정의는 있는데 참조가 없는 심볼 — orphan.
 *
 * exported 만 본다. 내부 헬퍼는 같은 파일 안에서만 쓰여도 정상이고,
 * 정규식 인덱서가 그것까지 정확히 세지 못한다.
 */
export function orphans(index, { includeTypes = false } = {}) {
  const bad = requireIndex(index)
  if (bad) return bad
  const out = []
  for (const [name, defs] of Object.entries(index.symbols ?? {})) {
    const refs = index.refs[name] ?? []
    if (refs.length) continue
    for (const d of defs) {
      if (!d.exported) continue
      if (!includeTypes && (d.kind === 'type' || d.kind === 'interface')) continue
      // 진입점은 참조가 없는 것이 정상이다
      if (/^(main|handler|default|index)$/i.test(name)) continue
      out.push({ name, ...d })
    }
  }
  return found(out, { note: 'exported 인데 참조가 없는 심볼입니다. 진입점이거나 미사용일 수 있습니다' })
}

/** 추적 불가로 기록된 것들 — 정직성의 근거 */
export function unresolvedIn(index, { file = null } = {}) {
  const bad = requireIndex(index)
  if (bad) return bad
  const list = file
    ? (index.unresolved ?? []).filter((u) => u.file === file)
    : (index.unresolved ?? [])
  return found(list)
}

/**
 * 단일 진입점. 스킬과 에이전트는 이것만 부른다.
 *
 * @param {object} index
 * @param {'definitions'|'references'|'callers'|'imports'|'imported-by'|'dependents'|'symbols-in'|'orphans'|'unresolved'} what
 * @param {string} target
 */
export function query(index, what, target, opts = {}) {
  switch (what) {
    case 'definitions': return definitions(index, target)
    case 'references': return references(index, target, opts)
    case 'callers': return callers(index, target)
    case 'imports': return importsOf(index, target)
    case 'imported-by': return importedBy(index, target)
    case 'dependents': return dependents(index, target)
    case 'symbols-in': return symbolsIn(index, target)
    case 'orphans': return orphans(index, opts)
    case 'unresolved': return unresolvedIn(index, { file: target || null })
    default:
      return miss('unknown_query', `알 수 없는 질의: ${what}`)
  }
}

export const QUERY_TARGETS = [
  'definitions', 'references', 'callers', 'imports',
  'imported-by', 'dependents', 'symbols-in', 'orphans', 'unresolved',
]

/**
 * 인덱스의 신뢰 수준을 요약한다. 문서에 "어느 Tier 가 답했는가" 를 적을 때 쓴다.
 */
export function indexHealth(index) {
  if (!index) return { available: false, tier: 'none' }
  const total = index.stats?.refs ?? 0
  const unresolvedCount = index.unresolved?.length ?? 0
  return {
    available: true,
    tier: 'indexed',
    engine: index.engine,
    builtAt: index.builtAt,
    files: index.stats?.indexed ?? 0,
    symbols: index.stats?.symbols ?? 0,
    refs: total,
    unresolved: unresolvedCount,
    unsupported: index.unsupported ?? [],
    // 미해결이 많으면 이 인덱스의 답을 그대로 믿으면 안 된다
    caution: unresolvedCount > 0
      ? `${unresolvedCount}건이 정적으로 추적되지 않습니다 (동적 디스패치·리플렉션·DI)`
      : null,
  }
}
