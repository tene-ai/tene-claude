/**
 * 셸 명령 분해 — D11 §3.2~3.3
 *
 * 체인 명령에서 앞 세그먼트가 안전하다고 전체를 통과시키면 안 된다.
 * `echo hi && tene get KEY` 는 두 번째 세그먼트가 위반이다.
 *
 * 반대로 오탐도 막아야 한다. `grep "tene get" README.md` 는 grep 이지 tene 이 아니다.
 * **세그먼트의 첫 토큰만 명령으로 본다** — 이것이 오탐 방지의 핵심이다.
 */

/** 따옴표 안은 분해하지 않는다 */
function scanQuote(s, start) {
  const q = s[start]
  let i = start + 1
  while (i < s.length) {
    if (s[i] === '\\') { i += 2; continue }
    if (s[i] === q) return i + 1
    i++
  }
  return s.length
}

/**
 * 명령을 세그먼트로 나눈다.
 * `&&` `||` `;` `|` 개행 `&` 로 나누되, 따옴표와 괄호 안은 건드리지 않는다.
 */
export function segments(command) {
  const s = String(command ?? '')
  const parts = []
  let depth = 0
  let cur = ''
  let i = 0

  while (i < s.length) {
    const c = s[i]

    if (c === '"' || c === "'") {
      const e = scanQuote(s, i)
      cur += s.slice(i, e)
      i = e
      continue
    }
    if (c === '\\') { cur += s.slice(i, i + 2); i += 2; continue }

    if (c === '(' || c === '{') depth++
    if (c === ')' || c === '}') depth = Math.max(0, depth - 1)

    if (depth === 0) {
      const m = s.slice(i).match(/^(\|\||&&|;|\||\n|&(?!&))/)
      if (m) {
        parts.push(cur.trim())
        cur = ''
        i += m[0].length
        continue
      }
    }
    cur += c
    i++
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts.filter(Boolean)
}

/** 환경변수 프리픽스와 래퍼를 벗긴 세그먼트 */
export function stripPrefix(segment) {
  let s = String(segment ?? '').trim()
  // FOO=bar BAZ="x y" tene get KEY
  s = s.replace(/^(\s*[A-Za-z_]\w*=(?:"[^"]*"|'[^']*'|\S*)\s+)+/, '')
  // sudo / env / nohup / time / command
  let prev
  do {
    prev = s
    s = s.replace(/^(sudo|env|nohup|time|command|exec)\s+(-\S+\s+)*/, '')
    s = s.replace(/^(\s*[A-Za-z_]\w*=(?:"[^"]*"|'[^']*'|\S*)\s+)+/, '')
  } while (s !== prev)
  return s
}

/** 세그먼트의 실행 명령 이름 (경로 제거) */
export function commandOf(segment) {
  const s = stripPrefix(segment)
  const m = s.match(/^(\S+)/)
  if (!m) return null
  const token = m[1].replace(/^["']|["']$/g, '')
  const slash = Math.max(token.lastIndexOf('/'), token.lastIndexOf('\\'))
  return slash >= 0 ? token.slice(slash + 1) : token
}

/**
 * 프리픽스를 벗기고 **명령 토큰을 basename 으로 바꾼** 문자열.
 *
 * 규칙 정규식이 `^tene\s+get` 형태이므로, `/usr/local/bin/tene get KEY` 를
 * 그대로 넘기면 매치되지 않아 통과한다 — 실제로 그렇게 뚫렸다.
 */
export function normalizedCommand(segment) {
  const s = stripPrefix(segment)
  const m = s.match(/^(\S+)/)
  if (!m) return s
  const token = m[1].replace(/^["']|["']$/g, '')
  const slash = Math.max(token.lastIndexOf('/'), token.lastIndexOf('\\'))
  if (slash < 0) return s
  return token.slice(slash + 1) + s.slice(m[1].length)
}

const INDIRECT_RE = /^(?:bash|sh|zsh|dash|ksh)\s+(?:-\w+\s+)*-c\s+(['"])([\s\S]*?)\1/
const EVAL_RE = /^eval\s+(.+)$/s
const XARGS_RE = /^xargs\s+(?:-\S+\s+)*(.+)$/s

/**
 * 간접 실행 안을 펼친다 — D11 §3.5
 *
 * `bash -c 'tene get KEY'` 를 그냥 두면 명령이 `bash` 라서 통과한다.
 * 안을 열어 다시 분해해야 한다.
 */
export function expandIndirect(segment) {
  const s = stripPrefix(segment)

  const m = s.match(INDIRECT_RE)
  if (m) return segments(m[2])

  const ev = s.match(EVAL_RE)
  if (ev) return segments(ev[1].replace(/^['"]|['"]$/g, ''))

  const xa = s.match(XARGS_RE)
  if (xa) return segments(xa[1].replace(/^['"]|['"]$/g, ''))

  return null
}

const HEREDOC_RE = /<<-?\s*(['"]?)(\w+)\1\r?\n([\s\S]*?)\r?\n\s*\2/g

/** heredoc 본문도 명령일 수 있다 */
export function heredocBodies(command) {
  const out = []
  for (const m of String(command ?? '').matchAll(HEREDOC_RE)) out.push(m[3])
  return out
}

const SUBSHELL_RE = /\$\(([^()]*)\)|`([^`]*)`/g

/** 명령 치환 `$(...)` 안도 실행된다 */
export function substitutions(segment) {
  const out = []
  for (const m of String(segment ?? '').matchAll(SUBSHELL_RE)) {
    const inner = m[1] ?? m[2]
    if (inner?.trim()) out.push(inner.trim())
  }
  return out
}

/**
 * 검사해야 할 모든 세그먼트를 낸다 — 간접 실행·치환·heredoc 을 전부 펼친다.
 *
 * 깊이 제한을 둔다. 무한 중첩으로 가드를 멈추게 하는 것을 막는다 —
 * 가드가 멈추면 fail-closed 로 전부 차단되므로 사용자가 못 쓰게 된다.
 */
export function allSegments(command, { maxDepth = 4 } = {}) {
  const seen = new Set()
  const out = []

  const walk = (cmd, depth) => {
    if (depth > maxDepth) return
    for (const seg of segments(cmd)) {
      if (seen.has(seg)) continue
      seen.add(seg)
      out.push(seg)

      const inner = expandIndirect(seg)
      if (inner) for (const s of inner) walk(s, depth + 1)

      for (const sub of substitutions(seg)) walk(sub, depth + 1)
    }
    for (const body of heredocBodies(cmd)) walk(body, depth + 1)
  }

  walk(String(command ?? ''), 0)
  return out
}
