/** SessionStart 요약 · 보존 정책 · resync — D13 §2.6 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildSessionContext, formatSummary, formatNextSuggestion, recommendNext, SESSION_BUDGET_TOKENS } from '../../lib/state/summary.js'
import { checkSize, clean, compactEvents } from '../../lib/state/retention.js'
import { detectDocs, inferPhase, mergeAc, findSprintDir, resync } from '../../lib/recover/resync.js'
import { parseDoc } from '../../lib/doc/parser.js'
import { eventsPath } from '../../lib/state/events.js'
import * as store from '../../lib/state/store.js'

function tmpProject() {
  const root = mkdtempSync(join(tmpdir(), 'tene-test-'))
  mkdirSync(join(root, '.git'), { recursive: true })
  return root
}

function write(root, rel, content) {
  const p = join(root, rel)
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, content)
  return p
}

// ── 요약 ──────────────────────────────────────────────────────────────

const CURRENT = {
  activeSprint: 'checkout-retry',
  phase: 'qa',
  profile: 'standard',
  docsRoot: 'docs/sprints',
  sprintDir: 'checkout-retry-payment',
  summary: {
    gate: { id: 'G6', result: 'fail' },
    ac: { total: 5, passed: 3, failed: 1, insufficient: 1, stale: 0, blockingFailed: 1 },
    coverage: { transitions: { covered: 3, total: 5 } },
    loopChecks: { count: 2, max: 3 },
    blocking: [{ kind: 'ac', id: 'ac_2', reason: 'payments 테이블에 실패 기록 없음' }],
  },
  nextAction: { skill: 'loop-check', reason: 'blocking AC 1건이 미충족입니다', alternatives: ['qa --only DATA'] },
}

test('요약은 600 토큰 예산 안에 든다', () => {
  const out = formatSummary(CURRENT)
  assert.ok(out.tokens <= SESSION_BUDGET_TOKENS, `${out.tokens} 토큰`)
  assert.equal(out.truncated, false)
})

test('요약에 차단 사유와 다음 행동이 들어간다', () => {
  const { text } = formatSummary(CURRENT)
  assert.match(text, /checkout-retry/)
  assert.match(text, /G6 FAIL/)
  assert.match(text, /ac_2/)
  assert.match(text, /\/tene:loop-check/)
})

// 전체는 94 토큰이고 차단 사유까지가 58 토큰이다. 60 을 주면 차단은 살고 그 뒤가 잘린다.
test('예산이 부족하면 뒤쪽 줄부터 잘리고 차단 사유는 남는다', () => {
  const out = formatSummary(CURRENT, { budget: 60 })
  assert.ok(out.truncated, '잘렸어야 한다')
  assert.match(out.text, /ac_2/, '차단 사유는 남아야 한다')
  assert.doesNotMatch(out.text, /문서:/, '경로는 먼저 잘려야 한다')
})

// 헤더조차 못 넣을 예산이면 아무것도 내지 않는다. 반쪽짜리 문장을 주입하지 않는다.
test('예산이 헤더보다 작으면 빈 문자열을 낸다', () => {
  const out = formatSummary(CURRENT, { budget: 5 })
  assert.equal(out.text, '')
  assert.ok(out.truncated)
})

test('AC 총계를 blocking 수처럼 표기하지 않는다', () => {
  const { text } = formatSummary(CURRENT)
  assert.match(text, /AC 5건/, '전체 AC 수를 그대로 쓴다')
  assert.doesNotMatch(text, /blocking AC 5건/, 'total 을 blocking 으로 부르면 통과율을 부풀려 읽는다')
})

test('활성 sprint 도 master plan 도 없으면 조용하다', () => {
  const ctx = buildSessionContext({ current: null, plan: null })
  assert.equal(ctx.kind, 'silent')
  assert.equal(ctx.text, '')
})

test('선행 sprint 가 끝나야 다음을 추천한다', () => {
  const plan = {
    sprints: [
      { id: 'payment-core', order: 1, dependsOn: [], status: 'archived' },
      { id: 'refund-flow', order: 3, dependsOn: ['payment-core'], status: 'planned' },
      { id: 'settlement', order: 2, dependsOn: ['refund-flow'], status: 'planned' },
    ],
    carryOver: [],
  }
  const rec = recommendNext(plan)
  assert.equal(rec.next.id, 'refund-flow')
  assert.deepEqual(rec.satisfied, ['payment-core'])
})

test('선행이 전부 미완료면 추천 대신 대기 사유를 말한다', () => {
  const plan = { sprints: [{ id: 'b', order: 1, dependsOn: ['a'], status: 'planned' }], carryOver: [] }
  const rec = recommendNext(plan)
  assert.equal(rec.next, null)
  assert.equal(rec.reason, 'blocked')
  const { text } = formatNextSuggestion(rec)
  assert.match(text, /대기 중: b/)
  assert.match(text, /선행 a/)
})

test('열린 이월 항목은 세션 시작에 노출된다', () => {
  const plan = {
    sprints: [{ id: 'a', order: 1, dependsOn: [], status: 'planned' }],
    carryOver: [{ id: 'x:D1', title: '재시도 잡의 멱등키 정책', status: 'open' }],
  }
  const { text } = formatNextSuggestion(recommendNext(plan))
  assert.match(text, /이월: x:D1/)
})

// ── 보존 ──────────────────────────────────────────────────────────────

test('checkSize 는 상한 아래에서 조용하다', () => {
  const root = tmpProject()
  try {
    assert.equal(checkSize(root).needsCleanup, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('이벤트 상한 초과 시 오래된 절반이 아카이브로 옮겨진다 (삭제 아님)', () => {
  const root = tmpProject()
  try {
    store.ensureStateDir(root)
    const lines = Array.from({ length: 20 }, (_, i) => JSON.stringify({ seq: i + 1, type: 'AcJudged' }))
    // 바이트 상한을 넘기려고 큰 페이로드를 붙인다
    const fat = lines.map((l) => l.slice(0, -1) + `,"pad":"${'x'.repeat(20000)}"}`)
    write(root, '.tene-claude/history/events.ndjson', fat.join('\n') + '\n')

    assert.equal(checkSize(root).needsCleanup, true)
    const res = compactEvents(root)
    assert.equal(res.moved, 10)
    assert.equal(res.kept, 10)
    assert.ok(existsSync(join(root, '.tene-claude', 'archive', res.to.split('/').at(-2), 'events.ndjson'))
      || existsSync(join(root, res.to)), '아카이브 파일이 있어야 한다')

    const remaining = readFileSync(eventsPath(root), 'utf8').trim().split('\n')
    assert.equal(remaining.length, 11, '남은 10줄 + compactEvents 가 남긴 StateCleaned 1줄')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('clean 은 기본이 dry-run 이다 — 명시하지 않으면 지우지 않는다', () => {
  const root = tmpProject()
  try {
    store.ensureStateDir(root)
    assert.equal(clean(root).dryRun, true)
    assert.equal(clean(root, { dryRun: false }).dryRun, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ── resync ────────────────────────────────────────────────────────────

test('id 로 디렉토리를 찾는다 — slug 가 바뀌어도', () => {
  const root = tmpProject()
  try {
    mkdirSync(join(root, 'docs/sprints/checkout-retry-완전히-다른-슬러그'), { recursive: true })
    const found = findSprintDir(root, 'docs/sprints', 'checkout-retry')
    assert.ok(found)
    assert.equal(found.archived, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('_archive 하위 sprint 는 archived 로 인식된다', () => {
  const root = tmpProject()
  try {
    mkdirSync(join(root, 'docs/sprints/_archive/2026-07/old-one-demo'), { recursive: true })
    const found = findSprintDir(root, 'docs/sprints', 'old-one')
    assert.equal(found.archived, true)
    assert.equal(inferPhase({ loopCheck: [] }, { archived: true }).phase, 'archived')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('loop-check 문서는 번호순으로 정렬된다', () => {
  const root = tmpProject()
  try {
    const dir = join(root, 'docs/sprints/x-demo')
    for (const n of [10, 2, 1]) write(root, `docs/sprints/x-demo/03-analysis/loop-check-${n}.md`, '#')
    const docs = detectDocs(dir)
    assert.deepEqual(docs.loopCheck.map((p) => p.match(/(\d+)\.md/)[1]), ['1', '2', '10'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('qa 에만 있고 prd 에 없는 AC 는 버리지 않고 orphan 으로 남긴다', () => {
  const prd = parseDoc(`---
tene:
  doc: prd
---
## 수용 기준 <!-- tene:sec=ac -->

| ID | 기준 | 우선도 | 검증 |
|---|---|---|---|
| ac_1 | If 결제가 실패하면, then 시스템은 입력값을 보존해야 한다 | blocking | UX |
`)
  const qa = parseDoc(`---
tene:
  doc: qa
---
## AC 판정 <!-- tene:sec=acverdicts -->

| ID | 우선도 | 검증 | 판정 | 증거 |
|---|---|---|---|---|
| ac_1 | blocking | UX | passed | e1 |
| ac_9 | blocking | DATA | failed | e2 |
`)
  const { ac, orphanIds } = mergeAc({ prd, design: null, qa })
  assert.deepEqual(orphanIds, ['ac_9'])
  assert.equal(ac.length, 2)
  assert.equal(ac.find((a) => a.id === 'ac_1').verdict, 'passed')
  assert.ok(ac.find((a) => a.id === 'ac_9').orphan)
})

test('resync 는 문서에서 상태를 재구성하고 게이트는 비운다', async () => {
  const root = tmpProject()
  try {
    write(root, 'docs/sprints/checkout-retry-payment/00-prd/prd.md', `---
tene:
  doc: prd
  title: 결제 실패 시 입력값 보존
  profile: standard
---
## 수용 기준 <!-- tene:sec=ac -->

| ID | 기준 | 우선도 | 검증 |
|---|---|---|---|
| ac_1 | If 결제가 실패하면, then 시스템은 입력값을 보존해야 한다 | blocking | UX |
`)
    write(root, 'docs/sprints/checkout-retry-payment/01-plan/plan.md', '---\ntene:\n  doc: plan\n---\n')
    write(root, 'docs/sprints/checkout-retry-payment/02-design/design.md', '---\ntene:\n  doc: design\n---\n')

    const { summary, applied } = await resync(root, 'checkout-retry', { docsRoot: 'docs/sprints' })
    assert.equal(applied, true)
    assert.equal(summary.phase, 'do', 'design 이 있으면 구현 중으로 본다')
    assert.match(summary.phaseBasis, /design\.md/)
    assert.equal(summary.ac.total, 1)
    assert.equal(summary.ac.pending, 1, 'qa 가 없으므로 판정은 pending')

    const s = store.readSprint(root, 'checkout-retry')
    assert.equal(s.title, '결제 실패 시 입력값 보존')
    assert.deepEqual(Object.values(s.gates).filter(Boolean), [], '게이트는 재판정하지 않는다')
    assert.ok(summary.warnings.some((w) => /게이트는 복구하지 않았습니다/.test(w)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('디렉토리가 없으면 SPRINT_DIR_NOT_FOUND', async () => {
  const root = tmpProject()
  try {
    await assert.rejects(
      () => resync(root, 'nope', { docsRoot: 'docs/sprints' }),
      (e) => e.code === 'SPRINT_DIR_NOT_FOUND',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
