/**
 * 정직성 Eval — D13 §4.4
 *
 * **이 테스트가 실패하면 릴리스를 중단한다.**
 *
 * 여기서 검증하는 것은 "잘 찾는가" 가 아니라 **"모르는 것을 모른다고 하는가"** 다.
 * 잘 못 찾는 것은 개선의 문제이지만, 모르는 것을 안다고 하는 것은 신뢰의 문제다.
 * 후자가 한 번 무너지면 이 도구의 모든 판정이 의심스러워진다.
 *
 * 에이전트(LLM)가 필요한 케이스(E-2 인터뷰, E-7 판정)는 여기서 다루지 않는다.
 * 결정론 도구가 답하는 부분만 고정한다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { buildAndWrite } from '../lib/scan/index-builder.js'
import { classifyIndex, findViolations, loadRules } from '../lib/scan/layer.js'
import { layerCapability, probe } from '../lib/qa/capability.js'
import { buildAnchorIndex, unattributed } from '../lib/scan/anchors.js'
import { pluginRoot } from '../lib/util/paths.js'

const EVALS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'evals', 'fixtures')
const PRESET = join(pluginRoot(), 'templates', 'layers.default.yml')

/** 픽스처를 임시 디렉토리로 복사한다 — 인덱스가 원본을 더럽히지 않게 */
function fixture(name) {
  const root = mkdtempSync(join(tmpdir(), `tene-eval-${name}-`))
  cpSync(join(EVALS, name), root, { recursive: true })
  execFileSync('git', ['init', '-q', root], { stdio: 'ignore' })
  return root
}

function expected(root, file) {
  return JSON.parse(readFileSync(join(root, '.expected', file), 'utf8'))
}

// ── E-4 · 미분류를 미분류로 보고하는가 ────────────────────────────────

test('E-4 [정직성] 규칙에 없는 디렉토리를 추측으로 배정하지 않는다', (t) => {
  const root = fixture('flat-app')
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const { index } = buildAndWrite(root)
  const rules = loadRules(root, { presetPath: PRESET })
  const c = classifyIndex(index, rules)
  const exp = expected(root, 'layers.json')

  const unclassifiedPaths = c.unclassified.map((u) => u.path).sort()
  assert.deepEqual(unclassifiedPaths, exp.mustBeUnclassified.sort(),
    `미분류여야 할 파일이 배정되었습니다. 실제 미분류: ${unclassifiedPaths.join(', ')}`)

  // 분류된 것은 정확해야 한다
  for (const [path, layer] of Object.entries(exp.classified)) {
    const found = c.byLayer[layer]?.some((f) => f.path === path)
    assert.ok(found, `${path} 가 ${layer} 로 분류되지 않았습니다`)
  }

  // 미분류가 반복되면 규칙을 제안해야 한다 — 미분류를 방치하지 않는다
  const patterns = c.suggestions.map((s) => s.pattern).sort()
  assert.deepEqual(patterns, exp.expectSuggestions.sort(),
    '반복되는 미분류 디렉토리에 규칙을 제안해야 합니다')
})

test('E-4 [정직성] 낮은 확신을 높은 확신으로 올리지 않는다', (t) => {
  const root = fixture('flat-app')
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const { index } = buildAndWrite(root)
  const rules = loadRules(root, { presetPath: PRESET })
  const c = classifyIndex(index, rules)

  // 경로 규칙으로 분류된 것만 high 다. import 추론은 medium 이 상한.
  for (const [layer, files] of Object.entries(c.byLayer)) {
    for (const f of files) {
      if (f.confidence === 'high') {
        assert.ok(f.matchedRule, `${f.path} 가 근거(matchedRule) 없이 high 입니다`)
      }
    }
  }
})

// ── E-3 · 계층 위반을 찾아내는가 ──────────────────────────────────────

test('E-3 심어둔 계층 위반 2건을 정확히 찾는다', (t) => {
  const root = fixture('layered-app')
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const { index } = buildAndWrite(root)
  const rules = loadRules(root, { presetPath: PRESET })
  const found = findViolations(index, rules)
  const exp = expected(root, 'violations.json')

  assert.equal(found.length, exp.expected.length,
    `위반 ${exp.expected.length}건을 기대했으나 ${found.length}건: ${JSON.stringify(found.map((v) => v.kind))}`)

  for (const e of exp.expected) {
    const hit = found.find((v) => v.kind === e.kind && v.file === e.file)
    assert.ok(hit, `${e.kind} (${e.file}) 를 찾지 못했습니다`)
    assert.equal(hit.severity, e.severity)
    assert.equal(hit.target, e.target, '위반은 위반한 파일에 귀속되어야 합니다')
  }
})

// ── E-10 · 도구가 없을 때 위장하지 않는가 ─────────────────────────────

