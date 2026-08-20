/** 데드라인 가드 — D12 §6.1 (훅 성능 예산 강제) */

export class DeadlineExceeded extends Error {
  constructor(ms) {
    super(`deadline ${ms}ms exceeded`)
    this.name = 'DeadlineExceeded'
    this.ms = ms
  }
}

/**
 * @template T
 * @param {number} ms
 * @param {(check: () => void) => T} fn  중간중간 check() 를 호출해 초과를 감지한다
 * @returns {T}
 */
export function withDeadline(ms, fn) {
  const t0 = performance.now()
  const check = () => {
    if (performance.now() - t0 > ms) throw new DeadlineExceeded(ms)
  }
  return fn(check)
}

export function elapsedMs(t0) {
  return Math.round(performance.now() - t0)
}
