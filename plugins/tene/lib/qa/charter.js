/**
 * Test Charter 컴파일 — D08 §2
 *
 * AC 하나를 "무엇을 어떻게 확인할 것인가" 로 바꾼다.
 *
 * charter 가 없으면 QA 는 AC 문장을 보고 즉흥적으로 확인하게 되고,
 * 그러면 무엇을 확인했는지 기록이 남지 않는다. charter 는 검증의 계획이자 기록이다.
 */
import { extractAc, extractTransitions } from '../doc/extract.js'
import { selectLayers } from './layers.js'

/** D08 §2.2 — 변형 7종 */
export const VARIANTS = {
  happy: { label: '정상 경로', always: true },
  alternate: { label: '대안 경로' },
  empty: { label: '빈 입력·빈 목록' },
  error: { label: '오류 응답' },
  permission: { label: '권한 없음' },
  retry: { label: '재시도' },
  recovery: { label: '실패 후 복구' },
}

const AUTH_RE = /권한|인증|로그인|auth|permission|role|admin|token/i
const INPUT_RE = /입력|폼|form|input|제출|submit|필드|field/i
const RETRY_RE = /재시도|retry|다시|새로고침|refresh|뒤로|back|중복|duplicate/i
const RECOVERY_RE = /복구|롤백|rollback|recover|취소|cancel|되돌/i

/**
 * 변형을 고른다. **조건이 맞는 것만** 고른다 —
 * 전부 생성하면 검증할 수 없는 변형이 charter 에 남아 insufficient 를 양산한다.
 */
export function selectVariants(ac, ctx = {}) {
  const picked = ['happy']
  const text = `${ac.statement ?? ''} ${ctx.uxFlow ?? ''} ${ctx.dataFlow ?? ''}`

  if (ctx.hasAlternatePath) picked.push('alternate')
  if (INPUT_RE.test(text)) picked.push('empty')
  // If-then 은 그 자체가 오류 경로의 정의다
  if (ac.pattern === 'unwanted' || /실패|오류|error|fail|4xx|5xx/i.test(text)) picked.push('error')
  if (AUTH_RE.test(text)) picked.push('permission')
  if (RETRY_RE.test(text) || ctx.hasReturnPaths) picked.push('retry')
  if (RECOVERY_RE.test(text) || ctx.hasFailurePath) picked.push('recovery')

  return [...new Set(picked)]
}

/**
 * "이러면 안 되는 것" 을 뽑는다 — D08 §2.4
 *
 * forbidden 이 하나라도 관찰되면 expected 가 전부 충족돼도 즉시 failed 다.
 * 그래서 charter 에 명시적으로 싣는다.
 */
export function extractForbidden(ac, ctx = {}) {
  const out = []
  if (ac.forbidden) out.push(...(Array.isArray(ac.forbidden) ? ac.forbidden : [ac.forbidden]))

  const text = `${ac.statement ?? ''} ${ctx.notes ?? ''}`
  // 문서에 "안 된다 / 없어야 / 금지" 가 있으면 금지 조건으로 본다
  for (const m of text.matchAll(/([^.\n]{4,60}?)(?:되어서는 안 |면 안 |없어야 |금지)/g)) {
    const s = m[1].trim()
    if (s && !out.includes(s)) out.push(s)
  }

  // DATA 기준에는 중복 생성이 대표적 금지 조건이다
  if (ac.method === 'DATA' && /기록|저장|생성|insert|create/i.test(ac.statement ?? '')) {
    out.push('같은 요청으로 레코드가 2건 이상 생성됨')
  }
  return [...new Set(out)]
}

function inferActor(ac, ctx) {
  const text = `${ac.statement ?? ''} ${ctx.uxFlow ?? ''}`
  if (/관리자|admin/i.test(text)) return '관리자'
  if (/cron|배치|스케줄|job|worker/i.test(text)) return '시스템(배치)'
  if (/구매자|사용자|고객|user|buyer/i.test(text)) return '사용자'
  return ctx.defaultActor ?? '사용자'
}

/**
 * EARS 문장을 단계로 바꾼다.
 *
 * 문장을 그대로 한 단계로 두지 않는다 — "When X, 시스템은 Y 해야 한다" 는
 * 트리거(X)와 기대(Y)가 하나에 섞여 있어, 어디까지 됐는지 기록할 수 없다.
 */
