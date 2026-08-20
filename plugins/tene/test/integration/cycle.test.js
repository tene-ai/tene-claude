/**
 * 사이클 통합 테스트 — D13 §1
 *
 * 빈 프로젝트에서 시작해 실제 bin 을 자식 프로세스로 실행한다.
 * 단위 테스트가 각 모듈을 보는 것과 달리, 여기서는 **모듈들이 서로 맞물리는지**를 본다.
 *
 * 실제로 이 테스트가 없어서 "문서가 두 경로에 생성되는" 결함을 수동 E2E 로 잡았다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function git(cwd, args) {
  execFileSync('git', args, { cwd, stdio: ['ignore', 'ignore', 'ignore'] })
}

/** bin 을 실행하고 봉투를 돌려준다 */
function cli(root, tool, args) {
  const out = execFileSync(process.execPath, [join(PLUGIN, 'bin', tool), '--project', root, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })
  return JSON.parse(out)
}

function newProject() {
  const root = mkdtempSync(join(tmpdir(), 'tene-cycle-'))
  git(root, ['init', '-q', root])
  git(root, ['config', 'user.email', 't@t'])
  git(root, ['config', 'user.name', 't'])
  writeFileSync(join(root, 'README.md'), '# p\n')
  git(root, ['add', '-A'])
  git(root, ['commit', '-qm', 'init'])
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  return { root, head }
}

function write(root, rel, content) {
  const p = join(root, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, content)
}

const PRD = `---
tene:
  sprint: checkout
  doc: prd
  phase: prd
  status: draft
  lang: ko
  profile: standard
---

# 결제 재시도 — PRD

## 1. 배경     <!-- tene:sec=background -->
실패 시 입력이 사라진다.

## 2. 목표     <!-- tene:sec=goals -->
입력을 잃지 않게 한다.

## 3. 범위 밖     <!-- tene:sec=nongoals -->
환불은 하지 않는다.

## 4. 기획 의도     <!-- tene:sec=intents -->

| ID | 의도 | 근거 | 행위자 | 출처 |
|---|---|---|---|---|
| intent_1 | 입력을 잃지 않게 한다 | 재입력 불만 | 구매자 | conversation |

## 5. 사용자 흐름     <!-- tene:sec=uxflow -->

### 정상 경로
입력 → 제출 → 결과

### 실패 경로
제출 → 오류 → 폼 복귀 (입력 유지)

### 되돌아오는 경로
뒤로가기, 새로고침, 중복 제출 방지

## 6. 데이터 흐름     <!-- tene:sec=dataflow -->
실패는 payments 에 기록된다.

## 7. 수용 기준     <!-- tene:sec=ac -->

| ID | 기준 | 우선도 | 방식 | 앵커 | 상태 |
|---|---|---|---|---|---|
| ac_1 | **When** 결제를 제출하면, 시스템은 결과를 표시해야 한다 | blocking | UX | \`processPayment\` | pending |
| ac_2 | **If** 결제가 실패하면, **then** 시스템은 사유를 기록해야 한다 | blocking | DATA | \`markFailed\` | pending |

## 8. 열린 결정 사항     <!-- tene:sec=decisions -->

| # | 결정할 것 | 선택지 | 기본 제안 | 결정자 |
|---|---|---|---|---|
| 1 | 멱등키 정책 | order_id / UUID | order_id | 사용자 |

## +@ (자유 관점)
`

test('빈 프로젝트에서 sprint 를 만들고 문서 경로가 하나로 통일된다', (t) => {
  const { root, head } = newProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const init = cli(root, 'tene-state', ['init', '--id', 'checkout', '--slug', 'retry', '--title', '결제 재시도', '--start-commit', head])
  assert.equal(init.ok, true)
  assert.equal(init.data.sprint.sprintDir, 'checkout-retry')

  const scaffold = cli(root, 'tene-doc', ['scaffold', '--doc', 'prd', '--sprint', 'checkout'])
  assert.equal(scaffold.ok, true)
  // tene-state 와 tene-doc 이 같은 경로를 써야 한다
  assert.match(scaffold.data.path, /checkout-retry/)
  assert.ok(existsSync(join(root, 'docs/sprints/checkout-retry/00-prd/prd.md')))
  assert.equal(existsSync(join(root, 'docs/sprints/checkout')), false, '두 번째 경로가 생기면 안 된다')
})