test('E-10 [정직성] 도구가 없으면 없다고 하고 0%/passed 로 위장하지 않는다', (t) => {
  const root = fixture('no-tools-app')
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const cap = probe(root)
  const exp = expected(root, 'capability.json')

  for (const key of exp.expectNull) {
    assert.equal(cap[key], null, `${key} 가 없는데 있다고 보고했습니다`)
  }
  // 브라우저는 none 이 아니라 unknown — 스킬이 Chrome MCP 를 판단한다
  assert.equal(cap.browser.kind, exp.expectBrowserKind,
    'Chrome MCP 를 감지할 수 없으므로 none 이 아니라 unknown 이어야 합니다')

  const runnable = layerCapability(cap)
  for (const l of exp.mustNotBeRunnable) {
    assert.equal(runnable[l], false, `${l} 을 실행할 수 없는데 가능하다고 보고했습니다`)
  }

  // 무엇이 없어서 못 하는지 밝혀야 한다
  const missing = cap.limitations.map((x) => x.missing)
  for (const m of exp.expectLimitations) {
    assert.ok(missing.includes(m), `한계 목록에 ${m} 이 없습니다`)
  }
})

test('E-10 [정직성] 도구 없음을 not-applicable 로 바꾸지 않는다', async (t) => {
  const root = fixture('no-tools-app')
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const { applyCapability } = await import('../lib/qa/layers.js')
  const cap = probe(root)
  const preset = applyCapability(['L1', 'L2', 'L5'], layerCapability(cap), cap)

  for (const [layer, h] of Object.entries(preset)) {
    assert.equal(h.state, 'required',
      `${layer} 을 not-applicable 로 바꿨습니다 — 도구가 없는 것과 해당 없는 것은 다릅니다`)
    assert.equal(h.result, 'insufficient')
    assert.ok(h.reason, `${layer} 에 사유가 없습니다`)
  }
})

// ── E-12 · 스펙 밖 변경을 보고하는가 ──────────────────────────────────

test('E-12 [정직성] 앵커에 걸리지 않은 변경을 미귀속으로 보고한다', (t) => {
  const root = fixture('unattributed-app')
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const { index } = buildAndWrite(root)
  const exp = expected(root, 'gaps.json')

  const anchors = buildAnchorIndex(index, exp.anchoredAc.map((a) => ({
    sprintId: 's', acId: a.id, anchors: a.anchors,
  })))

  const changed = ['src/payments/process.ts', 'src/utils/extra.ts']
  const out = unattributed(anchors, changed)

  for (const p of exp.mustBeUnattributed) {
    assert.ok(out.includes(p), `${p} 를 미귀속으로 보고하지 않았습니다 — 범위가 조용히 늘어납니다`)
  }
  for (const p of exp.mustNotBeUnattributed) {
    assert.equal(out.includes(p), false, `${p} 는 앵커되어 있는데 미귀속으로 보고했습니다`)
  }
})

// ── E-7 · 증거가 없을 때 ──────────────────────────────────────────────

test('E-7 [정직성] 인덱스로 답할 수 없으면 needs-investigation 을 낸다', async (t) => {
  const root = fixture('no-tools-app')
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const { definitions } = await import('../lib/scan/query.js')
  const { index } = buildAndWrite(root)

  const miss = definitions(index, 'noSuchSymbol')
  assert.equal(miss.ok, false)
  assert.equal(miss.source, 'needs-investigation',
    '없는 것을 빈 결과로 내면 "확인했고 없다" 로 읽힙니다')
  assert.ok(miss.hint, '왜 답할 수 없는지 밝혀야 합니다')
})

test('E-7 [정직성] 6질문에서 모르는 항목을 지어내지 않는다', async (t) => {
  const root = fixture('no-tools-app')
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const { answerSix } = await import('../lib/scan/questions.js')
  const { index } = buildAndWrite(root)

  // 타입 표기가 없는 함수 — Q5/Q6 를 확신할 수 없다
  const r = answerSix(index, 'fn')
  assert.ok(r.unanswered.includes('q6'), '반환 타입이 없는데 답했다고 하면 안 됩니다')
  assert.equal(r.answers.q6.answer, null)
  assert.ok(r.answers.q6.reason)
})

// ── E-1 · 실제 웹앱 구조에서 프리셋이 맞는가 ──────────────────────────

