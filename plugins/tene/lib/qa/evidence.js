/**
 * 증거 매니페스트 — D08 §5, §9.3
 *
 * 증거는 두 가지를 만족해야 유효하다.
 *   ① 해시가 맞는다 — 파일이 바뀌지 않았다
 *   ② 마지막 코드 변경보다 최신이다 — 지금 코드를 본 증거다
 *
 * ②가 없으면 "예전에 통과했으니 지금도 통과" 가 성립해버린다.
 * 이것이 AC 의 stale 판정과 이중 방어를 이룬다.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { writeAtomic } from '../util/atomic.js'
import { parseJsonSafe, stableJson } from '../util/json.js'
import { STATE_DIR } from '../util/paths.js'
import { nowIso } from '../util/time.js'

export const EVIDENCE_SCHEMA_VERSION = 1

/** 증거는 상태 디렉토리가 아니라 sprint 문서 옆에 둔다 — 사람이 열어볼 것이기 때문이다 */
export function evidenceDir(root, sprint) {
  return join(root, sprint.docsRoot, sprint.sprintDir, '03-analysis', 'evidence')
}

export function manifestPath(root, sprint) {
  return join(evidenceDir(root, sprint), 'manifest.json')
}

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

export function sha256File(path) {
  try {
    return sha256(readFileSync(path))
  } catch {
    return null
  }
}

export function newManifest(sprintId) {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    sprint: sprintId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    artifacts: [],
    cases: [],
  }
}

export function readManifest(root, sprint) {
  const p = manifestPath(root, sprint)
  if (!existsSync(p)) return null
  const raw = parseJsonSafe(readFileSync(p, 'utf8'))
  return raw?.schemaVersion === EVIDENCE_SCHEMA_VERSION ? raw : null
}

export function writeManifest(root, sprint, manifest) {
  mkdirSync(evidenceDir(root, sprint), { recursive: true })
  manifest.updatedAt = nowIso()
  writeAtomic(manifestPath(root, sprint), stableJson(manifest), { root })
  return manifestPath(root, sprint)
}

/**
 * 아티팩트를 등록한다. 파일은 이미 evidence/ 에 있어야 한다.
 *
 * @param {{ id: string, path: string, kind: string, ac?: string, layer?: string, tool?: string }} art
 */
export function registerArtifact(root, sprint, manifest, art) {
  const abs = join(evidenceDir(root, sprint), art.path)
  const hash = sha256File(abs)
  if (!hash) {
    throw new Error(`증거 파일을 읽을 수 없습니다: ${art.path}`)
  }
  const st = statSync(abs)

  const entry = {
    id: art.id,
    path: art.path,
    kind: art.kind,
    ac: art.ac ?? null,
    layer: art.layer ?? null,
    tool: art.tool ?? null,
    sha256: hash,
    bytes: st.size,
    createdAt: nowIso(),
  }
  const idx = manifest.artifacts.findIndex((a) => a.id === art.id)
  if (idx >= 0) manifest.artifacts[idx] = entry
  else manifest.artifacts.push(entry)
  return entry
}

/**
 * 증거 유효성 — D08 §9.3
 *
 * @param {object} manifest
 * @param {string} ref  artifact id 또는 path
 * @param {{ dir: string, lastCodeChangeAt?: string }} opts
 * @returns {{ ok: boolean, reason?: string }}
 */
export function verifyEvidence(manifest, ref, opts) {
  if (!manifest) return { ok: false, reason: '증거 매니페스트가 없습니다' }

  const art = manifest.artifacts.find((a) => a.id === ref || a.path === ref)
  if (!art) return { ok: false, reason: `매니페스트에 '${ref}' 가 없습니다` }

  const abs = join(opts.dir, art.path)
  if (!existsSync(abs)) return { ok: false, reason: `파일이 없습니다: ${art.path}` }

  const actual = sha256File(abs)
  if (actual !== art.sha256) {
    return { ok: false, reason: `해시 불일치 (${art.path}) — 증거 파일이 변경되었습니다` }
  }

  // freshness — 증거가 코드보다 오래되면 지금 코드를 본 증거가 아니다
  if (opts.lastCodeChangeAt && art.createdAt < opts.lastCodeChangeAt) {
    return {
      ok: false,
      reason: `증거가 마지막 코드 변경(${opts.lastCodeChangeAt})보다 이전입니다 (${art.createdAt})`,
    }
  }
  return { ok: true }
}

