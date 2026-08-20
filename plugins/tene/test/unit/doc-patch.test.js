import { test } from 'node:test'
import assert from 'node:assert/strict'
import { patchBlock, touchModified } from '../../lib/doc/patch.js'

const DOC = `---
tene:
  doc: design
  modified: 2026-08-01
---

## 계층     <!-- tene:sec=layers -->

<!-- tene:auto:start block=layers cia=grep -->
옛 내용
<!-- tene:auto:end -->

### 사람이 쓴 해석
보존되어야 한다.

## 위반     <!-- tene:sec=violations -->

사람 서술.
`

test('기존 블록을 교체한다', () => {
  const out = patchBlock(DOC, 'layers', '새 내용')
  assert.ok(out.includes('새 내용'))
  assert.ok(!out.includes('옛 내용'))
})

test('블록 밖 사람 영역을 보존한다', () => {
  const out = patchBlock(DOC, 'layers', '새 내용')
  assert.ok(out.includes('### 사람이 쓴 해석'))
  assert.ok(out.includes('보존되어야 한다.'))
  assert.ok(out.includes('사람 서술.'))
})

test('메타를 갱신한다', () => {
  const out = patchBlock(DOC, 'layers', 'x', { meta: { cia: 'indexed' } })
  assert.ok(/cia=indexed/.test(out))
  assert.ok(/generated=/.test(out))
})

test('블록이 없으면 섹션 끝에 삽입한다 (사람 서술 뒤)', () => {
  const out = patchBlock(DOC, 'violations', '표', { sectionId: 'violations' })
  assert.ok(out.indexOf('block=violations') > out.indexOf('사람 서술.'))
})

test('start/end 쌍이 맞지 않으면 오류를 낸다 (부분 교체 금지)', () => {
  assert.throws(
    () => patchBlock('<!-- tene:auto:start block=x -->\n내용', 'x', 'new'),
    (e) => e.code === 'AUTO_BLOCK_UNPAIRED',
  )
})

test('touchModified — 날짜만 바꾼다', () => {
  const out = touchModified(DOC, '2026-08-20T00:00:00Z')
  assert.ok(out.includes('modified: 2026-08-20'))
  assert.ok(!out.includes('2026-08-01'))
  assert.ok(out.includes('doc: design'))
})