test('E-1 기본 프리셋이 실제 Express 앱 구조를 정확히 분류한다', (t) => {
  const root = fixture('express-app')
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const { index } = buildAndWrite(root)
  const rules = loadRules(root, { presetPath: PRESET })
  const c = classifyIndex(index, rules)
  const exp = expected(root, 'layers.json')

  const actual = {}
  for (const [layer, files] of Object.entries(c.byLayer)) {
    for (const f of files) actual[f.path] = layer
  }

  const wrong = []
  for (const [path, want] of Object.entries(exp.expect)) {
    if (actual[path] !== want) wrong.push(`${path}: ${actual[path] ?? '미분류'} (기대 ${want})`)
  }
  assert.deepEqual(wrong, [],
    `프로젝트 규칙 없이 프리셋만으로 분류한 결과가 다릅니다:\n${wrong.join('\n')}`)

  // 테스트는 구현과 분리되어야 한다
  const testPaths = (c.byLayer.test ?? []).map((f) => f.path)
  assert.deepEqual(testPaths.sort(), exp.expectTest.sort())

  // 공통 유틸이 미분류로 남는 것은 정상이다 (추측으로 배정하지 않는다)
  const un = c.unclassified.map((u) => u.path)
  for (const p of un) {
    assert.ok(exp.acceptUnclassified.includes(p), `예상치 못한 미분류: ${p}`)
  }
})

test('E-1 Python 프로젝트도 경로·import 로 분류한다', (t) => {
  const root = fixture('fastapi-app')
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const { index } = buildAndWrite(root)
  const rules = loadRules(root, { presetPath: PRESET })
  const c = classifyIndex(index, rules)
  const exp = expected(root, 'layers.json')

  const actual = {}
  for (const [layer, files] of Object.entries(c.byLayer)) {
    for (const f of files) actual[f.path] = layer
  }

  const wrong = []
  for (const [path, want] of Object.entries(exp.expect)) {
    if (actual[path] !== want) wrong.push(`${path}: ${actual[path] ?? '미분류'} (기대 ${want})`)
  }
  assert.deepEqual(wrong, [], wrong.join('\n'))

  // 모호한 디렉토리(src/core)는 추측하지 않는다
  const un = c.unclassified.map((u) => u.path)
  for (const p of un) assert.ok(exp.acceptUnclassified.includes(p), `예상치 못한 미분류: ${p}`)
})

test('E-1 Python 심볼과 호출 관계를 찾는다', async (t) => {
  const root = fixture('fastapi-app')
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const { definitions, callers } = await import('../lib/scan/query.js')
  const { index } = buildAndWrite(root)

  const def = definitions(index, 'create_order')
  assert.equal(def.ok, true)
  assert.equal(def.results[0].file, 'src/services/order.py')

  const use = callers(index, 'create_order')
  assert.ok(use.results.some((r) => r.file === 'src/api/orders.py'),
    'API 계층에서 서비스를 부르는 관계를 찾아야 한다')
})

test('E-1 실제 프로젝트의 검증 도구를 정확히 감지한다', async (t) => {
  const root = fixture('express-app')
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const { probe: p2, layerCapability: lc } = await import('../lib/qa/capability.js')
  const cap = p2(root)

  assert.equal(cap.testRunner?.kind, 'npm')
  assert.ok(cap.typechecker, 'tsconfig.json 이 있으면 타입체커를 찾아야 한다')
  assert.ok(cap.linter, 'scripts.lint 가 있으면 린터를 찾아야 한다')
  // 브라우저는 없다 — 없다고 말해야지 있다고 하면 UX 검증이 거짓 통과한다
  assert.equal(lc(cap).L5, false)
})

test('상대 경로 root 로도 lib 를 쓸 수 있다', async (t) => {
  const { assertInProject } = await import('../lib/util/paths.js')
  // bin 은 절대 경로로 바꿔주지만 lib 를 직접 쓰는 코드는 그렇지 않다
  assert.doesNotThrow(() => assertInProject('.tene-claude/x.json', 'evals/fixtures/express-app'))
  assert.throws(() => assertInProject('../../../etc/passwd', 'evals/fixtures/express-app'),
    (e) => e.code === 'PATH_ESCAPE')
})

// ── 종합 ──────────────────────────────────────────────────────────────

test('정직성 케이스가 전부 정의되어 있다', () => {
  // E-2(인터뷰)와 일부 E-7(판정)은 에이전트가 필요해 여기서 다루지 않는다.
  // 그 사실을 명시해 "전부 검증됐다" 는 오해를 막는다.
  // 결정론 도구가 답하는 것
  const deterministic = ['E-1', 'E-3', 'E-4', 'E-7(질의)', 'E-10', 'E-12']
  assert.equal(deterministic.length, 6)

  // LLM 판단이 필요한 것 — 프롬프트 계약은 agent-contract.test.js 가 고정한다
  const promptGuarded = ['E-2 (인터뷰가 실패 경로를 묻는가)', 'E-7 (판정자가 증거 없이 passed 를 내는가)']
  assert.ok(promptGuarded.length,
    '이 둘은 프롬프트에 안전 장치가 있는지로 방어한다 — 판단 자체는 실행해봐야 안다')
})
