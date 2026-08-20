/**
 * 템플릿 ↔ extract 왕복 — 자기 템플릿을 자기가 읽는가
 *
 * **이 테스트가 없어서 게이트 G2 가 정상 문서를 막았다.**
 * 템플릿 헤더는 `커버 작업` 인데 ALIAS 는 `커버` 만 알았다.
 * 문서를 규격대로 채워도 추출이 0건이면 게이트가 통과할 수 없다.
 *
 * 언어별로 따로 본다 — 한쪽만 맞는 경우가 실제로 있었다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDoc } from '../../lib/doc/parser.js'
import * as ex from '../../lib/doc/extract.js'

const T = join(dirname(fileURLToPath(import.meta.url)), '../../templates')

/** 템플릿 표의 구분선 다음에 실제 값 한 행을 끼워 넣는다 */
function fillTable(text, secId, values) {
  const lines = text.split('\n')
  const anchor = lines.findIndex((l) => l.includes(`tene:sec=${secId}`))
  if (anchor < 0) throw new Error(`섹션 없음: ${secId}`)

  for (let i = anchor; i < Math.min(lines.length, anchor + 30); i++) {
    if (!/^\|[\s:|-]+\|$/.test(lines[i].trim())) continue
    const cols = lines[i].split('|').length - 2
    const row = values.slice(0, cols)
    while (row.length < cols) row.push('x')
    lines.splice(i + 1, 0, `| ${row.join(' | ')} |`)
    return lines.join('\n')
  }
  throw new Error(`표 없음: ${secId}`)
}

const CASES = [
  { doc: 'prd', sec: 'ac', label: '수용 기준',
    values: ['ac_1', '**When** 제출하면 결과를 표시해야 한다', 'blocking', 'UNIT', '`fn`', 'pending'],
    fn: (d) => ex.extractAc(d),
    check: (r) => r.some((x) => x.id === 'ac_1' && x.priority === 'blocking' && x.method === 'UNIT') },

  { doc: 'prd', sec: 'intents', label: '기획 의도',
    values: ['intent_1', '입력 보존', '재입력 불만', '구매자', 'conversation'],
    fn: (d) => ex.extractIntents(d),
    check: (r) => r.some((x) => x.id === 'intent_1') },

  { doc: 'plan', sec: 'tasks', label: '작업',
    values: ['task_1', '결제 처리', 'ac_1', 'Business Logic', '—'],
    fn: (d) => ex.extractTasks(d),
    check: (r) => r.some((x) => x.covers?.includes('ac_1')) },

  { doc: 'plan', sec: 'coverage', label: 'AC 커버리지',
    values: ['ac_1', 'task_1', 'covered'],
    fn: (d) => ex.extractCoverage(d),
    check: (r) => r.some((x) => x.covers && x.covers !== '—') },

  { doc: 'design', sec: 'transitions', label: '화면 전이',
    values: ['A → B', '제출', 'ac_1'],
    fn: (d) => ex.extractTransitions(d),
    check: (r) => r.length > 0 },

  { doc: 'design', sec: 'anchors', label: 'AC 앵커',
    values: ['ac_1', '`processPayment`'],
    fn: (d) => ex.extractAnchors(d),
    check: (r) => Array.isArray(r.ac_1) && r.ac_1.length > 0 },

  { doc: 'qa', sec: 'acverdicts', label: 'AC 판정',
    values: ['ac_1', 'blocking', 'UNIT', 'passed', 'ev_1', '—'],
    fn: (d) => ex.extractVerdicts(d),
    check: (r) => r.some((x) => x.ac === 'ac_1' && x.verdict === 'passed') },

  { doc: 'qa', sec: 'insufficient', label: '미측정',
    values: ['ac_3', '테스트 러너 없음', '러너 설치'],
    fn: (d) => ex.extractInsufficient(d),
    check: (r) => r.some((x) => x.item && x.reason) },
]

for (const lang of ['ko', 'en']) {
  for (const c of CASES) {
    test(`[${lang}] ${c.doc}.${c.sec} — ${c.label} 를 템플릿에서 추출한다`, () => {
      const raw = readFileSync(join(T, `${c.doc}.template.${lang}.md`), 'utf8')
      const doc = parseDoc(fillTable(raw, c.sec, c.values))
      const got = c.fn(doc)

      const size = Array.isArray(got) ? got.length : Object.keys(got).length
      assert.ok(size > 0,
        `추출 0건 — 템플릿 헤더가 ALIAS 에 없습니다. ` +
        `헤더: ${(doc.sections.get(c.sec)?.tables?.[0]?.headers ?? []).join(' | ')}`)
      assert.ok(c.check(got), `추출은 됐으나 값이 기대와 다릅니다: ${JSON.stringify(got).slice(0, 160)}`)
    })
  }
}

test('한국어와 영어 템플릿이 같은 결과를 낸다', () => {
  for (const c of CASES) {
    const sizes = ['ko', 'en'].map((lang) => {
      const raw = readFileSync(join(T, `${c.doc}.template.${lang}.md`), 'utf8')
      const got = c.fn(parseDoc(fillTable(raw, c.sec, c.values)))
      return Array.isArray(got) ? got.length : Object.keys(got).length
    })
    assert.equal(sizes[0], sizes[1], `${c.doc}.${c.sec} 이 언어마다 다릅니다: ko=${sizes[0]} en=${sizes[1]}`)
  }
})
