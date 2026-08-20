/**
 * 시크릿 가드 — D13 §2.11
 *
 * 이 파일의 테스트는 **보안 경계**를 지킨다. 실패하면 평문 시크릿이
 * 대화 컨텍스트에 들어갈 수 있다. 완화하지 않는다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { envAdvice, isPlainEnvFile, isVaultPath, judgeBash, judgeRead, writeTargetsOf } from '../../lib/guard/rules.js'
import { allSegments, commandOf, expandIndirect, heredocBodies, segments, stripPrefix, substitutions } from '../../lib/guard/segment.js'

const bash = (command, mode = 'default') => judgeBash({ tool_input: { command }, permission_mode: mode })
const read = (file_path) => judgeRead({ tool_input: { file_path } })

// ── 분해 ──────────────────────────────────────────────────────────────

test('체인을 세그먼트로 나눈다', () => {
  assert.deepEqual(segments('a && b || c ; d | e'), ['a', 'b', 'c', 'd', 'e'])
})

test('따옴표 안은 나누지 않는다', () => {
  assert.deepEqual(segments('echo "a && b"'), ['echo "a && b"'])
  assert.deepEqual(segments("echo 'x | y'"), ["echo 'x | y'"])
})

test('환경변수 프리픽스와 래퍼를 벗긴다', () => {
  assert.equal(commandOf('FOO=1 BAR="x y" tene get K'), 'tene')
  assert.equal(commandOf('sudo -E env tene get K'), 'tene')
  assert.equal(commandOf('/usr/local/bin/tene get K'), 'tene')
  assert.equal(stripPrefix('FOO=1 tene get K'), 'tene get K')
})

test('첫 토큰만 명령으로 본다 — 오탐 방지의 핵심', () => {
  assert.equal(commandOf('grep "tene get" README.md'), 'grep')
  assert.equal(commandOf('echo tene get'), 'echo')
})

test('간접 실행 안을 펼친다', () => {
  assert.deepEqual(expandIndirect("bash -c 'tene get K'"), ['tene get K'])
  assert.deepEqual(expandIndirect('sh -c "a && b"'), ['a', 'b'])
  assert.deepEqual(expandIndirect("eval 'tene get K'"), ['tene get K'])
})

test('명령 치환과 heredoc 도 본다', () => {
  assert.deepEqual(substitutions('echo $(tene get K)'), ['tene get K'])
  assert.deepEqual(substitutions('echo `tene list`'), ['tene list'])
  assert.deepEqual(heredocBodies('cat <<EOF\ntene get K\nEOF'), ['tene get K'])
})

test('중첩이 깊어도 멈춘다 — 가드가 멈추면 전부 차단된다', () => {
  let cmd = 'tene list'
  for (let i = 0; i < 12; i++) cmd = `bash -c '${cmd}'`
  const segs = allSegments(cmd)
  assert.ok(segs.length < 30, `세그먼트가 ${segs.length}개로 폭발했다`)
})

// ── SR1: tene get ─────────────────────────────────────────────────────

test('SR1: tene get 을 차단한다', () => {
  const r = bash('tene get API_KEY')
  assert.equal(r.decision, 'deny')
  assert.equal(r.code, 'SR1')
  assert.match(r.hookSpecificOutput.permissionDecisionReason, /별도 터미널/)
})

test('SR1: 체인·프리픽스·래퍼·간접 실행으로 우회할 수 없다', () => {
  for (const cmd of [
    'echo hi && tene get K',
    'FOO=1 tene get K',
    'sudo tene get K',
    "bash -c 'tene get K'",
    'echo $(tene get K)',
    'ls; tene get K',
    'true || tene get K',
  ]) {
    assert.equal(bash(cmd).code, 'SR1', `우회됨: ${cmd}`)
  }
})

test('SR1: 문자열 안의 언급은 통과 — 오탐이면 사용자가 가드를 끈다', () => {
  for (const cmd of [
    'grep "tene get" README.md',
    'echo "run tene get later"',
    "rg 'tene get' docs/",
  ]) {
    assert.equal(bash(cmd).decision, 'allow', `오탐: ${cmd}`)
  }
})

// ── SR2: export ───────────────────────────────────────────────────────

test('SR2: 비암호화 export 를 차단하고 암호화는 통과', () => {
  assert.equal(bash('tene export').code, 'SR2')
  assert.equal(bash('tene export --file x.json').code, 'SR2')
  assert.equal(bash('tene export --encrypted --file b.enc').decision, 'allow')
})

// ── SR3: .tene/ ───────────────────────────────────────────────────────

test('SR3: 볼트 읽기를 차단한다', () => {
  assert.equal(bash('cat .tene/vault.json').code, 'SR3')
  assert.equal(bash('cp .tene/vault.json /tmp/x').code, 'SR3')
  assert.equal(bash('tar czf v.tgz .tene/').code, 'SR3')
})

test('SR3: .tene-claude/ 는 볼트가 아니다 — 이 구분이 틀리면 플러그인이 못 돈다', () => {
  assert.equal(bash('cat .tene-claude/state/current.json').decision, 'allow')
  assert.equal(read('/p/.tene-claude/state/current.json').decision, 'allow')
  assert.equal(isVaultPath('.tene-claude/x'), false)
  assert.equal(isVaultPath('.tene/x'), true)
  assert.equal(isVaultPath('/abs/.tene'), true)
  assert.equal(isVaultPath('src/tene/a.js'), false)
})

test('SR3: Read 도구로도 볼트를 못 읽는다', () => {
  assert.equal(read('/p/.tene/vault.json').code, 'SR3')
  assert.equal(read('src/index.ts').decision, 'allow')
})

// ── SR4: 값을 인자로 ──────────────────────────────────────────────────

test('SR4: 값을 인자로 넘기면 escalate, --stdin 은 통과', () => {
  assert.equal(bash('tene set KEY sk_live_abc').decision, 'escalate')
  assert.equal(bash('cat k.txt | tene set KEY --stdin').decision, 'allow')
  assert.equal(bash('tene set KEY').decision, 'allow', '값 없이 대화형 입력은 안전하다')
})

// ── 권한 모드 ─────────────────────────────────────────────────────────

test('deny 는 bypassPermissions 에서도 유지된다', () => {
  for (const mode of ['bypassPermissions', 'dontAsk', 'acceptEdits', 'default']) {
    assert.equal(bash('tene get K', mode).decision, 'deny', `${mode} 에서 통과됨`)
    assert.equal(bash('tene export', mode).decision, 'deny', `${mode} 에서 통과됨`)
    assert.equal(bash('cat .tene/v', mode).decision, 'deny', `${mode} 에서 통과됨`)
  }
})

test('SR4 만 bypass 에서 경고로 강등된다 — 값 노출이 아니라 로그 잔존 위험이므로', () => {
  assert.equal(bash('tene set K v', 'bypassPermissions').decision, 'warn')
  assert.equal(bash('tene set K v', 'default').decision, 'escalate')
})

// ── .env ──────────────────────────────────────────────────────────────

test('.env 는 차단하지 않고 대안을 알린다', () => {
  assert.equal(isPlainEnvFile('.env'), true)
  assert.equal(isPlainEnvFile('.env.local'), true)
  assert.equal(isPlainEnvFile('.env.example'), false, '예제 파일은 시크릿이 아니다')
  assert.equal(isPlainEnvFile('src/env.ts'), false)

  const advice = envAdvice(['.env'], { teneAvailable: true })
  assert.match(advice, /tene import/)
  assert.equal(envAdvice(['.env.example']), null)
})

test('Bash 리다이렉트 대상을 찾는다', () => {
  assert.deepEqual(writeTargetsOf('echo "K=v" > .env'), ['.env'])
  assert.deepEqual(writeTargetsOf('cat x >> .env.local'), ['.env.local'])
})

// ── 빈 입력 ───────────────────────────────────────────────────────────

test('빈 명령과 결측 페이로드에서 터지지 않는다', () => {
  assert.equal(bash('').decision, 'allow')
  assert.equal(judgeBash({}).decision, 'allow')
  assert.equal(judgeRead({}).decision, 'allow')
})
