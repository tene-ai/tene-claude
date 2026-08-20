/** 훅 핸들러 — D13 §2.7 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseAcRefs, parsePhaseFromTitle } from '../../lib/hooks/task-created.js'

function tmpProject() {
  const root = mkdtempSync(join(tmpdir(), 'tene-test-'))
  mkdirSync(join(root, '.git'), { recursive: true })
  return root
}

/** 훅은 cwd 로 프로젝트를 찾는다. 원복을 보장한다. */
async function inProject(root, fn) {
  const prev = process.cwd()
  process.chdir(root)
  try {
    return await fn()
  } finally {
    process.chdir(prev)
  }
}

// ── task-created 파싱 ────────────────────────────────────────────────

test('태스크 제목의 [Phase] 접두어를 읽는다', () => {
  assert.equal(parsePhaseFromTitle('[QA] AC 검증'), 'qa')
  assert.equal(parsePhaseFromTitle('[Do] T2 입력값 보존'), 'do')
  assert.equal(parsePhaseFromTitle('[LoopCheck] 일치율'), 'loop-check')
  assert.equal(parsePhaseFromTitle('[Check] 갭 분석'), 'loop-check', 'Check 는 loop-check 의 별칭')
})

test('tene 태스크가 아니면 null — 남의 태스크에 끼어들지 않는다', () => {
  assert.equal(parsePhaseFromTitle('일반 작업'), null)
  assert.equal(parsePhaseFromTitle('[Sprint] checkout-retry'), null, 'Sprint 는 phase 가 아니다')
  assert.equal(parsePhaseFromTitle('[Bogus] 무언가'), null)
  assert.equal(parsePhaseFromTitle(''), null)
  assert.equal(parsePhaseFromTitle(undefined), null)
})

test('AC 참조는 숫자로 시작하는 것만 — 영어 문장에서 오탐하지 않는다', () => {
  assert.deepEqual(parseAcRefs('[Do] T2 입력값 보존 (AC-1)'), ['ac_1'])
  assert.deepEqual(parseAcRefs('[Design] 분류 (ac_2, ac_3)'), ['ac_2', 'ac_3'])
  assert.deepEqual(parseAcRefs('[QA] verify AC coverage'), [], '"AC coverage" 를 ac_coverage 로 읽으면 안 된다')
  assert.deepEqual(parseAcRefs('[QA] AC 검증'), [])
})

// ── session-start ────────────────────────────────────────────────────

test('상태가 없으면 아무것도 주입하지 않는다', async () => {
  const root = tmpProject()
  try {
    const { run } = await import('../../lib/hooks/session-start.js')
    const res = await inProject(root, () => run({}))
    assert.equal(res.exit, 0)
    assert.equal(res.stdout, undefined, '설치했다고 말을 걸지 않는다')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('손상된 current.json 이어도 조용히 통과한다 (fail-open)', async () => {
  const root = tmpProject()
  try {
    mkdirSync(join(root, '.tene-claude', 'state'), { recursive: true })
    writeFileSync(join(root, '.tene-claude', 'state', 'current.json'), '{broken')

    const { run } = await import('../../lib/hooks/session-start.js')
    const res = await inProject(root, () => run({}))
    assert.equal(res.exit, 0)
    assert.equal(res.stdout, undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('활성 sprint 가 있으면 요약을 stdout 으로 낸다', async () => {
  const root = tmpProject()
  try {
    mkdirSync(join(root, '.tene-claude', 'state'), { recursive: true })
    writeFileSync(join(root, '.tene-claude', 'state', 'current.json'), JSON.stringify({
      schemaVersion: 1, activeSprint: 'checkout-retry', phase: 'qa', profile: 'standard',
      docsRoot: 'docs/sprints', sprintDir: 'checkout-retry-payment',
      summary: {
        gate: { id: 'G6', result: 'fail' },
        ac: { total: 3, passed: 2, failed: 1, insufficient: 0, stale: 0, blockingFailed: 1, waived: 0 },
        loopChecks: { count: 1, max: 3 },
        blocking: [{ kind: 'ac', id: 'ac_2', reason: '실패 기록 없음' }],
      },
      nextAction: { skill: 'loop-check', reason: 'blocking AC 1건 미충족', alternatives: [] },
    }))

    const { run } = await import('../../lib/hooks/session-start.js')
    const res = await inProject(root, () => run({}))
    assert.match(res.stdout, /checkout-retry/)
    assert.match(res.stdout, /ac_2/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ── compact ──────────────────────────────────────────────────────────

test('pre-compact 는 아무것도 주입하지 않는다', async () => {
  const root = tmpProject()
  try {
    const { run } = await import('../../lib/hooks/compact.js')
    const res = await inProject(root, () => run({}, 'pre-compact'))
    assert.equal(res.exit, 0)
    assert.equal(res.hookSpecificOutput, undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('post-compact 는 압축되었다는 사실과 함께 상태를 다시 싣는다', async () => {
  const root = tmpProject()
  try {
    mkdirSync(join(root, '.tene-claude', 'state'), { recursive: true })
    writeFileSync(join(root, '.tene-claude', 'state', 'current.json'), JSON.stringify({
      schemaVersion: 1, activeSprint: 'x', phase: 'do', profile: 'standard',
      docsRoot: 'docs/sprints', sprintDir: 'x-demo',
      summary: { gate: null, ac: { total: 0 }, loopChecks: { count: 0, max: 3 }, blocking: [] },
      nextAction: { skill: 'loop-check', reason: '구현 검증', alternatives: [] },
    }))

    const { run } = await import('../../lib/hooks/compact.js')
    const res = await inProject(root, () => run({}, 'post-compact'))
    const ctx = res.hookSpecificOutput.additionalContext
    assert.match(ctx, /압축되었습니다/, '이 문맥이 대화에서 온 것이 아님을 밝혀야 한다')
    assert.match(ctx, /진행 중: x/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
