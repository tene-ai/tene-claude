/**
 * 플러그인 레이아웃 계약 — 실제로 로드되는 이름이 설계와 맞는가
 *
 * **`claude plugin validate` 는 이것을 잡지 못한다.** 매니페스트는 통과하는데
 * 스킬이 `/tene:tene-prd` 로 등록되는 것을 실제로 로드해보고 나서야 알았다.
 *
 * Claude Code 는 스킬 이름을 **디렉토리 이름**에서 가져온다. frontmatter 의
 * `name:` 은 무시된다. 워크플로는 `meta.name` 을 쓰므로 규칙이 다르다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const P = join(dirname(fileURLToPath(import.meta.url)), '..')

const dirs = (p) => readdirSync(p).filter((d) => statSync(join(p, d)).isDirectory())

test('스킬 디렉토리에 tene- 접두사를 붙이지 않는다', () => {
  const bad = dirs(join(P, 'skills')).filter((d) => d.startsWith('tene-'))
  assert.deepEqual(bad, [],
    `디렉토리 이름이 그대로 호출 이름이 된다. ` +
    `${bad.map((d) => `skills/${d} → /tene:${d}`).join(', ')} 처럼 중복된다`)
})

test('워크플로 meta.name 에도 tene- 접두사를 붙이지 않는다', () => {
  for (const f of readdirSync(join(P, 'workflows')).filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(join(P, 'workflows', f), 'utf8')
    const name = src.match(/name:\s*'([^']+)'/)?.[1]
    assert.ok(name, `${f}: meta.name 이 없다`)
    assert.equal(name.startsWith('tene-'), false, `${f}: meta.name '${name}' 이 /tene:tene-... 가 된다`)
  }
})

test('에이전트에도 tene- 접두사를 붙이지 않는다', () => {
  // 에이전트도 `tene:<name>` 으로 등록된다. 파일명에 tene- 를 붙이면
  // agentType 이 `tene:tene-judge` 가 되어 워크플로가 부르는 이름과 어긋난다.
  // **처음에 "에이전트는 네임스페이스가 안 붙는다" 고 가정했다가 실제 로드에서 틀린 것을 알았다.**
  for (const f of readdirSync(join(P, 'agents')).filter((x) => x.endsWith('.md'))) {
    assert.equal(f.startsWith('tene-'), false, `agents/${f} → agentType 이 tene:tene-... 가 된다`)
    const name = readFileSync(join(P, 'agents', f), 'utf8').match(/^name:\s*(\S+)/m)?.[1]
    assert.equal(name, f.replace(/\.md$/, ''), `${f}: frontmatter name 이 파일명과 다르다`)
  }
})

test('워크플로의 agentType 이 실제 등록 이름과 맞는다', () => {
  const agents = new Set(
    readdirSync(join(P, 'agents')).filter((x) => x.endsWith('.md')).map((f) => `tene:${f.replace(/\.md$/, '')}`),
  )
  for (const f of readdirSync(join(P, 'workflows')).filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(join(P, 'workflows', f), 'utf8')
    for (const m of src.matchAll(/agentType:\s*'([^']+)'/g)) {
      assert.ok(agents.has(m[1]),
        `${f}: agentType '${m[1]}' 가 없는 에이전트다. 있는 것: ${[...agents].join(', ')}`)
    }
  }
})

test('SubagentStop 훅이 tene: 네임스페이스로 매칭한다', () => {
  const hooks = JSON.parse(readFileSync(join(P, 'hooks/hooks.json'), 'utf8'))
  const matcher = hooks.hooks.SubagentStop?.[0]?.matcher
  assert.equal(matcher, 'tene:.*', `matcher 가 '${matcher}' 다 — 등록 이름은 tene:<name> 이다`)

  const handler = readFileSync(join(P, 'lib/hooks/subagent-stop.js'), 'utf8')
  assert.match(handler, /startsWith\('tene:'\)/, '핸들러도 같은 접두사를 봐야 한다')
})

test('스킬 본문이 참조하는 에이전트가 실제로 존재한다', () => {
  const agents = new Set(
    readdirSync(join(P, 'agents')).filter((x) => x.endsWith('.md')).map((f) => f.replace(/\.md$/, '')),
  )
  for (const d of dirs(join(P, 'skills'))) {
    const body = readFileSync(join(P, 'skills', d, 'SKILL.md'), 'utf8')
    for (const m of body.matchAll(/`tene:([\w-]+)`/g)) {
      const name = m[1]
      // 스킬 호출(/tene:qa)이 아니라 에이전트 참조만 본다
      if (existsSync(join(P, 'skills', name))) continue
      assert.ok(agents.has(name), `skills/${d}: 'tene:${name}' 가 스킬도 에이전트도 아니다`)
    }
  }
})

test('모든 스킬 디렉토리에 SKILL.md 가 있다', () => {
  for (const d of dirs(join(P, 'skills'))) {
    assert.ok(existsSync(join(P, 'skills', d, 'SKILL.md')), `skills/${d}: SKILL.md 없음`)
  }
})

test('스킬 frontmatter 의 name 이 디렉토리와 일치한다', () => {
  // Claude Code 는 디렉토리를 쓰지만, 둘이 다르면 읽는 사람이 헷갈린다
  for (const d of dirs(join(P, 'skills'))) {
    const raw = readFileSync(join(P, 'skills', d, 'SKILL.md'), 'utf8')
    const name = raw.match(/^name:\s*(\S+)/m)?.[1]
    assert.equal(name, d, `skills/${d}: frontmatter name 이 '${name}' 이다`)
  }
})

test('설계 카탈로그와 실제 스킬 디렉토리가 일치한다', () => {
  const doc = readFileSync(join(P, '../../docs/02-design/05-skills-hooks-routing.md'), 'utf8')
  // 카탈로그 표만 본다 — §1.5(스킬 모델 조사) 의 표가 섞이지 않게 거기서 자른다
  const start = doc.indexOf('## 1. 스킬 카탈로그')
  const end = doc.indexOf('## 1.5', start)
  const section = doc.slice(start, end > 0 ? end : doc.indexOf('## 2.', start))

  // 카탈로그 행은 `| \`name\` | \`/tene:name\` |` 형태다
  const documented = [...section.matchAll(/^\| `([\w-]+)` \| [`(]/gm)].map((m) => m[1]).sort()
  const actual = dirs(join(P, 'skills')).sort()

  assert.deepEqual(actual, documented,
    `문서와 실제가 다릅니다.\n  문서에만: ${documented.filter((d) => !actual.includes(d))}\n  실제에만: ${actual.filter((d) => !documented.includes(d))}`)
})

test('플러그인 매니페스트가 루트가 아니라 plugins/tene 에 있다', () => {
  // --plugin-dir 는 플러그인 하나를 가리킨다. 저장소 루트는 마켓플레이스다.
  assert.ok(existsSync(join(P, '.claude-plugin/plugin.json')))
  assert.ok(existsSync(join(P, '../../.claude-plugin/marketplace.json')))
  assert.equal(existsSync(join(P, '../../.claude-plugin/plugin.json')), false,
    '루트에 plugin.json 이 있으면 마켓플레이스와 플러그인이 섞인다')
})

test('hooks.json 이 선언한 훅 핸들러가 전부 존재한다', () => {
  const hooks = JSON.parse(readFileSync(join(P, 'hooks/hooks.json'), 'utf8'))
  const events = new Set()
  for (const list of Object.values(hooks.hooks)) {
    for (const entry of list) {
      for (const h of entry.hooks) {
        const m = h.command.match(/bin\/(tene-\w+)"?\s+(\S+)/)
        if (m && m[1] === 'tene-hook') events.add(m[2])
      }
    }
  }
  // tene-hook 이 분기하는 이벤트마다 핸들러 파일이 있어야 한다
  const handlerFor = { 'pre-compact': 'compact', 'post-compact': 'compact' }
  for (const ev of events) {
    const file = `${handlerFor[ev] ?? ev}.js`
    assert.ok(existsSync(join(P, 'lib/hooks', file)),
      `hooks.json 이 '${ev}' 를 부르는데 lib/hooks/${file} 가 없다`)
  }
  assert.ok(events.size >= 8, `훅 이벤트가 ${events.size}개뿐이다`)
})

test('bin 이 전부 실행 가능하고 shebang 이 있다', () => {
  for (const f of readdirSync(join(P, 'bin'))) {
    const abs = join(P, 'bin', f)
    const mode = statSync(abs).mode
    assert.ok(mode & 0o111, `bin/${f}: 실행 권한 없음`)
    assert.match(readFileSync(abs, 'utf8').split('\n')[0], /^#!\/usr\/bin\/env node/,
      `bin/${f}: shebang 없음`)
  }
})
