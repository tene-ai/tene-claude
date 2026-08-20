/**
 * Capability 감지 — D08 §4
 *
 * 무엇을 검증할 수 있는지 먼저 안다. 도구가 없으면 그 레이어는 `insufficient` 이고,
 * **`not-applicable` 이 아니다.** 도구가 없는 것과 해당 없는 것은 다르다 —
 * 전자는 갖추면 검증되지만 후자는 영영 검증 대상이 아니다.
 *
 * Chrome MCP 는 여기서 감지할 수 없다. bin 스크립트는 MCP 도구 목록을 볼 수 없으므로
 * 스킬이 판단해 `--capability` 로 주입한다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseJsonSafe } from '../util/json.js'

function readJson(path) {
  try {
    return parseJsonSafe(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

const has = (root, ...parts) => existsSync(join(root, ...parts))

export function detectTestRunner(root) {
  const pkg = readJson(join(root, 'package.json'))
  if (pkg?.scripts?.test) return { kind: 'npm', command: 'npm test', source: 'package.json scripts.test' }
  if (has(root, 'pytest.ini') || has(root, 'tox.ini')) return { kind: 'pytest', command: 'pytest', source: 'pytest.ini' }
  if (has(root, 'pyproject.toml')) {
    const t = safeRead(join(root, 'pyproject.toml'))
    if (/\[tool\.pytest/.test(t)) return { kind: 'pytest', command: 'pytest', source: 'pyproject.toml' }
  }
  if (has(root, 'go.mod')) return { kind: 'go', command: 'go test ./...', source: 'go.mod' }
  if (has(root, 'pom.xml')) return { kind: 'maven', command: 'mvn test', source: 'pom.xml' }
  if (has(root, 'build.gradle') || has(root, 'build.gradle.kts')) {
    return { kind: 'gradle', command: './gradlew test', source: 'build.gradle' }
  }
  if (has(root, 'Cargo.toml')) return { kind: 'cargo', command: 'cargo test', source: 'Cargo.toml' }
  return null
}

export function detectTypecheck(root) {
  const pkg = readJson(join(root, 'package.json'))
  if (pkg?.scripts?.typecheck) return { kind: 'npm', command: 'npm run typecheck', source: 'scripts.typecheck' }
  if (has(root, 'tsconfig.json')) return { kind: 'tsc', command: 'npx tsc --noEmit', source: 'tsconfig.json' }
  if (has(root, 'mypy.ini')) return { kind: 'mypy', command: 'mypy .', source: 'mypy.ini' }
  if (has(root, 'go.mod')) return { kind: 'go', command: 'go vet ./...', source: 'go.mod' }
  return null
}

export function detectLinter(root) {
  const pkg = readJson(join(root, 'package.json'))
  if (pkg?.scripts?.lint) return { kind: 'npm', command: 'npm run lint', source: 'scripts.lint' }
  for (const f of ['eslint.config.js', 'eslint.config.mjs', '.eslintrc.json', '.eslintrc.js', '.eslintrc']) {
    if (has(root, f)) return { kind: 'eslint', command: 'npx eslint .', source: f }
  }
  if (has(root, 'biome.json')) return { kind: 'biome', command: 'npx biome check .', source: 'biome.json' }
  if (has(root, 'ruff.toml') || has(root, '.ruff.toml')) return { kind: 'ruff', command: 'ruff check .', source: 'ruff.toml' }
  return null
}

/**
 * 브라우저. Chrome MCP 는 감지할 수 없으므로 `unknown` 을 낸다 —
 * `none` 이라고 단정하면 스킬이 Chrome MCP 를 갖고 있어도 UX 검증을 포기한다.
 */
export function detectBrowser(root, config = {}) {
  if (config.browserAdapter && config.browserAdapter !== 'auto') {
    return { kind: config.browserAdapter, source: 'config' }
  }
  if (has(root, 'node_modules', '@playwright', 'test') || has(root, 'playwright.config.ts') || has(root, 'playwright.config.js')) {
    return { kind: 'playwright', command: 'npx playwright test', source: 'playwright config' }
  }
  if (has(root, 'cypress.config.ts') || has(root, 'cypress.config.js')) {
    return { kind: 'cypress', command: 'npx cypress run', source: 'cypress config' }
  }
  return { kind: 'unknown', note: 'Chrome MCP 가용 여부는 스킬이 판단합니다' }
}

