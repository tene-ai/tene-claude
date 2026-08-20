import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPlaceholderOnly, parseDoc, parseTables, tableToObjects } from '../../lib/doc/parser.js'

const DOC = `---
tene:
  sprint: x
  doc: prd
  lang: ko
---

# 제목

## 배경     <!-- tene:sec=background -->

내용이 있다.

## 범위 밖     <!-- tene:sec=nongoals -->

<작성 필요>

## AC     <!-- tene:sec=ac -->

| ID | 기준 | 우선도 |
|---|---|---|
| ac_1 | **If** a, **then** b | blocking |

<!-- tene:auto:start block=ac cia=indexed -->
자동
<!-- tene:auto:end -->

## +@ 자유

아무거나
`

test('frontmatter 의 tene 블록을 파싱한다', () => {
  const d = parseDoc(DOC)
  assert.equal(d.tene.sprint, 'x')
  assert.equal(d.tene.lang, 'ko')
})

test('앵커가 있는 섹션만 수집한다', () => {
  const d = parseDoc(DOC)
  assert.deepEqual([...d.sections.keys()], ['background', 'nongoals', 'ac'])
})

test('+@ 섹션은 freeSections 로 분리된다', () => {
  const d = parseDoc(DOC)
  assert.equal(d.freeSections.length, 1)
  assert.ok(!d.sections.has('자유'))
})

test('자동 블록의 이름과 메타를 읽는다', () => {
  const d = parseDoc(DOC)
  assert.equal(d.autoBlocks[0].name, 'ac')
  assert.equal(d.autoBlocks[0].meta.cia, 'indexed')
  assert.ok(d.autoBlocks[0].endLine > d.autoBlocks[0].startLine)
})

test('쌍이 맞지 않는 자동 블록을 오류로 보고한다', () => {
  const d = parseDoc('---\ntene: { doc: prd }\n---\n<!-- tene:auto:start block=x -->\n내용\n')
  assert.equal(d.autoBlocks[0].endLine, null)
  assert.ok(d.errors.some((e) => e.code === 'AUTO_BLOCK_UNPAIRED'))
})

test('frontmatter 가 없으면 오류를 보고한다', () => {
  assert.ok(parseDoc('# 제목').errors.some((e) => e.code === 'NO_FRONTMATTER'))
})

test('isPlaceholderOnly — 플레이스홀더만 있으면 참', () => {
  assert.equal(isPlaceholderOnly('<작성 필요>'), true)
  assert.equal(isPlaceholderOnly('TODO'), true)
  assert.equal(isPlaceholderOnly('  \n  \n'), true)
  assert.equal(isPlaceholderOnly('내용이 있다.'), false)
})

test('isPlaceholderOnly — 인용·주석은 내용으로 치지 않는다', () => {
  assert.equal(isPlaceholderOnly('> ⚠️ 필수입니다.\n<작성 필요>'), true)
})

test('표 파싱 — 이스케이프된 파이프를 처리한다', () => {
  const t = parseTables('| a | b |\n|---|---|\n| x \\| y | z |')[0]
  assert.deepEqual(t.rows[0], ['x | y', 'z'])
})

test('tableToObjects — 헤더를 정규화한다', () => {
  const d = parseDoc(DOC)
  const rows = tableToObjects(d.sections.get('ac').tables[0])
  assert.equal(rows[0].id, 'ac_1')
  assert.equal(rows[0]['우선도'], 'blocking')
})
