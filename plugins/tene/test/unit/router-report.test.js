/** 라우팅·보고서 — D13 §2.12 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { detectLang, formatSuggestion, loadRules, matchesCondition, matchesKeywords, route } from '../../lib/router/match.js'
import { extractProducedSymbols, recentArchived } from '../../lib/report/lineage.js'
import { collectCarry, CARRY_KIND, renderCarry, toPromotable } from '../../lib/report/carry.js'
import { buildLayerReport } from '../../lib/report/layers-questions.js'
import { aggregate, promote, recommendNext, upsertSprint } from '../../lib/plan/aggregate.js'
import { parseDoc } from '../../lib/doc/parser.js'

// ── 라우팅 ────────────────────────────────────────────────────────────

test('규칙 파일을 읽는다', () => {
  const rules = loadRules()
  assert.ok(rules.length > 5)
  for (const r of rules) {
    assert.ok(r.id && r.suggest && r.any, `규칙 ${r.id} 이 불완전하다`)
  }
})

test('한글이 있으면 ko', () => {
  assert.equal(detectLang('QA 해줘'), 'ko')
  assert.equal(detectLang('run qa'), 'en')
})

test('phase 조건을 해석한다', () => {
  const s = { activeSprint: 'x', phase: 'qa' }
  assert.equal(matchesCondition('always', s), true)
  assert.equal(matchesCondition('phase>=do', s), true)
  assert.equal(matchesCondition('phase>=report', s), false)
  assert.equal(matchesCondition('phase=qa|report', s), true)
  assert.equal(matchesCondition('phase=draft', s), false)
  assert.equal(matchesCondition('no-active-sprint', s), false)
  assert.equal(matchesCondition('no-active-sprint', {}), true)
})

test('활성 sprint 가 없으면 phase 조건은 전부 거짓', () => {
  assert.equal(matchesCondition('phase>=do', {}), false)
  assert.equal(matchesCondition('phase=draft', {}), false)
})

test('한국어·영어 키워드를 모두 본다 (혼용 프롬프트가 흔하다)', () => {
  const any = { ko: ['검증'], en: ['verify'] }
  assert.ok(matchesKeywords(any, '이거 verify 해줘', 'ko'))
  assert.ok(matchesKeywords(any, '검증 needed', 'en'))
})

test('슬래시 명령에는 제안하지 않는다', () => {
  assert.equal(route('/tene:qa', { activeSprint: 'x', phase: 'qa' }, {}), null)
})

test('같은 세션에서 같은 제안을 두 번 하지 않는다', () => {
  const root = mkdtempSync(join(tmpdir(), 'tene-route-'))
  try {
    mkdirSync(join(root, '.git'), { recursive: true })
    const state = { activeSprint: 'x', phase: 'qa' }
    const cfg = { root, sessionId: 's1' }

    const first = route('QA 해줘', state, cfg)
    assert.equal(first?.skill, 'qa')

    const second = route('QA 다시 해줘', state, cfg)
    assert.equal(second, null, '두 번째는 제안하지 않아야 한다')

    // 세션이 바뀌면 다시 제안한다
    const other = route('QA 해줘', state, { root, sessionId: 's2' })
    assert.equal(other?.skill, 'qa')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('autoTrigger 를 끄면 아무것도 제안하지 않는다', () => {
  assert.equal(route('QA 해줘', { activeSprint: 'x', phase: 'qa' }, { autoTrigger: false }), null)
})

test('제안 문구에 현재 sprint 를 포함한다', () => {
  const r = { skill: 'qa', message: '검증 단계입니다', lang: 'ko' }
  const text = formatSuggestion(r, { activeSprint: 'checkout', phase: 'qa' })
  assert.match(text, /checkout/)
  assert.match(text, /\/tene:qa/)
})

// ── R1 ────────────────────────────────────────────────────────────────

test('이전 보고서의 R2 에서 신규 심볼만 뽑는다', () => {
  const report = parseDoc(`---
tene:
  doc: report
---
## R2 <!-- tene:sec=r2 -->

| 파일 | 변경 | 계층 | 심볼 |
|---|---|---|---|
| src/a.ts | 신규 | business-logic | processPayment, helper |
| src/b.ts | 수정 | persistence | existingFn |
`)
  assert.deepEqual(extractProducedSymbols(report), ['processPayment', 'helper'])
})

test('최근 아카이브 sprint 를 시간 역순으로 고른다', () => {
  const plan = {
    sprints: [
      { id: 'a', status: 'archived', archivedAt: '2026-08-01T00:00:00Z' },
      { id: 'b', status: 'archived', archivedAt: '2026-08-15T00:00:00Z' },
      { id: 'c', status: 'active' },
    ],
  }
  assert.deepEqual(recentArchived(plan, 2), ['b', 'a'])
})

// ── R4 ────────────────────────────────────────────────────────────────

test('계층 쏠림을 감지한다', () => {
  const changes = {
    rows: [
      { path: 'a.ts', layer: 'business-logic', symbols: [] },
      { path: 'b.ts', layer: 'business-logic', symbols: [] },
      { path: 'c.ts', layer: 'business-logic', symbols: [] },
      { path: 'd.ts', layer: 'interface', symbols: [] },
    ],
  }
  const r = buildLayerReport(changes)
  assert.equal(r.skew.layer, 'business-logic')
  assert.equal(r.skew.ratio, 0.75)
  assert.deepEqual(r.empty, ['persistence', 'infrastructure'])
})

test('고르게 분포하면 쏠림이 아니다', () => {
  const changes = {
    rows: [
      { path: 'a.ts', layer: 'business-logic', symbols: [] },
      { path: 'b.ts', layer: 'interface', symbols: [] },
      { path: 'c.ts', layer: 'persistence', symbols: [] },
    ],
  }
  assert.equal(buildLayerReport(changes).skew, null)
})

// ── R6 ────────────────────────────────────────────────────────────────

const SPRINT = {
  id: 'x',
  ac: [
    { id: 'ac_1', verdict: 'insufficient', reason: '테스트 러너 없음' },
    { id: 'ac_2', verdict: 'passed' },
  ],
  waivers: [{ ac: 'ac_3', reason: 'PG사 미지원', approvedBy: 'user' }],
  carryOver: [{ id: 'c1', title: '멱등키 정책', reason: '설계 미정', status: 'open' }],
  gaps: [{ id: 'g1', status: 'open', severity: 'blocker', detail: '롤백 미구현', evidence: '심볼 없음' }],
}

test('세 출처에서 이월을 모은다', () => {
  const c = collectCarry(SPRINT, {})
  const kinds = c.items.map((i) => i.kind)
  assert.ok(kinds.includes(CARRY_KIND.UNMEASURED), 'insufficient AC')
  assert.ok(kinds.includes(CARRY_KIND.WAIVER), 'waiver')
  assert.ok(kinds.includes(CARRY_KIND.WORK), 'carryOver + gap')
})

test('사유 없는 이월을 잡는다 — G7 이 이것으로 막는다', () => {
  const bad = collectCarry({ ...SPRINT, carryOver: [{ id: 'c9', title: '나중에', status: 'open' }] }, {})
  assert.equal(bad.ok, false)
  assert.ok(bad.missingReason.some((i) => i.title === '나중에'))
  assert.match(renderCarry(bad), /사유가 없는 이월 항목/)
})

test('waiver 는 승격하지 않는다 — 그 sprint 의 기록으로 남는다', () => {
  const c = collectCarry(SPRINT, {})
  const p = toPromotable(c, 'x')
  assert.equal(p.some((i) => i.kind === CARRY_KIND.WAIVER), false)
  assert.ok(p.every((i) => i.from === 'x'))
})

// ── master plan ───────────────────────────────────────────────────────

test('선행이 끝나야 다음을 추천한다', () => {
  const plan = {
    sprints: [
      { id: 'a', order: 1, dependsOn: [], status: 'archived' },
      { id: 'b', order: 2, dependsOn: ['a'], status: 'planned' },
      { id: 'c', order: 3, dependsOn: ['b'], status: 'planned' },
    ],
  }
  const agg = aggregate(plan, [])
  const next = recommendNext(agg)
  assert.equal(next.next.id, 'b')
})

test('이월이 막는 sprint 를 알린다 — 추천은 하되 막힌 사실을 함께 낸다', () => {
  const plan = { sprints: [{ id: 'b', order: 1, dependsOn: [], status: 'planned' }] }
  const agg = aggregate(plan, [])
  const next = recommendNext(agg, {
    carryOver: [{ id: 'x:c1', status: 'open', title: '멱등키', blocks: ['b'] }],
  })
  assert.equal(next.next.id, 'b')
  assert.equal(next.reason, 'blocked_by_carry')
  assert.equal(next.blocking.length, 1)
})

test('중복 승격을 막는다', () => {
  const plan = { carryOver: [{ id: 'x:c1', title: '기존' }] }
  const r = promote(plan, [{ id: 'x:c1', title: '중복' }, { id: 'x:c2', title: '새것' }])
  assert.deepEqual(r.added, ['x:c2'])
  assert.equal(plan.carryOver.length, 2)
})

test('등록되지 않은 sprint 를 보고한다', () => {
  const agg = aggregate({ sprints: [] }, [{ id: 'ghost', status: 'active', ac: [] }])
  assert.deepEqual(agg.unregistered, ['ghost'])
})

test('upsert 가 기존 order 와 의존을 보존한다', () => {
  const plan = { sprints: [{ id: 'a', order: 5, dependsOn: ['z'], status: 'planned' }] }
  upsertSprint(plan, { id: 'a', status: 'active', phase: 'qa' })
  assert.equal(plan.sprints[0].order, 5)
  assert.deepEqual(plan.sprints[0].dependsOn, ['z'])
  assert.equal(plan.sprints[0].status, 'active')
})
