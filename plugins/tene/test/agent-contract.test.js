/**
 * 에이전트 프롬프트 계약 — D13 §4.4 (E-2, E-7 의 회귀 방어)
 *
 * LLM 의 판단 자체는 테스트할 수 없다. 하지만 **그 판단을 유도하는 요소가
 * 프롬프트에 있는지**는 고정할 수 있다.
 *
 * 이 테스트가 막는 것: 프롬프트를 다듬다 안전 장치를 빼먹는 것.
 * 예를 들어 tene-judge 에서 "스크린샷으로 데이터를 주장하지 마라" 를 지우면,
 * DATA 기준이 UX 증거로 passed 가 되기 시작한다 — 그리고 아무도 모른다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const A = join(dirname(fileURLToPath(import.meta.url)), '../agents')

function agent(name) {
  // 파일명에 tene- 접두사가 없다 — 등록 이름이 `tene:<name>` 이 되기 때문이다
  const raw = readFileSync(join(A, `${name}.md`), 'utf8')
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const tools = fm?.[1].match(/^tools:\s*(.+)$/m)?.[1] ?? ''
  return {
    raw,
    body: raw.slice(fm?.[0].length ?? 0),
    tools: tools.split(',').map((t) => t.trim()).filter(Boolean),
  }
}

// ── 도구 경계 — 이것이 무너지면 판정이 오염된다 ────────────────────────

test('tene:judge 는 Read 만 갖는다 — 실행하면 판정이 오염된다', () => {
  const a = agent('judge')
  assert.deepEqual(a.tools, ['Read'],
    `판정자가 실행할 수 있으면 "내가 해보니 되더라" 가 판정이 된다. 현재: ${a.tools.join(', ')}`)
})

test('tene:refuter 도 Read 만 갖는다', () => {
  assert.deepEqual(agent('refuter').tools, ['Read'])
})

test('tene:gap-auditor 는 Write 를 갖지 않는다 — 감사자가 고치면 판정이 무의미해진다', () => {
  const a = agent('gap-auditor')
  assert.equal(a.tools.includes('Write'), false, `감사자에게 Write 가 있다: ${a.tools.join(', ')}`)
  assert.ok(a.tools.includes('Read'))
})

test('tene:cartographer 는 Write 를 갖지 않는다 — 조사만 한다', () => {
  assert.equal(agent('cartographer').tools.includes('Write'), false)
})

test('tene:qa-runner 는 증거를 남겨야 하므로 Write 를 갖는다', () => {
  const a = agent('qa-runner')
  assert.ok(a.tools.includes('Write'))
  assert.ok(a.tools.includes('Bash'), '검증을 실행해야 한다')
})

// ── E-7 · 판정자가 증거 없이 passed 를 내지 않는가 ─────────────────────

test('E-7 judge 가 판정 5종을 정의한다', () => {
  const b = agent('judge').body
  for (const v of ['passed', 'failed', 'insufficient', 'not-applicable']) {
    assert.ok(b.includes(v), `판정 ${v} 가 정의되지 않았다`)
  }
})

test('E-7 judge 가 "증거 없이 passed" 를 금지한다', () => {
  const b = agent('judge').body
  assert.match(b, /증거 없이 .?passed.? 추측/,
    '가장 흔한 실패를 명시적으로 금지해야 한다')
})

test('E-7 judge 가 UX 증거로 DATA 기준을 판정하는 것을 금지한다', () => {
  const b = agent('judge').body
  assert.match(b, /스크린샷으로 데이터를 주장/,
    '화면의 "저장됨" 을 DB 기록의 증거로 쓰는 것이 가장 잦은 오판이다')
  assert.match(b, /DATA.{0,40}데이터 관찰이 있어야/s,
    'method 별 증거 종류를 요구해야 한다')
})

test('E-7 judge 가 insufficient 를 실패가 아니라 "모름" 으로 정의한다', () => {
  const b = agent('judge').body
  assert.match(b, /insufficient.{0,80}모른다/s,
    'insufficient 를 failed 로 오해하면 게이트가 잘못 막는다')
  assert.match(b, /missingToDecide/,
    '무엇이 있으면 판정할 수 있는지 적게 해야 다음 회차가 진행된다')
})

test('E-7 judge 가 결정론 결과를 뒤집지 못하게 한다', () => {
  const b = agent('judge').body
  assert.match(b, /뒤집을 수 없다/)
  assert.match(b, /테스트 러너가 fail/, '구체적 예가 있어야 한다')
})

test('E-7 judge 가 forbidden 을 최우선으로 본다', () => {
  const b = agent('judge').body
  const forbiddenPos = b.indexOf('forbiddenOutcomes')
  const passedPos = b.indexOf('expected 를 충족')
  assert.ok(forbiddenPos > 0 && forbiddenPos < passedPos,
    '금지 조건이 충족 검사보다 앞에 와야 한다 — 둘 다 만족해도 실패다')
})

test('E-7 refuter 의 기본값이 반박이다', () => {
  const b = agent('refuter').body
  assert.match(b, /refuted:\s*true\s*가?\s*기본값/,
    '반박자가 관대하면 이 단계 전체가 무의미해진다')
  assert.match(b, /렌즈/, '3개 렌즈가 정의되어야 한다')
})

// ── E-2 · PRD 인터뷰가 실패 경로를 묻는가 ──────────────────────────────

test('E-2 interviewer 가 반드시 캐낼 다섯 가지를 명시한다', () => {
  const b = agent('interviewer').body
  const must = [
    /범위 밖/,
    /실패 경로/,
    /되돌아오는 경로/,
    /버그/,
    /데이터의? (운명|남는가)/,
  ]
  for (const re of must) {
    assert.match(b, re, `필수 질문이 빠졌다: ${re}`)
  }
})

test('E-2 interviewer 가 If-then 을 필수로 요구한다', () => {
  const b = agent('interviewer').body
  assert.match(b, /Unwanted\(If-then\)|If-then.{0,30}최소 1개|If-then.{0,20}필요/s,
    '실패 조건이 없는 기획은 실패를 생각하지 않은 기획이다')
  assert.match(b, /협상 대상이 아니다|필수/,
    '이 규칙이 선택으로 읽히면 안 된다')
})

test('E-2 interviewer 가 판정 불가능한 형용사를 거부한다', () => {
  const b = agent('interviewer').body
  assert.match(b, /빠르게|직관적/, '거부할 표현의 예가 있어야 한다')
  assert.match(b, /측정|판정할 수 없/, '무엇으로 바꿔야 하는지 알려야 한다')
})

test('E-2 interviewer 가 데이터 흐름을 화면과 따로 묻는다', () => {
  const b = agent('interviewer').body
  assert.match(b, /데이터.{0,60}(남는가|이야기)/s,
    '화면 보존과 데이터 기록은 다른 질문이다')
})

test('E-2 interviewer 가 모르는 것을 지어내지 않게 한다', () => {
  const b = agent('interviewer').body
  assert.match(b, /지어내지/, '빈칸을 그럴듯한 문장으로 덮는 것이 가장 나쁘다')
  assert.match(b, /열린 결정 사항/, '답이 없는 것을 둘 자리가 있어야 한다')
})

// ── 수집자가 판정하지 않는가 ───────────────────────────────────────────

test('tene:qa-runner 가 판정을 금지한다', () => {
  const b = agent('qa-runner').body
  assert.match(b, /판정하지 않는다/)
  assert.match(b, /passed.{0,20}failed.{0,20}쓰지 않는다|결론을 쓰지/s,
    'runner 가 결론을 쓰면 판정자가 그것을 따라간다')
})

test('tene:gap-auditor 가 근거 없는 implemented 를 금지한다', () => {
  const b = agent('gap-auditor').body
  assert.match(b, /근거 없[는이].{0,30}implemented/s)
  assert.match(b, /missing.{0,60}unverifiable|unverifiable.{0,60}missing/s,
    '안 찾아본 것과 찾아봤는데 없는 것을 구분해야 한다')
})

// ── 전 에이전트 공통 ───────────────────────────────────────────────────

test('모든 에이전트가 frontmatter 계약을 지킨다', () => {
  for (const f of readdirSync(A).filter((x) => x.endsWith('.md'))) {
    const raw = readFileSync(join(A, f), 'utf8')
    assert.match(raw, /^---\r?\n/, `${f}: frontmatter 없음`)
    assert.match(raw, /^name:\s*[a-z][\w-]*$/m, `${f}: name 이 소문자 슬러그여야 한다`)
    assert.equal(raw.match(/^name:\s*(\S+)/m)[1], f.replace(/\.md$/, ''), `${f}: name 이 파일명과 다르다`)
    assert.match(raw, /^description:\s*\S/m, `${f}: description 없음`)
    assert.match(raw, /^tools:\s*\S/m, `${f}: tools 없음`)
    assert.match(raw, /^model:\s*\S/m, `${f}: model 없음`)
  }
})

test('모든 에이전트가 "하지 않는 것" 을 명시한다', () => {
  for (const f of readdirSync(A).filter((x) => x.endsWith('.md'))) {
    const raw = readFileSync(join(A, f), 'utf8')
    assert.match(raw, /## 하지 않는 것/, `${f}: 경계가 없다`)
  }
})
