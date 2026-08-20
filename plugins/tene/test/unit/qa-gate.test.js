/** QA·게이트 — D13 §2.10 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseDoc } from '../../lib/doc/parser.js'
import { evaluateGate, GATES, gateForTransition } from '../../lib/gate/rules.js'
import { compile, extractForbidden, selectVariants } from '../../lib/qa/charter.js'
import { applyCapability, planLayers, selectLayers, validateHandling } from '../../lib/qa/layers.js'
import { detectTestRunner, layerCapability, probe } from '../../lib/qa/capability.js'
import { computeTransitionCoverage, crossJudgeDataFlow, planReturnPaths, summarizeReturnPaths } from '../../lib/qa/coverage.js'
import {
  addCase, judgeInput, newManifest, redact, registerArtifact,
  scanSecrets, sha256, verifyEvidence,
} from '../../lib/qa/evidence.js'

function tmpRepo(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'tene-qa-'))
  mkdirSync(join(root, '.git'), { recursive: true })
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel)
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, content)
  }
  return root
}

const AC_UX = { id: 'ac_1', statement: '**When** 결제를 제출하면, 시스템은 결과를 보여야 한다', method: 'UX', priority: 'blocking', pattern: 'event' }
const AC_DATA = { id: 'ac_2', statement: '**If** 결제가 실패하면, **then** 시스템은 사유를 기록해야 한다', method: 'DATA', priority: 'blocking', pattern: 'unwanted' }

// ── 레이어 선택 ───────────────────────────────────────────────────────

test('method 에 따라 레이어를 고른다', () => {
  assert.deepEqual(selectLayers({ method: 'UNIT' }), ['L1', 'L2'])
  assert.deepEqual(selectLayers({ method: 'DATA' }), ['L1', 'L2', 'L3'])
  assert.deepEqual(selectLayers({ method: 'UX' }), ['L1', 'L4', 'L5'])
})

test('If-then 기준은 L6(실패·복구)를 요구한다', () => {
  assert.ok(selectLayers(AC_DATA).includes('L6'), '실패 경로를 정의해놓고 검증하지 않으면 의미가 없다')
})

test('선택되지 않은 레이어도 목록으로 남긴다', () => {
  const plan = planLayers([{ id: 'a', method: 'UNIT' }])
  assert.ok(plan.notSelected.includes('L5'))
})

test('required 인데 결과가 없으면 미해결 — G6 을 막는다', () => {
  const v = validateHandling({ L1: { state: 'required' } }, ['L1'])
  assert.deepEqual(v.unresolved, ['L1'])
  assert.equal(v.ok, false)
})

test('not-applicable 은 사유가 있어야 한다', () => {
  const bad = validateHandling({ L4: { state: 'not-applicable' } }, [])
  assert.ok(bad.problems.some((p) => p.kind === 'no_reason'))

  const good = validateHandling({ L4: { state: 'not-applicable', reason: '단일 서비스' } }, [])
  assert.equal(good.problems.filter((p) => p.layer === 'L4').length, 0)
})

test('insufficient 도 사유가 있어야 한다 — 다음에 뭘 갖출지 알아야 하므로', () => {
  const v = validateHandling({ L2: { state: 'required', result: 'insufficient' } }, ['L2'])
  assert.ok(v.problems.some((p) => p.kind === 'no_reason'))
  assert.equal(v.unresolved.length, 0, '사유가 없어도 미해결은 아니다 (결과는 있으므로)')
})

test('도구가 없으면 insufficient 로 미리 표시하되 not-applicable 로 바꾸지 않는다', () => {
  const cap = { testRunner: null, browser: { kind: 'unknown' }, httpClient: {}, linter: null, typechecker: null }
  const preset = applyCapability(['L2', 'L5'], layerCapability(cap), cap)
  assert.equal(preset.L2.result, 'insufficient')
  assert.equal(preset.L2.state, 'required', '도구가 없는 것과 해당 없는 것은 다르다')
  assert.deepEqual(preset.L2.missingCapability, ['testRunner'])
})

test('실행 가능한 레이어는 미리 정하지 않는다', () => {
  const cap = { testRunner: { kind: 'npm' }, browser: { kind: 'playwright' }, httpClient: {}, linter: {}, typechecker: {} }
  const preset = applyCapability(['L1', 'L2', 'L5'], layerCapability(cap), cap)
  assert.deepEqual(Object.keys(preset), [], '전부 실행 가능하면 미리 표시할 것이 없다')
})

// ── Capability ────────────────────────────────────────────────────────

test('테스트 러너를 파일로 감지한다', () => {
  const root = tmpRepo({ 'package.json': '{"scripts":{"test":"node --test"}}' })
  try {
    assert.equal(detectTestRunner(root).kind, 'npm')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('브라우저는 감지 실패 시 none 이 아니라 unknown — Chrome MCP 를 스킬이 판단한다', () => {
  const root = tmpRepo({})
  try {
    const cap = probe(root)
    assert.equal(cap.browser.kind, 'unknown')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('스킬이 주입한 capability 가 감지보다 우선한다', () => {
  const root = tmpRepo({})
  try {
    const cap = probe(root, { injected: { browser: { kind: 'chrome-mcp' } } })
    assert.equal(cap.browser.kind, 'chrome-mcp')
    assert.equal(layerCapability(cap).L5, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ── Charter ───────────────────────────────────────────────────────────

test('If-then 기준에서 error 변형을 만든다', () => {
  assert.ok(selectVariants(AC_DATA).includes('error'))
  assert.ok(selectVariants(AC_UX).includes('happy'))
})

test('DATA 기록 기준에는 중복 생성 금지가 붙는다', () => {
  const f = extractForbidden(AC_DATA)
  assert.ok(f.some((x) => /2건 이상/.test(x)))
})

test('AC 가 없으면 charter 를 만들지 않고 경고한다', () => {
  const { charters, warnings } = compile({}, [])
  assert.equal(charters.length, 0)
  assert.ok(warnings.length)
})

test('charter 가 AC 문장을 단계로 나눈다 — 트리거와 기대를 분리한다', () => {
  const { charters } = compile({}, [AC_DATA])
  const steps = charters[0].steps
  assert.equal(steps[0].kind, 'trigger-failure')
  assert.match(steps[0].action, /결제가 실패하면/)
  assert.equal(steps[1].kind, 'expect')
  assert.match(steps[1].expectedData, /사유를 기록/)
})

// ── 전이 커버리지 ─────────────────────────────────────────────────────

const DESIGN = parseDoc(`---
tene:
  doc: design
---
## 전이 <!-- tene:sec=transitions -->

| 엣지 | 트리거 | 대상 AC |
|---|---|---|
| Checkout → Processing | 제출 | ac_1 |
| Processing → Result | 완료 | ac_1 |
| Processing → Error | 실패 | ac_2 |
`)

test('분모는 design 전이 표다 — QA 가 스스로 정하지 않는다', () => {
  const cov = computeTransitionCoverage(DESIGN, { cases: [{ ac: 'ac_1', edge: 'Checkout→Processing', result: 'pass' }] })
  assert.equal(cov.total, 3)
  assert.equal(cov.measured, 1)
  assert.equal(cov.percent, 33)
  assert.equal(cov.unmeasured.length, 2, '측정 못 한 엣지를 목록으로 내야 한다')
})

test('전이 표가 없으면 비율을 만들지 않는다', () => {
  const cov = computeTransitionCoverage(parseDoc('---\ntene:\n  doc: design\n---\n'), { cases: [] })
  assert.equal(cov.percent, null, '0/0 을 100% 로 쓰면 거짓말이다')
  assert.ok(cov.note)
})

test('되돌아오는 경로는 설계에 없어도 검증 대상이다', () => {
  const planned = planReturnPaths({ hasUxAc: true, hasFormSubmit: true, hasFailurePath: true })
  assert.equal(planned.length, 4)
  const s = summarizeReturnPaths(planned, { refresh_recovers: { result: 'pass' } })
  assert.equal(s.insufficient, 3, '측정 안 한 것은 insufficient 다')
})

test('정적 확인만으로 passed 를 주지 않는다', () => {
  assert.equal(crossJudgeDataFlow(true, false).result, 'insufficient')
  assert.equal(crossJudgeDataFlow(true, true).result, 'pass')
  assert.equal(crossJudgeDataFlow(false, false).result, 'fail')
})

// ── 증거 ──────────────────────────────────────────────────────────────

test('증거 해시가 다르면 무효', () => {
  const root = tmpRepo({ 'ev/a.log': 'observed output' })
  try {
    const sprint = { id: 's', docsRoot: '.', sprintDir: '' }
    const manifest = newManifest('s')
    // evidenceDir 를 맞추기 위해 직접 구성
    const dir = join(root, 'ev')
    manifest.artifacts.push({
      id: 'a1', path: 'a.log', kind: 'log',
      sha256: sha256(Buffer.from('observed output')), createdAt: '2026-08-20T00:00:00Z',
    })
    assert.equal(verifyEvidence(manifest, 'a1', { dir }).ok, true)

    writeFileSync(join(dir, 'a.log'), 'tampered')
    const bad = verifyEvidence(manifest, 'a1', { dir })
    assert.equal(bad.ok, false)
    assert.match(bad.reason, /해시 불일치/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('증거가 코드 변경보다 오래되면 무효 (freshness)', () => {
  const root = tmpRepo({ 'ev/a.log': 'x' })
  try {
    const dir = join(root, 'ev')
    const manifest = newManifest('s')
    manifest.artifacts.push({ id: 'a1', path: 'a.log', kind: 'log', sha256: sha256(Buffer.from('x')), createdAt: '2026-08-19T00:00:00Z' })

    const r = verifyEvidence(manifest, 'a1', { dir, lastCodeChangeAt: '2026-08-20T00:00:00Z' })
    assert.equal(r.ok, false)
    assert.match(r.reason, /이전입니다/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('판정자 입력에 runner 의 결론이 들어가지 않는다', () => {
  const manifest = newManifest('s')
  addCase(manifest, { id: 'c1', ac: 'ac_1', layer: 'L5', observed: '화면이 Result 로 바뀜', artifacts: [] })
  const input = judgeInput(manifest, 'ac_1', { ac: AC_UX, charter: {} })

  const json = JSON.stringify(input)
  assert.equal(json.includes('verdict'), false, 'runner 의 판정이 섞이면 판정자가 그것을 따라간다')
  assert.equal(input.evidence.cases[0].observed, '화면이 Result 로 바뀜')
})

test('증거에서 시크릿을 찾아내고 가린다', () => {
  const text = 'token=ghp_abcdefghijklmnopqrstuvwxyz0123456789 and AKIAIOSFODNN7EXAMPLE'
  const hits = scanSecrets(text)
  assert.ok(hits.some((h) => h.kind === 'github_token'))
  assert.ok(hits.some((h) => h.kind === 'aws_access_key'))

  const clean = redact(text)
  assert.equal(clean.includes('ghp_abcdefghijklmnopqrstuvwxyz0123456789'), false)
  assert.match(clean, /REDACTED/)
})

// ── 게이트 ────────────────────────────────────────────────────────────

const SPRINT = {
  id: 'x', title: '데모', profile: 'standard', phase: 'qa',
  docsRoot: 'docs/sprints', sprintDir: 'x',
  docs: {}, ac: [], waivers: [],
}

function gateCtx(over = {}) {
  return {
    root: '/x',
    sprint: { ...SPRINT, ...(over.sprint ?? {}) },
    docs: over.docs ?? {},
    loop: over.loop,
    qa: over.qa,
    changedFiles: over.changedFiles,
    verifyEvidence: over.verifyEvidence,
  }
}

test('전이에서 게이트를 찾는다', () => {
  assert.equal(gateForTransition('qa', 'report'), 'G6')
  assert.equal(gateForTransition('qa', 'do'), null, '되돌아가는 전이에는 게이트가 없다')
})

test('G0: id 와 제목을 검사한다', () => {
  assert.equal(evaluateGate('G0', gateCtx()).result, 'pass')
  assert.equal(evaluateGate('G0', gateCtx({ sprint: { title: '' } })).result, 'fail')
  assert.equal(evaluateGate('G0', gateCtx({ sprint: { id: 'Bad_Id' } })).result, 'fail')
})

test('G5: blocking 갭이 있으면 막는다', () => {
  const r = evaluateGate('G5', gateCtx({
    sprint: { docs: { loopCheck: ['03-analysis/loop-check-1.md'] } },
    loop: { blockingGaps: 2, unattributedUnresolved: 0 },
  }))
  assert.equal(r.result, 'fail')
  assert.ok(r.findings.some((f) => f.id === 'blocking_gaps_zero'))
})

test('G5: 미귀속이 남으면 blocking 0 이어도 막는다', () => {
  const r = evaluateGate('G5', gateCtx({
    sprint: { docs: { loopCheck: ['x.md'] } },
    loop: { blockingGaps: 0, unattributedUnresolved: 1 },
  }))
  assert.ok(r.findings.some((f) => f.id === 'unattributed_resolved'))
})

test('G5: loop 결과가 없으면 통과시키지 않는다', () => {
  const r = evaluateGate('G5', gateCtx({ sprint: { docs: { loopCheck: ['x.md'] } } }))
  assert.ok(r.findings.some((f) => f.id === 'blocking_gaps_zero'))
})

test('G6: blocking AC 가 passed 가 아니면 막는다', () => {
  const r = evaluateGate('G6', gateCtx({
    sprint: { ac: [{ id: 'ac_1', priority: 'blocking', verdict: 'failed' }] },
  }))
  assert.ok(r.findings.some((f) => f.id === 'blocking_ac_all_passed' && /ac_1\(failed\)/.test(f.detail)))
})

test('G6: waiver 가 있으면 그 AC 는 통과로 본다', () => {
  const r = evaluateGate('G6', gateCtx({
    sprint: {
      ac: [{ id: 'ac_1', priority: 'blocking', verdict: 'failed' }],
      waivers: [{ ac: 'ac_1', reason: 'PG사 샌드박스 미지원' }],
    },
  }))
  assert.equal(r.findings.filter((f) => f.id === 'blocking_ac_all_passed').length, 0)
})

test('G6: stale 이 있으면 막는다 — 코드가 바뀌어 판정이 무효다', () => {
  const r = evaluateGate('G6', gateCtx({
    sprint: { ac: [{ id: 'ac_1', priority: 'blocking', verdict: 'stale' }] },
  }))
  assert.ok(r.findings.some((f) => f.id === 'stale_zero'))
})

test('G6: insufficient 는 막지 않지만 목록에 남는다', () => {
  const r = evaluateGate('G6', gateCtx({
    sprint: { ac: [{ id: 'ac_1', priority: 'non-blocking', verdict: 'insufficient' }] },
  }))
  assert.equal(r.findings.filter((f) => f.id === 'blocking_ac_all_passed').length, 0)
  assert.deepEqual(r.insufficient, ['ac_1'], '보고서 R6 에 실려야 하므로 목록으로 낸다')
})

test('G6: passed 인데 증거가 없으면 막는다', () => {
  const r = evaluateGate('G6', gateCtx({
    sprint: { ac: [{ id: 'ac_1', priority: 'blocking', verdict: 'passed' }] },
  }))
  assert.ok(r.findings.some((f) => f.id === 'evidence_valid' && /증거 참조 없음/.test(f.detail)))
})

test('G4: git 을 못 읽으면 막지 않되 건너뛴 사실을 남긴다', () => {
  const r = evaluateGate('G4', gateCtx({ changedFiles: null }))
  assert.equal(r.result, 'pass')
  assert.match(r.checks[0].detail, /확인할 수 없어/)
})

test('검사 중 오류가 나도 통과로 넘기지 않는다', () => {
  const r = evaluateGate('G6', gateCtx({
    sprint: { ac: [{ id: 'ac_1', priority: 'blocking', verdict: 'passed', evidenceRef: 'x' }] },
    verifyEvidence: () => { throw new Error('boom') },
  }))
  assert.equal(r.result, 'fail')
  assert.ok(r.findings.some((f) => /검사 중 오류/.test(f.detail)))
})

test('모든 게이트가 검사 목록을 갖는다', () => {
  for (const [id, g] of Object.entries(GATES)) {
    assert.ok(g.checks.length > 0, `${id} 에 검사가 없다`)
    assert.ok(g.from && g.to, `${id} 의 from/to 가 없다`)
  }
})
