/**
 * 시크릿 가드 규칙 — D11 §2~3
 *
 * 4대 안전 규칙(SR)은 **협상 대상이 아니다.** 위반하면 평문 시크릿이 대화 컨텍스트에
 * 들어가고, 그 컨텍스트는 로깅·캐시·보존될 수 있다.
 *
 * SR1  tene get 을 실행하지 않는다
 * SR2  tene export 를 --encrypted 없이 실행하지 않는다
 * SR3  .tene/ 아래 파일을 읽지 않는다
 * SR4  시크릿 값을 CLI 인자로 전달하지 않는다
 *
 * `deny` 는 **모든 권한 모드에서 유지한다.** --dangerously-skip-permissions 라도
 * 시크릿 유출은 허용하지 않는다.
 */
import { allSegments, commandOf, normalizedCommand } from './segment.js'

export const SR = {
  SR1: 'tene get 금지',
  SR2: '비암호화 export 금지',
  SR3: '.tene/ 읽기 금지',
  SR4: '값을 인자로 전달 금지',
}

/** 파일을 읽거나 복사하는 명령들 — .tene/ 를 건드리면 안 된다 */
const READERS = new Set([
  'cat', 'less', 'more', 'head', 'tail', 'strings', 'xxd', 'od', 'bat', 'hexdump',
  'base64', 'cp', 'mv', 'tar', 'zip', 'rsync', 'scp', 'grep', 'rg', 'awk', 'sed',
  'python', 'python3', 'node', 'ruby', 'perl',
])

const NO_ESCALATE_MODES = new Set(['bypassPermissions', 'dontAsk'])

function deny(code, reason) {
  return {
    decision: 'deny',
    code,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `[tene:${code}] ${reason}`,
    },
  }
}

function escalateOrWarn(mode, code, reason) {
  // 물어볼 사람이 없는 모드에서는 escalate 가 무의미하다. 경고로 낮춘다.
  if (NO_ESCALATE_MODES.has(mode)) {
    return {
      decision: 'warn',
      code,
      exit: 0,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: `[tene:${code}] ${reason}`,
      },
    }
  }
  return {
    decision: 'escalate',
    code,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: `[tene:${code}] ${reason}`,
    },
  }
}

const allow = () => ({ decision: 'allow', exit: 0 })

// ── 경로 판정 ─────────────────────────────────────────────────────────

/**
 * `.tene/` 인가. **`.tene-claude/` 는 아니다.**
 *
 * 이 구분이 틀리면 플러그인이 자기 상태 디렉토리를 못 읽거나,
 * 볼트를 읽어도 통과시킨다. 둘 다 심각하다.
 */
export function isVaultPath(path) {
  const p = String(path ?? '').replace(/\\/g, '/')
  if (!p) return false
  // 경로 어디든 `.tene` 세그먼트가 통째로 나오면 볼트다
  return /(^|\/)\.tene(\/|$)/.test(p)
}

