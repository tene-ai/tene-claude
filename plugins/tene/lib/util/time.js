/** 시간 유틸 — D12 §7.1 (결정론: 실제 시계 접근은 여기서만) */

/** @returns {string} RFC 3339 UTC (초 단위, 밀리초 제거) */
export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** @returns {string} YYYY-MM-DD */
export function todayIso() {
  return nowIso().slice(0, 10)
}

/** @returns {string} YYYY-MM (아카이브 디렉토리용) */
export function yearMonth(iso = nowIso()) {
  return iso.slice(0, 7)
}

/** run id: run_YYYYMMDD_NN — D08 §5.2 */
export function makeRunId(seq = 1) {
  return `run_${nowIso().slice(0, 10).replace(/-/g, '')}_${String(seq).padStart(2, '0')}`
}

export function parseIso(s) {
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : t
}

export function olderThan(iso, ms) {
  const t = parseIso(iso)
  return t === null ? true : Date.now() - t > ms
}
