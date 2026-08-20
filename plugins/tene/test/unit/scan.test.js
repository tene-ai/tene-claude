/** 코드 인텔리전스 — D13 §2.8 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PACKS, analyze, validatePack } from '../../lib/scan/langs/index.js'
import * as ts from '../../lib/scan/langs/typescript.js'
import { build, buildAndWrite, checkFreshness, readIndex } from '../../lib/scan/index-builder.js'
import { callers, definitions, indexHealth, orphans, query } from '../../lib/scan/query.js'
import { classifyIndex, findViolations, judgeLayer, loadRules, violationKind } from '../../lib/scan/layer.js'
import { answerSix, parseParams, parseReturn } from '../../lib/scan/questions.js'
import { buildAnchorIndex, classifyAnchor, groupBySprint, touched, unattributed } from '../../lib/scan/anchors.js'
import { parseGitignore, matchesIgnore, collect } from '../../lib/scan/walk.js'
import { pluginRoot } from '../../lib/util/paths.js'

function tmpRepo(files) {
  const root = mkdtempSync(join(tmpdir(), 'tene-scan-'))
  mkdirSync(join(root, '.git'), { recursive: true })
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel)
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, content)
  }
  return root
}

const PRESET = join(pluginRoot(), 'templates', 'layers.default.yml')

// ── 언어 팩 계약 ──────────────────────────────────────────────────────

test('모든 언어 팩이 계약을 지킨다', () => {
  for (const [name, pack] of Object.entries(PACKS)) {
    assert.deepEqual(validatePack(pack), [], `${name} 팩 계약 위반`)
  }
})

test('stripNonCode 는 길이와 줄 수를 보존한다 — 라인 번호가 어긋나면 안 된다', () => {
  const src = 'const a = 1 // 주석\n/* 블록\n여러 줄 */\nconst b = "문자열"\n'
  const out = ts.stripNonCode(src)
  assert.equal(out.length, src.length)
  assert.equal(out.split('\n').length, src.split('\n').length)
})

test('주석·문자열 안의 가짜 정의를 세지 않는다', () => {
  const src = [
    '// function fakeInComment() {}',
    '/* class FakeClass {} */',
    'const s = "function alsoFake() {}"',
    'export function real() {}',
  ].join('\n')
  const names = ts.extractDefinitions(src).map((d) => d.name)
  assert.deepEqual(names.filter((n) => n.toLowerCase().includes('fake')), [])
  assert.ok(names.includes('real'))
})

test('import 경로는 문자열이므로 살려서 읽는다', () => {
  const src = "import { a } from './payments'\nimport React from 'react'\n"
  const imports = ts.extractImports(src)
  assert.deepEqual(imports.map((i) => i.from), ['./payments', 'react'])
})

test('.ts 의 제네릭을 JSX 컴포넌트로 세지 않는다', () => {
  const src = 'function f(): Promise<PaymentResult> { return g() }'
  const { refs } = ts.extractReferences(src, { path: 'a.ts' })
  assert.equal(refs.filter((r) => r.kind === 'jsx').length, 0)
})

test('.tsx 의 컴포넌트는 잡되 중첩 제네릭은 거른다', () => {
  const jsx = ts.extractReferences('const x = <div><Spinner /></div>', { path: 'a.tsx' })
  assert.ok(jsx.refs.some((r) => r.kind === 'jsx' && r.name === 'Spinner'))
  const generic = ts.extractReferences('const m: Map<K, Set<V>> = x', { path: 'a.tsx' })
  assert.equal(generic.refs.filter((r) => r.kind === 'jsx').length, 0)
})

test('동적 디스패치를 없는 척하지 않고 unresolved 로 남긴다', () => {
  const { unresolved } = ts.extractReferences('handlers[key]()', { path: 'a.ts' })
  assert.equal(unresolved[0].reason, 'dynamic_dispatch')
})

test('Go 는 대문자로 export 를 판정한다', () => {
  const a = analyze('go', 'func Exported() {}\nfunc unexported() {}\n', { path: 'a.go' })
  const byName = Object.fromEntries(a.definitions.map((d) => [d.name, d.exported]))
  assert.equal(byName.Exported, true)
  assert.equal(byName.unexported, false)
})

test('Go import 블록을 읽는다 (경로가 문자열이다)', () => {
  const a = analyze('go', 'import (\n\t"fmt"\n\tpay "github.com/acme/pay"\n)\n', { path: 'a.go' })
  assert.deepEqual(a.imports.map((i) => i.from), ['fmt', 'github.com/acme/pay'])
})

