/** loop-check — D13 §2.9 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDoc } from '../../lib/doc/parser.js'
import { extractRequirements } from '../../lib/loop/requirements.js'
import { judgeAll, judgeRequirement, kindOf, severityOf, summarize } from '../../lib/loop/judge.js'
import { detectStall, diffRounds, formatProgress, judgeRound, VERDICT } from '../../lib/loop/progress.js'
import { applyResolutions, detectUnattributed, isExempt, renderUnattributed, unresolvedCount } from '../../lib/loop/unattributed.js'

const PRD = parseDoc(`---
tene:
  doc: prd
---
## 수용 기준 <!-- tene:sec=ac -->

| ID | 기준 | 우선도 | 방식 | 앵커 |
|---|---|---|---|---|
| ac_1 | **When** 제출하면, 시스템은 결과를 보여야 한다 | blocking | UX | \`processPayment\` |
| ac_2 | **If** 실패하면, **then** 사유를 기록해야 한다 | non-blocking | DATA | \`markFailed\` |
`)

const PLAN = parseDoc(`---
tene:
  doc: plan
---
## 작업 <!-- tene:sec=tasks -->

| # | 작업 | 커버하는 AC | 예상 계층 | 선행 |
|---|---|---|---|---|
| task_1 | 결제 처리 | ac_1 | Business Logic | — |
| task_2 | 실패 기록 | ac_2 | Persistence | task_1 |
`)

const DESIGN = parseDoc(`---
tene:
  doc: design
---
## 계층 <!-- tene:sec=layers -->

### Business Logic (Processing rules)
| 대상 | 파일 | 신규/수정 | 출처 |
|---|---|---|---|
| processPayment | src/services/payment.ts | 신규 | design |

### Persistence (Data)
| 대상 | 파일 | 신규/수정 | 출처 |
|---|---|---|---|
| markFailed | src/db/payments.ts | 신규 | design |

## 처리 로직 <!-- tene:sec=logic -->

### 실패 분기
\`processPayment\` 가 실패하면 \`markFailed\` 를 부른다 (ac_1).

## 데이터 계약 <!-- tene:sec=contracts -->

| 대상 | 입력 스키마 | 출력 스키마 | 출처 |
|---|---|---|---|
| processPayment | PaymentInput | PaymentResult | design |

## 전이 <!-- tene:sec=transitions -->

| 엣지 | 트리거 | 대상 AC |
|---|---|---|
| Checkout → Result | 제출 | ac_1 |
`)

const INDEX = {
  files: { 'src/services/payment.ts': { lang: 'typescript' } },
  symbols: {
    processPayment: [{
      kind: 'function', file: 'src/services/payment.ts', line: 1, exported: true, confidence: 'high',
      signatureText: 'export async function processPayment(input: PaymentInput): Promise<PaymentResult> {',
    }],
  },
  imports: {},
  refs: {},
  unresolved: [],
}

const RULES = {
  layers: {
    interface: { paths: ['src/routes/**'], imports: [] },
    'business-logic': { paths: ['src/services/**'], imports: [] },
    persistence: { paths: ['src/db/**'], imports: [] },
    infrastructure: { paths: ['src/config/**'], imports: [] },
  },
  precedence: ['interface', 'persistence', 'infrastructure', 'business-logic'],
  exclude: [], testPaths: [], source: 'test',
}

// ── 요구 추출 ─────────────────────────────────────────────────────────

test('6개 출처에서 요구를 뽑는다', () => {
  const { requirements, bySource } = extractRequirements({ prd: PRD, plan: PLAN, design: DESIGN })
  assert.equal(bySource['prd:ac'], 2)
  assert.equal(bySource['plan:task'], 2)
  assert.equal(bySource['design:logic'], 1)
  assert.equal(bySource['design:layer'], 2)
  assert.equal(bySource['design:transition'], 1)
  assert.equal(bySource['design:contract'], 1)
  assert.equal(requirements.length, 9)
})

test('작업은 덮는 AC 중 가장 높은 우선도를 물려받는다', () => {
  const { requirements } = extractRequirements({ prd: PRD, plan: PLAN, design: DESIGN })
  const t1 = requirements.find((r) => r.refId === 'task_1')
  const t2 = requirements.find((r) => r.refId === 'task_2')
  assert.equal(t1.priority, 'blocking', 'ac_1(blocking) 을 덮으므로')
  assert.equal(t2.priority, 'non-blocking', 'ac_2(non-blocking) 만 덮으므로')
})

test('계층 배치는 non-blocking, 데이터 계약은 연결 없으면 blocking', () => {
  const { requirements } = extractRequirements({ prd: PRD, plan: PLAN, design: DESIGN })
  assert.equal(requirements.find((r) => r.source === 'design:layer').priority, 'non-blocking')
  assert.equal(requirements.find((r) => r.source === 'design:contract').priority, 'blocking')
})

test('문서가 없으면 조용히 넘기지 않고 경고한다', () => {
  const { warnings, total } = extractRequirements({ prd: PRD })
  assert.equal(total, 2)
  assert.ok(warnings.some((w) => /plan\.md 가 없어/.test(w)))
  assert.ok(warnings.some((w) => /design\.md 가 없어/.test(w)))
})

// ── 판정 ──────────────────────────────────────────────────────────────

const ctx = { index: INDEX, rules: RULES, changedFiles: new Set(['src/services/payment.ts']), anchorsByAc: { ac_1: ['src/services/payment.ts'] } }

test('앵커 심볼이 있고 변경됐으면 implemented', () => {
  const req = { source: 'prd:ac', refId: 'ac_1', priority: 'blocking', expectedAnchors: ['processPayment'] }
  const v = judgeRequirement(req, ctx)
  assert.equal(v.judgment, 'implemented')
  assert.match(v.evidence, /src\/services\/payment\.ts:1/)
})

test('앵커 심볼이 없으면 missing — 근거를 함께 낸다', () => {
  const req = { source: 'prd:ac', refId: 'ac_2', priority: 'blocking', expectedAnchors: ['markFailed'] }
  const v = judgeRequirement(req, ctx)
  assert.equal(v.judgment, 'missing')
  assert.match(v.evidence, /찾지 못했습니다/, '"확인했으나 없음" 의 근거가 있어야 한다')
  assert.ok(v.suggestedFix)
})

test('앵커가 없으면 missing 이 아니라 unverifiable', () => {
  const req = { source: 'prd:ac', refId: 'ac_3', priority: 'blocking', expectedAnchors: [] }
  const v = judgeRequirement(req, ctx)
  assert.equal(v.judgment, 'unverifiable', '안 찾아본 것과 찾아봤는데 없는 것은 다르다')
  assert.equal(v.reason, 'no_anchor')
})

test('심볼은 있으나 이번에 변경되지 않았으면 partial', () => {
  const req = { source: 'prd:ac', refId: 'ac_1', priority: 'blocking', expectedAnchors: ['processPayment'] }
  const v = judgeRequirement(req, { ...ctx, changedFiles: new Set(['src/other.ts']) })
  assert.equal(v.judgment, 'partial')
  assert.equal(v.reason, 'not_changed')
})

test('화면 전이는 정적으로 확인할 수 없으므로 unverifiable', () => {
  const req = { source: 'design:transition', refId: 'A → B', from: 'A', to: 'B', priority: 'blocking' }
  const v = judgeRequirement(req, ctx)
  assert.equal(v.judgment, 'unverifiable')
  assert.equal(v.reason, 'runtime_required')
})

test('인덱스가 없으면 전부 unverifiable — implemented 로 넘기지 않는다', () => {
  const req = { source: 'prd:ac', refId: 'ac_1', priority: 'blocking', expectedAnchors: ['processPayment'] }
  const v = judgeRequirement(req, { rules: RULES })
  assert.equal(v.judgment, 'unverifiable')
  assert.equal(v.reason, 'no_index')
})

test('계층이 설계와 다르면 partial 로 잡는다', () => {
  const req = {
    source: 'design:layer', refId: 'persistence:processPayment', priority: 'non-blocking',
    expectedLayer: 'persistence', expectedAnchors: ['processPayment'],
  }
  const v = judgeRequirement(req, ctx)
  assert.equal(v.judgment, 'partial')
  assert.equal(v.reason, 'layer_mismatch')
})

test('severity: blocking 이 미구현이면 blocker, unverifiable 은 info', () => {
  assert.equal(severityOf({ priority: 'blocking' }, 'missing'), 'blocker')
  assert.equal(severityOf({ priority: 'blocking' }, 'partial'), 'blocker')
  assert.equal(severityOf({ priority: 'blocking' }, 'unverifiable'), 'info')
  assert.equal(severityOf({ priority: 'non-blocking' }, 'missing'), 'warning')
})

test('이전에 implemented 였다가 깨지면 regression', () => {
  assert.equal(kindOf('missing', 'x', true), 'regression')
  assert.equal(kindOf('missing', 'x', false), 'missing')
})

// ── 집계 ──────────────────────────────────────────────────────────────

test('unverifiable 을 분모에서 뺀다 — 개수는 병기한다', () => {
  const judged = [
    { judgment: 'implemented' }, { judgment: 'implemented' },
    { judgment: 'missing' }, { judgment: 'unverifiable' },
  ]
  const s = summarize(judged, [])
  assert.equal(s.denominator, 3, 'unverifiable 1건이 빠져야 한다')
  assert.equal(s.progress, Number((2 / 3).toFixed(3)))
  assert.equal(s.unverifiableCount, 1)
})

test('확인 가능한 항목이 없으면 진행률을 만들지 않는다', () => {
  const s = summarize([{ judgment: 'unverifiable' }], [])
  assert.equal(s.progress, null, '0/0 을 100% 로 표시하면 거짓말이다')
  assert.match(formatProgress(s), /산출 불가/)
})

test('게이트는 백분율이 아니라 blocking 갭을 본다', () => {
  const reqs = [
    { id: 'r1', source: 'prd:ac', refId: 'ac_1', priority: 'blocking', expectedAnchors: ['markFailed'], statement: 'x' },
    { id: 'r2', source: 'prd:ac', refId: 'ac_2', priority: 'non-blocking', expectedAnchors: ['alsoGone'], statement: 'y' },
  ]
  const r = judgeAll(reqs, ctx, { round: 1 })
  assert.equal(r.blockingGaps, 1, 'non-blocking 미구현은 게이트를 막지 않는다')
  assert.equal(r.gaps.length, 2, '갭 자체는 둘 다 기록된다')
})

// ── 수렴 ──────────────────────────────────────────────────────────────

test('blocking 0 + 미귀속 0 이면 통과', () => {
  const v = judgeRound({ blockingGaps: 0, unattributedUnresolved: 0, progress: 0.8 }, [], { round: 1, maxRounds: 3 })
  assert.equal(v.verdict, VERDICT.PASS)
  assert.equal(v.canAdvance, true)
})

test('미귀속이 남으면 blocking 0 이어도 통과하지 못한다', () => {
  const v = judgeRound({ blockingGaps: 0, unattributedUnresolved: 2, progress: 1 }, [], { round: 1, maxRounds: 3 })
  assert.notEqual(v.verdict, VERDICT.PASS)
})

test('2회 연속 진전이 없으면 stalled — 반복을 더 돌라고 하지 않는다', () => {
  const history = [
    { round: 1, blockingGaps: 3, progress: 0.5 },
    { round: 2, blockingGaps: 3, progress: 0.5 },
  ]
  const v = judgeRound({ blockingGaps: 3, unattributedUnresolved: 0, progress: 0.5 }, history, { round: 3, maxRounds: 5 })
  assert.equal(v.verdict, VERDICT.STALLED)
  assert.ok(v.options.some((o) => /설계를 고친다/.test(o)))
})

test('non-blocking 만 개선돼 진행률이 올라도 blocking 이 그대로면 stalled 로 본다', () => {
  const history = [
    { round: 1, blockingGaps: 2, progress: 0.4 },
    { round: 2, blockingGaps: 2, progress: 0.5 },
  ]
  // 진행률은 0.4 → 0.5 → 0.6 으로 오르지만 blocking 은 2 에서 요지부동이다.
  // 목표는 blocking 0 이므로 이건 진전이 아니다.
  const stall = detectStall({ blockingGaps: 2, progress: 0.6 }, history)
  assert.equal(stall.stalled, true)
  assert.match(stall.reason, /2 → 2 → 2/)
})

test('blocking 이 한 번이라도 줄면 정체가 아니다', () => {
  const history = [
    { round: 1, blockingGaps: 3, progress: 0.3 },
    { round: 2, blockingGaps: 2, progress: 0.4 },
  ]
  assert.equal(detectStall({ blockingGaps: 2, progress: 0.4 }, history).stalled, false)
})

test('blocking 이 0 이면 정체가 아니다 (통과 경로다)', () => {
  const history = [{ round: 1, blockingGaps: 0, progress: 1 }, { round: 2, blockingGaps: 0, progress: 1 }]
  assert.equal(detectStall({ blockingGaps: 0, progress: 1 }, history).stalled, false)
})

test('상한에 도달하면 exhausted 와 선택지를 낸다', () => {
  const v = judgeRound({ blockingGaps: 1, unattributedUnresolved: 0, progress: 0.9 }, [{ round: 1, blockingGaps: 3, progress: 0.4 }], { round: 3, maxRounds: 3 })
  assert.equal(v.verdict, VERDICT.EXHAUSTED)
  assert.ok(v.options.some((o) => /waiver/.test(o)))
})

test('회차 비교가 고쳐진 것과 깨진 것을 가른다', () => {
  const prev = [
    { requirementId: 'r1', judgment: 'missing' },
    { requirementId: 'r2', judgment: 'implemented' },
  ]
  const cur = [
    { requirementId: 'r1', judgment: 'implemented', refId: 'a' },
    { requirementId: 'r2', judgment: 'missing', refId: 'b' },
    { requirementId: 'r3', judgment: 'missing', refId: 'c' },
  ]
  const d = diffRounds(prev, cur)
  assert.deepEqual(d.fixed.map((f) => f.id), ['r1'])
  assert.deepEqual(d.broken.map((b) => b.id), ['r2'])
  assert.deepEqual(d.added, ['r3'])
})

// ── 미귀속 ────────────────────────────────────────────────────────────

test('테스트·설정·문서는 앵커 대상이 아니다', () => {
  assert.equal(isExempt('src/a.test.ts'), true)
  assert.equal(isExempt('package.json'), true)
  assert.equal(isExempt('docs/sprints/x/00-prd/prd.md'), true)
  assert.equal(isExempt('src/services/a.ts'), false)
})

test('git 을 못 읽으면 0건이 아니라 available:false 를 낸다', () => {
  const r = detectUnattributed({ root: '/x', changed: null, anchors: {}, index: {}, rules: RULES })
  assert.equal(r.available, false)
  assert.equal(r.items.length, 0)
  assert.ok(r.hint, '왜 확인 못 했는지 말해야 한다')
  assert.match(renderUnattributed(r), /확인하지 못했습니다/)
})

test('앵커 없는 변경을 미귀속으로 잡는다', () => {
  const r = detectUnattributed({
    root: '/x',
    changed: ['src/services/a.ts', 'src/services/b.ts', 'src/a.test.ts'],
    anchors: { byPath: { 'src/services/a.ts': ['s:ac_1'] } },
    index: { files: {}, imports: {} },
    rules: RULES,
  })
  assert.deepEqual(r.items.map((i) => i.path), ['src/services/b.ts'])
  assert.deepEqual(r.exempt, ['src/a.test.ts'])
})

test('해소되면 미해소 수에서 빠진다', () => {
  const items = [{ path: 'a.ts', status: 'open' }, { path: 'b.ts', status: 'open' }]
  const applied = applyResolutions(items, [{ path: 'a.ts', resolution: 'unrelated', reason: '포맷팅' }])
  assert.equal(unresolvedCount(applied), 1)
  assert.equal(applied[0].resolution, 'unrelated')
})