test('미완성 PRD 는 G1 이 막고, 채우면 통과한다', (t) => {
  const { root, head } = newProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))

  cli(root, 'tene-state', ['init', '--id', 'checkout', '--slug', 'retry', '--title', 'x', '--start-commit', head])
  cli(root, 'tene-doc', ['scaffold', '--doc', 'prd', '--sprint', 'checkout'])
  cli(root, 'tene-state', ['docs', '--id', 'checkout', '--data', '{"prd":"00-prd/prd.md"}'])

  const before = cli(root, 'tene-gate', ['check', '--gate', 'G1'])
  assert.equal(before.data.result, 'fail', '빈 템플릿이 통과하면 게이트가 무의미하다')
  assert.ok(before.data.findings.length >= 2)

  write(root, 'docs/sprints/checkout-retry/00-prd/prd.md', PRD)
  const after = cli(root, 'tene-gate', ['check', '--gate', 'G1'])
  assert.equal(after.data.result, 'pass', JSON.stringify(after.data.findings))
})

test('AC 를 추출하면 EARS 패턴과 우선도가 보존된다', (t) => {
  const { root, head } = newProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))

  cli(root, 'tene-state', ['init', '--id', 'checkout', '--slug', 'retry', '--title', 'x', '--start-commit', head])
  write(root, 'docs/sprints/checkout-retry/00-prd/prd.md', PRD)

  const ex = cli(root, 'tene-doc', ['extract', '--what', 'ac', '--doc', 'prd', '--sprint', 'checkout'])
  const ac = ex.data.items ?? ex.data.ac ?? ex.data
  assert.equal(ac.length, 2)
  assert.equal(ac.find((a) => a.id === 'ac_2').pattern, 'unwanted', 'If-then 을 unwanted 로 읽어야 한다')
  assert.equal(ac.find((a) => a.id === 'ac_1').method, 'UX')
})

test('phase 를 건너뛸 수 없다', (t) => {
  const { root, head } = newProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  cli(root, 'tene-state', ['init', '--id', 'checkout', '--slug', 'retry', '--title', 'x', '--start-commit', head])

  assert.throws(
    () => cli(root, 'tene-state', ['advance', '--id', 'checkout', '--to', 'qa']),
    (err) => {
      const env = JSON.parse(err.stdout)
      return env.error.code === 'INVALID_TRANSITION' && env.error.detail.allowed.includes('prd')
    },
  )
})

test('구현하면 인덱스가 앵커를 잇고 loop-check 가 통과한다', (t) => {
  const { root, head } = newProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))

  cli(root, 'tene-state', ['init', '--id', 'checkout', '--slug', 'retry', '--title', 'x', '--start-commit', head])
  write(root, 'docs/sprints/checkout-retry/00-prd/prd.md', PRD)
  cli(root, 'tene-state', ['docs', '--id', 'checkout', '--data', '{"prd":"00-prd/prd.md"}'])
  cli(root, 'tene-state', ['ac', '--id', 'checkout', '--data', JSON.stringify([
    { id: 'ac_1', priority: 'blocking', method: 'UX', anchors: ['processPayment'] },
    { id: 'ac_2', priority: 'blocking', method: 'DATA', anchors: ['markFailed'] },
  ])])

  // 앵커만 있고 구현이 없으면 갭
  cli(root, 'tene-scan', ['build'])
  const before = cli(root, 'tene-loop', ['check'])
  assert.ok(before.data.gate.blockingGaps > 0, '구현 전에는 blocking 갭이 있어야 한다')

  // 구현
  write(root, 'src/payments/process.ts', [
    'export async function processPayment(input: PaymentInput): Promise<PaymentResult> {',
    '  const r = await charge(input)',
    '  if (!r.ok) return markFailed(input, r.reason)',
    '  return r',
    '}',
    'export function markFailed(input: PaymentInput, reason: string) {',
    "  return db.payments.update({ status: 'failed', reason })",
    '}',
  ].join('\n'))

  cli(root, 'tene-scan', ['build'])
  const after = cli(root, 'tene-loop', ['check'])
  assert.equal(after.data.gate.blockingGaps, 0, JSON.stringify(after.data.gaps))
  assert.equal(after.data.verdict.verdict, 'pass')
})

