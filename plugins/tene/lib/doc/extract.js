/**
 * 문서 → 구조화 데이터 — D04 §7
 *
 * 스킬·에이전트가 문서를 직접 파싱하지 않게 한다. 파싱 로직을 한 곳에 모은다.
 * 표 헤더는 언어마다 다르므로 별칭 맵으로 정규화한다.
 */
import { normalizeHeader, parseDoc, plainCell, tableToObjects } from './parser.js'

/** 열 별칭 — 언어 독립 접근. normalizeHeader 를 거친 값과 비교한다. */
const ALIAS = {
  id: ['id', '아이디'],
  statement: ['기준', 'criterion', 'statement', '의도', 'intent', '요구', 'requirement', '작업', 'task', '항목'],
  priority: ['우선도', 'priority', '중요도'],
  method: ['방식', 'method', '검증방식'],
  anchors: ['앵커', 'anchor', 'anchors'],
  status: ['상태', 'status'],
  verdict: ['판정', 'verdict', '결과', 'result'],
  rationale: ['근거', 'rationale', '이유', 'why'],
  actors: ['행위자', 'actor', 'actors'],
  source: ['출처', 'source'],
  covers: ['커버하는ac', '커버작업', '커버', 'covers', 'coversac', 'coveringtasks', 'coveredby'],
  layer: ['계층', 'layer', '예상계층'],
  reason: ['사유', 'reason', '이유'],
  evidence: ['증거', 'evidence', '근거'],
  from: ['from', '시작', '출발'],
  to: ['to', '도착', '대상'],
  trigger: ['트리거', 'trigger'],
  targetAc: ['대상ac', 'targetac', '대상'],
  kind: ['종류', 'kind', 'type'],
  title: ['항목', 'title', '제목', '작업', 'item'],
}

function pick(row, key) {
  for (const alias of ALIAS[key] ?? []) {
    if (row[alias] !== undefined && row[alias] !== '') return row[alias]
  }
  return ''
}

/** 첫 표를 객체 배열로. 섹션이 없으면 빈 배열. */
function rowsOf(doc, sectionId) {
  const sec = doc.sections.get(sectionId)
  if (!sec || !sec.tables.length) return []
  return tableToObjects(sec.tables[0])
}

const EARS = {
  ubiquitous: /(시스템은\s|The system shall\s)/i,
  event: /(\*\*When\*\*|^\s*When\s)/i,
  state: /(\*\*While\*\*|^\s*While\s)/i,
  unwanted: /(\*\*If\*\*|^\s*If\s)/i,
  optional: /(\*\*Where\*\*|^\s*Where\s)/i,
}

/** EARS 패턴 판별 — unwanted 를 먼저 본다 (If-then 이 다른 패턴과 겹칠 수 있다) */
export function earsPattern(statement) {
  const s = String(statement ?? '')
  if (EARS.unwanted.test(s)) return 'unwanted'
  if (EARS.event.test(s)) return 'event'
  if (EARS.state.test(s)) return 'state'
  if (EARS.optional.test(s)) return 'optional'
  if (EARS.ubiquitous.test(s)) return 'ubiquitous'
  return null
}

