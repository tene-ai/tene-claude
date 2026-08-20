/**
 * 환경 진단 — D12 §8.2
 *
 * 결정론적 사실만 수집한다. 판단·권고 문구는 스킬(L4)이 렌더링한다.
 * MCP 도구 가용 여부는 bin 에서 알 수 없으므로 스킬이 주입한다 (D08 §4).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_DOCS_ROOT, STATE_DIR, VAULT_DIR, statOrNull } from './util/paths.js'
import { inspectLock } from './util/lock.js'
import { parseJsonSafe, stableJson } from './util/json.js'
import { writeAtomic } from './util/atomic.js'
import { nowIso, olderThan } from './util/time.js'

const MIN_CC = '2.1.143'
const MIN_CC_WORKFLOW = '2.1.154'
const MIN_NODE = 20

function tryExec(cmd, args, timeout = 2000) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

/** "2.1.234" 형태 비교. a >= b 이면 true */
export function versionGte(a, b) {
  if (!a || !b) return false
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x > y
  }
  return true
}

/**
 * Claude Code 버전 — 3단 폴백.
 *
 * `claude --version` 은 실측 2.5초로 훅 예산(200ms)을 완전히 깬다.
 * 그래서 환경변수 경로에서 먼저 뽑고, 캐시를 쓰고, 마지막에만 프로세스를 띄운다.
 *
 * @param {{ root?: string, allowExec?: boolean }} opts
 */
export function detectClaudeVersion({ root, allowExec = true } = {}) {
  // 1) CLAUDE_CODE_EXECPATH 에 버전이 경로로 들어 있다 (0ms)
  //    예: /Users/x/.local/share/claude/versions/2.1.235
  const execPath = process.env.CLAUDE_CODE_EXECPATH
  if (execPath) {
    const m = execPath.match(/(?:^|[/\\])(\d+\.\d+\.\d+)(?:[/\\]|$)/)
    if (m) return { version: m[1], source: 'execpath' }
  }

  // 2) 캐시 (파생 데이터. 삭제해도 재생성된다)
  if (root) {
    const cachePath = join(root, STATE_DIR, 'index', 'env-cache.json')
    const cached = existsSync(cachePath) ? parseJsonSafe(readFileSync(cachePath, 'utf8')) : null
    if (cached?.claudeVersion && !olderThan(cached.at, 7 * 24 * 3600 * 1000)) {
      return { version: cached.claudeVersion, source: 'cache' }
    }
  }

  // 3) 프로세스 기동 (느림 — 훅에서는 allowExec:false 로 막는다)
  if (!allowExec) return { version: null, source: 'unavailable' }
  const raw = tryExec('claude', ['--version'], 5000)
  const version = raw ? (raw.match(/(\d+\.\d+\.\d+)/)?.[1] ?? null) : null
  if (version && root) {
    try {
      const dir = join(root, STATE_DIR, 'index')
      mkdirSync(dir, { recursive: true })
      writeAtomic(join(dir, 'env-cache.json'), stableJson({ claudeVersion: version, at: nowIso() }))
    } catch {
      /* 캐시 실패는 무시 */
    }
  }
  return { version, source: version ? 'exec' : 'unavailable' }
}

function probeRuntime(root, allowExec) {
  const nodeMajor = Number(process.versions.node.split('.')[0])
  const cc = detectClaudeVersion({ root, allowExec })
  const ccVersion = cc.version

  return {
    node: {
      version: process.versions.node,
      ok: nodeMajor >= MIN_NODE,
      required: `>=${MIN_NODE}`,
    },
    claudeCode: {
      version: ccVersion,
      versionSource: cc.source,
      ok: ccVersion ? versionGte(ccVersion, MIN_CC) : null,
      required: `>=${MIN_CC}`,
      workflowAvailable: ccVersion ? versionGte(ccVersion, MIN_CC_WORKFLOW) : null,
      workflowRequired: `>=${MIN_CC_WORKFLOW}`,
    },
    platform: `${process.platform}-${process.arch}`,
  }
}

