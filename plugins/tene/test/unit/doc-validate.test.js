import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDoc } from '../../lib/doc/parser.js'
import { validateDoc } from '../../lib/doc/validate.js'

const AC_GOOD = '| ID | 기준 | 우선도 | 방식 | 앵커 | 상태 |\n|---|---|---|---|---|---|\n| ac_1 | **If** 만료면, **then** 복귀한다 | blocking | UX | `X` | pending |'

function prd(ac = AC_GOOD, nongoals = '없음') {
  return parseDoc(`---
tene: { sprint: x, doc: prd }
---
## 배경  <!-- tene:sec=background -->
불편하다
## 목표  <!-- tene:sec=goals -->
줄인다
## 범위밖  <!-- tene:sec=nongoals -->
${nongoals}
## 의도  <!-- tene:sec=intents -->
| ID | 의도 | 근거 | 행위자 | 출처 |
|---|---|---|---|---|
| intent_1 | 재입력 제거 | 이탈 | 구매자 | conversation |
## UX  <!-- tene:sec=uxflow -->
흐름
## 데이터  <!-- tene:sec=dataflow -->
흐름
## AC  <!-- tene:sec=ac -->
${ac}
## 결정  <!-- tene:sec=decisions -->
없음
`)
}

const v = (doc, ctx = {}) => validateDoc(doc, { docType: 'prd', profile: 'standard', ...ctx })
const failed = (doc, ctx) => v(doc, ctx).failed

test('정상 PRD 는 G1 을 통과한다', () => {
  assert.equal(v(prd()).valid, true)
})

test('범위 밖이 플레이스홀더면 실패한다', () => {
  assert.ok(failed(prd(AC_GOOD, '<작성 필요>')).includes('nongoals_nonempty'))
})

test('If-then 패턴이 없으면 실패한다', () => {
  const ac = '| ID | 기준 | 우선도 | 방식 | 앵커 | 상태 |\n|---|---|---|---|---|---|\n| ac_1 | **When** x 하면 y 한다 | blocking | DATA | `X` | pending |'
  assert.ok(failed(prd(ac)).includes('ac_unwanted_min'))
})

test('모호 형용사를 검출한다', () => {
  const ac = '| ID | 기준 | 우선도 | 방식 | 앵커 | 상태 |\n|---|---|---|---|---|---|\n| ac_1 | **If** a, **then** 빠르게 응답한다 | blocking | UX | `X` | pending |'
  const r = v(prd(ac))
  assert.ok(r.failed.includes('ac_no_vague'))
  assert.ok(r.checks.find((c) => c.id === 'ac_no_vague').suggestion)
})

test('검증 방식 태그가 없으면 실패한다', () => {
  const ac = '| ID | 기준 | 우선도 | 방식 | 앵커 | 상태 |\n|---|---|---|---|---|---|\n| ac_1 | **If** a, **then** b | blocking |  | `X` | pending |'
  assert.ok(failed(prd(ac)).includes('ac_method_tagged'))
})

test('필수 섹션이 없으면 실패하고 누락 목록을 준다', () => {
  const doc = parseDoc('---\ntene: { doc: prd }\n---\n## 배경  <!-- tene:sec=background -->\nx\n')
  const r = v(doc)
  assert.equal(r.valid, false)
  const c = r.checks.find((x) => x.id === 'sections')
  assert.ok(c.value.includes('nongoals'))
})

test('light profile 은 섹션이 적어도 통과한다', () => {
  const doc = parseDoc(`---
tene: { doc: prd }
---
## 범위밖  <!-- tene:sec=nongoals -->
없음
## 의도  <!-- tene:sec=intents -->
| ID | 의도 |
|---|---|
| intent_1 | 재입력 제거 |
## AC  <!-- tene:sec=ac -->
${AC_GOOD}
`)
  assert.equal(v(doc, { profile: 'light' }).valid, true)
})

test('자유 섹션은 검증에 영향을 주지 않는다', () => {
  const doc = parseDoc(prd().raw + '\n## +@ 메모\n아무거나\n')
  const r = v(doc)
  assert.equal(r.valid, true)
  assert.equal(r.freeSections.length, 1)
})

test('report — R1~R6 중 하나라도 비면 실패한다', () => {
  const base = ['summary', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6']
  const mk = (emptyId) => parseDoc('---\ntene: { doc: report }\n---\n' +
    base.map((id) => `## ${id}  <!-- tene:sec=${id} -->\n${id === emptyId ? '<작성 필요>' : '내용'}\n`).join('') +
    '\n### Interface\n### Business Logic\n### Persistence\n### Infrastructure\n')
  assert.ok(validateDoc(mk('r3'), { docType: 'report' }).failed.includes('r1_to_r6_present'))
  assert.ok(!validateDoc(mk(null), { docType: 'report' }).failed.includes('r1_to_r6_present'))
})

test('design — 4계층 중 하나라도 없으면 실패한다', () => {
  const mk = (layers) => parseDoc(`---
tene: { doc: design }
---
## 개요  <!-- tene:sec=overview -->
x
## 계층  <!-- tene:sec=layers -->
${layers}
## 위반  <!-- tene:sec=violations -->
x
## 로직  <!-- tene:sec=logic -->
x
## 질문  <!-- tene:sec=questions -->
| Q | A |
|---|---|
| Q1 | x |
## 계약  <!-- tene:sec=contracts -->
x
## 전이  <!-- tene:sec=transitions -->
x
## 앵커  <!-- tene:sec=anchors -->
x
`)
  const all = '### Interface\n### Business Logic\n### Persistence\n### Infrastructure'
  assert.ok(!validateDoc(mk(all), { docType: 'design', acIds: [] }).failed.includes('layers_all_four'))
  assert.ok(validateDoc(mk('### Interface\n### Business Logic'), { docType: 'design', acIds: [] })
    .failed.includes('layers_all_four'))
})
