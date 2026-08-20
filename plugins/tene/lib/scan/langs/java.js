/**
 * Java 언어 팩 — D06 §2.7
 *
 * 메서드 판별이 가장 어려운 언어다. 반환 타입이 자유 형식이라
 * `if (x) {` 와 `void run() {` 을 정규식으로 완전히 가르지 못한다.
 * 그래서 **접근 제어자가 있는 것만** 메서드로 세고, 나머지는 놓친다.
 * 놓치는 쪽이 없는 메서드를 지어내는 쪽보다 낫다.
 */

export const name = 'java'
export const extensions = ['.java']

export function stripNonCode(src) {
  const n = src.length
  const out = new Array(n)
  let i = 0
  const blank = (from, to) => {
    for (let k = from; k < to; k++) out[k] = src[k] === '\n' ? '\n' : ' '
  }

  while (i < n) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') {
      const e = src.indexOf('\n', i)
      const end = e < 0 ? n : e
      blank(i, end); i = end; continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2)
      const end = e < 0 ? n : e + 2
      blank(i, end); i = end; continue
    }
    // 텍스트 블록 """
    if (src.slice(i, i + 3) === '"""') {
      const e = src.indexOf('"""', i + 3)
      const end = e < 0 ? n : e + 3
      blank(i, end); i = end; continue
    }
    if (c === '"' || c === "'") {
      const end = scanString(src, i, c)
      blank(i, end); i = end; continue
    }
    out[i] = c; i++
  }
  return out.join('')
}

function scanString(src, start, quote) {
  let i = start + 1
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (c === '\\') { i += 2; continue }
    if (c === quote) return i + 1
    if (c === '\n') return i
    i++
  }
  return n
}

const MODIFIERS = '(?:public|private|protected|static|final|abstract|synchronized|native|default)'

const DEF_PATTERNS = [
  { re: new RegExp(`^\\s*(?:@\\w+\\s+)*(${MODIFIERS}\\s+)*(?:abstract\\s+|final\\s+)*class\\s+(\\w+)`, 'gm'),
    name: 2, kind: 'class', mods: 1, confidence: 'high' },
  { re: new RegExp(`^\\s*(?:@\\w+\\s+)*(${MODIFIERS}\\s+)*interface\\s+(\\w+)`, 'gm'),
    name: 2, kind: 'interface', mods: 1, confidence: 'high' },
  { re: new RegExp(`^\\s*(?:@\\w+\\s+)*(${MODIFIERS}\\s+)*enum\\s+(\\w+)`, 'gm'),
    name: 2, kind: 'type', mods: 1, confidence: 'high' },
  { re: new RegExp(`^\\s*(?:@\\w+\\s+)*(${MODIFIERS}\\s+)*record\\s+(\\w+)`, 'gm'),
    name: 2, kind: 'class', mods: 1, confidence: 'high' },
  // 메서드 — 접근 제어자가 반드시 있어야 한다. 없으면 놓친다 (의도적).
  { re: new RegExp(`^\\s*(?:@\\w+\\s+)*((?:${MODIFIERS}\\s+)+)[\\w<>\\[\\],.?\\s]+?\\s(\\w+)\\s*\\([^)]*\\)\\s*(?:throws\\s+[\\w,.\\s]+)?\\{`, 'gm'),
    name: 2, kind: 'method', mods: 1, confidence: 'medium' },
]

const NOT_NAME = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'else', 'do', 'try'])

export function extractDefinitions(src) {
  const code = stripNonCode(src)
  const lines = code.split('\n')
  const found = new Map()

  for (const p of DEF_PATTERNS) {
    p.re.lastIndex = 0
    let m
    while ((m = p.re.exec(code)) !== null) {
      const symbolName = m[p.name]
      if (!symbolName || NOT_NAME.has(symbolName)) continue
      const line = lineAt(code, m.index)
      const key = `${symbolName}:${line}`
      if (found.has(key)) continue

      const mods = m[p.mods] ?? ''
      found.set(key, {
        name: symbolName,
        kind: p.kind,
        line,
        exported: /\bpublic\b/.test(mods),
        signatureText: (lines[line - 1] ?? '').trim().slice(0, 200),
        confidence: p.confidence,
      })
    }
  }
  return [...found.values()].sort((a, b) => a.line - b.line)
}

export function extractImports(src) {
  const code = stripNonCode(src)
  const out = []
  for (const m of code.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+(?:\.\*)?)\s*;/gm)) {
    const full = m[1]
    const last = full.split('.').pop()
    out.push({
      from: full,
      names: last === '*' ? [] : [{ name: last, local: last }],
      line: lineAt(code, m.index),
      namespace: last === '*',
    })
  }
  return out
}

const CALL_RE = /\b([A-Za-z_]\w*)\s*\(/g
const MEMBER_CALL_RE = /\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\(/g
const NEW_RE = /\bnew\s+([A-Z]\w*)\s*[(<]/g

const NOT_CALL = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'super', 'this',
  'synchronized', 'assert', 'throw', 'do', 'else', 'try', 'int', 'boolean', 'void',
])

export function extractReferences(src) {
  const code = stripNonCode(src)
  const refs = []
  const unresolved = []

  for (const m of code.matchAll(CALL_RE)) {
    const n = m[1]
    if (NOT_CALL.has(n)) continue
    refs.push({ name: n, line: lineAt(code, m.index), kind: 'call', confidence: 'medium' })
  }
  for (const m of code.matchAll(MEMBER_CALL_RE)) {
    refs.push({ name: m[2], line: lineAt(code, m.index), kind: 'member-call', via: m[1], confidence: 'medium' })
  }
  for (const m of code.matchAll(NEW_RE)) {
    refs.push({ name: m[1], line: lineAt(code, m.index), kind: 'instantiation', confidence: 'high' })
  }
  // 리플렉션과 DI 는 정적으로 추적할 수 없다
  for (const m of code.matchAll(/\b(?:Class\.forName|getDeclaredMethod|getMethod)\s*\(/g)) {
    unresolved.push({ line: lineAt(code, m.index), reason: 'reflection', detail: m[0].trim() })
  }
  for (const m of code.matchAll(/@(?:Autowired|Inject|Resource)\b/g)) {
    unresolved.push({ line: lineAt(code, m.index), reason: 'dependency_injection', detail: m[0] })
  }

  return { refs: dedupe(refs), unresolved }
}

function dedupe(refs) {
  const seen = new Map()
  for (const r of refs) {
    const key = `${r.name}:${r.line}:${r.kind}`
    if (!seen.has(key)) seen.set(key, r)
  }
  return [...seen.values()].sort((a, b) => a.line - b.line)
}

export function lineAt(text, index) {
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++
  return line
}

/** Java 는 패키지 경로로 import 한다. 소스 루트를 몰라 저장소 내부 해석을 하지 않는다. */
export function resolveCandidates() {
  return []
}