test('Python 은 _ 접두어를 비공개로 본다', () => {
  const a = analyze('python', 'def public_fn():\n    pass\n\ndef _private():\n    pass\n', { path: 'a.py' })
  const byName = Object.fromEntries(a.definitions.map((d) => [d.name, d.exported]))
  assert.equal(byName.public_fn, true)
  assert.equal(byName._private, false)
})

// ── 워커 ──────────────────────────────────────────────────────────────

test('.gitignore 의 단순 glob 을 해석하고 미지원 패턴은 버린다', () => {
  const rules = parseGitignore('dist/\n*.log\n!keep.log\nsrc/[abc].ts\n# 주석\n')
  assert.equal(rules.length, 3, '문자 클래스 패턴은 버려야 한다')
  assert.equal(matchesIgnore('dist', rules, true), true)
  assert.equal(matchesIgnore('a.log', rules, false), true)
  assert.equal(matchesIgnore('keep.log', rules, false), false, '! 부정이 이겨야 한다')
})

test('node_modules 와 .gitignore 경로를 인덱싱하지 않는다', () => {
  const root = tmpRepo({
    '.gitignore': 'dist/\n',
    'src/a.ts': 'export function keep() {}',
    'dist/b.ts': 'export function dropped() {}',
    'node_modules/c/d.js': 'export function alsoDropped() {}',
  })
  try {
    const { files } = collect(root)
    const paths = files.map((f) => f.path)
    assert.deepEqual(paths, ['src/a.ts'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('심볼 이름이 constructor·toString 이어도 인덱스가 죽지 않는다', () => {
  // 실제 코드베이스를 인덱싱하다 여기서 죽었다.
  // 일반 객체는 obj['constructor'] 가 Object.prototype 의 함수라 ??= 가 배열을 만들지 않는다.
  const root = tmpRepo({
    'src/a.ts': [
      'export class A {',
      '  constructor(x) { this.x = x }',
      '  toString() { return 1 }',
      '  valueOf() { return 2 }',
      '}',
      'export function hasOwnProperty() { return 3 }',
    ].join('\n'),
  })
  try {
    const { index } = build(root)
    assert.ok(Array.isArray(index.symbols.toString), 'toString 이 배열이어야 한다')
    assert.ok(Array.isArray(index.symbols.hasOwnProperty))
    assert.ok(index.stats.symbols > 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('확장자 없는 실행 스크립트를 shebang 으로 인덱싱한다', () => {
  // bin/tene-guard 처럼 확장자가 없는 진입점이 통째로 빠지면
  // orphan 오탐이 쏟아지고 interface 계층이 비어 보인다.
  const root = tmpRepo({
    'bin/mytool': '#!/usr/bin/env node\nexport function toolMain() { return 1 }\n',
    'bin/script.sh': '#!/bin/bash\necho hi\n',
    'README': 'not code\n',
  })
  try {
    const { index } = build(root)
    assert.ok(index.files['bin/mytool'], '#!node 스크립트를 인덱싱해야 한다')
    assert.ok(index.symbols.toolMain)
    assert.equal(index.files['bin/script.sh'], undefined, 'bash 는 미지원이다')
    assert.equal(index.files.README, undefined, 'shebang 없는 확장자 없는 파일은 코드가 아니다')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ── 인덱스 ────────────────────────────────────────────────────────────

test('인덱스는 절대 경로를 담지 않는다 — 저장소를 옮겨도 깨지지 않아야 한다', () => {
  const root = tmpRepo({ 'src/a.ts': 'export function f() {}' })
  try {
    const { index } = build(root)
    const json = JSON.stringify({ ...index, root: undefined })
    assert.equal(json.includes(root), false, `절대 경로가 들어 있다`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('증분 빌드가 심볼을 중복시키지 않는다', () => {
  const root = tmpRepo({
    'src/a.ts': "import { g } from './b'\nexport function f() { return g() }",
    'src/b.ts': 'export function g() {}',
  })
  try {
    buildAndWrite(root)
    // mtime 이 같으면 변경으로 안 보므로 내용과 함께 시간을 바꾼다
    const p = join(root, 'src/a.ts')
    writeFileSync(p, "import { g } from './b'\nexport function f() { return g() }\nexport function h() {}")
    const res = buildAndWrite(root)

    assert.equal(res.mode, 'incremental')
    assert.equal(res.index.symbols.f.length, 1, 'f 가 중복되면 안 된다')
    assert.ok(res.index.symbols.h, '새 심볼이 들어와야 한다')
    assert.equal(res.index.refs.g.filter((r) => r.file === 'src/a.ts').length, 1, '참조도 중복되면 안 된다')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('상대 import 를 실제 파일로 해석한다', () => {
  const root = tmpRepo({
    'src/api/routes.ts': "import { p } from '../payments/process'",
    'src/payments/process.ts': 'export function p() {}',
  })
  try {
    const { index } = build(root)
    assert.equal(index.imports['src/api/routes.ts'][0].resolved, 'src/payments/process.ts')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('checkFreshness 는 변경을 감지한다', () => {
  const root = tmpRepo({ 'src/a.ts': 'export function f() {}' })
  try {
    buildAndWrite(root)
    assert.equal(checkFreshness(root).fresh, true)
    writeFileSync(join(root, 'src/b.ts'), 'export function g() {}')
    const after = checkFreshness(root)
    assert.equal(after.fresh, false)
    assert.equal(after.added, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ── 질의 ──────────────────────────────────────────────────────────────

test('인덱스로 답할 수 없으면 needs-investigation 을 낸다 — 억지로 답하지 않는다', () => {
  const root = tmpRepo({ 'src/a.ts': 'export function f() {}' })
  try {
    const index = build(root).index
    const res = definitions(index, 'noSuchThing')
    assert.equal(res.ok, false)
    assert.equal(res.source, 'needs-investigation')
    assert.equal(res.reason, 'no_match')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('같은 이름이 여러 곳이면 모호함을 표시하고 전부 돌려준다', () => {
  const root = tmpRepo({
    'src/a.ts': 'export function dup() {}',
    'src/b.ts': 'export function dup() {}',
  })
  try {
    const res = definitions(build(root).index, 'dup')
    assert.equal(res.results.length, 2)
    assert.equal(res.ambiguous, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('정의는 있는데 참조가 없으면 orphan 후보로 구분한다', () => {
  const root = tmpRepo({ 'src/a.ts': 'export function lonely() {}' })
  try {
    const res = callers(build(root).index, 'lonely')
    assert.equal(res.ok, true)
    assert.equal(res.orphanCandidate, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ── 계층 ──────────────────────────────────────────────────────────────

test('규칙에 없는 경로를 추측으로 채우지 않는다', () => {
  const root = tmpRepo({ 'src/utils/x.ts': 'export function f() {}' })
  try {
    const rules = loadRules(root, { presetPath: PRESET })
    const j = judgeLayer('src/utils/x.ts', rules)
    assert.equal(j.layer, 'unclassified')
    assert.equal(j.source, 'unmatched')
    assert.equal(j.suggestion, 'src/utils/**', '규칙 후보를 제안해야 한다')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('경로 규칙이 import 규칙보다 우선한다', () => {
  const root = tmpRepo({ 'x.ts': '' })
  try {
    const rules = loadRules(root, { presetPath: PRESET })
    // 경로는 controllers(interface), import 는 prisma(persistence)
    const j = judgeLayer('src/controllers/a.ts', rules, { imports: ['@prisma/client'] })
    assert.equal(j.layer, 'interface')
    assert.equal(j.confidence, 'high')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('경로로 못 정하면 import 로 정하되 confidence 를 낮춘다', () => {
  const root = tmpRepo({ 'x.ts': '' })
  try {
    const rules = loadRules(root, { presetPath: PRESET })
    const j = judgeLayer('lib/unknown/a.ts', rules, { imports: ['@prisma/client'] })
    assert.equal(j.layer, 'persistence')
    assert.equal(j.confidence, 'medium')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('계층 위반의 종류를 가른다', () => {
  assert.equal(violationKind('interface', 'persistence'), 'layer-skip')
  assert.equal(violationKind('persistence', 'interface'), 'reverse')
  assert.equal(violationKind('business-logic', 'infrastructure'), 'infra-leak')
  assert.equal(violationKind('interface', 'business-logic'), null, '정방향은 위반이 아니다')
})

test('위반은 위반이 일어난 파일에 귀속된다', () => {
  const root = tmpRepo({
    'src/controllers/a.ts': "import { db } from '../db/client'",
    'src/db/client.ts': 'export const db = {}',
  })
  try {
    const rules = loadRules(root, { presetPath: PRESET })
    const v = findViolations(build(root).index, rules)
    assert.equal(v.length, 1)
    assert.equal(v[0].file, 'src/controllers/a.ts', '컨트롤러의 문제이지 db 파일의 문제가 아니다')
    assert.equal(v[0].kind, 'layer-skip')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('같은 디렉토리가 반복 미분류면 규칙을 제안한다', () => {
  const root = tmpRepo({
    'src/utils/a.ts': 'export function a() {}',
    'src/utils/b.ts': 'export function b() {}',
  })
  try {
    const c = classifyIndex(build(root).index, loadRules(root, { presetPath: PRESET }))
    assert.deepEqual(c.suggestions, [{ pattern: 'src/utils/**', files: 2 }])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ── 6질문 ─────────────────────────────────────────────────────────────

test('시그니처에서 매개변수와 반환을 읽는다', () => {
  const sig = 'export async function f(a: string, b: Map<K, V>): Promise<Result> {'
  assert.deepEqual(parseParams(sig).params, [
    { name: 'a', type: 'string' },
    { name: 'b', type: 'Map<K, V>' },
  ])
  assert.equal(parseReturn(sig), 'Promise<Result>')
})

test('타입 표기가 없으면 low 로 낮추고 그렇게 말한다', () => {
  const root = tmpRepo({ 'src/a.ts': 'export function f(x) { return x }' })
  try {
    const r = answerSix(build(root).index, 'f')
    assert.equal(r.answers.q5.confidence, 'low')
    assert.match(r.answers.q5.note, /타입 표기가 없어/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('모르는 질문은 모른다고 답한다 — 빈칸을 채우지 않는다', () => {
  const root = tmpRepo({ 'src/a.ts': 'export function f() {}' })
  try {
    const r = answerSix(build(root).index, 'ghost')
    assert.equal(r.tier, 'needs-investigation')
    assert.ok(r.unanswered.includes('q2'))
    assert.equal(r.answers.q2.answer, null)
    assert.ok(r.answers.q2.reason)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ── 앵커 ──────────────────────────────────────────────────────────────

test('앵커 종류를 가른다', () => {
  assert.equal(classifyAnchor('processPayment').kind, 'symbol')
  assert.equal(classifyAnchor('src/a/b.ts').kind, 'path')
  assert.equal(classifyAnchor('src/a/b.ts:42').kind, 'location')
  assert.equal(classifyAnchor('`processPayment`').value, 'processPayment', '백틱을 벗긴다')
})

test('해석되지 않은 앵커를 조용히 버리지 않는다', () => {
  const root = tmpRepo({ 'src/a.ts': 'export function real() {}' })
  try {
    const index = build(root).index
    const a = buildAnchorIndex(index, [
      { sprintId: 's', acId: 'ac_1', anchors: ['real'] },
      { sprintId: 's', acId: 'ac_2', anchors: ['ghost'] },
      { sprintId: 's', acId: 'ac_3', anchors: [] },
    ])
    const reasons = a.unresolved.map((u) => u.reason)
    assert.ok(reasons.includes('no_match'), 'ghost 앵커가 보고돼야 한다')
    assert.ok(reasons.includes('no_anchors'), '앵커 없는 AC 가 보고돼야 한다')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('touched 는 편집 경로로 AC 를 찾는다', () => {
  const root = tmpRepo({ 'src/a.ts': 'export function real() {}' })
  try {
    const a = buildAnchorIndex(build(root).index, [{ sprintId: 's', acId: 'ac_1', anchors: ['real'] }])
    const hit = touched(a, ['src/a.ts'])
    assert.deepEqual(hit.acs, ['s:ac_1'])
    assert.deepEqual(touched(a, ['src/other.ts']).unknownPaths, ['src/other.ts'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('앵커 없는 변경을 미귀속으로 남긴다 (테스트 파일은 제외)', () => {
  const idx = { byPath: { 'src/a.ts': ['s:ac_1'] } }
  const out = unattributed(idx, ['src/a.ts', 'src/b.ts', 'src/b.test.ts'], { ignore: ['.test.'] })
  assert.deepEqual(out, ['src/b.ts'])
})

test('sprint:ac 키를 sprint 별로 나눈다', () => {
  assert.deepEqual(groupBySprint(['a:ac_1', 'a:ac_2', 'b:ac_1']), { a: ['ac_1', 'ac_2'], b: ['ac_1'] })
})

test('indexHealth 는 추적 불가 건수를 숨기지 않는다', () => {
  const root = tmpRepo({ 'src/a.ts': 'handlers[key]()' })
  try {
    const h = indexHealth(build(root).index)
    assert.ok(h.unresolved > 0)
    assert.match(h.caution, /정적으로 추적되지 않습니다/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