function probeState(root, docsRoot) {
  const stateDir = join(root, STATE_DIR)
  const currentPath = join(stateDir, 'state', 'current.json')
  const current = existsSync(currentPath) ? parseJsonSafe(readFileSync(currentPath, 'utf8')) : null

  return {
    root,
    docsRoot,
    stateDir: existsSync(stateDir),
    current: current
      ? {
          activeSprint: current.activeSprint ?? null,
          phase: current.phase ?? null,
          profile: current.profile ?? null,
          schemaVersion: current.schemaVersion ?? null,
        }
      : null,
    currentCorrupt: existsSync(currentPath) && current === null,
    lock: inspectLock(root),
  }
}

function probeIndex(root) {
  const dir = join(root, STATE_DIR, 'index')
  const read = (name) => {
    const p = join(dir, name)
    const st = statOrNull(p)
    if (!st) return null
    const parsed = parseJsonSafe(readFileSync(p, 'utf8'))
    return parsed ? { builtAt: parsed.builtAt ?? null, bytes: st.size, stats: parsed.stats ?? null } : { corrupt: true, bytes: st.size }
  }
  return {
    symbols: read('symbols.json'),
    anchors: read('anchors.json'),
    understanding: read('understanding.json'),
  }
}

function probeLayerRules(root, docsRoot) {
  const p = join(root, docsRoot, '_meta', 'layers.yml')
  return { path: existsSync(p) ? `${docsRoot}/_meta/layers.yml` : null, exists: existsSync(p) }
}

function probeTestRunner(root) {
  const pkgPath = join(root, 'package.json')
  if (existsSync(pkgPath)) {
    const pkg = parseJsonSafe(readFileSync(pkgPath, 'utf8'))
    if (pkg?.scripts?.test) return { kind: 'npm', command: 'npm test' }
  }
  if (existsSync(join(root, 'pytest.ini')) || existsSync(join(root, 'pyproject.toml'))) {
    return { kind: 'pytest', command: 'pytest' }
  }
  if (existsSync(join(root, 'go.mod'))) return { kind: 'go', command: 'go test ./...' }
  if (existsSync(join(root, 'pom.xml'))) return { kind: 'maven', command: 'mvn test' }
  if (existsSync(join(root, 'build.gradle')) || existsSync(join(root, 'build.gradle.kts'))) {
    return { kind: 'gradle', command: './gradlew test' }
  }
  return null
}

function probeTypecheck(root) {
  const pkgPath = join(root, 'package.json')
  if (existsSync(pkgPath)) {
    const pkg = parseJsonSafe(readFileSync(pkgPath, 'utf8'))
    for (const key of ['typecheck', 'tsc', 'check-types']) {
      if (pkg?.scripts?.[key]) return { kind: 'npm', command: `npm run ${key}` }
    }
    if (existsSync(join(root, 'tsconfig.json'))) return { kind: 'tsc', command: 'npx tsc --noEmit' }
  }
  return null
}

function probePlaywright(root) {
  if (existsSync(join(root, 'node_modules', '@playwright', 'test'))) return { kind: 'playwright', source: 'node_modules' }
  if (existsSync(join(root, 'playwright.config.ts')) || existsSync(join(root, 'playwright.config.js'))) {
    return { kind: 'playwright', source: 'config' }
  }
  return null
}

function probeSecrets(root) {
  const teneVersion = tryExec('tene', ['version', '--json'])
  const parsed = teneVersion ? parseJsonSafe(teneVersion) : null
  const vaultExists = existsSync(join(root, VAULT_DIR))

  const envFiles = ['.env', '.env.local', '.env.development', '.env.production']
    .filter((f) => existsSync(join(root, f)))

  return {
    cli: parsed ? { version: parsed.version ?? null, available: true }
      : teneVersion ? { version: teneVersion.split(/\s+/)[1] ?? null, available: true }
      : { available: false },
    vault: vaultExists,
    plaintextEnv: envFiles,
  }
}

