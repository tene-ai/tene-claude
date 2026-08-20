/**
 * 파일 워커 — D06 §2.1
 *
 * `.gitignore` 를 존중하되 **단순 glob 만** 해석한다. 복잡한 패턴은 무시하고
 * 기본 제외에 의존한다 — gitignore 를 완전히 구현하려다 틀리는 것보다,
 * 못 읽는 패턴을 못 읽는다고 인정하는 편이 낫다.
 */
import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export const DEFAULT_EXCLUDES = [
  '.git', 'node_modules', 'dist', 'build', 'out', 'target', 'vendor',
  '.next', '.nuxt', '.svelte-kit', '__pycache__', '.venv', 'venv',
  '.tene', '.tene-claude', 'coverage', '.turbo', '.cache', '.gradle',
  '.idea', '.vscode', 'Pods', '.terraform',
]

export const MAX_FILE_BYTES = 2 * 1024 * 1024

/** 확장자 → 언어. 언어 팩이 이 표를 공유한다. */
export const EXT_LANG = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'typescript', '.jsx': 'typescript', '.mjs': 'typescript', '.cjs': 'typescript',
  '.py': 'python', '.pyi': 'python',
  '.go': 'go',
  '.java': 'java',
}

export function langOf(path) {
  const dot = path.lastIndexOf('.')
  return dot < 0 ? null : (EXT_LANG[path.slice(dot).toLowerCase()] ?? null)
}

/** shebang → 언어. 확장자 없는 실행 스크립트를 위한 것이다. */
export const SHEBANG_LANG = [
  { re: /^#!.*\bnode\b/, lang: 'typescript' },
  { re: /^#!.*\bpython[\d.]*\b/, lang: 'python' },
]

/**
 * 확장자가 없으면 첫 줄을 읽어 shebang 으로 판별한다.
 *
 * `bin/tene-guard` 처럼 확장자 없는 실행 파일이 통째로 빠지면
 * 진입점이 인덱스에 없어 orphan 오탐이 쏟아지고 interface 계층이 비어 보인다 —
 * 실제로 tene 자신을 인덱싱하다 bin/ 9개가 전부 누락된 것을 발견했다.
 */
export function langOfFile(abs, name) {
  const byExt = langOf(name)
  if (byExt) return byExt
  if (name.includes('.')) return null // 확장자가 있는데 미지원이면 그대로 미지원

  let fd
  try {
    fd = openSync(abs, 'r')
    const buf = Buffer.alloc(64)
    const n = readSync(fd, buf, 0, buf.length, 0)
    const first = buf.subarray(0, n).toString('utf8').split('\n')[0]
    for (const s of SHEBANG_LANG) if (s.re.test(first)) return s.lang
    return null
  } catch {
    return null
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd) } catch { /* 무시 */ }
    }
  }
}

export function extOf(path) {
  const dot = path.lastIndexOf('.')
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf(sep))
  return dot > slash ? path.slice(dot).toLowerCase() : ''
}

// ── .gitignore ────────────────────────────────────────────────────────

/**
 * 지원하는 것: `*`, `**`, 끝 `/` (디렉토리), 앞 `!` (부정), 앞 `/` (루트 고정), `#` 주석
 * 지원하지 않는 것: `[a-z]` 문자 클래스, `?`
 *
 * 못 읽는 패턴은 **버린다**. 잘못 해석해 필요한 파일을 빼는 것보다 낫다.
 */
export function parseGitignore(text) {
  const rules = []
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (/[[\]?]/.test(line)) continue // 미지원 패턴은 버린다

    let pattern = line
    const negate = pattern.startsWith('!')
    if (negate) pattern = pattern.slice(1)

    const dirOnly = pattern.endsWith('/')
    if (dirOnly) pattern = pattern.slice(0, -1)

    const rooted = pattern.startsWith('/')
    if (rooted) pattern = pattern.slice(1)
    if (!pattern) continue

    rules.push({ re: globToRegExp(pattern, rooted), negate, dirOnly, source: line })
  }
  return rules
}

