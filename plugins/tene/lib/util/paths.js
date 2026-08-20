/**
 * 경로 유틸 — D11 §8 (경로 이탈 방지), D01 §4.2 (루트 탐색)
 *
 * 모든 쓰기 경로가 assertInProject 를 통과해야 한다.
 */
import { existsSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TeneError } from './errors.js'

export const STATE_DIR = '.tene-claude'
export const VAULT_DIR = '.tene'
export const DEFAULT_DOCS_ROOT = 'docs/sprints'

/**
 * 플러그인 자신의 루트. 번들된 템플릿·프리셋을 읽을 때 쓴다.
 *
 * `CLAUDE_PLUGIN_ROOT` 가 있으면 그것을 믿는다 (Claude Code 가 설정한다).
 * 없으면 이 파일 위치에서 거슬러 올라간다 — 로컬 실행과 테스트 경로다.
 */
export function pluginRoot() {
  if (process.env.CLAUDE_PLUGIN_ROOT) return process.env.CLAUDE_PLUGIN_ROOT
  // lib/util/paths.js → lib/util → lib → <plugin>
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
}

/** 루트 표지: 있으면 그 디렉토리를 프로젝트 루트로 본다 */
const ROOT_MARKERS = ['.git', STATE_DIR, 'package.json', 'go.mod', 'pyproject.toml', 'Cargo.toml']

/**
 * 프로젝트 루트를 찾는다.
 * 우선순위: 명시 인자 → CLAUDE_PROJECT_DIR → 위로 탐색 → cwd
 * @param {string} [explicit]
 * @returns {string} 절대 경로
 */
export function findProjectRoot(explicit) {
  if (explicit) return resolve(explicit)
  if (process.env.CLAUDE_PROJECT_DIR) return resolve(process.env.CLAUDE_PROJECT_DIR)

  let dir = process.cwd()
  const root = resolve(sep)
  while (true) {
    if (ROOT_MARKERS.some((m) => existsSync(join(dir, m)))) return dir
    const parent = dirname(dir)
    if (parent === dir || dir === root) break
    dir = parent
  }
  return process.cwd()
}

/**
 * 경로가 프로젝트 루트 안에 있음을 보장한다. 심볼릭 링크 우회도 막는다.
 * @param {string} path  루트 상대 또는 절대
 * @param {string} root  절대
 * @returns {string} 절대 경로
 * @throws {TeneError} PATH_ESCAPE
 */
export function assertInProject(path, root) {
  // root 가 상대 경로로 올 수 있다 (lib 를 직접 쓰는 코드). 먼저 절대로 만든다 —
  // 상대인 채로 relative() 에 넣으면 cwd 기준으로 어긋나 멀쩡한 경로가 이탈로 잡힌다.
  const absRoot = resolve(root)
  const abs = isAbsolute(path) ? path : resolve(absRoot, path)
  const rel = relative(absRoot, abs)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new TeneError('PATH_ESCAPE', { path, root })
  }
  // 존재하는 상위 디렉토리를 realpath 로 확인 (심볼릭 링크 이탈 차단)
  let probe = abs
  while (probe !== absRoot && !existsSync(probe)) probe = dirname(probe)
  if (existsSync(probe)) {
    const real = realpathSync(probe)
    const realRoot = realpathSync(absRoot)
    const relReal = relative(realRoot, real)
    if (relReal.startsWith('..') || isAbsolute(relReal)) {
      throw new TeneError('PATH_ESCAPE', { path, root, reason: 'symlink' })
    }
  }
  return abs
}

/** 절대 경로를 루트 상대 POSIX 경로로. 상태 파일에는 항상 이 형태로 저장한다. */
/**
 * 심볼릭 링크를 고려한 상대 경로. 프로젝트 밖이면 null.
 *
 * macOS 의 `/tmp` 는 `/private/tmp` 로, `/var` 는 `/private/var` 로 링크된다.
 * 한쪽만 realpath 를 거치면 같은 파일인데 `../../..` 가 나와 "프로젝트 밖" 으로 판정된다 —
 * 실제로 훅이 그 경로에서 동작하지 않았다.
 */
export function relativeInProject(path, root) {
  const tryRel = (a, b) => {
    const rel = relative(a, b)
    return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel.split(sep).join('/') : null
  }
  const direct = tryRel(root, path)
  if (direct !== null) return direct

  // 양쪽을 실제 경로로 풀어 다시 본다
  const realRoot = safeReal(root)
  const realPath = safeReal(path)
  return tryRel(realRoot, realPath)
}

function safeReal(p) {
  try {
    return realpathSync(p)
  } catch {
    // 파일이 아직 없을 수 있다 — 부모 디렉토리로 시도한다
    try {
      return join(realpathSync(dirname(p)), p.slice(dirname(p).length + 1))
    } catch {
      return p
    }
  }
}

export function toProjectRelative(path, root) {
  const abs = isAbsolute(path) ? path : resolve(root, path)
  return relative(root, abs).split(sep).join('/')
}

/** `.tene/` (tene CLI 볼트) 하위인가 — D11 §3.6 */
export function isVaultPath(path) {
  const p = String(path ?? '').split(sep).join('/')
  return /(^|\/)\.tene(\/|$)/.test(p)
}

/** 우리 상태 디렉토리 하위인가 */
export function isStatePath(path) {
  const p = String(path ?? '').split(sep).join('/')
  return p.includes(`${STATE_DIR}/`) || p.endsWith(STATE_DIR)
}

/** 문서·상태 파일인가 (훅에서 무시할 대상) */
export function isDocOrState(path, docsRoot = DEFAULT_DOCS_ROOT) {
  const p = String(path ?? '').split(sep).join('/')
  return p.startsWith(docsRoot) || isStatePath(p) || p.endsWith('.md')
}

/** 설정 파일인가 (phase 가드 예외) */
export function isConfigFile(path) {
  const p = String(path ?? '').split(sep).join('/')
  return /(^|\/)(package\.json|tsconfig[^/]*\.json|\.gitignore|\.env\.example|[^/]*\.ya?ml|[^/]*\.toml)$/.test(p)
}

/** 테스트 파일인가 (미귀속 변경 검사 예외) */
export function isTestFile(path) {
  const p = String(path ?? '').split(sep).join('/')
  return /(\.(test|spec)\.[jt]sx?$)|(^|\/)(tests?|__tests__|spec)\//.test(p) ||
    /_test\.go$/.test(p) || /(^|\/)test_[^/]+\.py$/.test(p)
}

export function statOrNull(p) {
  try {
    return statSync(p)
  } catch {
    return null
  }
}
