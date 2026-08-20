/**
 * 인덱스 빌더 — D06 §2.8~2.9
 *
 * 절대 경로를 인덱스에 넣지 않는다. 저장소를 옮기거나 다른 사람이 열면 전부 깨진다.
 * `root` 만 검증용으로 남기고, 나머지는 전부 root 기준 상대 경로다.
 *
 * 증분 빌드의 어려운 부분은 `refs` 가 전역이라는 점이다. 파일 하나가 바뀌면
 * **그 파일이 만든 refs 만** 골라내 지우고 다시 넣어야 한다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeAtomic } from '../util/atomic.js'
import { parseJsonSafe, stableJson } from '../util/json.js'
import { STATE_DIR } from '../util/paths.js'
import { nowIso } from '../util/time.js'
import { analyze, packFor } from './langs/index.js'
import { collect } from './walk.js'

export const INDEX_SCHEMA_VERSION = 1
export const ENGINE = 'node-regex'

/** 50% 넘게 바뀌면 증분 병합이 전체 빌드보다 비싸진다 */
const FULL_REBUILD_RATIO = 0.5

export function indexPath(root) {
  return join(root, STATE_DIR, 'index', 'symbols.json')
}

export function readIndex(root) {
  const p = indexPath(root)
  if (!existsSync(p)) return null
  const raw = parseJsonSafe(readFileSync(p, 'utf8'))
  if (!raw || raw.schemaVersion !== INDEX_SCHEMA_VERSION) return null
  // 다른 저장소의 인덱스가 섞이면 경로가 전부 어긋난다
  if (raw.root && raw.root !== root) return null

  // JSON.parse 는 일반 객체를 만든다. 증분 빌드가 여기에 push 하므로
  // 프로토타입 없는 맵으로 되살려야 같은 문제가 재발하지 않는다.
  for (const key of ['files', 'symbols', 'imports', 'refs']) {
    if (raw[key]) raw[key] = Object.assign(bare(), raw[key])
  }
  return raw
}

/**
 * 심볼 이름은 사용자 코드에서 온다 — `constructor`, `toString`, `__proto__` 가 될 수 있다.
 * 일반 객체를 쓰면 `obj['constructor'] ??= []` 가 Object.prototype 의 함수를 반환해
 * `.push` 에서 터진다. **실제 코드베이스를 인덱싱하다 그렇게 죽었다.**
 */
function bare() {
  return Object.create(null)
}

/** 프로토타입 오염 없이 배열에 밀어넣는다 */
function pushTo(map, key, value) {
  if (!Object.hasOwn(map, key)) map[key] = []
  map[key].push(value)
}

function emptyIndex(root) {
  return {
    schemaVersion: INDEX_SCHEMA_VERSION,
    builtAt: nowIso(),
    engine: ENGINE,
    root,
    stats: { files: 0, indexed: 0, skipped: 0, symbols: 0, refs: 0 },
    unsupported: [],
    files: bare(),
    symbols: bare(),
    imports: bare(),
    refs: bare(),
    unresolved: [],
  }
}

/** 한 파일을 분석해 인덱스 조각으로 만든다 */
function analyzeFile(root, file) {
  let src
  try {
    src = readFileSync(file.abs, 'utf8')
  } catch {
    return null
  }
  const result = analyze(file.lang, src, { path: file.path })
  if (!result) return null
  return { file, ...result }
}

/** 조각들을 인덱스에 넣는다 (기존 항목은 호출 전에 제거되어 있어야 한다) */
function mergeIn(index, piece, fileIndexByPath) {
  const { file, definitions, imports, refs, unresolved, lang } = piece

  index.files[file.path] = { mtime: file.mtime, size: file.size, lang }

  for (const d of definitions) {
    pushTo(index.symbols, d.name, {
      kind: d.kind,
      file: file.path,
      line: d.line,
      exported: d.exported,
      confidence: d.confidence,
      signatureText: d.signatureText,
      ...(d.receiver ? { receiver: d.receiver } : {}),
    })
  }

  const pack = packFor(lang)
  index.imports[file.path] = imports.map((im) => ({
    from: im.from,
    names: im.names,
    line: im.line,
    ...(im.namespace ? { namespace: true } : {}),
    ...(im.reexport ? { reexport: true } : {}),
    resolved: resolveImport(pack, file.path, im.from, fileIndexByPath),
  }))

  for (const r of refs) {
    pushTo(index.refs, r.name, {
      file: file.path,
      line: r.line,
      kind: r.kind,
      confidence: r.confidence,
      ...(r.via ? { via: r.via } : {}),
    })
  }

  for (const u of unresolved) {
    index.unresolved.push({ file: file.path, line: u.line, reason: u.reason, detail: u.detail })
  }
}

