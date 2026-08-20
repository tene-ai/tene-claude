/**
 * R1 — 이전 sprint 와의 연결 — D10 §1
 *
 * 이 항목이 방어하는 것: **고립된 기능, 중복 구현, 고아 코드.**
 *
 * R1 의 진짜 가치는 "무엇을 이어받았나" 가 아니라 **"이번 변경으로 무엇이 고아가 됐나"** 다.
 * 앞의 것은 없어도 코드가 돌지만, 뒤의 것은 쌓이면 아무도 손대지 못하는 코드가 된다.
 *
 * `orphaned` 는 확정이 아니라 **후보**다. 동적 디스패치로 호출될 수 있으므로
 * confidence 를 medium 으로 두고 사람이 판단하게 한다.
 */
import { parseTables, plainCell, tableToObjects } from '../doc/parser.js'
import { references } from '../scan/query.js'

/** 최근 아카이브된 sprint N개 */
export function recentArchived(masterPlan, n = 3) {
  return (masterPlan?.sprints ?? [])
    .filter((s) => s.status === 'archived')
    .sort((a, b) => String(b.archivedAt ?? '').localeCompare(String(a.archivedAt ?? '')))
    .slice(0, n)
    .map((s) => s.id)
}

/**
 * 이전 보고서의 R2 표에서 **신규 생성된 심볼**을 뽑는다.
 *
 * R2 가 R1 의 입력이다. 그래서 R2 의 심볼 기록이 정확해야 한다 —
 * R2 를 대충 쓰면 다음 sprint 의 R1 이 아무것도 못 본다.
 */
export function extractProducedSymbols(reportDoc) {
  const sec = reportDoc?.sections?.get('r2')
  if (!sec?.tables?.length) return []

  const out = []
  for (const table of sec.tables) {
    for (const row of tableToObjects(table)) {
      const change = plainCell(pick(row, ['변경', 'change', '신규/수정']))
      if (!/신규|new|added|생성/i.test(change)) continue
      const syms = plainCell(pick(row, ['심볼', 'symbols', 'symbol']))
      for (const s of syms.split(/[,\s]+/)) {
        const t = s.replace(/`/g, '').trim()
        if (t && !/^[<-]/.test(t)) out.push(t)
      }
    }
  }
  return [...new Set(out)]
}

function pick(row, keys) {
  for (const k of keys) {
    const norm = k.toLowerCase().replace(/\s+/g, '')
    if (row[norm] !== undefined && row[norm] !== '') return row[norm]
  }
  return ''
}

/**
 * @param {object} sprint
 * @param {object} masterPlan
 * @param {object} index
 * @param {{ changedFiles: Set<string>, changedSymbols: Set<string>, readReport: (id:string)=>object|null }} ctx
 */
export function buildLineage(sprint, masterPlan, index, ctx) {
  const declared = (masterPlan?.sprints ?? []).find((s) => s.id === sprint.id)?.dependsOn ?? []
  const predecessors = [...new Set([...declared, ...recentArchived(masterPlan, 3)])]
    .filter((id) => id !== sprint.id)

  const prevSymbols = new Map() // symbol → sprintId
  const missingReports = []

  for (const pid of predecessors) {
    const report = ctx.readReport?.(pid)
    if (!report) { missingReports.push(pid); continue }
    for (const sym of extractProducedSymbols(report)) {
      if (!prevSymbols.has(sym)) prevSymbols.set(sym, pid)
    }
  }

  const relations = []
  const orphans = []

  for (const [sym, pid] of prevSymbols) {
    if (ctx.changedSymbols?.has(sym)) {
      relations.push({
        kind: 'modified', symbol: sym, from: pid,
        detail: '이번 sprint 에서 직접 수정', source: 'git',
      })
      continue
    }

    const refs = references(index, sym)
    const refList = refs.ok ? refs.results : []

    const refFromChanged = refList.filter((r) => ctx.changedFiles?.has(r.file))
    if (refFromChanged.length) {
      relations.push({
        kind: 'extended', symbol: sym, from: pid,
        detail: `이번 변경이 참조: ${refFromChanged.slice(0, 3).map((r) => `${r.file}:${r.line}`).join(', ')}`,
        source: 'indexed',
      })
      continue
    }

    if (!refList.length) {
      // 이것이 R1 의 핵심 산출물이다
      orphans.push({
        kind: 'orphaned', symbol: sym, from: pid,
        detail: '참조 0건 — 이번 변경으로 사용되지 않게 되었을 수 있습니다',
        confidence: 'medium',
        note: '동적 디스패치로 호출될 수 있으므로 확정이 아닙니다',
      })
      continue
    }

    relations.push({
      kind: 'unchanged', symbol: sym, from: pid,
      detail: `참조 ${refList.length}건 — 이번 변경과 무관`, source: 'indexed',
    })
  }

  return {
    predecessors,
    relations,
    orphans,
    // 이전 보고서를 못 읽으면 연결을 확인할 수 없다. 0건이라고 말하지 않는다.
    missingReports,
    caveat: missingReports.length
      ? `이전 sprint ${missingReports.join(', ')} 의 보고서를 읽지 못해 연결을 확인하지 못했습니다`
      : null,
  }
}

/** R1 섹션 마크다운 */
export function renderLineage(lineage, { lang = 'ko' } = {}) {
  const lines = []

  if (!lineage.predecessors.length) {
    lines.push(lang === 'ko'
      ? '첫 sprint 이거나 선행 sprint 가 없습니다.'
      : 'First sprint, or no predecessors.')
  } else {
    lines.push(lang === 'ko' ? '| 이전 sprint | 산출물 | 관계 | 근거 |' : '| Previous | Artifact | Relation | Evidence |')
    lines.push('|---|---|---|---|')
    const KIND = { modified: '직접 수정', extended: '확장 — 참조함', unchanged: '변경 없음' }
    for (const r of lineage.relations) {
      lines.push(`| ${r.from} | \`${r.symbol}\` | ${KIND[r.kind] ?? r.kind} | ${r.source ?? ''} ${r.detail} |`)
    }
    if (!lineage.relations.length) lines.push('| — | — | — | 연결된 산출물을 찾지 못했습니다 |')
  }

  lines.push('', lang === 'ko' ? '### 연결이 끊긴 지점' : '### Broken connections')
  if (!lineage.orphans.length) {
    lines.push('', lang === 'ko' ? '해당 없음' : 'None')
  } else {
    lines.push('', lang === 'ko'
      ? '| 산출물 | 출처 sprint | 현재 참조 | 판단 필요 |'
      : '| Artifact | From | Refs | Needs decision |')
    lines.push('|---|---|---|---|')
    for (const o of lineage.orphans) {
      lines.push(`| \`${o.symbol}\` | ${o.from} | **0건** | ${o.detail} |`)
    }
    lines.push('', lang === 'ko'
      ? '> 확정이 아닙니다. 동적 호출 가능성이 있으므로 사람이 판단해야 합니다.'
      : '> Not conclusive — dynamic dispatch is possible. A person must decide.')
  }

  if (lineage.caveat) lines.push('', `> ⚠️ ${lineage.caveat}`)
  return lines.join('\n')
}