function globToRegExp(glob, rooted) {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` 는 0개 이상의 디렉토리
        if (glob[i + 2] === '/') { out += '(?:.*/)?'; i += 2 } else { out += '.*'; i += 1 }
      } else {
        out += '[^/]*'
      }
      continue
    }
    out += /[.+^${}()|\\]/.test(c) ? `\\${c}` : c
  }
  // 루트 고정이 아니면 어느 깊이에서든 걸린다
  return new RegExp(`^${rooted ? '' : '(?:.*/)?'}${out}$`)
}

export function matchesIgnore(relPath, rules, isDir) {
  let ignored = false
  for (const r of rules) {
    if (r.dirOnly && !isDir) continue
    // 디렉토리 규칙은 그 하위 전체를 덮는다
    const hit = r.re.test(relPath) || (r.dirOnly && r.re.test(relPath.split('/')[0]))
    if (!hit) continue
    ignored = !r.negate
  }
  return ignored
}

export function loadGitignore(root) {
  try {
    return parseGitignore(readFileSync(join(root, '.gitignore'), 'utf8'))
  } catch {
    return [] // 없거나 못 읽으면 기본 제외만 쓴다
  }
}

// ── 순회 ──────────────────────────────────────────────────────────────

/**
 * @param {string} root
 * @param {{ excludes?: string[], gitignore?: boolean, maxBytes?: number, subpaths?: string[] }} [opts]
 * @yields {{ path: string, abs: string, lang?: string, size?: number, mtime?: number, skipped?: string }}
 *
 * path 는 root 기준 POSIX 상대 경로다. 인덱스에 절대 경로를 넣지 않는다 —
 * 저장소를 옮기거나 다른 사람이 열면 전부 깨진다.
 */
export function* walk(root, opts = {}) {
  const excludes = new Set(opts.excludes ?? DEFAULT_EXCLUDES)
  const rules = opts.gitignore === false ? [] : loadGitignore(root)
  const maxBytes = opts.maxBytes ?? MAX_FILE_BYTES
  const roots = opts.subpaths?.length ? opts.subpaths.map((p) => join(root, p)) : [root]

  for (const start of roots) {
    yield* walkDir(start, { root, excludes, rules, maxBytes })
  }
}

function* walkDir(dir, ctx) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return // 권한 없음 등 — 조용히 건너뛴다
  }

  for (const e of entries) {
    const abs = join(dir, e.name)
    const rel = relative(ctx.root, abs).split(sep).join('/')

    if (ctx.excludes.has(e.name)) continue
    if (e.isSymbolicLink()) continue // 순환을 만들 수 있다. 따라가지 않는다.

    if (e.isDirectory()) {
      if (matchesIgnore(rel, ctx.rules, true)) continue
      yield* walkDir(abs, ctx)
      continue
    }
    if (!e.isFile()) continue
    if (matchesIgnore(rel, ctx.rules, false)) continue

    const lang = langOfFile(abs, e.name)
    if (!lang) {
      yield { path: rel, abs, skipped: 'unsupported', ext: extOf(e.name) }
      continue
    }

    let st
    try {
      st = statSync(abs)
    } catch {
      continue
    }
    if (st.size > ctx.maxBytes) {
      yield { path: rel, abs, skipped: 'too_large', size: st.size }
      continue
    }

    yield { path: rel, abs, lang, size: st.size, mtime: st.mtimeMs }
  }
}

/** 순회 결과를 한 번에 모은다. 통계도 함께 낸다. */
export function collect(root, opts = {}) {
  const files = []
  const skipped = { too_large: [], unsupported: new Map() }
  for (const f of walk(root, opts)) {
    if (!f.skipped) { files.push(f); continue }
    if (f.skipped === 'too_large') skipped.too_large.push(f.path)
    else skipped.unsupported.set(f.ext, (skipped.unsupported.get(f.ext) ?? 0) + 1)
  }
  return {
    files,
    tooLarge: skipped.too_large,
    // 지원하지 않는 확장자를 세어 보고한다 — "이 저장소는 절반이 Kotlin" 을 숨기지 않는다
    unsupported: [...skipped.unsupported.entries()]
      .map(([ext, count]) => ({ ext, files: count }))
      .sort((a, b) => b.files - a.files),
  }
}
