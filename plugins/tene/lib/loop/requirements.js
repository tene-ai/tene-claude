/**
 * 요구 항목 추출 — D07 §2
 *
 * 문서 3종에서 **검증 가능한 요구 항목**을 뽑는다. 6개 출처가 있는 이유는
 * AC 만 보면 설계에서 정한 것들(계층 배치, 화면 전이, 데이터 계약)이
 * 검증 대상에서 통째로 빠지기 때문이다.
 *
 * 순수 함수다. 파싱된 문서를 받아 배열을 낸다.
 */
import {
  extractAc, extractCoverage, extractTasks, extractTransitions,
} from '../doc/extract.js'
import { plainCell, tableToObjects } from '../doc/parser.js'

export const SOURCES = [
  'prd:ac', 'plan:task', 'design:logic',
  'design:layer', 'design:transition', 'design:contract',
]

const LAYER_NAMES = {
  interface: /interface|entry\s*point|인터페이스|진입/i,
  'business-logic': /business\s*logic|처리\s*규칙|비즈니스/i,
  persistence: /persistence|데이터|영속/i,
  infrastructure: /infrastructure|runtime|인프라|런타임/i,
}

/** blocking 이 non-blocking 을 이긴다 */
function highest(priorities) {
  return priorities.includes('blocking') ? 'blocking' : 'non-blocking'
}

function rowsOf(doc, sectionId) {
  const sec = doc?.sections?.get(sectionId)
  if (!sec?.tables?.length) return []
  return tableToObjects(sec.tables[0])
}

// ── 출처별 추출 ───────────────────────────────────────────────────────

function fromPrdAc(prd) {
  if (!prd) return []
  return extractAc(prd).map((ac, i) => ({
    id: `req_ac_${ac.id}`,
    source: 'prd:ac',
    refId: ac.id,
    statement: ac.statement,
    priority: ac.priority,
    method: ac.method,
    expectedAnchors: ac.anchors ?? [],
    sourceLine: prd.sections.get('ac')?.startLine ?? 0,
    order: i,
  }))
}

/**
 * 작업의 priority 는 **덮는 AC 중 가장 높은 것**을 물려받는다.
 * 작업 자체에는 우선도가 없다 — 그 작업이 무엇을 위한 것인지가 우선도를 정한다.
 */
function fromPlanTasks(plan, acPriority) {
  if (!plan) return []
  return extractTasks(plan).map((t, i) => {
    const covers = splitIds(t.covers)
    const priorities = covers.map((id) => acPriority.get(id)).filter(Boolean)
    return {
      id: `req_task_${t.id || i + 1}`,
      source: 'plan:task',
      refId: t.id || String(i + 1),
      statement: t.statement || t.title || '',
      priority: priorities.length ? highest(priorities) : 'non-blocking',
      covers,
      expectedLayer: normalizeLayer(t.layer),
      expectedAnchors: [],
      sourceLine: plan.sections.get('tasks')?.startLine ?? 0,
      order: i,
    }
  }).filter((r) => r.statement)
}

/**
 * 처리 로직은 `### <로직명>` 소절로 쓰인다.
 * 표가 아니라 서술이므로 제목만 뽑고 본문은 판정 근거로 넘긴다.
 */