function probeGit(root) {
  const inside = tryExec('git', ['-C', root, 'rev-parse', '--is-inside-work-tree']) === 'true'
  if (!inside) return { available: false }
  return {
    available: true,
    head: tryExec('git', ['-C', root, 'rev-parse', '--short', 'HEAD']),
    branch: tryExec('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD']),
    dirty: (tryExec('git', ['-C', root, 'status', '--porcelain']) ?? '').length > 0,
  }
}

/**
 * @param {{ root: string, docsRoot?: string, capability?: object, allowExec?: boolean }} opts
 *   capability: 스킬이 주입하는 MCP 가용 정보 (예: { chromeMcp: true })
 *   allowExec:  false 면 외부 프로세스를 띄우지 않는다 (훅 컨텍스트)
 */
export function diagnose({ root, docsRoot = DEFAULT_DOCS_ROOT, capability = {}, allowExec = true }) {
  const runtime = probeRuntime(root, allowExec)
  const state = probeState(root, docsRoot)
  const index = probeIndex(root)
  const layers = probeLayerRules(root, docsRoot)
  const secrets = probeSecrets(root)
  const git = probeGit(root)

  const qa = {
    testRunner: probeTestRunner(root),
    typecheck: probeTypecheck(root),
    playwright: probePlaywright(root),
    chromeMcp: capability.chromeMcp ?? null, // null = 스킬이 판단해야 함
  }

  const findings = []
  if (!runtime.node.ok) {
    findings.push({ severity: 'blocker', code: 'NODE_TOO_OLD',
      message: `Node.js ${runtime.node.version} — ${runtime.node.required} 가 필요합니다` })
  }
  if (runtime.claudeCode.ok === false) {
    findings.push({ severity: 'blocker', code: 'CC_TOO_OLD',
      message: `Claude Code ${runtime.claudeCode.version} — ${runtime.claudeCode.required} 가 필요합니다` })
  }
  if (runtime.claudeCode.workflowAvailable === false) {
    findings.push({ severity: 'warning', code: 'NO_WORKFLOW',
      message: 'Dynamic Workflow 미지원 — 대규모 검증이 순차 실행됩니다' })
  }
  if (state.currentCorrupt) {
    findings.push({ severity: 'blocker', code: 'STATE_CORRUPT',
      message: 'current.json 을 읽을 수 없습니다', remediation: '/tene:status --resync' })
  }
  if (state.lock.held && state.lock.stale) {
    findings.push({ severity: 'warning', code: 'STALE_LOCK',
      message: '오래된 lock 이 남아 있습니다', remediation: '/tene:clear --lock' })
  }
  if (!layers.exists) {
    findings.push({ severity: 'info', code: 'NO_LAYER_RULES',
      message: '계층 규칙이 없습니다 — 기본 프리셋으로 동작합니다', remediation: '/tene:layers scan' })
  }
  if (!qa.testRunner) {
    findings.push({ severity: 'info', code: 'NO_TEST_RUNNER',
      message: '테스트 러너 미감지 — UNIT 검증이 insufficient 로 보고됩니다' })
  }
  if (!qa.playwright && qa.chromeMcp !== true) {
    findings.push({ severity: 'info', code: 'NO_BROWSER',
      message: '브라우저 드라이버 미감지 — UX 검증이 insufficient 로 보고될 수 있습니다' })
  }
  if (secrets.plaintextEnv.length && secrets.cli.available) {
    findings.push({ severity: 'warning', code: 'PLAINTEXT_ENV',
      message: `평문 .env 발견: ${secrets.plaintextEnv.join(', ')}`,
      remediation: 'tene import .env && rm .env' })
  }

  return { runtime, state, index, layers, qa, secrets, git, findings }
}
