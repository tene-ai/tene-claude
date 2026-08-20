/**
 * 자연어 라우팅 — D05 §5
 *
 * **제안만 한다. 차단하지 않는다.**
 *
 * 1단은 스킬의 description/when_to_use 로 모델이 판단하고,
 * 이 라우터는 모델이 놓치는 경우를 위한 결정론적 보조다.
 *
 * 같은 세션에서 같은 제안을 두 번 하지 않는다 — 반복되면 사용자가 무시하게 되고,
 * 무시하는 습관이 붙으면 정말 필요할 때도 안 읽는다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeAtomic } from '../util/atomic.js'
import { parseJsonSafe, stableJson } from '../util/json.js'
import { pluginRoot, STATE_DIR } from '../util/paths.js'
import { PHASES } from '../state/schema.js'

let cachedRules = null

export function loadRules() {
  if (cachedRules) return cachedRules
  try {
    const p = join(pluginRoot(), 'lib', 'router', 'rules.json')
    cachedRules = parseJsonSafe(readFileSync(p, 'utf8'))?.rules ?? []
  } catch {
    cachedRules = []
  }
  return cachedRules
}

/** 한글이 섞여 있으면 ko */
export function detectLang(text) {
  return /[가-힣]/.test(String(text ?? '')) ? 'ko' : 'en'
}

/** D05 §5.4 — 조건 표현 */
export function matchesCondition(when, state) {
  const w = String(when ?? 'always')
  if (w === 'always') return true

  const active = Boolean(state?.activeSprint)
  if (w === 'no-active-sprint') return !active
  if (w === 'has-active-sprint') return active
  if (w === 'tene-cli-available') return Boolean(state?.teneCli)

  const eq = w.match(/^phase=(.+)$/)
  if (eq) {
    if (!active) return false
    return eq[1].split('|').includes(state.phase)
  }

  const gte = w.match(/^phase>=(.+)$/)
  if (gte) {
    if (!active) return false
    const target = PHASES.indexOf(gte[1])
    const cur = PHASES.indexOf(state.phase)
    return target >= 0 && cur >= target
  }
  return false
}

export function matchesKeywords(any, prompt, lang) {
  const text = String(prompt ?? '').toLowerCase()
  if (!text) return null

  // 해당 언어를 먼저 보되, 반대 언어 키워드도 본다 (혼용 프롬프트가 흔하다)
  const order = lang === 'ko' ? ['ko', 'en'] : ['en', 'ko']
  for (const l of order) {
    for (const kw of any?.[l] ?? []) {
      if (text.includes(String(kw).toLowerCase())) return kw
    }
  }
  return null
}

// ── 중복 제어 ─────────────────────────────────────────────────────────

function suggestedPath(root) {
  return join(root, STATE_DIR, 'history', 'suggested.json')
}

export function readSuggested(root, sessionId) {
  const p = suggestedPath(root)
  if (!existsSync(p)) return { sessionId, suggested: [] }
  const raw = parseJsonSafe(readFileSync(p, 'utf8'))
  // 세션이 바뀌면 초기화한다
  if (!raw || raw.sessionId !== sessionId) return { sessionId, suggested: [] }
  return raw
}

export function markSuggested(root, sessionId, ruleId) {
  try {
    const cur = readSuggested(root, sessionId)
    if (cur.suggested.includes(ruleId)) return cur
    cur.suggested.push(ruleId)
    cur.sessionId = sessionId
    writeAtomic(suggestedPath(root), stableJson(cur), { root })
    return cur
  } catch {
    return { sessionId, suggested: [] } // 기록 실패가 제안을 막지 않는다
  }
}

// ── 진입점 ────────────────────────────────────────────────────────────

const DEFAULT_MESSAGE = {
  ko: (skill) => `이 요청은 /tene:${skill} 로 처리할 수 있습니다.`,
  en: (skill) => `This request maps to /tene:${skill}.`,
}

/**
 * @param {string} prompt
 * @param {{ activeSprint?: string, phase?: string, teneCli?: boolean, summary?: object }} state
 * @param {{ autoTrigger?: boolean, root?: string, sessionId?: string }} config
 */
export function route(prompt, state, config = {}) {
  if (config.autoTrigger === false) return null
  if (!prompt || prompt.trim().length < 3) return null
  // 이미 슬래시 명령을 쓰고 있으면 제안하지 않는다
  if (/^\s*\//.test(prompt)) return null

  const lang = detectLang(prompt)
  const rules = loadRules()

  const candidates = []
  for (const r of rules) {
    if (!matchesCondition(r.when, state)) continue
    const hit = matchesKeywords(r.any, prompt, lang)
    if (!hit) continue
    candidates.push({ ...r, matched: hit })
  }
  if (!candidates.length) return null

  candidates.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50))

  const seen = config.root ? readSuggested(config.root, config.sessionId).suggested : []
  const top = candidates.find((c) => !seen.includes(c.id))
  if (!top) return null

  if (config.root) markSuggested(config.root, config.sessionId, top.id)

  const message = top.message?.[lang] ?? top.message?.en ?? DEFAULT_MESSAGE[lang](top.suggest)
  return { rule: top.id, skill: top.suggest, matched: top.matched, message, lang }
}

/** 훅이 주입할 문자열 */
export function formatSuggestion(result, state, { lang = 'ko' } = {}) {
  if (!result) return null
  const lines = [`[tene] ${result.message}`]

  if (state?.activeSprint) {
    lines.push(lang === 'ko'
      ? `  현재 sprint: ${state.activeSprint} (phase: ${state.phase})`
      : `  Current sprint: ${state.activeSprint} (phase: ${state.phase})`)
  }
  lines.push(`  → /tene:${result.skill}`)
  return lines.join('\n')
}
