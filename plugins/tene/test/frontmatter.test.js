/**
 * frontmatter 계약 — 공식 스펙과 맞는가
 *
 * **초기 구현은 스킬 frontmatter 를 5개 필드로 가정했다.** 실제로는 20개가 있고,
 * `allowed-tools` 는 우리가 이해한 것과 정반대(제한이 아니라 사전 승인)였다.
 * 이 테스트는 그 오해가 되돌아오는 것을 막는다.
 *
 * 근거: https://code.claude.com/docs/en/skills, /docs/en/sub-agents
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const P = join(dirname(fileURLToPath(import.meta.url)), '..')
const dirs = (p) => readdirSync(p).filter((d) => statSync(join(p, d)).isDirectory())

/** 공식 문서의 스킬 필드 (v2.1.218 기준) */
const SKILL_FIELDS = new Set([
  'name', 'description', 'when_to_use', 'argument-hint', 'arguments',
  'disable-model-invocation', 'user-invocable', 'allowed-tools', 'disallowed-tools',
  'model', 'effort', 'context', 'agent', 'background', 'hooks', 'paths',
  'shell', 'metadata', 'license', 'compatibility',
])

/** 공식 문서의 서브에이전트 필드 */
const AGENT_FIELDS = new Set([
  'name', 'description', 'model', 'effort', 'tools', 'disallowedTools',
  'skills', 'mcpServers', 'permissionMode', 'isolation', 'background',
  'memory', 'initialPrompt', 'maxTurns', 'hooks', 'color',
])

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return null
  const out = {}
  let key = null
  for (const line of m[1].split('\n')) {
    if (/^\s*#/.test(line)) continue
    const kv = line.match(/^([\w-]+):\s*(.*)$/)
    if (kv) { key = kv[1]; out[key] = kv[2].trim(); continue }
    if (key && /^\s+/.test(line)) out[key] += `\n${line.trim()}`
  }
  return out
}

const skills = dirs(join(P, 'skills')).map((d) => ({
  name: d,
  fm: frontmatter(readFileSync(join(P, 'skills', d, 'SKILL.md'), 'utf8')),
  body: readFileSync(join(P, 'skills', d, 'SKILL.md'), 'utf8'),
}))

const agents = readdirSync(join(P, 'agents')).filter((f) => f.endsWith('.md')).map((f) => ({
  name: f.replace(/\.md$/, ''),
  fm: frontmatter(readFileSync(join(P, 'agents', f), 'utf8')),
  body: readFileSync(join(P, 'agents', f), 'utf8'),
}))

// ── 필드 이름 ─────────────────────────────────────────────────────────

test('스킬이 스펙에 없는 frontmatter 필드를 쓰지 않는다', () => {
  for (const s of skills) {
    for (const k of Object.keys(s.fm)) {
      assert.ok(SKILL_FIELDS.has(k), `skills/${s.name}: '${k}' 는 스킬 필드가 아니다`)
    }
  }
})

test('에이전트가 스펙에 없는 필드를 쓰지 않는다', () => {
  for (const a of agents) {
    for (const k of Object.keys(a.fm)) {
      assert.ok(AGENT_FIELDS.has(k), `agents/${a.name}: '${k}' 는 서브에이전트 필드가 아니다`)
    }
  }
})

test('when_to_use 는 언더스코어다 — 다른 필드와 달리 하이픈이 아니다', () => {
  for (const s of skills) {
    assert.equal('when-to-use' in s.fm, false, `skills/${s.name}: 'when-to-use' 는 인식되지 않는다`)
  }
})

// ── 명령 경로 — 실사용에서 터진 것 ─────────────────────────────────────

