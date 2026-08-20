import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDoc } from '../../lib/doc/parser.js'
import { earsPattern, extractAc, extractIntents, extractTransitions } from '../../lib/doc/extract.js'

const KO = parseDoc(`---
tene: { doc: prd }
---
## AC  <!-- tene:sec=ac -->
| ID | 기준 (EARS) | 우선도 | 방식 | 앵커 | 상태 |
|---|---|---|---|---|---|
| ac_1 | **If** 만료면, **then** 복귀한다 | blocking | UX | \`CheckoutPage\` | pending |
| ac_2 | **When** 4xx 이면 기록한다 | non-blocking | DATA | \`a\`, \`b\` | pending |
`)

const EN = parseDoc(`---
tene: { doc: prd }
---
## Acceptance Criteria  <!-- tene:sec=ac -->
| ID | Criterion | Priority | Method | Anchor | Status |
|---|---|---|---|---|---|
| ac_1 | **If** expired, **then** return | blocking | UX | \`CheckoutPage\` | pending |
`)

test('한국어·영어 표에서 같은 스키마를 낸다', () => {
  const ko = extractAc(KO)[0]
  const en = extractAc(EN)[0]
  assert.deepEqual(Object.keys(ko).sort(), Object.keys(en).sort())
  assert.equal(ko.priority, en.priority)
  assert.equal(ko.method, en.method)
  assert.equal(ko.pattern, en.pattern)
})

test('앵커를 배열로 분리하고 백틱을 제거한다', () => {
  assert.deepEqual(extractAc(KO)[1].anchors, ['a', 'b'])
})

test('EARS 패턴을 판별한다 — If-then 이 우선', () => {
  assert.equal(earsPattern('**If** a, **then** b'), 'unwanted')
  assert.equal(earsPattern('**When** x'), 'event')
  assert.equal(earsPattern('**While** y'), 'state')
  assert.equal(earsPattern('시스템은 z 해야 한다'), 'ubiquitous')
  assert.equal(earsPattern('그냥 문장'), null)
})

test('우선도 기본값은 blocking — 안전한 쪽', () => {
  const doc = parseDoc(`---
tene: { doc: prd }
---
## AC  <!-- tene:sec=ac -->
| ID | 기준 | 우선도 | 방식 | 앵커 | 상태 |
|---|---|---|---|---|---|
| ac_1 | **If** a, **then** b |  | UX | \`X\` | pending |
`)
  assert.equal(extractAc(doc)[0].priority, 'blocking')
})

test('플레이스홀더 행은 제외한다', () => {
  const doc = parseDoc(`---
tene: { doc: prd }
---
## AC  <!-- tene:sec=ac -->
| ID | 기준 | 우선도 | 방식 | 앵커 | 상태 |
|---|---|---|---|---|---|
| ac_1 | <무엇> | blocking | UX | | pending |
`)
  assert.equal(extractAc(doc).length, 0)
})

test('화면 전이를 엣지로 만든다', () => {
  const doc = parseDoc(`---
tene: { doc: design }
---
## 전이  <!-- tene:sec=transitions -->
| 엣지 | 트리거 | 대상 AC |
|---|---|---|
| CheckoutPage → Processing | 결제 클릭 | ac_1 |
`)
  const e = extractTransitions(doc)[0]
  assert.equal(e.from, 'CheckoutPage')
  assert.equal(e.to, 'Processing')
  assert.deepEqual(e.targetAc, ['ac_1'])
})

test('intents 를 추출한다', () => {
  const doc = parseDoc(`---
tene: { doc: prd }
---
## 의도  <!-- tene:sec=intents -->
| ID | 의도 | 근거 | 행위자 | 출처 |
|---|---|---|---|---|
| intent_1 | 재입력 제거 | 이탈 | 구매자, 관리자 | conversation |
`)
  const i = extractIntents(doc)[0]
  assert.equal(i.id, 'intent_1')
  assert.deepEqual(i.actors, ['구매자', '관리자'])
})
