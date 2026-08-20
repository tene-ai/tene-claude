/**
 * Understanding Layer 판정 — D06 §3
 *
 * **추측으로 채우지 않는다.** 규칙에 걸리지 않는 파일은 `unclassified` 로 남는다.
 * `src/utils/` 를 business-logic 으로 자동 배정하면 이후 모든 계층 통계가 왜곡되고,
 * 미분류 목록이 곧 "규칙을 다듬을 지점" 이라는 정보도 함께 사라진다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSimpleYaml } from '../doc/parser.js'

export const LAYERS = ['interface', 'business-logic', 'persistence', 'infrastructure']
export const UNCLASSIFIED = 'unclassified'

/**
 * 계층 순서 — 위반 판정의 기준.
 * interface → business-logic → persistence, infrastructure 는 아래 전체가 쓴다.
 */
const ORDER = { interface: 0, 'business-logic': 1, persistence: 2, infrastructure: 3 }

// ── 규칙 로딩 ─────────────────────────────────────────────────────────

/** 프로젝트 규칙 → 없으면 플러그인 프리셋 */
export function loadRules(root, { docsRoot = 'docs/sprints', presetPath } = {}) {
  const projectPath = join(root, docsRoot, '_meta', 'layers.yml')
  if (existsSync(projectPath)) {
    const parsed = tryParse(projectPath)
    if (parsed) return { ...parsed, source: 'rules-project', path: `${docsRoot}/_meta/layers.yml` }
  }
  if (presetPath && existsSync(presetPath)) {
    const parsed = tryParse(presetPath)
    if (parsed) return { ...parsed, source: 'rules-default', path: presetPath }
  }
  return { ...FALLBACK, source: 'rules-builtin', path: null }
}

function tryParse(path) {
  try {
    const y = parseSimpleYaml(readFileSync(path, 'utf8'))
    if (!y?.layers) return null
    return normalizeRules(y)
  } catch {
    return null
  }
}

function normalizeRules(y) {
  const layers = {}
  for (const key of LAYERS) {
    const raw = y.layers?.[key] ?? {}
    layers[key] = {
      paths: toArray(raw.paths),
      imports: toArray(raw.imports),
    }
  }
  return {
    version: y.version ?? 1,
    layers,
    precedence: toArray(y.precedence).filter((p) => LAYERS.includes(p)),
    unmatched: y.unmatched ?? UNCLASSIFIED,
    exclude: toArray(y.exclude),
    testPaths: toArray(y.test_paths ?? y.testPaths),
  }
}

function toArray(v) {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x)
  if (typeof v === 'string' && v) return [v]
  return []
}

/** 프리셋 파일조차 못 읽을 때의 최소 규칙 */
const FALLBACK = normalizeRules({
  version: 1,
  layers: {
    interface: { paths: ['src/pages/**', 'src/routes/**', 'src/controllers/**', 'src/api/**'], imports: [] },
    'business-logic': { paths: ['src/services/**', 'src/domain/**', 'src/core/**'], imports: [] },
    persistence: { paths: ['src/repositories/**', 'src/models/**', 'src/db/**'], imports: [] },
    infrastructure: { paths: ['src/config/**', 'src/infra/**'], imports: [] },
  },
  precedence: LAYERS,
  unmatched: UNCLASSIFIED,
  exclude: [],
  test_paths: ['**/*.test.*', '**/*.spec.*'],
})

// ── glob ──────────────────────────────────────────────────────────────

const globCache = new Map()

export function globToRegExp(glob) {
  const cached = globCache.get(glob)
  if (cached) return cached

  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') { out += '(?:.*/)?'; i += 2 } else { out += '.*'; i += 1 }
      } else {
        out += '[^/]*'
      }
      continue
    }
    out += /[.+^${}()|[\]\\?]/.test(c) ? `\\${c}` : c
  }
  const re = new RegExp(`^${out}$`)
  globCache.set(glob, re)
  return re
}

export function matchAnyGlob(path, patterns) {
  for (const p of patterns) {
    if (globToRegExp(p).test(path)) return p
  }
  return null
}

/** `@aws-sdk/*` 같은 패턴도 받는다 */
function matchAnyImport(specs, patterns) {
  for (const p of patterns) {
    const re = p.includes('*') ? globToRegExp(p) : null
    for (const s of specs) {
      if (re ? re.test(s) : (s === p || s.startsWith(`${p}/`))) return { pattern: p, spec: s }
    }
  }
  return null
}

// ── 판정 ──────────────────────────────────────────────────────────────

/**
 * 파일 하나의 계층을 정한다.
 *
 * 1. 경로 규칙 (precedence 순)
 * 2. import 규칙 — 경로로 안 걸린 파일만
 * 3. 미분류 — **추측하지 않는다**
 *
 * @param {string} filePath  root 기준 상대 경로
 * @param {object} rules
 * @param {{ imports?: string[] }} [ctx] 이 파일의 import 명세들
 */