test('스킬 본문의 tene 명령이 CLAUDE_PLUGIN_ROOT 를 쓴다', () => {
  // bin/ 은 PATH 에 없다. `tene-state read` 라고 쓰면 실행되지 않는다.
  // tene-guard 는 제외한다 — 스킬이 실행하지 않고 hooks.json 이 부른다 (언급일 뿐).
  const bare = /(?<![/"])\b(tene-(?:state|doc|scan|loop|qa|report|gate))\b(?!")/g
  for (const s of skills) {
    const body = s.body.slice(s.body.indexOf('---', 3))
    const hits = [...body.matchAll(bare)]
      .filter((m) => !body.slice(Math.max(0, m.index - 30), m.index).includes('CLAUDE_PLUGIN_ROOT'))
      .map((m) => m[1])
    assert.deepEqual([...new Set(hits)], [],
      `skills/${s.name}: PATH 를 가정한 명령이 있다 — \${CLAUDE_PLUGIN_ROOT}/bin/ 을 붙여야 실행된다`)
  }
})

test('allowed-tools 의 Bash 패턴이 실제 명령 경로와 맞는다', () => {
  for (const s of skills) {
    const at = s.fm['allowed-tools'] ?? ''
    if (!at.includes('Bash')) continue
    const usesBin = s.body.includes('${CLAUDE_PLUGIN_ROOT}/bin/')
    if (!usesBin) continue
    assert.ok(at.includes('${CLAUDE_PLUGIN_ROOT}/bin/*') || at.includes('Bash(node *)'),
      `skills/${s.name}: 본문은 bin/ 을 쓰는데 allowed-tools 가 그 패턴을 승인하지 않는다`)
  }
})

// ── 호출 주체 ─────────────────────────────────────────────────────────

test('부작용이 큰 스킬은 모델이 스스로 부르지 않는다', () => {
  for (const name of ['archive', 'clear']) {
    const s = skills.find((x) => x.name === name)
    assert.equal(s.fm['disable-model-invocation'], 'true',
      `${name}: 되돌리기 어려운 조작을 모델이 판단해 실행하면 안 된다`)
  }
})

test('배경 지식 스킬만 user-invocable: false 다', () => {
  const hidden = skills.filter((s) => s.fm['user-invocable'] === 'false').map((s) => s.name)
  assert.deepEqual(hidden, ['conventions'],
    '사용자가 부를 수 없는 스킬은 배경 지식뿐이어야 한다')
})

test('두 제한을 동시에 걸지 않는다 — 아무도 못 부르게 된다', () => {
  for (const s of skills) {
    const both = s.fm['user-invocable'] === 'false' && s.fm['disable-model-invocation'] === 'true'
    assert.equal(both, false, `skills/${s.name}: 사용자도 모델도 부를 수 없다`)
  }
})

// ── 도구 제한 — 오해했던 것 ────────────────────────────────────────────

test('secrets 는 allowed-tools 가 아니라 disallowed-tools 로 방어한다', () => {
  const s = skills.find((x) => x.name === 'secrets')
  assert.ok(s.fm['disallowed-tools'],
    'allowed-tools 는 사전 승인이지 제한이 아니다. 실제 방어는 disallowed-tools 다')
  assert.match(s.fm['disallowed-tools'], /Write/)
})

test('스킬 본문이 allowed-tools 를 보안 경계라고 주장하지 않는다', () => {
  for (const s of skills) {
    const claims = /allowed-tools[^\n]{0,40}(1차 방어|보안 경계|제한한다)/.test(s.body)
    assert.equal(claims, false,
      `skills/${s.name}: allowed-tools 는 제한이 아니다 (모든 도구가 여전히 호출 가능하다)`)
  }
})

// ── 격리 ──────────────────────────────────────────────────────────────

test('context: fork 를 쓰면 agent 를 함께 지정한다', () => {
  for (const s of skills) {
    if (s.fm.context !== 'fork') continue
    assert.ok(s.fm.agent, `skills/${s.name}: fork 인데 agent 가 없다 (기본 general-purpose 로 떨어진다)`)
  }
})

test('fork 스킬은 지침이 아니라 과업을 담는다', () => {
  // 문서 경고: 과업 없는 지침만 있으면 서브에이전트가 아무것도 안 하고 끝난다
  for (const s of skills) {
    if (s.fm.context !== 'fork') continue
    assert.match(s.body, /\$ARGUMENTS|\$0/,
      `skills/${s.name}: fork 스킬에 인자 자리가 없다 — 무엇을 조사할지 전달되지 않는다`)
  }
})

// ── 서브에이전트 ──────────────────────────────────────────────────────

test('판정 에이전트는 실행 도구를 갖지 않는다', () => {
  for (const name of ['judge', 'refuter']) {
    const a = agents.find((x) => x.name === name)
    assert.equal(a.fm.tools, 'Read', `${name}: 판정자가 실행하면 수집과 판정의 분리가 무너진다`)
  }
})

test('감사·조사 에이전트는 쓰기를 실제로 제거한다', () => {
  for (const name of ['gap-auditor', 'cartographer']) {
    const a = agents.find((x) => x.name === name)
    assert.match(a.fm.disallowedTools ?? '', /Write/,
      `${name}: tools allowlist 만으로는 의도가 드러나지 않는다`)
  }
})

test('모든 에이전트에 maxTurns 가 있다 — 폭주 방지', () => {
  for (const a of agents) {
    assert.ok(a.fm.maxTurns, `agents/${a.name}: maxTurns 가 없다`)
    assert.ok(Number(a.fm.maxTurns) > 0)
  }
})

test('플러그인에서 무시되는 필드를 쓰지 않는다', () => {
  // permissionMode 와 hooks 는 플러그인 서브에이전트에서 무시된다
  for (const a of agents) {
    assert.equal('permissionMode' in a.fm, false,
      `agents/${a.name}: permissionMode 는 플러그인 서브에이전트에서 무시된다`)
    assert.equal('hooks' in a.fm, false,
      `agents/${a.name}: hooks 는 플러그인 서브에이전트에서 무시된다 — hooks.json 을 쓴다`)
  }
})

// ── eval ──────────────────────────────────────────────────────────────

test('핵심 스킬에 eval 케이스가 있다', () => {
  const core = ['prd', 'qa', 'loop-check', 'secrets', 'layers']
  for (const name of core) {
    const p = join(P, 'skills', name, 'evals/evals.json')
    assert.ok(existsSync(p), `skills/${name}/evals/evals.json 이 없다`)
  }
})

test('eval 파일이 skill-creator 형식을 지킨다', () => {
  for (const s of skills) {
    const p = join(P, 'skills', s.name, 'evals/evals.json')
    if (!existsSync(p)) continue
    const data = JSON.parse(readFileSync(p, 'utf8'))

    assert.equal(data.skill_name, s.name, `${s.name}: skill_name 이 다르다`)
    assert.ok(Array.isArray(data.evals) && data.evals.length, `${s.name}: evals 가 비었다`)

    for (const e of data.evals) {
      assert.ok(typeof e.id === 'number', `${s.name}#${e.id}: id 가 숫자가 아니다`)
      assert.ok(e.prompt?.length > 10, `${s.name}#${e.id}: prompt 가 너무 짧다`)
      assert.ok(e.expected_output, `${s.name}#${e.id}: expected_output 이 없다`)
      assert.ok(Array.isArray(e.assertions) && e.assertions.length,
        `${s.name}#${e.id}: assertions 가 없다 — 채점할 수 없다`)
      for (const a of e.assertions) {
        assert.ok(a.length > 5 && !/^(좋다|good|괜찮)/.test(a),
          `${s.name}#${e.id}: '${a}' 는 채점 불가능하다`)
      }
    }
  }
})

test('eval 이 정직성을 검증한다 — 잘 하는지가 아니라', () => {
  // 이 제품의 약속은 "모르는 것을 모른다고 하는 것" 이다
  const honesty = /insufficient|unverifiable|미측정|모른다|추측|판정 불가|판정하지 않는다|지어내|위장|배정하지 않는다|받아들이지 않는다/
  let found = 0
  for (const s of skills) {
    const p = join(P, 'skills', s.name, 'evals/evals.json')
    if (!existsSync(p)) continue
    for (const e of JSON.parse(readFileSync(p, 'utf8')).evals) {
      if (e.assertions.some((a) => honesty.test(a))) found++
    }
  }
  assert.ok(found >= 4, `정직성을 검증하는 케이스가 ${found}개뿐이다`)
})
