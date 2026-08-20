/** 안정 직렬화 — D03 §2.2 (키 재귀 정렬로 git diff 안정화) */

/** 객체 키를 재귀적으로 정렬한다. 배열 순서는 보존한다. */
export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out = {}
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k])
    return out
  }
  return value
}

/** 2-space 들여쓰기 + 키 정렬 + trailing newline */
export function stableJson(value) {
  return JSON.stringify(sortKeys(value), null, 2) + '\n'
}

/** 한 줄 JSON (NDJSON / stdout 봉투용). 키 정렬 적용. */
export function lineJson(value) {
  return JSON.stringify(sortKeys(value))
}

/** 파싱 실패 시 null. 호출자가 손상 처리를 결정한다. */
export function parseJsonSafe(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
