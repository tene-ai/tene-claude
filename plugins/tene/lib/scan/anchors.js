/**
 * 앵커 역인덱스 — D06 §5
 *
 * AC 는 심볼에 앵커된다. 파일이 편집되면 **그 파일에 걸린 AC 를 즉시** 찾아야 한다.
 * PostToolUse 훅이 이걸 쓰는데, 훅은 인덱스를 다시 만들 시간이 없다.
 *
 * 그래서 `byPath` 를 미리 만들어 둔다 — 경로 하나로 영향 AC 를 O(1) 에 얻는다.
 * 훅이 하는 일은 JSON 하나 읽고 키 조회하는 것뿐이다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeAtomic } from '../util/atomic.js'
import { parseJsonSafe, stableJson } from '../util/json.js'
import { STATE_DIR } from '../util/paths.js'
import { nowIso } from '../util/time.js'
import { definitions } from './query.js'

export const ANCHOR_SCHEMA_VERSION = 1

export function anchorsPath(root) {
  return join(root, STATE_DIR, 'index', 'anchors.json')
}

export function readAnchors(root) {
  const p = anchorsPath(root)
  if (!existsSync(p)) return null
  const raw = parseJsonSafe(readFileSync(p, 'utf8'))
  return raw?.schemaVersion === ANCHOR_SCHEMA_VERSION ? raw : null
}

/** `checkout-retry:ac_2` — sprint 를 섞어도 충돌하지 않는 키 */
export function acKey(sprintId, acId) {
  return `${sprintId}:${acId}`
}

/**
 * 앵커 문자열의 종류를 가른다.
 *
 * `processPayment`        → symbol
 * `src/payments/x.ts`     → path
 * `src/x.ts:42`           → location
 */
export function classifyAnchor(raw) {
  const value = String(raw ?? '').trim().replace(/^`|`$/g, '')
  if (!value) return null
  if (/^[\w.-]+\/[\w./-]+:\d+$/.test(value)) {
    const [file, line] = value.split(':')
    return { kind: 'location', value, file, line: Number(line) }
  }
  if (value.includes('/') || /\.\w{1,5}$/.test(value)) {
    return { kind: 'path', value, file: value }
  }
  return { kind: 'symbol', value }
}

/**
 * AC 앵커를 파일 경로로 해석한다.
 *
 * 해석하지 못한 앵커는 **버리지 않고 `unresolved` 로 남긴다.** 조용히 사라지면
 * 그 AC 는 어떤 파일이 바뀌어도 stale 이 되지 않고, 아무도 그 사실을 모른다.
 *
 * @param {object} index
 * @param {Array<{ sprintId: string, acId: string, anchors: string[] }>} acList
 */
export function buildAnchorIndex(index, acList) {
  const byPath = {}
  const bySymbol = {}
  const byAc = {}
  const unresolved = []

  for (const { sprintId, acId, anchors } of acList) {
    const key = acKey(sprintId, acId)
    const entries = []

    for (const raw of anchors ?? []) {
      const a = classifyAnchor(raw)
      if (!a) continue

      if (a.kind === 'symbol') {
        const defs = definitions(index, a.value)
        if (!defs.ok) {
          const entry = { kind: 'symbol', value: a.value, file: null, source: 'unresolved', confidence: 'low' }
          entries.push(entry)
          unresolved.push({ ac: key, anchor: a.value, reason: defs.reason, hint: defs.hint })
          ;(bySymbol[a.value] ??= []).push(key)
          continue
        }
        // 같은 이름이 여러 곳이면 전부 건다. 하나만 골라 틀리면 stale 을 놓친다.
        for (const d of defs.results) {
          entries.push({
            kind: 'symbol', value: a.value, file: d.file, line: d.line,
            source: 'indexed', confidence: defs.ambiguous ? 'medium' : d.confidence,
            ...(defs.ambiguous ? { ambiguous: true } : {}),
          })
          pushUnique(byPath, d.file, key)
        }
        pushUnique(bySymbol, a.value, key)
        continue
      }

      // path / location — 인덱스에 없어도 파일 경로 자체는 유효할 수 있다
      const known = Boolean(index?.files?.[a.file])
      entries.push({
        kind: a.kind, value: a.value, file: a.file, line: a.line,
        source: known ? 'path' : 'path-unverified',
        confidence: known ? 'high' : 'low',
      })
      pushUnique(byPath, a.file, key)
      if (!known) unresolved.push({ ac: key, anchor: a.value, reason: 'file_not_indexed' })
    }

    byAc[key] = { anchors: entries, resolved: entries.some((e) => e.file) }
    if (!entries.length) {
      unresolved.push({ ac: key, anchor: null, reason: 'no_anchors', hint: 'design.md 의 앵커 표를 채우세요' })
    }
  }

  return {
    schemaVersion: ANCHOR_SCHEMA_VERSION,
    generatedAt: nowIso(),
    byPath,
    bySymbol,
    byAc,
    unresolved,
    stats: {
      ac: Object.keys(byAc).length,
      paths: Object.keys(byPath).length,
      unresolved: unresolved.length,
    },
  }
}

function pushUnique(obj, key, value) {
  const list = (obj[key] ??= [])
  if (!list.includes(value)) list.push(value)
}

export function writeAnchors(root, anchorIndex) {
  writeAtomic(anchorsPath(root), stableJson(anchorIndex), { root })
  return anchorsPath(root)
}

/**
 * 편집된 파일들에 걸린 AC 를 찾는다. **훅이 부르는 함수다.**
 *
 * 인덱스를 다시 만들지 않는다. 파일을 읽지도 않는다. 맵 조회만 한다.
 *
 * @param {object} anchorIndex
 * @param {string[]} paths  root 기준 상대 경로
 * @returns {{ acs: string[], byPath: Record<string,string[]>, unknownPaths: string[] }}
 */
export function touched(anchorIndex, paths) {
  const acs = new Set()
  const hit = {}
  const unknown = []

  for (const p of paths) {
    const list = anchorIndex?.byPath?.[p]
    if (!list?.length) { unknown.push(p); continue }
    hit[p] = list
    for (const ac of list) acs.add(ac)
  }
  return { acs: [...acs], byPath: hit, unknownPaths: unknown }
}

/**
 * `sprint:ac` 키를 sprint 별로 나눈다. 훅이 상태를 갱신할 때 필요하다.
 */
export function groupBySprint(acKeys) {
  const out = {}
  for (const key of acKeys) {
    const idx = key.indexOf(':')
    if (idx < 0) continue
    const sprint = key.slice(0, idx)
    ;(out[sprint] ??= []).push(key.slice(idx + 1))
  }
  return out
}

/**
 * 앵커에 걸리지 않은 변경 — D07 §4 미귀속 변경 검출의 입력.
 *
 * 이걸 조용히 넘기면 "AC 에 없는 코드가 늘어나는 것" 을 아무도 못 본다.
 */
export function unattributed(anchorIndex, changedPaths, { ignore = [] } = {}) {
  const out = []
  for (const p of changedPaths) {
    if (anchorIndex?.byPath?.[p]?.length) continue
    if (ignore.some((pat) => p.includes(pat))) continue
    out.push(p)
  }
  return out
}
