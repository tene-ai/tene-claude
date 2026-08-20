/** 토큰 예산 — D05 §3.4 (SessionStart 주입 절삭) */

/** 한국어 혼용 기준 보수적 추정 */
const CHARS_PER_TOKEN = 2.5

export function estimateTokens(text) {
  return Math.ceil(String(text ?? '').length / CHARS_PER_TOKEN)
}

/**
 * 우선순위 순으로 줄을 채우다 예산을 넘으면 멈춘다.
 * @param {Array<{ key: string, text: string }>} lines  우선순위 내림차순
 * @param {number} maxTokens
 */
export function truncateToBudget(lines, maxTokens) {
  const out = []
  let used = 0
  for (const { text } of lines) {
    if (!text) continue
    const cost = estimateTokens(text)
    if (used + cost > maxTokens) break
    out.push(text)
    used += cost
  }
  return { text: out.join('\n'), tokens: used }
}
