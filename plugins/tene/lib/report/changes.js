/**
 * R2 — 파일 변경과 구현 내용 — D10 §2
 *
 * 표는 기계가 만들고, **"어떻게 구현했는지" 는 사람/LLM 이 쓴다.**
 * 기계가 서술까지 하면 diff 를 옮겨 적은 글이 나오고, 그건 읽을 가치가 없다.
 *
 * **삭제된 심볼도 기록한다.** R1 의 orphaned 판정과 짝을 이룬다 —
 * 무엇이 사라졌는지 모르면 다음 sprint 가 없어진 것을 참조한다.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { judgeLayer, LAYERS } from '../scan/layer.js'
import { langOf } from '../scan/walk.js'
import { packFor } from '../scan/langs/index.js'
import { isDocOrState, isVaultPath } from '../util/paths.js'

function git(root, args) {
  try {
    return execFileSync('git', args, {
      cwd: root, encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }
}

/** `git diff --numstat` — 변경 파일과 증감 */
export function diffStat(root, fromCommit, toRef = 'HEAD') {
  if (!fromCommit) return null
  const out = git(root, ['diff', '--numstat', `${fromCommit}..${toRef}`])
  if (out === null) return null

  const rows = []
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const [added, removed, path] = line.split('\t')
    rows.push({
      path,
      added: Number(added) || 0,
      removed: Number(removed) || 0,
      binary: added === '-',
    })
  }
  return rows
}

/** 작업 중(미커밋) 변경도 본다 — 구현 직후 보고서를 쓰는 것이 보통이다 */
export function workingStat(root) {
  const out = git(root, ['status', '--porcelain', '-uall'])
  if (out === null) return null
  const rows = []
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const status = line.slice(0, 2).trim()
    let path = line.slice(3).trim()
    if (path.includes(' -> ')) path = path.split(' -> ')[1]
    rows.push({ path, added: 0, removed: 0, untracked: status === '??' })
  }
  return rows
}

function fileAt(root, commit, path) {
  return git(root, ['show', `${commit}:${path}`])
}

/**
 * 파일 하나의 심볼 변화. added / modified / removed.
 *
 * 정규식 인덱서로 뽑으므로 이름 단위 비교다 — 본문이 바뀐 것은
 * `modified` 로 나오지만 어떻게 바뀌었는지는 알 수 없다. 그건 서술의 몫이다.
 */
export function changedSymbolsInFile(root, path, baseCommit) {
  const lang = langOf(path)
  const pack = lang ? packFor(lang) : null
  if (!pack) return []

  let after = ''
  try {
    after = readFileSync(join(root, path), 'utf8')
  } catch {
    after = '' // 삭제된 파일
  }
  const before = baseCommit ? fileAt(root, baseCommit, path) : null

  const defsBefore = new Set((before ? pack.extractDefinitions(before, { path }) : []).map((d) => d.name))
  const defsAfter = pack.extractDefinitions(after, { path })
  const afterNames = new Set(defsAfter.map((d) => d.name))

  const out = defsAfter.map((d) => ({
    name: d.name,
    kind: d.kind,
    status: defsBefore.has(d.name) ? 'modified' : 'added',
    line: d.line,
  }))

  for (const n of defsBefore) {
    if (!afterNames.has(n)) out.push({ name: n, status: 'removed' })
  }
  return out
}

const LAYER_ORDER = [...LAYERS, 'test', 'unclassified']

/**
 * @param {string} root
 * @param {object} sprint
 * @param {{ index: object, rules: object }} ctx
 */
export function buildChanges(root, sprint, ctx) {
  const committed = diffStat(root, sprint.startCommit)
  const working = workingStat(root) ?? []

  if (committed === null && !working.length) {
    // git 을 못 읽었다. 빈 표를 내면 "변경 없음" 으로 읽힌다.
    return {
      rows: [], available: false,
      reason: sprint.startCommit ? 'git_unavailable' : 'no_start_commit',
      hint: sprint.startCommit
        ? 'git 명령을 실행할 수 없어 변경 목록을 만들지 못했습니다'
        : 'sprint 시작 커밋이 없어 무엇이 이번 변경인지 알 수 없습니다',
    }
  }

  const byPath = new Map()
  for (const r of [...(committed ?? []), ...working]) {
    const prev = byPath.get(r.path)
    byPath.set(r.path, prev ? { ...prev, ...r, added: Math.max(prev.added, r.added) } : r)
  }

  const rows = []
  const excluded = []

  for (const f of byPath.values()) {
    if (isDocOrState(f.path, sprint.docsRoot) || isVaultPath(f.path)) { excluded.push(f.path); continue }

    const layer = judgeLayer(f.path, ctx.rules, {
      imports: (ctx.index?.imports?.[f.path] ?? []).map((im) => im.from),
    })
    const symbols = changedSymbolsInFile(root, f.path, sprint.startCommit)

    rows.push({
      path: f.path,
      change: f.untracked || (f.added > 0 && f.removed === 0 && !ctx.index?.files?.[f.path])
        ? '신규'
        : '수정',
      diff: f.binary ? '(binary)' : `+${f.added}/-${f.removed}`,
      layer: layer.layer,
      layerSource: layer.source,
      symbols,
    })
  }

  rows.sort((a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer) || a.path.localeCompare(b.path))

  return {
    rows,
    available: true,
    excluded,
    stats: {
      files: rows.length,
      added: rows.filter((r) => r.change === '신규').length,
      symbolsAdded: rows.reduce((a, r) => a + r.symbols.filter((s) => s.status === 'added').length, 0),
      symbolsRemoved: rows.reduce((a, r) => a + r.symbols.filter((s) => s.status === 'removed').length, 0),
    },
  }
}

/** 이번 sprint 에서 바뀐 심볼 이름 집합 — R1 이 쓴다 */
export function changedSymbolSet(changes) {
  const out = new Set()
  for (const r of changes.rows ?? []) {
    for (const s of r.symbols) if (s.status !== 'removed') out.add(s.name)
  }
  return out
}

export function changedFileSet(changes) {
  return new Set((changes.rows ?? []).map((r) => r.path))
}

/** R2 자동 생성 블록 */
export function renderChanges(changes, { lang = 'ko' } = {}) {
  if (!changes.available) {
    return lang === 'ko' ? `> ⚠️ ${changes.hint}` : `> ⚠️ ${changes.hint}`
  }
  if (!changes.rows.length) {
    return lang === 'ko' ? '(변경된 코드 파일이 없습니다)' : '(no code files changed)'
  }

  const lines = lang === 'ko'
    ? ['| 파일 | 변경 | 계층 | 심볼 |', '|---|---|---|---|']
    : ['| File | Change | Layer | Symbols |', '|---|---|---|---|']

  for (const r of changes.rows) {
    const syms = r.symbols.length
      ? r.symbols.map((s) => `${s.name} (${s.status})`).join(', ')
      : '—'
    lines.push(`| \`${r.path}\` | ${r.change} ${r.diff} | ${r.layer} | ${syms} |`)
  }

  const removed = changes.rows.flatMap((r) => r.symbols.filter((s) => s.status === 'removed').map((s) => s.name))
  if (removed.length) {
    lines.push('', lang === 'ko'
      ? `> 삭제된 심볼: ${removed.map((n) => `\`${n}\``).join(', ')} — 이것을 참조하던 곳이 있는지 확인하세요.`
      : `> Removed symbols: ${removed.join(', ')}`)
  }
  return lines.join('\n')
}
