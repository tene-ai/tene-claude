/**
 * TypeScript / JavaScript 언어 팩 — D06 §2.3~2.4
 *
 * 정규식 기반이다. AST 가 아니다. 그래서 **틀릴 수 있고, 틀릴 수 있다는 사실을
 * confidence 로 함께 내보낸다.** 확신 없는 결과를 high 로 올리지 않는다.
 */

export const name = 'typescript'
export const extensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']

/**
 * 주석과 문자열을 **같은 길이의 공백으로** 치환한다.
 *
 * 지우지 않고 공백으로 바꾸는 이유: 라인 번호와 열 위치가 원본과 어긋나면
 * 보고서의 `file:line` 이 전부 거짓말이 된다.
 *
 * 이것이 인덱서 정확도의 절반이다. 주석 안의 `function foo()` 를 정의로 세면
 * 그 오탐이 문서에 확정처럼 실린다.
 */
export function stripNonCode(src) {
  const n = src.length
  const out = new Array(n)
  let i = 0

  const blank = (from, to) => {
    for (let k = from; k < to; k++) out[k] = src[k] === '\n' ? '\n' : ' '
  }

  while (i < n) {
    const c = src[i]

    // 라인 주석 — 개행은 남긴다
    if (c === '/' && src[i + 1] === '/') {
      const e = src.indexOf('\n', i)
      const end = e < 0 ? n : e
      blank(i, end)
      i = end
      continue
    }

    // 블록 주석
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2)
      const end = e < 0 ? n : e + 2
      blank(i, end)
      i = end
      continue
    }

    // 문자열 / 템플릿 리터럴
    if (c === '"' || c === "'" || c === '`') {
      const end = scanString(src, i, c)
      blank(i, end)
      i = end
      continue
    }

    // 정규식 리터럴 — `/` 앞 문맥으로 나눗셈과 구분한다.
    // 완벽하지 않지만, 안 하면 정규식 안의 따옴표가 문자열 시작으로 오인된다.
    if (c === '/' && isRegexPosition(src, i)) {
      const end = scanRegex(src, i)
      if (end > i + 1) {
        blank(i, end)
        i = end
        continue
      }
    }

    out[i] = c
    i++
  }
  return out.join('')
}

/**
 * 주석만 지우고 **문자열은 남긴다.**
 *
 * import 경로(`from './payments'`)는 문자열이다. stripNonCode 로 지우면
 * import 를 하나도 못 읽는다 — 실제로 그렇게 만들었다가 잡았다.
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
      const e = src.indexOf('\n', i)
      const end = e < 0 ? n : e
      blank(i, end); i = end; continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2)
      const end = e < 0 ? n : e + 2
      blank(i, end); i = end; continue
    }
    // 문자열은 그대로 두되, 그 안의 `//` 를 주석으로 오인하지 않도록 통째로 건너뛴다
    if (c === '"' || c === "'" || c === '`') {
      const end = scanString(src, i, c)
      for (let k = i; k < end; k++) out[k] = src[k]
      i = end; continue
    }
    if (c === '/' && isRegexPosition(src, i)) {
      const end = scanRegex(src, i)
      if (end > i + 1) { blank(i, end); i = end; continue }
    }
    out[i] = c; i++
  }
  return out.join('')
}

/** 템플릿 리터럴의 `${}` 안은 코드지만, 여기서는 통째로 비운다 (보수적). */
function scanString(src, start, quote) {
  let i = start + 1
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (c === '\\') { i += 2; continue }
    if (c === quote) return i + 1
    // 따옴표 문자열은 줄을 넘지 않는다 — 닫히지 않았으면 거기서 끝난 것으로 본다
    if (c === '\n' && quote !== '`') return i
    i++
  }
  return n
}