/** DB 는 접속 정보 없이 확인할 수 없다. 스키마 파일 존재만 본다. */
export function detectDb(root) {
  if (has(root, 'prisma', 'schema.prisma')) return { kind: 'prisma', source: 'prisma/schema.prisma', reachable: false }
  if (has(root, 'migrations')) return { kind: 'migrations', source: 'migrations/', reachable: false }
  return null
}

/**
 * @param {string} root
 * @param {{ browserAdapter?: string, injected?: object }} [config] injected 는 스킬이 넘긴 것
 */
export function probe(root, config = {}) {
  const testRunner = detectTestRunner(root)
  const typechecker = detectTypecheck(root)
  const linter = detectLinter(root)
  const browser = detectBrowser(root, config)
  const db = detectDb(root)

  const base = {
    testRunner,
    typechecker,
    linter,
    browser,
    httpClient: { kind: 'bash-curl', command: 'curl', source: 'always' },
    db,
    faultInject: null,   // MVP 미지원. false 가 아니라 null 로 둔다 — "없음" 을 명시한다.
  }

  // 스킬이 확인한 것(Chrome MCP 등)이 감지보다 우선한다
  const merged = { ...base, ...(config.injected ?? {}) }

  return {
    ...merged,
    // 무엇을 못 하는지 명시한다. 이것이 insufficient 의 근거가 된다.
    limitations: buildLimitations(merged),
  }
}

function buildLimitations(cap) {
  const out = []
  if (!cap.testRunner) out.push({ missing: 'testRunner', affects: ['L2', 'L3', 'L7'], detail: '테스트 러너를 찾지 못했습니다' })
  if (!cap.typechecker && !cap.linter) out.push({ missing: 'static', affects: ['L1'], detail: '타입체커·린터를 찾지 못했습니다' })
  if (!cap.browser || cap.browser.kind === 'unknown' || cap.browser.kind === 'none') {
    out.push({ missing: 'browser', affects: ['L4', 'L5', 'L6'], detail: '브라우저 자동화 도구를 확인하지 못했습니다' })
  }
  if (!cap.db?.reachable) out.push({ missing: 'db', affects: ['L3'], detail: 'DB 에 접속할 수 없어 데이터 상태를 직접 확인할 수 없습니다' })
  if (!cap.faultInject) out.push({ missing: 'faultInject', affects: ['L6'], detail: '결함 주입 도구가 없습니다' })
  return out
}

/** capability → 레이어별 실행 가능 여부 */
export function layerCapability(cap) {
  return {
    L1: Boolean(cap.linter || cap.typechecker),
    L2: Boolean(cap.testRunner),
    L3: Boolean(cap.testRunner || cap.httpClient),
    L4: isBrowserReady(cap) || Boolean(cap.httpClient),
    L5: isBrowserReady(cap),
    L6: isBrowserReady(cap) || Boolean(cap.httpClient),
    L7: Boolean(cap.testRunner),
  }
}

function isBrowserReady(cap) {
  const k = cap.browser?.kind
  return Boolean(k) && k !== 'unknown' && k !== 'none'
}

function safeRead(p) {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return ''
  }
}

/** doctor·qa 문서에 쓰는 표 */
export function renderCapability(cap, { lang = 'ko' } = {}) {
  const row = (label, v, effect) => {
    const mark = v ? `✅ ${v.command ?? v.kind ?? ''}`.trim() : `⛔ ${lang === 'ko' ? '없음' : 'none'}`
    return `| ${label} | ${mark} | ${effect ?? ''} |`
  }
  const head = lang === 'ko'
    ? ['| 도구 | 가용 | 없으면 |', '|---|---|---|']
    : ['| Tool | Available | If missing |', '|---|---|---|']

  return [
    ...head,
    row('테스트 러너', cap.testRunner, 'L2/L3/L7 insufficient'),
    row('타입체커', cap.typechecker, 'L1 부분'),
    row('린터', cap.linter, 'L1 부분'),
    row('브라우저', isBrowserReady(cap) ? cap.browser : null, 'L4/L5/L6 insufficient'),
    row('HTTP', cap.httpClient, ''),
    row('DB 직접 조회', cap.db?.reachable ? cap.db : null, 'L3 는 정적 확인만'),
    row('결함 주입', cap.faultInject, 'L6 insufficient'),
  ].join('\n')
}
