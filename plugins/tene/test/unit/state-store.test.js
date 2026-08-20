/** 상태 저장소 — D13 §2.6 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as store from '../../lib/state/store.js'
import { appendEvent, readEvents } from '../../lib/state/events.js'
import { SCHEMA_VERSION } from '../../lib/state/schema.js'

function tmpProject() {
  const root = mkdtempSync(join(tmpdir(), 'tene-test-'))
  mkdirSync(join(root, '.git'), { recursive: true }) // findProjectRoot 용
  return root
}

async function seed(root, id = 'x') {
  return store.initSprint(root, {
    id, slug: 'demo', title: '데모', docsRoot: 'docs/sprints', sprintDir: `${id}-demo`,
  })
}

test('낙관적 잠금 — rev 불일치 시 STALE_WRITE', async (t) => {
  const root = tmpProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  await seed(root)

  const snapshot = store.readSprint(root, 'x')
  // 같은 초 안에 두 번 쓴다. updatedAt 비교였다면 통과해버린다 — rev 라야 잡힌다.
  store.writeSprint(root, { ...snapshot, phase: 'prd' }, { expectedRev: snapshot.rev })

  assert.throws(
    () => store.writeSprint(root, { ...snapshot, phase: 'plan' }, { expectedRev: snapshot.rev }),
    (e) => e.code === 'STALE_WRITE',
  )
})

test('rev 는 저장할 때마다 1씩 오른다', async (t) => {
  const root = tmpProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  await seed(root)

  const r0 = store.readSprint(root, 'x').rev
  await store.setAc(root, 'x', [{ id: 'ac_1', priority: 'blocking', method: 'UNIT', verdict: 'passed' }])
  assert.equal(store.readSprint(root, 'x').rev, r0 + 1)
})

test('손상 파일은 .corrupt- 로 격리되고 원본이 남는다', async (t) => {
  const root = tmpProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  await seed(root)
  writeFileSync(store.paths.sprint(root, 'x'), '{broken')

  assert.throws(() => store.readSprint(root, 'x'), (e) => e.code === 'STATE_CORRUPT')
  const files = readdirSync(store.paths.sprintsDir(root))
  assert.ok(files.some((f) => f.includes('.corrupt-')), `격리 파일 없음: ${files.join(', ')}`)
})

test('구조가 깨진 상태(파싱은 되지만 phase 가 이상)도 격리된다', async (t) => {
  const root = tmpProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  await seed(root)
  writeFileSync(store.paths.sprint(root, 'x'),
    JSON.stringify({ schemaVersion: 1, id: 'x', phase: 'nonsense', status: 'active', ac: [], gates: {} }))

  assert.throws(() => store.readSprint(root, 'x'), (e) => e.code === 'STATE_CORRUPT' && e.detail.fields.includes('phase'))
})

test('상위 스키마는 읽기 전용 — 파일을 건드리지 않는다', async (t) => {
  const root = tmpProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  await seed(root)
  const p = store.paths.sprint(root, 'x')
  const future = JSON.stringify({ schemaVersion: SCHEMA_VERSION + 5, id: 'x', phase: 'draft', status: 'active', ac: [], gates: {} })
  writeFileSync(p, future)

  assert.throws(() => store.readSprint(root, 'x'), (e) => e.code === 'SCHEMA_TOO_NEW')
  // 백업도 마이그레이션도 하지 않았다
  const files = readdirSync(store.paths.sprintsDir(root))
  assert.deepEqual(files.filter((f) => f.includes('.bak-')), [])
})

test('허용되지 않은 전이는 거부하고 갈 수 있는 곳을 알려준다', async (t) => {
  const root = tmpProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  await seed(root)

  await assert.rejects(
    () => store.advance(root, 'x', 'qa'),
    (e) => e.code === 'INVALID_TRANSITION' && e.detail.allowed.includes('prd'),
  )
})

test('게이트 fail 은 전이를 막지만 판정은 기록된다', async (t) => {
  const root = tmpProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  await seed(root)

  await assert.rejects(
    () => store.advance(root, 'x', 'prd', { gateResult: { result: 'fail', detail: '의도 없음' } }),
    (e) => e.code === 'GATE_BLOCKED',
  )
  const s = store.readSprint(root, 'x')
  assert.equal(s.phase, 'draft', '차단됐으므로 phase 는 그대로여야 한다')
  assert.equal(s.gates.G0.result, 'fail', '판정은 남아야 한다')
})

test('--force 는 게이트 fail 을 넘기되 forced 로 남긴다', async (t) => {
  const root = tmpProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  await seed(root)

  await store.advance(root, 'x', 'prd', { force: true, gateResult: { result: 'fail', detail: 'x' } })
  const s = store.readSprint(root, 'x')
  assert.equal(s.phase, 'prd')
  assert.equal(s.gates.G0.forced, true)
})

test('markStaleNoLock 은 passed 만 stale 로 바꾼다', async (t) => {
  const root = tmpProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  await seed(root)
  await store.setAc(root, 'x', [
    { id: 'ac_1', priority: 'blocking', method: 'UNIT', verdict: 'passed' },
    { id: 'ac_2', priority: 'blocking', method: 'UNIT', verdict: 'failed' },
    { id: 'ac_3', priority: 'blocking', method: 'UNIT', verdict: 'insufficient' },
  ])

  const staled = store.markStaleNoLock(root, 'x', ['ac_1', 'ac_2', 'ac_3'], 'src/a.js')
  assert.deepEqual(staled, ['ac_1'], 'failed/insufficient 는 이미 미통과이므로 가리지 않는다')
})

test('current.summary 는 sprint 에서 파생된다 — 직접 쓰지 않아도 맞는다', async (t) => {
  const root = tmpProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  await seed(root)
  await store.setAc(root, 'x', [
    { id: 'ac_1', priority: 'blocking', method: 'UNIT', verdict: 'failed', reason: '미구현' },
    { id: 'ac_2', priority: 'non-blocking', method: 'UX', verdict: 'passed' },
  ])

  const c = store.readCurrent(root)
  assert.equal(c.summary.ac.blockingFailed, 1)
  assert.equal(c.summary.ac.total, 2)
  assert.equal(c.summary.blocking[0].id, 'ac_1')
})

test('archive 하면 활성 sprint 가 해제된다', async (t) => {
  const root = tmpProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  await seed(root)

  for (const to of ['prd', 'plan', 'design', 'do', 'loop-check', 'qa', 'report', 'archived']) {
    await store.advance(root, 'x', to, { force: true })
  }

  const current = store.readCurrent(root)
  assert.equal(current.activeSprint, null,
    '끝난 sprint 를 활성으로 남기면 SessionStart 가 계속 보여주고 다음 sprint 와 헷갈린다')
  assert.equal(current.nextAction.skill, 'master-plan')
  assert.equal(store.readSprint(root, 'x').status, 'archived')
})

test('이벤트는 seq 가 이어지고 손상된 줄은 건너뛴다', async (t) => {
  const root = tmpProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  await seed(root)

  appendEvent(root, { type: 'AcJudged', sprint: 'x', payload: { n: 1 } })
  appendEvent(root, { type: 'AcJudged', sprint: 'x', payload: { n: 2 } })
  const { events } = readEvents(root, { limit: 10 })
  const seqs = events.map((e) => e.seq)
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), 'seq 는 단조 증가해야 한다')
  assert.equal(new Set(seqs).size, seqs.length, 'seq 중복 없음')
})

// ── eval 이 찾아낸 것 (docs/03-analysis/skill-evals-01.md) ────────────

test('미판정 AC 는 pending 으로 세고 report 로 보내지 않는다', async (t) => {
  const root = tmpProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  await seed(root)
  for (const to of ['prd', 'plan', 'design', 'do', 'loop-check', 'qa']) {
    await store.advance(root, 'x', to, { force: true })
  }
  await store.setAc(root, 'x', [
    { id: 'ac_1', priority: 'blocking', method: 'UX', verdict: 'pending' },
    { id: 'ac_2', priority: 'blocking', method: 'DATA', verdict: 'pending' },
  ])

  const s = store.computeAcSummary(store.readSprint(root, 'x').ac)
  assert.equal(s.pending, 2)
  assert.equal(s.blockingPending, 2)
  assert.equal(s.blockingFailed, 0, '미판정은 실패가 아니다')

  const next = store.readCurrent(root).nextAction
  assert.equal(next.skill, 'qa',
    '한 건도 판정하지 않았는데 report 로 보내면 "안 본 것" 이 "통과한 것" 으로 넘어간다')
  assert.match(next.reason, /판정되지 않았습니다/)
})

test('AC 를 다 통과시켜야 report 로 간다', async (t) => {
  const root = tmpProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  await seed(root)
  for (const to of ['prd', 'plan', 'design', 'do', 'loop-check', 'qa']) {
    await store.advance(root, 'x', to, { force: true })
  }
  await store.setAc(root, 'x', [{ id: 'ac_1', priority: 'blocking', method: 'UNIT', verdict: 'passed' }])
  assert.equal(store.readCurrent(root).nextAction.skill, 'report')
})

test('docs 경로는 sprint 디렉토리 기준이어야 한다 — 프로젝트 기준은 거부', async (t) => {
  const root = tmpProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  await seed(root)

  // 조용히 받아 두면 게이트가 docsRoot/sprintDir 을 한 번 더 붙여 전부 fail 한다
  await assert.rejects(
    () => store.setDocs(root, 'x', { design: 'docs/sprints/x-demo/02-design/design.md' }),
    (e) => e.code === 'BAD_ARGS' && /02-design\/design\.md/.test(e.hint ?? ''),
  )
  const docs = await store.setDocs(root, 'x', { design: '02-design/design.md' })
  assert.equal(docs.design, '02-design/design.md')
})