/** 앵커 셀을 배열로 — 백틱·쉼표 구분 */
function parseAnchors(cell) {
  const s = plainCell(cell)
  if (!s || s === '-' || /^\(/.test(s)) return []
  return s.split(/[,、]/).map((x) => x.trim()).filter(Boolean)
}

export function extractIntents(doc) {
  return rowsOf(doc, 'intents')
    .map((r) => ({
      id: plainCell(pick(r, 'id')),
      statement: plainCell(pick(r, 'statement')),
      rationale: plainCell(pick(r, 'rationale')),
      actors: plainCell(pick(r, 'actors')).split(/[,、]/).map((s) => s.trim()).filter(Boolean),
      source: plainCell(pick(r, 'source')) || 'conversation',
    }))
    .filter((x) => x.id && !/^<.*>$/.test(x.statement))
}

export function extractAc(doc) {
  return rowsOf(doc, 'ac')
    .map((r) => {
      const statement = plainCell(pick(r, 'statement'))
      return {
        id: plainCell(pick(r, 'id')),
        statement,
        pattern: earsPattern(statement),
        priority: normalizePriority(plainCell(pick(r, 'priority'))),
        method: plainCell(pick(r, 'method')).toUpperCase(),
        anchors: parseAnchors(pick(r, 'anchors')),
        status: plainCell(pick(r, 'status')) || 'pending',
      }
    })
    .filter((x) => x.id && !/^<.*>$/.test(x.statement))
}

function normalizePriority(v) {
  const s = String(v ?? '').toLowerCase()
  if (s.includes('non')) return 'non-blocking'
  if (s.includes('block')) return 'blocking'
  return s || 'blocking' // 기본은 blocking — 안전한 쪽
}

export function extractTasks(doc) {
  return rowsOf(doc, 'tasks')
    .map((r) => ({
      id: plainCell(pick(r, 'id')) || plainCell(r['#']),
      title: plainCell(pick(r, 'title')) || plainCell(pick(r, 'statement')),
      covers: parseAnchors(pick(r, 'covers')),
      layer: plainCell(pick(r, 'layer')),
    }))
    .filter((x) => x.id && x.title && !/^<.*>$/.test(x.title))
}

export function extractCoverage(doc) {
  return rowsOf(doc, 'coverage').map((r) => ({
    ac: plainCell(pick(r, 'id')) || plainCell(r.ac),
    covers: plainCell(pick(r, 'covers')),
    status: plainCell(pick(r, 'status')),
  }))
}

export function extractTransitions(doc) {
  return rowsOf(doc, 'transitions')
    .map((r, i) => {
      const edge = plainCell(pick(r, 'from')) || plainCell(r['엣지']) || plainCell(r.edge)
      const [from, to] = edge.includes('→') ? edge.split('→').map((s) => s.trim()) : [edge, plainCell(pick(r, 'to'))]
      return {
        id: `edge_${i + 1}`,
        from,
        to,
        trigger: plainCell(pick(r, 'trigger')),
        targetAc: parseAnchors(pick(r, 'targetAc')),
      }
    })
    .filter((e) => e.from && e.to)
}

export function extractAnchors(doc) {
  const out = {}
  for (const r of rowsOf(doc, 'anchors')) {
    const ac = plainCell(pick(r, 'id')) || plainCell(r.ac)
    if (!ac) continue
    out[ac] = parseAnchors(pick(r, 'anchors'))
  }
  return out
}

export function extractVerdicts(doc) {
  return rowsOf(doc, 'acverdicts')
    .map((r) => ({
      ac: plainCell(pick(r, 'id')) || plainCell(r.ac),
      priority: normalizePriority(plainCell(pick(r, 'priority'))),
      method: plainCell(pick(r, 'method')).toUpperCase(),
      verdict: normalizeVerdict(plainCell(pick(r, 'verdict'))),
      evidence: plainCell(pick(r, 'evidence')),
    }))
    .filter((x) => x.ac)
}

function normalizeVerdict(v) {
  const s = String(v ?? '').toLowerCase()
  if (s.startsWith('pass')) return 'passed'
  if (s.startsWith('fail')) return 'failed'
  if (s.startsWith('insuff') || s.includes('미측정')) return 'insufficient'
  if (s.includes('not-applicable') || s.includes('해당없음')) return 'not-applicable'
  if (s.includes('stale')) return 'stale'
  return s || 'pending'
}

export function extractInsufficient(doc) {
  return rowsOf(doc, 'insufficient')
    .map((r) => ({
      item: plainCell(pick(r, 'id')) || plainCell(pick(r, 'title')),
      reason: plainCell(pick(r, 'reason')),
      toMeasure: plainCell(r['측정하려면']) || plainCell(r.tomeasure),
    }))
    .filter((x) => x.item)
}

export function extractCarry(doc) {
  const rows = [...rowsOf(doc, 'carry'), ...rowsOf(doc, 'r6')]
  return rows
    .map((r) => ({
      id: plainCell(pick(r, 'id')) || plainCell(r['#']),
      kind: plainCell(pick(r, 'kind')),
      title: plainCell(pick(r, 'title')),
      reason: plainCell(pick(r, 'reason')),
      status: plainCell(pick(r, 'status')) || 'open',
    }))
    .filter((x) => x.id && x.title)
}

/** loop-check 용 요구 항목 — D07 §2.1 */
export function extractRequirements({ prd, plan, design }) {
  const out = []
  let n = 0
  const add = (source, refId, statement, priority, expectedAnchors = []) => {
    if (!statement) return
    out.push({ id: `req_${++n}`, source, refId, statement, priority, expectedAnchors })
  }

  if (prd) for (const ac of extractAc(prd)) add('prd:ac', ac.id, ac.statement, ac.priority, ac.anchors)
  if (plan) for (const t of extractTasks(plan)) add('plan:task', t.id, t.title, 'non-blocking', t.covers)
  if (design) {
    const logic = design.sections.get('logic')
    if (logic) {
      for (const m of logic.body.matchAll(/^###\s+(.+)$/gm)) add('design:logic', m[1].trim(), m[1].trim(), 'non-blocking')
    }
    for (const [ac, anchors] of Object.entries(extractAnchors(design))) {
      add('design:anchor', ac, `${ac} 앵커 구현: ${anchors.join(', ')}`, 'non-blocking', anchors)
    }
    for (const e of extractTransitions(design)) {
      add('design:transition', e.id, `${e.from} → ${e.to} (${e.trigger})`, 'non-blocking', e.targetAc)
    }
  }
  return out
}

/** bin/tene-doc extract 진입 */
export function extract(what, docs) {
  switch (what) {
    case 'intents': return { intents: extractIntents(docs.prd) }
    case 'ac': return { ac: extractAc(docs.prd) }
    case 'tasks': return { tasks: extractTasks(docs.plan) }
    case 'coverage': return { coverage: extractCoverage(docs.plan) }
    case 'edges': return { edges: extractTransitions(docs.design) }
    case 'anchors': return { anchors: extractAnchors(docs.design) }
    case 'verdicts': return { verdicts: extractVerdicts(docs.qa) }
    case 'insufficient': return { insufficient: extractInsufficient(docs.qa) }
    case 'carry': return { carry: extractCarry(docs.report ?? docs['master-plan']) }
    case 'requirements': return { requirements: extractRequirements(docs) }
    default: return null
  }
}

export const EXTRACT_TARGETS = [
  'intents', 'ac', 'tasks', 'coverage', 'edges', 'anchors',
  'verdicts', 'insufficient', 'carry', 'requirements',
]

export { parseDoc, normalizeHeader }