export function buildSteps(ac, edges = []) {
  const s = String(ac.statement ?? '')
  const steps = []

  const when = s.match(/\*\*When\*\*\s*(.+?),\s*(.+)$/i) ?? s.match(/^\s*When\s+(.+?),\s*(.+)$/i)
  const iff = s.match(/\*\*If\*\*\s*(.+?),\s*\*\*then\*\*\s*(.+)$/i) ?? s.match(/^\s*If\s+(.+?),\s*then\s+(.+)$/i)
  const whilee = s.match(/\*\*While\*\*\s*(.+?),\s*(.+)$/i)
  const where = s.match(/\*\*Where\*\*\s*(.+?),\s*(.+)$/i)

  const pair = iff ?? when ?? whilee ?? where
  if (pair) {
    steps.push({
      action: pair[1].trim(),
      kind: iff ? 'trigger-failure' : 'trigger',
      observerIds: [],
    })
    steps.push({
      action: '결과 관찰',
      [ac.method === 'DATA' ? 'expectedData' : 'expectedUi']: pair[2].trim(),
      kind: 'expect',
      observerIds: [],
    })
  } else {
    steps.push({ action: s.slice(0, 120), kind: 'expect', observerIds: [] })
  }

  // 전이 표의 엣지를 단계로 붙인다 — QA 커버리지의 분모와 같은 출처를 쓴다
  for (const e of edges) {
    steps.push({
      action: `${e.from} → ${e.to}`,
      expectedUi: e.trigger ? `${e.trigger} 후 ${e.to}` : e.to,
      kind: 'transition',
      edge: `${e.from}→${e.to}`,
      observerIds: [],
    })
  }
  return steps
}

function assessRisk(ac, ctx) {
  if (ac.priority === 'blocking' && ac.method === 'DATA') return 'high'
  if (ac.pattern === 'unwanted') return 'high'
  if (ac.priority === 'blocking') return 'medium'
  return 'low'
}

/**
 * AC 목록에서 charter 를 만든다.
 *
 * @param {{ prd?: object, design?: object }} docs 파싱된 문서
 * @param {object[]} [acList] 없으면 prd 에서 뽑는다
 */
export function compile(docs, acList) {
  const ac = acList ?? (docs.prd ? extractAc(docs.prd) : [])
  const edges = docs.design ? extractTransitions(docs.design) : []

  const uxFlow = sectionText(docs.prd, 'uxflow')
  const dataFlow = sectionText(docs.prd, 'dataflow')
  const hasReturnPaths = /뒤로|새로고침|중복|재시도|back|refresh|retry/i.test(uxFlow)
  const hasFailurePath = /실패 경로|failure path|실패하면/i.test(uxFlow)
  const hasAlternatePath = /대안|분기|alternate|branch/i.test(uxFlow)

  const charters = ac.map((a, i) => {
    const myEdges = edges.filter((e) => splitAcIds(e.targetAc).includes(a.id.toLowerCase()))
    const ctx = { uxFlow, dataFlow, hasReturnPaths, hasFailurePath, hasAlternatePath }

    return {
      id: `charter_${i + 1}`,
      acIds: [a.id],
      title: (a.statement ?? '').slice(0, 60),
      actor: inferActor(a, ctx),
      preconditions: extractPreconditions(a, uxFlow),
      steps: buildSteps(a, myEdges),
      variants: selectVariants(a, ctx),
      forbiddenOutcomes: extractForbidden(a, ctx),
      requiredLayers: selectLayers(a, {
        hasReturnPaths,
        touchesExistingSymbols: Boolean(a.anchors?.length),
      }),
      edges: myEdges.map((e) => `${e.from}→${e.to}`),
      risk: assessRisk(a, ctx),
      priority: a.priority,
      method: a.method,
    }
  })

  return {
    charters,
    // AC 없이 charter 는 만들 수 없다. 조용히 빈 배열을 내지 않는다.
    warnings: ac.length ? [] : ['수용 기준이 없어 charter 를 만들 수 없습니다'],
    edgeTotal: edges.length,
  }
}

function extractPreconditions(ac, uxFlow) {
  const out = []
  const s = String(ac.statement ?? '')
  const where = s.match(/\*\*Where\*\*\s*(.+?),/i)
  if (where) out.push(where[1].trim())
  const whilee = s.match(/\*\*While\*\*\s*(.+?),/i)
  if (whilee) out.push(`상태: ${whilee[1].trim()}`)
  if (AUTH_RE.test(s)) out.push('인증된 세션')
  return out
}

function sectionText(doc, id) {
  return doc?.sections?.get(id)?.body ?? ''
}

function splitAcIds(v) {
  return String(v ?? '').split(/[,\s]+/).map((s) => s.replace(/[`*]/g, '').toLowerCase()).filter(Boolean)
}

/** qa.md 의 charter 표 */
export function renderCharters(charters, { lang = 'ko' } = {}) {
  const head = lang === 'ko'
    ? ['| ID | AC | 행위자 | 변형 | 필요 레이어 | 위험 |', '|---|---|---|---|---|---|']
    : ['| ID | AC | Actor | Variants | Layers | Risk |', '|---|---|---|---|---|---|']

  const rows = charters.map((c) =>
    `| ${c.id} | ${c.acIds.join(', ')} | ${c.actor} | ${c.variants.join(', ')} | ${c.requiredLayers.join(', ')} | ${c.risk} |`)

  const lines = [...head, ...rows]

  const forbidden = charters.filter((c) => c.forbiddenOutcomes.length)
  if (forbidden.length) {
    lines.push('', lang === 'ko' ? '**금지 조건** (하나라도 관찰되면 즉시 failed)' : '**Forbidden** (any observation → failed)')
    for (const c of forbidden) {
      for (const f of c.forbiddenOutcomes) lines.push(`- \`${c.acIds.join(',')}\` — ${f}`)
    }
  }
  return lines.join('\n')
}