/** 게이트에 넘길 검증 함수를 만든다 */
export function evidenceVerifier(root, sprint, { lastCodeChangeAt } = {}) {
  const manifest = readManifest(root, sprint)
  const dir = evidenceDir(root, sprint)
  return (ref) => verifyEvidence(manifest, ref, { dir, lastCodeChangeAt })
}

// ── 관찰 기록 ─────────────────────────────────────────────────────────

/**
 * 케이스 = 한 번의 관찰. **판정을 담지 않는다.**
 *
 * runner 가 "통과했습니다" 라고 쓰면 판정자가 그것을 읽고 따라간다.
 * 그래서 케이스에는 관찰만 담고, verdict 필드 자체를 두지 않는다.
 */
export function addCase(manifest, c) {
  const entry = {
    id: c.id,
    ac: c.ac,
    layer: c.layer,
    variant: c.variant ?? null,
    steps: c.steps ?? [],
    observed: c.observed,          // 무엇을 보았는가 (사실만)
    artifacts: c.artifacts ?? [],  // 근거 파일 id
    tool: c.tool ?? null,
    at: nowIso(),
  }
  manifest.cases.push(entry)
  return entry
}

/** 판정자에게 넘길 입력 — runner 의 결론을 제거한다 */
export function judgeInput(manifest, acId, { ac, charter }) {
  const cases = manifest?.cases?.filter((c) => c.ac === acId) ?? []
  const artIds = new Set(cases.flatMap((c) => c.artifacts))
  return {
    ac,
    charter,
    evidence: {
      cases: cases.map((c) => ({
        id: c.id, layer: c.layer, variant: c.variant,
        steps: c.steps, observed: c.observed, artifacts: c.artifacts, tool: c.tool,
      })),
      artifacts: (manifest?.artifacts ?? [])
        .filter((a) => artIds.has(a.id))
        .map((a) => ({ id: a.id, kind: a.kind, path: a.path, bytes: a.bytes, sha256: a.sha256 })),
    },
  }
}

// ── Redaction ─────────────────────────────────────────────────────────

/**
 * 증거에 시크릿이 섞이는 것을 막는다 — D08 §5.4, D11.
 *
 * 증거는 저장소에 커밋되고 공유된다. 로그 한 줄에 토큰이 들어가면 그대로 유출된다.
 */
const SECRET_PATTERNS = [
  { name: 'aws_access_key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'github_token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: 'slack_token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'private_key', re: /-----BEGIN[ A-Z]*PRIVATE KEY-----/g },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: 'bearer', re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/gi },
  { name: 'basic_auth_url', re: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s:@]+@/gi },
  { name: 'env_assignment', re: /\b(?:API|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE)[A-Z_]*\s*[=:]\s*["']?[A-Za-z0-9/_+=-]{12,}/g },
]

export function scanSecrets(text) {
  const hits = []
  const s = String(text ?? '')
  for (const p of SECRET_PATTERNS) {
    p.re.lastIndex = 0
    for (const m of s.matchAll(p.re)) {
      hits.push({ kind: p.name, at: m.index, sample: mask(m[0]) })
    }
  }
  return hits
}

export function redact(text) {
  let out = String(text ?? '')
  for (const p of SECRET_PATTERNS) {
    out = out.replace(p.re, (m) => `[REDACTED:${p.name}]`)
  }
  return out
}

function mask(s) {
  const t = String(s)
  return t.length <= 8 ? '***' : `${t.slice(0, 4)}…${t.slice(-2)}`
}

/**
 * 증거 파일 전체를 훑는다. 텍스트가 아닌 파일은 건너뛰되 건너뛴 사실을 남긴다 —
 * 스크린샷 안의 토큰은 이 검사로 잡을 수 없다.
 */
export function scanManifest(root, sprint, manifest) {
  const dir = evidenceDir(root, sprint)
  const findings = []
  const skipped = []

  for (const art of manifest?.artifacts ?? []) {
    const abs = join(dir, art.path)
    if (!/\.(txt|log|json|md|html|csv|xml|yaml|yml)$/i.test(art.path)) {
      skipped.push({ id: art.id, path: art.path, reason: 'binary_or_unknown' })
      continue
    }
    try {
      const hits = scanSecrets(readFileSync(abs, 'utf8'))
      if (hits.length) findings.push({ id: art.id, path: art.path, hits })
    } catch {
      skipped.push({ id: art.id, path: art.path, reason: 'unreadable' })
    }
  }
  return {
    clean: findings.length === 0,
    findings,
    skipped,
    // 검사하지 못한 파일이 있으면 "깨끗하다" 고 단정하지 않는다
    note: skipped.length ? `${skipped.length}건은 검사하지 못했습니다 (이미지·바이너리 포함)` : null,
  }
}