test('앵커 없는 파일은 미귀속 변경으로 잡힌다', (t) => {
  const { root, head } = newProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))

  cli(root, 'tene-state', ['init', '--id', 'checkout', '--slug', 'retry', '--title', 'x', '--start-commit', head])
  write(root, 'docs/sprints/checkout-retry/00-prd/prd.md', PRD)
  cli(root, 'tene-state', ['docs', '--id', 'checkout', '--data', '{"prd":"00-prd/prd.md"}'])
  cli(root, 'tene-state', ['ac', '--id', 'checkout', '--data', JSON.stringify([
    { id: 'ac_1', priority: 'blocking', method: 'UX', anchors: ['processPayment'] },
  ])])
  write(root, 'src/payments/process.ts', 'export function processPayment() { return 1 }')
  write(root, 'src/misc/helper.ts', 'export function helper() { return 2 }')
  cli(root, 'tene-scan', ['build'])

  const r = cli(root, 'tene-loop', ['check'])
  const paths = r.data.unattributed.items.map((i) => i.path)
  assert.ok(paths.includes('src/misc/helper.ts'), '앵커 없는 변경을 잡아야 한다')
  assert.equal(paths.includes('src/payments/process.ts'), false, '앵커된 파일은 미귀속이 아니다')
})

test('코드를 고치면 passed 판정이 stale 이 된다', (t) => {
  const { root, head } = newProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))

  cli(root, 'tene-state', ['init', '--id', 'checkout', '--slug', 'retry', '--title', 'x', '--start-commit', head])
  write(root, 'src/payments/process.ts', 'export function processPayment() { return 1 }')
  cli(root, 'tene-state', ['ac', '--id', 'checkout', '--data', JSON.stringify([
    { id: 'ac_1', priority: 'blocking', method: 'UX', anchors: ['processPayment'], verdict: 'passed' },
    { id: 'ac_2', priority: 'blocking', method: 'DATA', anchors: ['processPayment'], verdict: 'failed' },
  ])])
  cli(root, 'tene-scan', ['build'])

  // PostToolUse 훅이 하는 일
  const hook = execFileSync(process.execPath, [join(PLUGIN, 'bin', 'tene-hook'), 'post-edit'], {
    cwd: root, encoding: 'utf8',
    input: JSON.stringify({ tool_input: { file_path: join(root, 'src/payments/process.ts') } }),
  })
  assert.match(hook, /무효가 되었습니다/)

  const s = cli(root, 'tene-state', ['read', '--id', 'checkout'])
  const byId = Object.fromEntries(s.data.sprint.ac.map((a) => [a.id, a.verdict]))
  assert.equal(byId.ac_1, 'stale')
  assert.equal(byId.ac_2, 'failed', 'failed 는 이미 미통과이므로 가리지 않는다')
})

test('G6 fail 상태에서 TaskCompleted 가 exit 2 로 막는다', (t) => {
  const { root, head } = newProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))

  cli(root, 'tene-state', ['init', '--id', 'checkout', '--slug', 'retry', '--title', 'x', '--start-commit', head])
  cli(root, 'tene-state', ['ac', '--id', 'checkout', '--data', JSON.stringify([
    { id: 'ac_1', priority: 'blocking', method: 'UX', verdict: 'failed' },
  ])])

  let code = 0
  let stderr = ''
  try {
    execFileSync(process.execPath, [join(PLUGIN, 'bin', 'tene-gate'), 'task-complete'], {
      cwd: root, encoding: 'utf8',
      input: JSON.stringify({ task: { title: '[QA] AC 검증', id: 't1' } }),
    })
  } catch (err) {
    code = err.status
    stderr = err.stderr
  }
  assert.equal(code, 2, '게이트가 막아야 한다')
  assert.match(stderr, /G6/)
  assert.match(stderr, /해결:/, '막기만 하고 길을 안 알려주면 게이트를 끄게 된다')
})

