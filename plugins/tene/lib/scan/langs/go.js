/**
 * Go 언어 팩 — D06 §2.6
 *
 * Go 는 **대문자 = export** 라는 규칙이 언어에 박혀 있어 `exported` 판정이
 * 다른 언어보다 정확하다. 추정이 아니라 규칙이다.
 */

export const name = 'go'
export const extensions = ['.go']

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
    // 백틱은 raw string — 줄을 넘는다
    if (c === '`') {
      const e = src.indexOf('`', i + 1)
      const end = e < 0 ? n : e + 1
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

/**
 * 주석만 지우고 문자열은 남긴다.
 * Go 의 import 경로(`"fmt"`)는 문자열이라 stripNonCode 로는 읽을 수 없다.
 */
export function stripComments(src) {
  const n = src.length
  const out = new Array(n)
  let i = 0
  const blank = (from, to) => {
    for (let k = from; k < to; k++) out[k] = src[k] === '\n' ? '\n' : ' '
  }
  while (i < n) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') {
      const e = src.indexOf('\n', i); const end = e < 0 ? n : e
      blank(i, end); i = end; continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2
      blank(i, end); i = end; continue
    }
    if (c === '`') {
      const e = src.indexOf('`', i + 1); const end = e < 0 ? n : e + 1
      for (let k = i; k < end; k++) out[k] = src[k]
      i = end; continue
    }
    if (c === '"' || c === "'") {
      const end = scanString(src, i, c)
      for (let k = i; k < end; k++) out[k] = src[k]
      i = end; continue
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
  // 메서드가 먼저다 — `func (r *T) Name(` 은 함수 패턴에도 걸리므로 순서가 중요하다
  { re: /^func\s*\(\s*\w+\s+\*?(\w+)\s*\)\s*(\w+)\s*\(/gm, name: 2, recv: 1, kind: 'method', confidence: 'high' },
  { re: /^func\s+(\w+)\s*[(\[]/gm, name: 1, kind: 'function', confidence: 'high' },
  { re: /^type\s+(\w+)\s+struct\b/gm, name: 1, kind: 'class', confidence: 'high' },
  { re: /^type\s+(\w+)\s+interface\b/gm, name: 1, kind: 'interface', confidence: 'high' },
  { re: /^type\s+(\w+)\s+(?!struct|interface)\S/gm, name: 1, kind: 'type', confidence: 'high' },
  { re: /^(?:var|const)\s+(\w+)\s/gm, name: 1, kind: 'const', confidence: 'medium' },
]

export function extractDefinitions(src) {
  const code = stripNonCode(src)
  const lines = code.split('\n')
  const found = new Map()
  const takenLines = new Set()

  for (const p of DEF_PATTERNS) {
    p.re.lastIndex = 0
    let m
    while ((m = p.re.exec(code)) !== null) {
      const symbolName = m[p.name]
      if (!symbolName) continue
      const line = lineAt(code, m.index)
      // 메서드로 이미 잡힌 줄을 함수로 다시 세지 않는다
      if (takenLines.has(line)) continue
      takenLines.add(line)

      found.set(`${symbolName}:${line}`, {
        name: symbolName,
        kind: p.kind,
        line,
        exported: /^[A-Z]/.test(symbolName), // 언어 규칙이다. 추정이 아니다.
        receiver: p.recv ? m[p.recv] : undefined,
        signatureText: (lines[line - 1] ?? '').trim().slice(0, 200),
        confidence: p.confidence,
      })
    }
  }
  return [...found.values()].sort((a, b) => a.line - b.line)
}

export function extractImports(src) {
  const code = stripComments(src) // 경로가 문자열이므로 살려야 한다
  const out = []

  // 괄호 블록 import
  for (const block of code.matchAll(/^import\s*\(([\s\S]*?)\)/gm)) {
    const baseLine = lineAt(code, block.index)
    block[1].split('\n').forEach((raw, idx) => {
      const line = raw.trim()
      if (!line) return
      const m = line.match(/^(?:(\w+|\.|_)\s+)?"([^"]+)"/)
      if (!m) return
      out.push({
        from: m[2],
        names: m[1] ? [{ name: m[2], local: m[1] }] : [],
        line: baseLine + idx + 1,
        namespace: true,
      })
    })
  }

  // 단일 import
  for (const m of code.matchAll(/^import\s+(?:(\w+|\.|_)\s+)?"([^"]+)"/gm)) {
    out.push({
      from: m[2],
      names: m[1] ? [{ name: m[2], local: m[1] }] : [],
      line: lineAt(code, m.index),
      namespace: true,
    })
  }

  return out.sort((a, b) => a.line - b.line)
}

const CALL_RE = /\b([A-Za-z_]\w*)\s*\(/g
const MEMBER_CALL_RE = /\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\(/g

const NOT_CALL = new Set([
  'if', 'for', 'switch', 'return', 'func', 'go', 'defer', 'select', 'range',
  'make', 'new', 'len', 'cap', 'append', 'copy', 'delete', 'panic', 'recover', 'print', 'println',
  'import', 'package', 'type', 'var', 'const',
  'string', 'int', 'int64', 'float64', 'bool', 'byte', 'rune', 'error', 'chan', 'map', 'struct', 'interface',
])

export function extractReferences(src) {
  const code = stripNonCode(src)
  const refs = []
  const unresolved = []

  for (const m of code.matchAll(CALL_RE)) {
    const n = m[1]
    if (NOT_CALL.has(n)) continue
    const lineText = lineTextAt(code, m.index)
    if (/^func\s/.test(lineText)) continue // 선언 자체
    refs.push({ name: n, line: lineAt(code, m.index), kind: 'call', confidence: 'high' })
  }

  for (const m of code.matchAll(MEMBER_CALL_RE)) {
    refs.push({ name: m[2], line: lineAt(code, m.index), kind: 'member-call', via: m[1], confidence: 'medium' })
  }

  // 인터페이스를 통한 호출은 정적으로 대상을 정할 수 없다
  for (const m of code.matchAll(/\breflect\.\w+\s*\(/g)) {
    unresolved.push({ line: lineAt(code, m.index), reason: 'reflection', detail: m[0].trim() })
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

/** Go 는 모듈 경로로 import 한다. 저장소 내부 해석은 go.mod 가 필요해 하지 않는다. */
export function resolveCandidates() {
  return []
}