export function judgeLayer(filePath, rules, ctx = {}) {
  if (matchAnyGlob(filePath, rules.exclude ?? [])) {
    return { layer: UNCLASSIFIED, source: 'excluded', confidence: 'high', reason: '계층 판정 제외 경로' }
  }
  if (matchAnyGlob(filePath, rules.testPaths ?? [])) {
    return { layer: 'test', source: 'test-path', confidence: 'high', reason: '테스트 파일 — 구현 통계와 분리' }
  }

  const order = rules.precedence?.length ? rules.precedence : LAYERS

  for (const layer of order) {
    const hit = matchAnyGlob(filePath, rules.layers?.[layer]?.paths ?? [])
    if (hit) {
      return { layer, source: rules.source ?? 'rules', confidence: 'high', matchedRule: hit }
    }
  }

  // 경로로 못 정하면 import 로 본다. 경로보다 약한 근거이므로 confidence 를 낮춘다.
  const specs = ctx.imports ?? []
  if (specs.length) {
    for (const layer of order) {
      const hit = matchAnyImport(specs, rules.layers?.[layer]?.imports ?? [])
      if (hit) {
        return {
          layer, source: 'imports', confidence: 'medium',
          matchedRule: hit.pattern, evidence: `import '${hit.spec}'`,
        }
      }
    }
  }

  return {
    layer: UNCLASSIFIED,
    source: 'unmatched',
    confidence: 'high', // "모른다" 는 확실히 안다
    reason: '경로·import 규칙 어디에도 걸리지 않았습니다',
    suggestion: suggestRule(filePath),
  }
}

/** 미분류 파일에서 규칙 후보를 만든다 — 사용자가 layers.yml 을 다듬을 때 쓴다 */
function suggestRule(filePath) {
  const parts = filePath.split('/')
  if (parts.length < 2) return null
  return `${parts.slice(0, parts.length - 1).join('/')}/**`
}

/**
 * 인덱스 전체를 계층별로 나눈다.
 * @returns {{ byLayer: Record<string,string[]>, unclassified: string[], stats: object, suggestions: object[] }}
 */
export function classifyIndex(index, rules) {
  const byLayer = Object.fromEntries([...LAYERS, 'test'].map((l) => [l, []]))
  const unclassified = []
  const suggestionCount = new Map()

  for (const [path, meta] of Object.entries(index?.files ?? {})) {
    const specs = (index.imports?.[path] ?? []).map((im) => im.from)
    const j = judgeLayer(path, rules, { imports: specs })

    if (j.layer === UNCLASSIFIED) {
      if (j.source === 'excluded') continue
      unclassified.push({ path, lang: meta.lang, suggestion: j.suggestion })
      if (j.suggestion) suggestionCount.set(j.suggestion, (suggestionCount.get(j.suggestion) ?? 0) + 1)
      continue
    }
    byLayer[j.layer].push({ path, lang: meta.lang, confidence: j.confidence, matchedRule: j.matchedRule })
  }

  const total = Object.values(byLayer).reduce((a, l) => a + l.length, 0) + unclassified.length
  const stats = { total, unclassified: unclassified.length }
  for (const l of [...LAYERS, 'test']) stats[l] = byLayer[l].length

  return {
    byLayer,
    unclassified,
    stats,
    // 같은 디렉토리가 여러 번 미분류로 나오면 규칙을 추가할 가치가 있다
    suggestions: [...suggestionCount.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([pattern, files]) => ({ pattern, files })),
    rulesSource: rules.source,
    rulesPath: rules.path,
  }
}

// ── 위반 ──────────────────────────────────────────────────────────────

/**
 * 계층 위반의 종류 — D06 §3.4
 *
 * 위반은 **위반이 일어난 파일** 에 귀속된다. 컨트롤러가 DB 를 직접 만지면
 * 그건 interface 파일의 문제이지 persistence 파일의 문제가 아니다.
 */
export function violationKind(from, to) {
  if (!ORDER[from] === undefined || ORDER[to] === undefined) return null
  if (from === to) return null
  const a = ORDER[from]
  const b = ORDER[to]

  if (from === 'interface' && to === 'persistence') return 'layer-skip'
  if (from === 'persistence' && (to === 'interface' || to === 'business-logic')) return 'reverse'
  if (from === 'business-logic' && to === 'infrastructure') return 'infra-leak'
  if (b < a && to !== 'infrastructure') return 'reverse'
  return null
}

export const VIOLATION_SEVERITY = {
  'layer-skip': 'warning',
  reverse: 'blocker',
  'infra-leak': 'warning',
}

/**
 * import 관계에서 계층 위반을 찾는다.
 * 해석되지 않은 import(외부 패키지)는 검사하지 않는다 — 대상 계층을 알 수 없다.
 */
export function findViolations(index, rules) {
  const layerOf = new Map()
  for (const path of Object.keys(index?.files ?? {})) {
    const specs = (index.imports?.[path] ?? []).map((im) => im.from)
    layerOf.set(path, judgeLayer(path, rules, { imports: specs }).layer)
  }

  const out = []
  for (const [file, list] of Object.entries(index?.imports ?? {})) {
    const from = layerOf.get(file)
    if (!from || from === UNCLASSIFIED || from === 'test') continue

    for (const im of list) {
      if (!im.resolved) continue // 외부 패키지 — 계층을 모른다
      const to = layerOf.get(im.resolved)
      if (!to || to === UNCLASSIFIED || to === 'test') continue

      const kind = violationKind(from, to)
      if (!kind) continue
      out.push({
        kind,
        severity: VIOLATION_SEVERITY[kind] ?? 'warning',
        file, line: im.line, target: im.resolved,
        from, to,
        detail: `${from} → ${to}`,
      })
    }
  }
  return out.sort((a, b) => (a.severity === 'blocker' ? -1 : 1) - (b.severity === 'blocker' ? -1 : 1))
}