function fromDesignLogic(design, acPriority) {
  const sec = design?.sections?.get('logic')
  if (!sec) return []

  const out = []
  const lines = sec.body.split('\n')
  let current = null

  for (const [i, line] of lines.entries()) {
    const h = line.match(/^#{3,6}\s+(.+)$/)
    if (h) {
      if (current) out.push(current)
      const title = h[1].replace(/<!--.*?-->/g, '').trim()
      current = {
        id: `req_logic_${out.length + 1}`,
        source: 'design:logic',
        refId: title,
        statement: title,
        body: '',
        sourceLine: sec.startLine + i + 1,
        order: out.length,
      }
      continue
    }
    if (current) current.body += `${line}\n`
  }
  if (current) out.push(current)

  return out
    .filter((r) => r.statement && !/^</.test(r.statement))
    .map((r) => {
      const acs = [...r.body.matchAll(/\bac_\w+/gi)].map((m) => m[0].toLowerCase())
      const priorities = acs.map((id) => acPriority.get(id)).filter(Boolean)
      return {
        ...r,
        priority: priorities.length ? highest(priorities) : 'non-blocking',
        covers: [...new Set(acs)],
        expectedAnchors: extractCodeSpans(r.body),
      }
    })
}

/**
 * 4계층 배치. 각 계층 표의 행이 하나의 요구다 — "이 대상은 이 계층에 있어야 한다".
 * 배치는 구조 품질이므로 non-blocking 이다.
 */
function fromDesignLayers(design) {
  const sec = design?.sections?.get('layers')
  if (!sec) return []

  const out = []
  const lines = sec.body.split('\n')
  let currentLayer = null
  let order = 0

  for (const [i, line] of lines.entries()) {
    const h = line.match(/^#{3,6}\s+(.+)$/)
    if (h) {
      currentLayer = null
      for (const [key, re] of Object.entries(LAYER_NAMES)) {
        if (re.test(h[1])) { currentLayer = key; break }
      }
      continue
    }
    if (!currentLayer || !line.trim().startsWith('|')) continue

    const cells = line.split('|').map((c) => plainCell(c)).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1)
    if (cells.length < 2) continue
    const [target, file] = cells
    if (!target || /^-+$/.test(target) || /대상|target/i.test(target)) continue

    out.push({
      id: `req_layer_${++order}`,
      source: 'design:layer',
      refId: `${currentLayer}:${target}`,
      statement: `${target} 를 ${currentLayer} 에 배치`,
      priority: 'non-blocking', // 배치는 구조 품질이다
      expectedLayer: currentLayer,
      expectedFile: file && !/^</.test(file) ? file.split(':')[0] : null,
      expectedAnchors: target ? [target.replace(/`/g, '')] : [],
      sourceLine: sec.startLine + i + 1,
      order,
    })
  }
  return out
}

function fromDesignTransitions(design, acPriority) {
  if (!design) return []
  return extractTransitions(design).map((t, i) => {
    const acs = splitIds(t.targetAc)
    const priorities = acs.map((id) => acPriority.get(id)).filter(Boolean)
    return {
      id: `req_edge_${i + 1}`,
      source: 'design:transition',
      refId: `${t.from} → ${t.to}`,
      statement: `${t.from} → ${t.to} (${t.trigger || '트리거 미기재'})`,
      priority: priorities.length ? highest(priorities) : 'non-blocking',
      covers: acs,
      from: t.from,
      to: t.to,
      trigger: t.trigger,
      expectedAnchors: [],
      sourceLine: design.sections.get('transitions')?.startLine ?? 0,
      order: i,
    }
  })
}

/**
 * 데이터 계약. AC 와 연결되지 않으면 **blocking** 이다 —
 * 계약 위반은 조용히 데이터를 깨뜨리므로 우선도를 낮출 이유가 없다.
 */
function fromDesignContracts(design, acPriority) {
  if (!design) return []
  return rowsOf(design, 'contracts').map((r, i) => {
    const target = plainCell(pickAny(r, ['대상', 'target', '항목']))
    if (!target || /^</.test(target)) return null
    const acs = [...JSON.stringify(r).matchAll(/\bac_\w+/gi)].map((m) => m[0].toLowerCase())
    const priorities = acs.map((id) => acPriority.get(id)).filter(Boolean)
    return {
      id: `req_contract_${i + 1}`,
      source: 'design:contract',
      refId: target,
      statement: `${target} 의 입출력 계약`,
      priority: priorities.length ? highest(priorities) : 'blocking',
      covers: acs,
      inputSchema: plainCell(pickAny(r, ['입력스키마', 'inputschema', '입력'])),
      outputSchema: plainCell(pickAny(r, ['출력스키마', 'outputschema', '출력'])),
      expectedAnchors: [target.replace(/`/g, '')],
      sourceLine: design.sections.get('contracts')?.startLine ?? 0,
      order: i,
    }
  }).filter(Boolean)
}

// ── 보조 ──────────────────────────────────────────────────────────────

function pickAny(row, keys) {
  for (const k of keys) if (row[k] !== undefined && row[k] !== '') return row[k]
  return ''
}

function splitIds(v) {
  return String(v ?? '')
    .split(/[,\s]+/)
    .map((s) => plainCell(s).toLowerCase())
    .filter((s) => /^ac_\w+$/.test(s))
}

function normalizeLayer(v) {
  const s = String(v ?? '').toLowerCase()
  for (const [key, re] of Object.entries(LAYER_NAMES)) if (re.test(s)) return key
  return null
}

/** 본문의 `backtick` 안 식별자를 앵커 후보로 */
function extractCodeSpans(body) {
  return [...new Set([...String(body).matchAll(/`([A-Za-z_$][\w$.]*)`/g)].map((m) => m[1]))]
    .filter((s) => !/^(true|false|null|undefined)$/i.test(s))
    .slice(0, 5)
}

// ── 진입점 ────────────────────────────────────────────────────────────

/**
 * @param {{ prd?: object, plan?: object, design?: object }} docs 파싱된 문서
 * @returns {{ requirements: object[], bySource: Record<string,number>, warnings: string[] }}
 */
export function extractRequirements(docs) {
  const acList = docs.prd ? extractAc(docs.prd) : []
  const acPriority = new Map(acList.map((a) => [a.id.toLowerCase(), a.priority]))

  const requirements = [
    ...fromPrdAc(docs.prd),
    ...fromPlanTasks(docs.plan, acPriority),
    ...fromDesignLogic(docs.design, acPriority),
    ...fromDesignLayers(docs.design),
    ...fromDesignTransitions(docs.design, acPriority),
    ...fromDesignContracts(docs.design, acPriority),
  ]

  const bySource = {}
  for (const s of SOURCES) bySource[s] = requirements.filter((r) => r.source === s).length

  // 문서가 없어서 못 뽑은 것을 조용히 넘기지 않는다.
  // 요구 항목이 적으면 검증도 적게 되고, 그게 통과율을 올린다.
  const warnings = []
  if (!docs.prd) warnings.push('prd.md 가 없어 수용 기준을 뽑지 못했습니다')
  if (!docs.plan) warnings.push('plan.md 가 없어 작업 항목을 뽑지 못했습니다')
  if (!docs.design) warnings.push('design.md 가 없어 설계 요구(로직·계층·전이·계약)를 뽑지 못했습니다')
  if (docs.design && !bySource['design:layer']) warnings.push('design.md 에 4계층 표가 비어 있습니다')

  return { requirements, bySource, warnings, total: requirements.length }
}

/** 커버리지 표로 plan 이 AC 를 실제로 덮는지 본다 (G2 와 같은 데이터) */
export function coverageGaps(plan, acList) {
  if (!plan) return acList.map((a) => a.id)
  const rows = extractCoverage(plan)
  const covered = new Set(rows.filter((r) => r.covers && r.covers !== '—').map((r) => r.ac?.toLowerCase()))
  return acList.filter((a) => !covered.has(a.id.toLowerCase())).map((a) => a.id)
}