/** 세그먼트 안에 볼트 경로가 언급되는가 */
function mentionsVault(segment) {
  const s = String(segment ?? '')
  // 따옴표·상대경로 표기를 모두 받는다
  return /(^|[\s"'=(])(\.\/)?\.tene(\/|\b)(?!-claude)/.test(s)
}

// ── Bash 판정 ─────────────────────────────────────────────────────────

const TENE_GET_RE = /^tene\s+get\b/
const TENE_EXPORT_RE = /^tene\s+export\b/
const TENE_SET_RE = /^tene\s+set\s+[A-Za-z_][\w.-]*\s+\S/
const ENCRYPTED_RE = /--encrypted\b/
const STDIN_RE = /(--stdin\b|-\s*$)/

/**
 * @param {object} payload  PreToolUse 훅 페이로드
 * @returns {{ decision: string, code?: string, hookSpecificOutput?: object, exit?: number }}
 */
export function judgeBash(payload) {
  const command = payload?.tool_input?.command ?? ''
  const mode = payload?.permission_mode ?? 'default'
  if (!command.trim()) return allow()

  let softest = null

  for (const seg of allSegments(command)) {
    const bin = commandOf(seg)
    const bare = normalizedCommand(seg) // 절대 경로로 우회할 수 없게 basename 으로 정규화

    // SR1 — 평문 값이 stdout 으로 나온다
    if (bin === 'tene' && TENE_GET_RE.test(bare)) {
      return deny('SR1',
        'tene get 은 평문 값을 stdout 으로 내보내 AI 컨텍스트에 들어갑니다. ' +
        '값을 확인하려면 별도 터미널에서 직접 실행하세요 — 저는 그것을 보지 않습니다. ' +
        '존재 여부만 필요하면 `tene list` 를 쓰세요.')
    }

    // SR2 — 전부 평문으로 쏟아진다
    if (bin === 'tene' && TENE_EXPORT_RE.test(bare) && !ENCRYPTED_RE.test(seg)) {
      return deny('SR2',
        '`tene export` 는 모든 시크릿을 평문으로 출력합니다. ' +
        '백업은 `tene export --encrypted --file backup.tene.enc` 를 쓰세요. ' +
        '이름만 확인하려면 `tene list` 입니다.')
    }

    // SR3 — 암호문조차 컨텍스트에 넣지 않는다
    if (bin && READERS.has(bin) && mentionsVault(seg)) {
      return deny('SR3',
        '`.tene/` 는 암호화된 볼트입니다. 암호문도 AI 컨텍스트에 넣지 않습니다. ' +
        '보유한 키 이름은 `tene list` 로 확인하세요.')
    }

    // SR4 — 값 노출이 아니라 로그 잔존 위험이므로 한 단계 낮다
    if (bin === 'tene' && TENE_SET_RE.test(bare) && !STDIN_RE.test(seg)) {
      const v = escalateOrWarn(mode, 'SR4',
        '시크릿 값을 CLI 인자로 전달하면 `ps`·셸 히스토리·시스템 로그에 남습니다. ' +
        '`cat key.txt | tene set KEY --stdin` 또는 값 없이 `tene set KEY` (대화형 입력)를 쓰세요.')
      softest = softest ?? v
    }
  }

  return softest ?? allow()
}

// ── Read 판정 ─────────────────────────────────────────────────────────

export function judgeRead(payload) {
  const p = payload?.tool_input?.file_path ?? payload?.tool_input?.path ?? ''
  if (!p) return allow()

  if (isVaultPath(p)) {
    return deny('SR3',
      '`.tene/` 는 암호화된 볼트입니다. 암호문도 AI 컨텍스트에 넣지 않습니다. ' +
      '`tene list` 로 키 이름을 확인하세요.')
  }
  return allow()
}

// ── .env 감지 (차단하지 않는다) ───────────────────────────────────────

const ENV_FILE = /(^|\/)\.env(\.\w+)?$/
const ENV_EXAMPLE = /(^|\/)\.env\.(example|sample|template|dist)$/

export function isPlainEnvFile(path) {
  const p = String(path ?? '')
  return ENV_FILE.test(p) && !ENV_EXAMPLE.test(p)
}

/**
 * `.env` 는 정당한 용도가 많다. **차단하지 않고 대안을 알린다** —
 * 차단하면 마찰만 크고 사용자는 플러그인을 끈다.
 */
export function envAdvice(paths, { teneAvailable = false } = {}) {
  const hits = paths.filter(isPlainEnvFile)
  if (!hits.length) return null

  const lines = [`[tene] 평문 \`.env\` 파일이 감지되었습니다: ${hits.join(', ')}`]
  if (teneAvailable) {
    lines.push('  tene import .env && rm .env && echo \'.env\' >> .gitignore')
    lines.push('  이후 실행을 `tene run -- <cmd>` 로 바꾸면 값이 파일에 남지 않습니다. (/tene:secrets)')
  } else {
    lines.push('  시크릿을 암호화해 관리하려면 tene CLI 도입을 검토하세요.')
  }
  return lines.join('\n')
}

/** Bash 명령에서 쓰기 대상 경로를 추린다 (리다이렉트·복사) */
export function writeTargetsOf(command) {
  const out = []
  const s = String(command ?? '')
  for (const m of s.matchAll(/>>?\s*(["']?)([^\s"'|;&]+)\1/g)) out.push(m[2])
  for (const m of s.matchAll(/\b(?:cp|mv|tee)\s+(?:-\S+\s+)*\S+\s+(["']?)([^\s"']+)\1/g)) out.push(m[2])
  return [...new Set(out)]
}