test('tene 태스크가 아니면 게이트가 개입하지 않는다', (t) => {
  const { root, head } = newProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  cli(root, 'tene-state', ['init', '--id', 'checkout', '--slug', 'retry', '--title', 'x', '--start-commit', head])

  const out = execFileSync(process.execPath, [join(PLUGIN, 'bin', 'tene-gate'), 'task-complete'], {
    cwd: root, encoding: 'utf8',
    input: JSON.stringify({ task: { title: '일반 작업' } }),
  })
  assert.equal(out, '')
})

test('상태를 지워도 문서만으로 복구된다', (t) => {
  const { root, head } = newProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))

  cli(root, 'tene-state', ['init', '--id', 'checkout', '--slug', 'retry', '--title', 'x', '--start-commit', head])
  write(root, 'docs/sprints/checkout-retry/00-prd/prd.md', PRD)
  write(root, 'docs/sprints/checkout-retry/01-plan/plan.md', '---\ntene:\n  doc: plan\n---\n')

  // 상태 디렉토리를 통째로 날린다
  rmSync(join(root, '.tene-claude'), { recursive: true, force: true })

  const r = cli(root, 'tene-state', ['resync', '--id', 'checkout'])
  assert.equal(r.ok, true)
  assert.equal(r.data.summary.phase, 'design', 'plan 까지 있으면 design 단계로 추론한다')
  assert.equal(r.data.summary.ac.total, 2)
  assert.match(r.data.report, /추정 phase/, '추론임을 밝혀야 한다')
})

test('SessionStart 는 빈 프로젝트에서 조용하다', (t) => {
  const { root } = newProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const out = execFileSync(process.execPath, [join(PLUGIN, 'bin', 'tene-hook'), 'session-start'], {
    cwd: root, encoding: 'utf8', input: '{}',
  })
  assert.equal(out, '', '설치했다고 말을 걸지 않는다')
})

test('사이클을 draft 에서 archived 까지 완주한다', (t) => {
  const { root, head } = newProject()
  t.after(() => rmSync(root, { recursive: true, force: true }))

  cli(root, 'tene-state', ['init', '--id', 'p', '--slug', 'r', '--title', 'x', '--start-commit', head])

  // 게이트를 실제 문서로 통과시키는 것은 위 테스트들이 본다.
  // 여기서는 **전이 경로 자체가 끝까지 이어지는지**만 본다.
  const path = ['prd', 'plan', 'design', 'do', 'loop-check', 'qa', 'report', 'archived']
  let prev = 'draft'
  for (const to of path) {
    const r = cli(root, 'tene-state', ['advance', '--id', 'p', '--to', to, '--force'])
    assert.equal(r.ok, true, `${prev} → ${to} 실패`)
    assert.equal(r.data.to, to)
    prev = to
  }

  const s = cli(root, 'tene-state', ['read', '--id', 'p'])
  assert.equal(s.data.sprint.phase, 'archived')
  assert.equal(s.data.sprint.status, 'archived')
  assert.equal(s.data.current.activeSprint, null, 'archive 후 활성이 해제되어야 한다')

  // --force 로 건너뛴 것도 기록되어야 한다 — 안 그러면 나중에 통과 여부를 알 수 없다
  const gates = Object.entries(s.data.sprint.gates).filter(([, v]) => v)
  assert.equal(gates.length, 8, `게이트 기록 ${gates.length}개: ${gates.map(([k]) => k).join(',')}`)
  assert.ok(gates.every(([, v]) => v.forced === true && v.result === 'skipped'),
    'force 로 넘어간 게이트는 skipped + forced 로 남아야 한다')
})

test('시크릿 가드는 fail-closed — 깨진 입력에도 차단한다', () => {
  const out = execFileSync(process.execPath, [join(PLUGIN, 'bin', 'tene-guard'), '--event', 'pretooluse-bash'], {
    encoding: 'utf8', input: 'not json at all',
  })
  const parsed = JSON.parse(out)
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny')
})