/** 후보 경로 중 실제로 인덱스에 있는 파일을 고른다. 없으면 null (외부 패키지이거나 미지원). */
function resolveImport(pack, fromFile, spec, fileSet) {
  if (!pack?.resolveCandidates) return null
  for (const cand of pack.resolveCandidates(fromFile, spec)) {
    if (fileSet.has(cand)) return cand
  }
  return null
}

/** 특정 파일이 만든 항목을 전부 제거한다 — 증분 빌드의 핵심 */
function removeFile(index, path) {
  delete index.files[path]
  delete index.imports[path]

  for (const [name, list] of Object.entries(index.symbols)) {
    const kept = list.filter((s) => s.file !== path)
    if (kept.length) index.symbols[name] = kept
    else delete index.symbols[name]
  }
  for (const [name, list] of Object.entries(index.refs)) {
    const kept = list.filter((r) => r.file !== path)
    if (kept.length) index.refs[name] = kept
    else delete index.refs[name]
  }
  index.unresolved = index.unresolved.filter((u) => u.file !== path)
}

function recount(index) {
  index.stats.symbols = Object.values(index.symbols).reduce((a, l) => a + l.length, 0)
  index.stats.refs = Object.values(index.refs).reduce((a, l) => a + l.length, 0)
  index.stats.indexed = Object.keys(index.files).length
}

/**
 * 인덱스를 만든다. 이전 인덱스가 있으면 변경분만 다시 읽는다.
 *
 * @param {string} root
 * @param {{ force?: boolean, subpaths?: string[], gitignore?: boolean, onProgress?: Function }} [opts]
 * @returns {{ index: object, mode: 'full'|'incremental', changed: number, removed: number, elapsedMs: number }}
 */
export function build(root, opts = {}) {
  const t0 = performance.now()
  const scan = collect(root, { subpaths: opts.subpaths, gitignore: opts.gitignore })
  const prev = opts.force ? null : readIndex(root)

  const currentPaths = new Set(scan.files.map((f) => f.path))
  const changed = []
  const removed = []

  for (const f of scan.files) {
    const old = prev?.files?.[f.path]
    if (!old || old.mtime !== f.mtime || old.size !== f.size) changed.push(f)
  }
  for (const path of Object.keys(prev?.files ?? {})) {
    if (!currentPaths.has(path)) removed.push(path)
  }

  const wantsFull = !prev || changed.length > scan.files.length * FULL_REBUILD_RATIO
  const index = wantsFull ? emptyIndex(root) : prev
  const targets = wantsFull ? scan.files : changed

  if (!wantsFull) {
    for (const path of removed) removeFile(index, path)
    for (const f of changed) removeFile(index, f.path)
  }

  let done = 0
  for (const f of targets) {
    const piece = analyzeFile(root, f)
    if (piece) mergeIn(index, piece, currentPaths)
    if (opts.onProgress && ++done % 100 === 0) opts.onProgress(done, targets.length)
  }

  index.builtAt = nowIso()
  index.engine = ENGINE
  index.root = root
  index.unsupported = scan.unsupported
  index.stats.files = scan.files.length + scan.unsupported.reduce((a, u) => a + u.files, 0)
  index.stats.skipped = index.stats.files - scan.files.length + scan.tooLarge.length
  if (scan.tooLarge.length) index.tooLarge = scan.tooLarge
  recount(index)

  return {
    index,
    mode: wantsFull ? 'full' : 'incremental',
    changed: targets.length,
    removed: removed.length,
    elapsedMs: Math.round(performance.now() - t0),
  }
}

export function writeIndex(root, index) {
  writeAtomic(indexPath(root), stableJson(index), { root })
  return indexPath(root)
}

/** 빌드하고 저장한다 */
export function buildAndWrite(root, opts = {}) {
  const res = build(root, opts)
  writeIndex(root, res.index)
  return res
}

/**
 * 인덱스가 현재 파일 상태와 맞는지 본다. 전체 스캔을 하지만 파일을 읽지는 않는다.
 * @returns {{ fresh: boolean, changed: number, removed: number, added: number }}
 */
export function checkFreshness(root) {
  const prev = readIndex(root)
  if (!prev) return { fresh: false, changed: 0, removed: 0, added: 0, reason: 'no_index' }

  const scan = collect(root)
  const currentPaths = new Set(scan.files.map((f) => f.path))
  let changed = 0
  let added = 0
  for (const f of scan.files) {
    const old = prev.files[f.path]
    if (!old) { added++; continue }
    if (old.mtime !== f.mtime || old.size !== f.size) changed++
  }
  const removed = Object.keys(prev.files).filter((p) => !currentPaths.has(p)).length
  return { fresh: changed + added + removed === 0, changed, removed, added, builtAt: prev.builtAt }
}
