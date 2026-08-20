/**
 * R3 — 기획 의도 충족 매핑 — D10 §3
 *
 * 이 항목이 방어하는 것: **의도와 구현의 단절.**
 *
 * "무엇을 만들었나" 는 R2 가 답한다. R3 는 **"왜 만들었나"** 를 답한다.
 * 둘이 이어지지 않으면 요구사항과 무관한 코드가 쌓인다.
 *
 * 미승인 편차는 반드시 R6 으로 이월된다. 조용히 넘어가지 않는다.
 */
import { extractAc, extractIntents } from '../doc/extract.js'
import { plainCell, tableToObjects } from '../doc/parser.js'

/**
 * AC ↔ 의도 ↔ 구현(앵커) 을 잇는다.
 *
 * @param {object} sprint
 * @param {object} prdDoc
 * @param {object} anchors  앵커 역인덱스
 */
export function buildIntentMap(sprint, prdDoc, anchors) {
  const intents = prdDoc ? extractIntents(prdDoc) : []
  const acFromDoc = prdDoc ? extractAc(prdDoc) : []
  const acState = new Map((sprint.ac ?? []).map((a) => [a.id, a]))

  const rows = []
  const unmapped = []

  for (const ac of acFromDoc) {
    const state = acState.get(ac.id) ?? {}
    const entry = anchors?.byAc?.[`${sprint.id}:${ac.id}`]
    const impl = (entry?.anchors ?? []).map((a) => a.value)

    // 의도 연결: AC 문장이나 상태에 intent 참조가 있으면 쓰고, 없으면 단일 의도일 때만 추정
    const intentId = state.intentId
      ?? matchIntent(ac, intents)
      ?? (intents.length === 1 ? intents[0].id : null)
    const intent = intents.find((i) => i.id === intentId)

    if (!intent) unmapped.push(ac.id)

    rows.push({
      acId: ac.id,
      acStatement: ac.statement,
      priority: ac.priority,
      implementation: impl,
      intentId: intent?.id ?? null,
      intentStatement: intent?.statement ?? null,
      rationale: intent?.rationale ?? null,
      verdict: state.verdict ?? 'pending',
      waived: Boolean(state.waived),
    })
  }

  // 어떤 AC 에도 연결되지 않은 의도 — 구현되지 않은 의도다
  const usedIntents = new Set(rows.map((r) => r.intentId).filter(Boolean))
  const unrealized = intents.filter((i) => !usedIntents.has(i.id))

  return {
    rows,
    unmapped,        // 의도를 못 찾은 AC
    unrealized,      // AC 로 이어지지 않은 의도
    warnings: buildWarnings({ rows, unmapped, unrealized, intents }),
  }
}

function matchIntent(ac, intents) {
  const text = `${ac.statement ?? ''}`
  for (const i of intents) {
    if (new RegExp(`\\b${escapeRe(i.id)}\\b`, 'i').test(text)) return i.id
  }
  return null
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildWarnings({ rows, unmapped, unrealized, intents }) {
  const out = []
  if (!intents.length) out.push('prd.md 에 기획 의도가 없어 R3 를 만들 수 없습니다')
  if (unmapped.length) out.push(`의도와 연결되지 않은 AC: ${unmapped.join(', ')}`)
  if (unrealized.length) {
    out.push(`AC 로 이어지지 않은 의도: ${unrealized.map((i) => i.id).join(', ')} — 구현되지 않았거나 AC 를 빠뜨렸습니다`)
  }
  const noImpl = rows.filter((r) => !r.implementation.length).map((r) => r.acId)
  if (noImpl.length) out.push(`구현 앵커가 없는 AC: ${noImpl.join(', ')}`)
  return out
}

/**
 * "의도와 다르게 구현된 것" — loop-check 의 partial/mismatch 판정에서 수집.
 *
 * **미승인 편차는 R6 으로 이월된다.** 여기서 목록만 만들고,
 * 승인 여부는 사람이 정한다.
 */
export function findDeviations(loopCheckDoc) {
  const sec = loopCheckDoc?.sections?.get('comparison')
  if (!sec?.tables?.length) return []

  const out = []
  for (const table of sec.tables) {
    for (const row of tableToObjects(table)) {
      const verdict = plainCell(row['판정'] ?? row.judgment ?? row.verdict ?? '')
      if (!/partial|mismatch|부분|불일치/i.test(verdict)) continue
      out.push({
        requirement: plainCell(row['요구항목'] ?? row.requirement ?? row['항목'] ?? ''),
        source: plainCell(row['출처'] ?? row.source ?? ''),
        actual: plainCell(row['근거'] ?? row.evidence ?? ''),
        approved: false, // 기본은 미승인 — 승인은 명시적이어야 한다
      })
    }
  }
  return out.filter((d) => d.requirement)
}

/** R3 섹션 마크다운 */
export function renderIntentMap(map, deviations, { lang = 'ko' } = {}) {
  const lines = []

  lines.push(lang === 'ko' ? '| 구현 | 충족한 AC | 기획 의도 | 판정 |' : '| Implementation | AC | Intent | Verdict |')
  lines.push('|---|---|---|---|')

  for (const r of map.rows) {
    const impl = r.implementation.length ? r.implementation.map((s) => `\`${s}\``).join(', ') : '—'
    const intent = r.intentStatement ? `${r.intentId}: ${r.intentStatement}` : '**연결 없음**'
    const verdict = r.waived ? `${r.verdict} (예외 승인)` : r.verdict
    lines.push(`| ${impl} | ${r.acId} | ${intent} | ${verdict} |`)
  }
  if (!map.rows.length) lines.push('| — | — | — | 수용 기준이 없습니다 |')

  lines.push('', lang === 'ko' ? '### 의도와 다르게 구현된 것' : '### Built differently than intended')
  if (!deviations.length) {
    lines.push('', lang === 'ko' ? '해당 없음' : 'Not applicable')
  } else {
    lines.push('', lang === 'ko' ? '| 요구 | 실제 구현 | 승인 여부 |' : '| Requirement | Actual | Approved |')
    lines.push('|---|---|---|')
    for (const d of deviations) {
      const mark = d.approved ? '✅ 승인' : '⚠️ 미승인 — R6 로 이월'
      lines.push(`| ${d.requirement} (${d.source}) | ${d.actual} | ${mark} |`)
    }
  }

  for (const w of map.warnings) lines.push('', `> ⚠️ ${w}`)
  return lines.join('\n')
}
