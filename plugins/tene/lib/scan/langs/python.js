/**
 * Python 언어 팩 — D06 §2.5
 *
 * **들여쓰기 기반 스코프를 구현하지 않는다.** 메서드는 들여쓰기 깊이로만 추정하고
 * `confidence: medium` 이 상한이다. 스코프를 반쯤 구현하면 반쯤 틀린 답을 high 로 낸다.
 */

export const name = 'python'
export const extensions = ['.py', '.pyi']

/** `#` 주석, `'''`/`"""` docstring, 일반 문자열을 같은 길이 공백으로 */
export function stripNonCode(src) {
  const n = src.length
  const out = new Array(n)
  let i = 0
  const blank = (from, to) => {
    for (let k = from; k < to; k++) out[k] = src[k] === '\n' ? '\n' : ' '
  }

  while (i < n) {
    const c = src[i]

    if (c === '#') {
      const e = src.indexOf('\n', i)
      const end = e < 0 ? n : e
      blank(i, end); i = end; continue
    }

    // 삼중 따옴표 먼저 본다 — 단일 따옴표 처리보다 앞이어야 한다
    const triple = src.slice(i, i + 3)
    if (triple === '"""' || triple === "'''") {
      const e = src.indexOf(triple, i + 3)
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

const DEF_PATTERNS = [
  { re: /^(async\s+)?def\s+(\w+)\s*\(/gm, name: 2, kind: 'function', confidence: 'high' },
  { re: /^class\s+(\w+)/gm, name: 1, kind: 'class', confidence: 'high' },
  { re: /^[ \t]{4,}(?:async\s+)?def\s+(\w+)\s*\(/gm, name: 1, kind: 'method', confidence: 'medium' },
]

export function extractDefinitions(src) {
  const code = stripNonCode(src)
  const lines = code.split('\n')
  const found = new Map()

  for (const p of DEF_PATTERNS) {
    p.re.lastIndex = 0
    let m
    while ((m = p.re.exec(code)) !== null) {
      const symbolName = m[p.name]
      if (!symbolName) continue
      const line = lineAt(code, m.index)
      const key = `${symbolName}:${line}`
      if (found.has(key)) continue
      found.set(key, {
        name: symbolName,
        kind: p.kind,
        line,
        // Python 에는 export 가 없다. `_` 로 시작하면 관례상 비공개다.
        exported: !symbolName.startsWith('_'),
        signatureText: (lines[line - 1] ?? '').trim().slice(0, 200),
        confidence: p.confidence,
      })
    }
  }
  return [...found.values()].sort((a, b) => a.line - b.line)
}

const IMPORT_PATTERNS = [
  { re: /^from\s+([\w.]+)\s+import\s+(.+)$/gm, from: 1, names: 2 },
  { re: /^import\s+([\w.]+)(?:\s+as\s+(\w+))?/gm, from: 1, alias: 2 },
]

export function extractImports(src) {
  const code = stripNonCode(src)
  const out = []
  const seen = new Set()

  for (const p of IMPORT_PATTERNS) {
    p.re.lastIndex = 0
    let m
    while ((m = p.re.exec(code)) !== null) {
      const from = m[p.from]
      if (!from) continue
      const line = lineAt(code, m.index)
      const key = `${from}:${line}`
      if (seen.has(key)) continue
      seen.add(key)

      const names = []
      if (p.names && m[p.names]) {
        for (const part of m[p.names].replace(/[()]/g, '').split(',')) {
          const bits = part.trim().split(/\s+as\s+/)
          const orig = bits[0]?.trim()
          if (orig) names.push({ name: orig, local: (bits[1] ?? orig).trim() })
        }
      }
      if (p.alias && m[p.alias]) names.push({ name: from, local: m[p.alias] })

      out.push({ from, names, line, namespace: !p.names })
    }
  }
  return out.sort((a, b) => a.line - b.line)
}

const CALL_RE = /\b([A-Za-z_]\w*)\s*\(/g
const MEMBER_CALL_RE = /\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\(/g
const DYNAMIC_RE = /\bgetattr\s*\(|\b(\w+)\s*\[\s*[^\]]+\s*\]\s*\(/g

const NOT_CALL = new Set([
  'if', 'for', 'while', 'return', 'print', 'def', 'class', 'lambda', 'with',
  'assert', 'del', 'elif', 'except', 'import', 'raise', 'yield', 'not', 'and', 'or', 'in', 'is',
])

export function extractReferences(src) {
  const code = stripNonCode(src)
  const refs = []
  const unresolved = []

  for (const m of code.matchAll(CALL_RE)) {
    const n = m[1]
    if (NOT_CALL.has(n)) continue
    const lineText = lineTextAt(code, m.index)
    if (/^\s*(async\s+)?def\s/.test(lineText) && lineText.includes(`def ${n}`)) continue
    if (/^\s*class\s/.test(lineText) && lineText.includes(`class ${n}`)) continue
    refs.push({ name: n, line: lineAt(code, m.index), kind: 'call', confidence: 'high' })
  }

  for (const m of code.matchAll(MEMBER_CALL_RE)) {
    refs.push({ name: m[2], line: lineAt(code, m.index), kind: 'member-call', via: m[1], confidence: 'medium' })
  }

  for (const m of code.matchAll(DYNAMIC_RE)) {
    unresolved.push({ line: lineAt(code, m.index), reason: 'dynamic_dispatch', detail: m[0].trim().slice(0, 80) })
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

function lineTextAt(text, index) {
  const start = text.lastIndexOf('\n', index) + 1
  const end = text.indexOf('\n', index)
  return text.slice(start, end < 0 ? text.length : end)
}

/** `from .payments import x` → 후보 경로 */
export function resolveCandidates(fromFile, spec) {
  if (!spec.startsWith('.')) return []
  const dir = fromFile.slice(0, fromFile.lastIndexOf('/') + 1)
  let up = 0
  while (spec[up] === '.') up++
  const rest = spec.slice(up).replace(/\./g, '/')
  const parts = dir.split('/').filter(Boolean)
  for (let i = 1; i < up; i++) parts.pop()
  const base = [...parts, rest].filter(Boolean).join('/')
  return [`${base}.py`, `${base}/__init__.py`, `${base}.pyi`]
}