const REGEX_PRECEDERS = /[({[,;:!&|?+\-*/%=~^<>]$/

function isRegexPosition(src, i) {
  let j = i - 1
  while (j >= 0 && (src[j] === ' ' || src[j] === '\t')) j--
  if (j < 0) return true
  if (src[j] === '\n') return true
  const before = src.slice(Math.max(0, j - 6), j + 1)
  if (/\b(return|typeof|case|in|of)$/.test(before)) return true
  return REGEX_PRECEDERS.test(src[j])
}

function scanRegex(src, start) {
  let i = start + 1
  let inClass = false
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (c === '\\') { i += 2; continue }
    if (c === '\n') return start + 1 // 정규식은 줄을 넘지 않는다 → 나눗셈이었다
    if (c === '[') inClass = true
    else if (c === ']') inClass = false
    else if (c === '/' && !inClass) {
      i++
      while (i < n && /[gimsuyvd]/.test(src[i])) i++
      return i
    }
    i++
  }
  return start + 1
}

// ── 정의 ──────────────────────────────────────────────────────────────

const DEF_PATTERNS = [
  { re: /^(export\s+)?(default\s+)?(async\s+)?function\s*\*?\s*(\w+)\s*\(/gm,
    name: 4, kind: 'function', exported: 1, confidence: 'high' },
  { re: /^(export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+?)?=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|\w+\s*=>)/gm,
    name: 2, kind: 'function', exported: 1, confidence: 'high' },
  { re: /^(export\s+)?(abstract\s+)?class\s+(\w+)/gm,
    name: 3, kind: 'class', exported: 1, confidence: 'high' },
  { re: /^(export\s+)?interface\s+(\w+)/gm,
    name: 2, kind: 'interface', exported: 1, confidence: 'high' },
  { re: /^(export\s+)?type\s+(\w+)\s*[=<]/gm,
    name: 2, kind: 'type', exported: 1, confidence: 'high' },
  { re: /^(export\s+)?enum\s+(\w+)/gm,
    name: 2, kind: 'type', exported: 1, confidence: 'high' },
  // 나머지 const — 함수가 아닌 값
  { re: /^(export\s+)?const\s+(\w+)\s*(?::[^=]+)?=\s*(?!async|function|\()/gm,
    name: 2, kind: 'const', exported: 1, confidence: 'medium' },
  // 클래스 메서드 — 들여쓰기로만 판별하므로 medium 이 상한이다
  { re: /^[ \t]{2,}(?:(?:public|private|protected|static|readonly|async|get|set)\s+)*(\w+)\s*\([^)]*\)\s*(?::[^{;]+)?\{/gm,
    name: 1, kind: 'method', confidence: 'medium' },
]

/** 제어문은 메서드가 아니다 */
const NOT_METHOD = new Set(['if', 'for', 'while', 'switch', 'catch', 'do', 'else', 'return', 'function', 'constructor'])

/** 대문자로 시작하고 JSX 를 반환하면 컴포넌트로 본다 */
function looksLikeComponent(name, body) {
  return /^[A-Z]/.test(name) && /return\s*\(?\s*</.test(body)
}

export function extractDefinitions(src, { path = '' } = {}) {
  const code = stripNonCode(src)
  const lines = code.split('\n')
  const found = new Map() // name+line 중복 제거

  for (const p of DEF_PATTERNS) {
    p.re.lastIndex = 0
    let m
    while ((m = p.re.exec(code)) !== null) {
      const symbolName = m[p.name]
      if (!symbolName || NOT_METHOD.has(symbolName)) continue

      const line = lineAt(code, m.index)
      const key = `${symbolName}:${line}`
      if (found.has(key)) continue

      let kind = p.kind
      if (kind === 'function' && looksLikeComponent(symbolName, code.slice(m.index, m.index + 600))) {
        kind = 'component'
      }

      found.set(key, {
        name: symbolName,
        kind,
        line,
        exported: p.exported ? Boolean(m[p.exported]) : false,
        signatureText: (lines[line - 1] ?? '').trim().slice(0, 200),
        confidence: p.confidence ?? 'medium',
      })
    }
  }

  // export { a, b } / export default foo — 위에서 잡은 정의의 exported 를 올린다
  const defs = [...found.values()]
  const reExported = new Set()
  for (const m of code.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    for (const part of m[1].split(',')) {
      const local = part.trim().split(/\s+as\s+/)[0].trim()
      if (local) reExported.add(local)
    }
  }
  for (const d of defs) if (reExported.has(d.name)) d.exported = true

  return defs.sort((a, b) => a.line - b.line)
}

// ── import ────────────────────────────────────────────────────────────

const IMPORT_PATTERNS = [
  { re: /^import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gm, names: 1, from: 2 },
  { re: /^import\s+(?:type\s+)?(\w+)\s*,\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gm, names: 2, def: 1, from: 3 },
  { re: /^import\s+(?:type\s+)?(\w+)\s+from\s*['"]([^'"]+)['"]/gm, def: 1, from: 2 },
  { re: /^import\s+\*\s+as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/gm, ns: 1, from: 2 },
  { re: /^import\s*['"]([^'"]+)['"]/gm, from: 1 }, // side-effect only
  { re: /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/gm, names: 1, from: 2 },
  { re: /(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/gm, def: 1, from: 2 },
  { re: /^export\s+(?:\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/gm, from: 1, reexport: true },
]

export function extractImports(src) {
  const code = stripComments(src) // 문자열을 살려야 경로를 읽는다
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
        for (const part of m[p.names].split(',')) {
          const local = part.trim().split(/\s+as\s+/).pop()?.trim()
          const orig = part.trim().split(/\s+as\s+/)[0]?.trim()
          if (orig) names.push({ name: orig, local: local || orig })
        }
      }
      if (p.def && m[p.def]) names.push({ name: 'default', local: m[p.def] })
      if (p.ns && m[p.ns]) names.push({ name: '*', local: m[p.ns] })

      out.push({
        from,
        names,
        line,
        namespace: Boolean(p.ns),
        reexport: Boolean(p.reexport),
      })
    }
  }
  return out.sort((a, b) => a.line - b.line)
}

// ── 참조 ──────────────────────────────────────────────────────────────

const CALL_RE = /\b([A-Za-z_$][\w$]*)\s*\(/g
const JSX_RE = /<([A-Z][\w.]*)[\s/>]/g
const MEMBER_CALL_RE = /\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g
const DYNAMIC_RE = /\b([A-Za-z_$][\w$]*)\s*\[\s*[^\]]+\s*\]\s*\(/g

/** 호출로 세면 안 되는 것들 — 키워드와 선언 자체 */
const NOT_CALL = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof', 'await',
  'new', 'do', 'else', 'try', 'throw', 'case', 'in', 'of', 'delete', 'void', 'yield',
  'import', 'export', 'require', 'super', 'this', 'constructor',
])

/**
 * @param {string} src
 * @param {{ path?: string }} [opts] path 로 JSX 여부를 가른다
 */
export function extractReferences(src, { path = '' } = {}) {
  const code = stripNonCode(src)
  const refs = []
  const unresolved = []
  // .ts 에서 `<T>` 는 거의 항상 제네릭이다. .tsx/.jsx 에서만 JSX 를 센다.
  const jsxCapable = /\.(tsx|jsx|js|mjs)$/i.test(path) || path === ''

  for (const m of code.matchAll(CALL_RE)) {
    const n = m[1]
    if (NOT_CALL.has(n)) continue
    // 선언 자체를 호출로 세지 않는다
    const lineText = lineTextAt(code, m.index)
    if (/^\s*(export\s+)?(async\s+)?function\s/.test(lineText) && lineText.includes(`function ${n}`)) continue
    refs.push({ name: n, line: lineAt(code, m.index), kind: 'call', confidence: 'high' })
  }

  for (const m of code.matchAll(MEMBER_CALL_RE)) {
    refs.push({ name: m[2], line: lineAt(code, m.index), kind: 'member-call', via: m[1], confidence: 'medium' })
  }

  if (jsxCapable) {
    for (const m of code.matchAll(JSX_RE)) {
      // `Promise<PaymentResult>` 처럼 식별자 바로 뒤의 `<` 는 제네릭이다.
      // `>` 는 제외 대상이 아니다 — JSX 에서 `</div><Next />` 가 흔하고,
      // 중첩 제네릭 `Map<K, Set<V>>` 은 안쪽 `<` 앞이 식별자라 이미 걸린다.
      const before = code[m.index - 1]
      if (before && /[\w$]/.test(before)) continue
      refs.push({ name: m[1].split('.')[0], line: lineAt(code, m.index), kind: 'jsx', confidence: 'high' })
    }
  }

  // 동적 디스패치는 추적할 수 없다. 없는 척하지 않고 기록한다.
  for (const m of code.matchAll(DYNAMIC_RE)) {
    unresolved.push({
      line: lineAt(code, m.index),
      reason: 'dynamic_dispatch',
      detail: m[0].trim().slice(0, 80),
    })
  }

  return { refs: dedupeRefs(refs), unresolved }
}

function dedupeRefs(refs) {
  const seen = new Map()
  for (const r of refs) {
    const key = `${r.name}:${r.line}:${r.kind}`
    if (!seen.has(key)) seen.set(key, r)
  }
  return [...seen.values()].sort((a, b) => a.line - b.line)
}

// ── 공통 ──────────────────────────────────────────────────────────────

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

/** `./foo` → 후보 경로들. 실제 해석은 index-builder 가 파일 존재로 확정한다. */
export function resolveCandidates(fromFile, spec) {
  if (!spec.startsWith('.')) return [] // 외부 패키지
  const dir = fromFile.slice(0, fromFile.lastIndexOf('/') + 1)
  const base = normalizePath(dir + spec)
  const exts = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']
  return [
    ...exts.map((e) => base + e),
    ...exts.map((e) => `${base}/index${e}`),
    base,
  ]
}

function normalizePath(p) {
  const parts = []
  for (const seg of p.split('/')) {
    if (seg === '.' || seg === '') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}
