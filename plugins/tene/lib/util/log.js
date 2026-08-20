/** 로깅 정책 — D12 §9 (홈 디렉토리 노출 방지, 시크릿 미기록) */

const HOME_PATTERNS = [
  /\/Users\/[^/\s]+/g,
  /\/home\/[^/\s]+/g,
  /C:\\Users\\[^\\\s]+/g,
]

/** 절대 경로에서 홈 디렉토리를 ~ 로 치환한다 */
export function safePath(p) {
  let s = String(p ?? '')
  for (const re of HOME_PATTERNS) s = s.replace(re, '~')
  return s
}

export const isDebug = () => process.env.TENE_DEBUG === '1'

/** stderr 로만 나간다. stdout 은 봉투 전용이다. */
export function debug(...args) {
  if (!isDebug()) return
  process.stderr.write(`[tene:debug] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`)
}

export function warn(message) {
  process.stderr.write(`[tene:warn] ${safePath(message)}\n`)
}
