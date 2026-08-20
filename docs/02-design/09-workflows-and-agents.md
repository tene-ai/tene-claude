# D09 · Dynamic Workflow · 에이전트

> 대응: FR-1.5, FR-4.7, W-47, W-5D, W-3G, W-45, W-59~W-5C, W-66
> 근거: [00-rnd/02 §4](../00-rnd/02-claude-code-architecture-research.md) — 워크플로 런타임 제약

---

## 1. 워크플로를 쓰는 기준

워크플로는 **비싸다.** 아무 데나 쓰지 않는다.

| 쓴다 | 쓰지 않는다 |
|---|---|
| 같은 작업을 **N개 항목에 반복** | 단일 대상 작업 |
| 중간 결과가 **컨텍스트를 오염**시킬 규모 | 결과가 짧은 작업 |
| **적대적 검증**이 필요 | 단순 사실 조회 |
| N ≥ 임계 (기본 8) | N < 임계 |
| 사용자 입력이 **불필요** | 인터뷰가 필요 |

### 1.1 런타임 제약 (반드시 준수)

| 제약 | 대응 |
|---|---|
| 스크립트에서 파일시스템·셸 접근 불가 | 에이전트가 `bin/` 스크립트를 호출 |
| **실행 중 사용자 입력 불가** | PRD 인터뷰는 워크플로로 만들지 않는다 |
| 모듈 로딩 불가 (`import()` 시 실행 전 실패) | 계산은 에이전트가 `bin/` 으로 |
| `Date.now()`/`Math.random()`/`new Date()` throw | 타임스탬프는 워크플로 반환 후 스탬프, 또는 `args` 주입 |
| 동시 16, 총 1,000 에이전트 | 항목 수 상한 확인 |
| 한 호출에 최대 4,096 아이템 | 초과 시 분할 |
| 재개는 같은 세션 내에서만 | 상태를 파일에 남겨 스킬 수준 재개 |
| v2.1.154+ 필요 | 미만이면 순차 서브에이전트로 degrade |

### 1.2 `meta` 는 순수 리터럴

```javascript
// ✅
export const meta = {
  name: 'qa-sweep',          // → /tene:qa-sweep
  description: 'Verify every acceptance criterion with separated collection and judgment',
  phases: [{ title: 'Collect' }, { title: 'Judge' }, { title: 'Refute' }],
}

// ❌ 변수·함수호출·스프레드·템플릿 보간 전부 금지
export const meta = { name: `tene-${kind}`, ...base }
```

---

## 2. 워크플로 3종

| 이름 | 전환 조건 | 팬아웃 규모 | 대체 (미전환 시) |
|---|---|---|---|
| `qa-sweep` | AC ≥ 8 또는 명시 요청 | AC × 2~3 | 순차 runner→judge→refuter |
| `conformance-audit` | 요구 항목 ≥ 15 | 항목 × 1~2 | `tene:gap-auditor` 단독 |
| `understand-sweep` | 사용자 명시 호출만 | 심볼 × 1 | `tene:cartographer` 단독 |

---

## 3. `qa-sweep`

```javascript
export const meta = {
  name: 'qa-sweep',          // → /tene:qa-sweep
  description: 'Verify every acceptance criterion: collect evidence, judge independently, then refute passes',
  phases: [
    { title: 'Collect', detail: 'gather evidence per criterion (no judgment)' },
    { title: 'Judge',   detail: 'independent verdict from evidence only' },
    { title: 'Refute',  detail: 'adversarial check on passed verdicts' },
  ],
}

const acs = args?.criteria ?? []
if (!acs.length) return { error: 'no criteria supplied' }

const results = await pipeline(
  acs,

  // ── Collect: 증거만 수집. 판정 금지 ────────────────────────────
  ac => agent(
    [
      `수용 기준 ${ac.id} 에 대한 증거를 수집하라.`,
      `기준: ${ac.statement}`,
      `방식: ${ac.method}`,
      `필요 레이어: ${ac.requiredLayers.join(', ')}`,
      `Charter 절차:`,
      ...ac.charter.steps.map((s, i) => `  ${i+1}. ${s.action} → 기대: ${s.expectedUi ?? s.expectedData}`),
      ``,
      `규칙:`,
      `· 관찰한 것만 기록하라. "통과했다" 고 쓰지 마라`,
      `· 증거를 evidence/${args.runId}/ 에 저장하고 경로와 sha256 을 반환하라`,
      `· 각 스텝에서 UI 상태·콘솔·네트워크를 함께 캡처하라`,
      `· 실행하지 못한 것은 실행하지 못했다고 쓰라`,
    ].join('\n'),
    { phase: 'Collect', label: ac.id, schema: EVIDENCE_SCHEMA }
  ),

  // ── Judge: 증거만 보고 판정. runner 요약 미포함 ─────────────────
  (ev, ac) => agent(
    [
      `다음 수용 기준을 증거만으로 판정하라.`,
      `기준: ${ac.statement}`,
      `금지 결과: ${JSON.stringify(ac.forbiddenOutcomes)}`,
      `관찰 기록: ${JSON.stringify(ev.observations)}`,
      `아티팩트: ${JSON.stringify(ev.artifacts)}`,
      ``,
      `verdict ∈ { passed, failed, insufficient, not-applicable }`,
      `· 금지 결과가 하나라도 관찰되면 즉시 failed`,
      `· 증거가 없으면 passed 로 추측하지 마라. insufficient 다`,
      `· 기준 문장을 재해석해 통과시키지 마라`,
      `· 스크린샷만으로 데이터 흐름을 판정하지 마라`,
    ].join('\n'),
    { phase: 'Judge', label: ac.id, schema: VERDICT_SCHEMA }
  ).then(v => ({ ac, ev, v })),

  // ── Refute: passed 만 3렌즈 반박 ──────────────────────────────
  r => r.v.verdict !== 'passed' ? r :
    parallel(['correctness', 'edge-case', 'evidence-sufficiency'].map(lens => () =>
      agent(
        [
          `${lens} 렌즈로 이 passed 판정을 반박하라.`,
          `기준: ${r.ac.statement}`,
          `판정 근거: ${r.v.reason}`,
          `증거: ${JSON.stringify(r.ev.observations)}`,
          ``,
          `기본값은 refuted: true 다. 증거가 불충분하면 반박하라.`,
          `반박할 수 없을 때만 refuted: false 를 반환하라.`,
        ].join('\n'),
        { phase: 'Refute', label: `${r.ac.id}:${lens}`, schema: REFUTE_SCHEMA }
      )
    )).then(votes => {
      const valid = votes.filter(Boolean)
      const refutedCount = valid.filter(x => x.refuted).length
      return {
        ...r,
        refuted: refutedCount >= 2,
        refutations: valid.filter(x => x.refuted).map(x => ({ lens: x.lens, reason: x.reason })),
      }
    })
)

return results.filter(Boolean).map(r => ({
  acId: r.ac.id,
  verdict: r.refuted ? 'failed' : r.v.verdict,
  originalVerdict: r.v.verdict,
  reason: r.refuted ? r.refutations[0].reason : r.v.reason,
  evidencePaths: r.ev.artifacts?.map(a => a.path) ?? [],
  refutations: r.refutations ?? [],
}))
```

### 3.1 `pipeline` 을 쓴 이유

AC 별로 독립 진행된다. `parallel` (배리어) 을 쓰면 **가장 느린 AC 가 전체를 붙잡는다.**

```
pipeline:  AC-1 [Collect→Judge→Refute] ────────▶ 완료
           AC-2 [Collect───────→Judge→Refute] ─▶ 완료
           AC-3 [Collect→Judge] ──────────────▶ 완료 (failed, Refute 생략)

parallel:  전체 Collect 대기 ──▶ 전체 Judge 대기 ──▶ 전체 Refute
           ↑ 가장 느린 하나가 모두를 막음
```

### 3.2 스키마

```javascript
const EVIDENCE_SCHEMA = {
  type: 'object',
  required: ['acId', 'observations'],
  properties: {
    acId: { type: 'string' },
    observations: { type: 'array', items: {
      type: 'object', required: ['kind', 'detail'],
      properties: {
        kind: { enum: ['ui-state','console','network','db','file','test-output','log'] },
        detail: { type: 'string' },
        edgeId: { type: 'string' },
        at: { type: 'string' },
      }}},
    artifacts: { type: 'array', items: {
      type: 'object', required: ['path','sha256','kind'],
      properties: { path: {type:'string'}, sha256: {type:'string'},
                    kind: {type:'string'}, size: {type:'number'} }}},
    notExecuted: { type: 'array', items: {
      type: 'object', required: ['step','reason'],
      properties: { step: {type:'string'}, reason: {type:'string'} }}},
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['acId', 'verdict', 'reason'],
  properties: {
    acId: { type: 'string' },
    verdict: { enum: ['passed','failed','insufficient','not-applicable'] },
    reason: { type: 'string' },
    evidencePaths: { type: 'array', items: { type: 'string' } },
    forbiddenObserved: { type: 'array', items: { type: 'string' } },
  },
}

const REFUTE_SCHEMA = {
  type: 'object',
  required: ['refuted', 'reason', 'lens'],
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
    lens: { enum: ['correctness','edge-case','evidence-sufficiency'] },
  },
}
```

**`schema` 옵션의 이점**: 도구 호출 층에서 검증되고, 불일치 시 모델이 재시도한다. 파싱 코드를 쓸 필요가 없다.

### 3.3 타임스탬프 처리

워크플로에서 `Date.now()` 가 throw 하므로:

```javascript
// 스킬이 호출 시 주입
await Workflow({
  name: 'qa-sweep',          // → /tene:qa-sweep
  args: { criteria: acs, runId: 'run_20260820_01', startedAt: '2026-08-20T04:10:00Z' },
})

// 워크플로 반환 후 스킬이 스탬프
const finishedAt = new Date().toISOString()
```

---

## 4. `conformance-audit`

```javascript
export const meta = {
  name: 'conformance-audit', // → /tene:conformance-audit
  description: 'Audit each requirement against the implementation, then verify negative findings',
  phases: [
    { title: 'Audit',  detail: 'judge each requirement independently' },
    { title: 'Verify', detail: 'refute missing/partial findings to avoid false negatives' },
  ],
}

const reqs = args?.requirements ?? []

const results = await pipeline(
  reqs,

  r => agent(
    [
      `요구 항목이 구현되었는지 확인하라.`,
      `출처: ${r.source} (${r.refId})`,
      `요구: ${r.statement}`,
      `예상 앵커: ${JSON.stringify(r.expectedAnchors ?? [])}`,
      ``,
      `절차: tene-scan 을 먼저 쓰고, 답하지 못하면 Read 로 확인하라.`,
      `판정: implemented | partial | missing | unverifiable`,
      `· implemented → file:line 근거 필수`,
      `· partial     → file:line + 무엇이 빠졌는지`,
      `· missing     → "확인했으나 없음" 의 근거 (질의 결과 0건 등)`,
      `· unverifiable→ 사유 + 무엇이 있으면 확인 가능한지`,
      ``,
      `근거 없는 implemented 는 금지. 근거가 없으면 unverifiable 이다.`,
    ].join('\n'),
    { phase: 'Audit', label: r.id, schema: JUDGMENT_SCHEMA }
  ),

  // missing/partial 만 재확인 — 오탐(있는데 못 찾음) 방지
  (j, r) => (j.judgment === 'implemented' || j.judgment === 'unverifiable')
    ? { req: r, judgment: j }
    : agent(
        [
          `다음 판정을 반박하라: "${r.statement}" 가 ${j.judgment} 이다.`,
          `판정 근거: ${j.evidence}`,
          ``,
          `실제로 구현되어 있는데 놓친 것은 아닌가?`,
          `· 다른 이름으로 구현되었을 수 있다`,
          `· 다른 파일·다른 계층에 있을 수 있다`,
          `· 인덱서가 지원하지 않는 언어일 수 있다`,
          ``,
          `찾았으면 refuted: true 와 file:line 을 반환하라.`,
        ].join('\n'),
        { phase: 'Verify', label: r.id, schema: REFUTE_FINDING_SCHEMA }
      ).then(v => ({
        req: r,
        judgment: v.refuted
          ? { ...j, judgment: 'implemented', evidence: v.foundAt, note: `재확인: ${v.reason}` }
          : j,
      }))
)

return results.filter(Boolean)
```

**`missing`/`partial` 을 재확인하는 이유**: 인덱서가 못 찾은 것을 미구현으로 오판하면 사용자가 **이미 있는 것을 다시 만든다.** 중복 구현은 이 제품이 막으려는 바로 그 문제다.

---

## 5. `understand-sweep`

```javascript
export const meta = {
  name: 'understand-sweep',  // → /tene:understand-sweep
  description: 'Collect the six questions for many symbols in parallel and build an impact map',
  phases: [
    { title: 'Resolve',  detail: 'resolve target symbols' },
    { title: 'Question', detail: 'six questions per symbol' },
    { title: 'Synthesize', detail: 'merge into an impact map' },
  ],
}

phase('Resolve')
const targets = await agent(
  `다음 패턴에 해당하는 심볼을 나열하라: ${args.pattern}\n` +
  `tene-scan 을 사용하라. exported 심볼을 우선하라. 최대 ${args.limit ?? 50}개.`,
  { schema: { type:'object', required:['symbols'],
              properties:{ symbols: { type:'array', items:{type:'string'} } } } }
)

const answers = await pipeline(
  targets.symbols,
  s => agent(
    `심볼 "${s}" 에 대해 6가지 질문에 답하라.\n` +
    `tene-scan questions ${s} 를 먼저 쓰고, needs-investigation 이면 직접 조사하라.\n` +
    `각 답변에 source(lsp|indexed|investigated)와 confidence 를 붙여라.\n` +
    `모르는 것은 모른다고 쓰라. orphan(참조 0건)과 not_indexed(도구가 못 봄)를 구분하라.`,
    { phase: 'Question', label: s, schema: QUESTIONS_SCHEMA }
  )
)

phase('Synthesize')
const map = await agent(
  `다음 6질문 결과들을 영향 맵으로 합성하라:\n${JSON.stringify(answers.filter(Boolean))}\n\n` +
  `포함할 것:\n` +
  `· 계층별 심볼 분포\n` +
  `· 계층 위반 후보\n` +
  `· orphan 심볼 (삭제 후보)\n` +
  `· 참조가 많은 심볼 (변경 위험 높음)\n` +
  `· unresolved (추적 불가) 목록`,
  { schema: IMPACT_MAP_SCHEMA }
)

return { symbols: answers.filter(Boolean), map }
```

**`parallel` 이 아니라 `pipeline`**: 심볼별로 독립이므로 배리어가 불필요하다. 단 `Synthesize` 는 전체 결과가 필요하므로 pipeline 밖에서 한 번 호출한다.

---

## 6. 스킬이 워크플로를 호출하는 방법

### 6.0 opt-in 근거

Claude Code 는 Workflow 도구 호출에 **명시적 opt-in** 을 요구한다. 그 조건 중 하나가 다음이다.

> *"The user invoked a skill or slash command whose instructions tell you to call Workflow."*

**따라서 스킬 본문이 Workflow 호출을 지시하면 정당한 opt-in 이다.** 단 **명시적으로 써야 한다** — 암묵적으로 기대하면 모델이 호출하지 않는다.

### 6.1 스킬 본문에 넣을 문구 (필수)

```markdown
## 실행 방식 결정

수용 기준이 `workflow_threshold`(기본 8) 이상이거나 사용자가 명시 요청하면
**Workflow 도구로 `qa-sweep` 을 실행한다.**

    Workflow({ name: 'qa-sweep',
               args: { criteria: <AC 배열>, runId: <run id>, startedAt: <ISO> } })

임계 미만이면 서브에이전트를 순차 호출한다 (§6.3).
Claude Code 가 v2.1.154 미만이거나 워크플로가 비활성이면 항상 순차 실행한다.
```

이 문구가 없으면 워크플로가 실행되지 않는다. **`tene-qa`, `tene-loop-check`, `tene-understand` 세 스킬 본문에 반드시 포함한다.**

### 6.2 워크플로 미가용 시 degrade

```javascript
// 스킬 로직 (§6.3 순차 대체)
const canUseWorkflow =
  ccVersionAtLeast('2.1.154') &&
  !config.disableWorkflows &&
  items.length >= config.workflowThreshold

if (canUseWorkflow) {
  result = await runWorkflow('qa-sweep', { criteria: acs, runId })
} else {
  // 순차 실행. 같은 에이전트, 같은 프롬프트, 같은 스키마
  result = []
  for (const ac of acs) {
    const ev = await runAgent('tene:qa-runner', ac)
    const v  = await runAgent('tene:judge', { ac, evidence: ev })
    const r  = v.verdict === 'passed' ? await refuteSequential(ac, ev, v) : null
    result.push(merge(ac, ev, v, r))
  }
}
```

**동일한 프롬프트와 스키마를 쓴다.** 실행 방식만 다르고 판정 기준은 같아야 한다.

사용자에게 알린다:
```
[tene] Dynamic Workflow 를 사용할 수 없어 순차 실행합니다 (Claude Code v2.1.140).
       AC 12건 검증에 시간이 더 걸립니다.
```

---

## 7. 에이전트 카탈로그

| 에이전트 | 도구 | 단계 | 반환 |
|---|---|---|---|
| `tene:interviewer` | Read, Glob, Grep, AskUserQuestion, Write | prd | PRD 경로 + AC 수 + 미해결 질문 |
| `tene:cartographer` | Read, Glob, Grep, Bash | design, loop-check, report | 4계층 맵 + 6질문 표 |
| `tene:gap-auditor` | Read, Glob, Grep, Bash | loop-check | 판정 목록 + 갭 |
| `tene:qa-planner` | Read, Glob, Grep, Bash | qa | Charter + 레이어 계획 |
| `tene:qa-runner` | Bash, Read, Write, Glob, Grep (+Chrome MCP) | qa | 관찰 기록 + 아티팩트 |
| `tene:judge` | Read | qa | verdict |
| `tene:refuter` | Read | qa | refuted 여부 |
| `tene:reporter` | Read, Glob, Grep, Bash, Write | report | report 경로 |

### 7.1 공통 규약

```
· 최종 텍스트가 반환값이다. 인사말·서론 금지
· 읽은 파일 내용을 반환하지 마라. 요약·표만 반환하라
· 모든 사실에 source 와 confidence 를 붙여라
· 확신이 없으면 지어내지 말고 모른다고 쓰라
· frontmatter tools 로 필요한 것만 부여받는다
```

### 7.2 도구 부여 원칙

| 에이전트 | Write | Bash | 이유 |
|---|---|---|---|
| `tene:cartographer` | ❌ | ✅ (tene-scan) | 조사만. 코드·문서 수정 금지 |
| `tene:gap-auditor` | ❌ | ✅ (tene-scan) | 감사만. **코드 수정 금지** |
| `tene:qa-runner` | ✅ (evidence/ 만) | ✅ | 증거 파일 저장 필요 |
| `tene:judge` | ❌ | ❌ | **읽기만.** 실행하면 판정이 오염된다 |
| `tene:refuter` | ❌ | ❌ | 동일 |

**`tene:judge` 와 `tene:refuter` 에 Bash 를 주지 않는 것이 중요하다.** 판정자가 직접 실행하면 수집/판정 분리가 무너진다.

### 7.3 `tene:interviewer` 상세

```yaml
---
name: tene:interviewer
description: 기획 의도를 대화로 추출해 PRD 초안과 수용 기준을 만든다.
tools: Read, Glob, Grep, AskUserQuestion, Write
model: inherit
---
```

```
당신은 기획 의도를 캐내는 인터뷰어다. 코드를 쓰지 않는다.

원칙:
· 사용자가 답하고 당신이 문서를 쓴다
· 관례적 기본값이 있는 것은 묻지 말고 스스로 정한 뒤 "가정" 으로 명시하라
· 답이 없는 것은 지어내지 말고 "열린 결정 사항" 에 남겨라
· AskUserQuestion 한 호출에 최대 4개 질문. 한 번에 한 라운드

반드시 캐낼 것 (사용자가 먼저 말하지 않아도):
  ① 범위 밖 — 비슷하지만 이번에 안 할 것과 그 이유
  ② 실패 경로 — 중간에 실패하면 어디로 가는가
  ③ 되돌아오는 경로 — 뒤로가기·새로고침·중복 제출·재시도
  ④ "이러면 버그다" 라고 말할 수 있는 조건
  ⑤ 데이터가 실패 시 남는가 안 남는가

수용 기준 작성:
· EARS 5패턴만 사용 (Ubiquitous / When / While / If-then / Where)
· 각 AC 에 priority(blocking|non-blocking)와 method(UNIT|DATA|UX) 태깅
· If-then 패턴 최소 1개 필수
· 판정 불가능한 형용사("빠르게","직관적으로","적절히") 거부하고 다시 물어라
· forbidden(이러면 안 되는 것)을 함께 캐내라

의도(Intent) 기록:
· source.kind = "conversation", locator = 세션 참조
· 하나의 의도가 여러 AC 를 낳을 수 있다. 1:1 로 강제하지 마라

종료 조건 (전부 충족 시):
  범위 밖 비어있지 않음 / AC ≥ 1 / If-then ≥ 1 /
  모든 AC 에 priority·method / UX 흐름에 실패 경로 존재

반환: { docPath, intentCount, acCount, openDecisions[], assumptions[] }
```

---

## 8. 워크플로 배포

```
plugins/tene/workflows/
├── qa-sweep.js
├── conformance-audit.js
└── understand-sweep.js
```

플러그인 루트 `workflows/` 에 두면 `meta.name` 앞에 플러그인 네임스페이스가 붙는다.

| `meta.name` | 실행 명령 |
|---|---|
| `qa-sweep` | `/tene:qa-sweep` ✅ |
| ~~`tene-qa-sweep`~~ | ~~`/tene:tene-qa-sweep`~~ ❌ 중복 |

**따라서 `meta.name` 에 `tene-` 접두사를 붙이지 않는다.** 이 문서의 모든 워크플로 예시가 이 규칙을 따른다.

> ⚠️ **구현 중 정정 — 같은 규칙이 스킬과 에이전트에도 적용된다.**
>
> 이 규칙을 워크플로에만 적었다가, 실제로 로드해보니 스킬은 `/tene:tene-prd`,
> 에이전트는 `tene:tene-judge` 로 등록되어 있었다.
>
> | 종류 | 이름의 출처 | 올바른 이름 |
> |---|---|---|
> | 스킬 | **디렉토리 이름** (frontmatter `name:` 은 무시된다) | `skills/prd/` → `/tene:prd` |
> | 에이전트 | 파일명 | `agents/judge.md` → agentType `tene:judge` |
> | 워크플로 | `meta.name` | `qa-sweep` → `/tene:qa-sweep` |
>
> **`agentType` 에는 네임스페이스를 포함해야 한다.** `tene-judge` 만 쓰면 해석되지 않는다 —
> 워크플로 3종이 전부 그렇게 되어 있었고, 실제로는 동작하지 않았을 것이다.
>
> `claude plugin validate` 는 이것을 잡지 못한다. 로드해서 이름을 봐야 안다.

### 8.1 사용자 직접 호출

```
/tene:qa-sweep                     # 현재 sprint 의 AC 전체
/tene:conformance-audit            # 현재 sprint 의 요구 항목 전체
/tene:understand-sweep src/payments/**
```

스킬이 자동 전환하는 경로 외에, 사용자가 직접 부를 수도 있다.

---

## 9. 비용 관리

### 9.1 크기 가이드라인

```
/config workflowSizeGuideline=medium    (기본, <15 에이전트)
```

`qa-sweep` 이 AC 12건이면 최대 12 + 12 + 36 = 60 에이전트가 된다. **medium 가이드라인을 넘는다.**

**대응**: 반박(Refute) 단계를 조건부로 만든다.

```javascript
// 반박 대상 축소 규칙
const needsRefutation = (ac, verdict) =>
  verdict.verdict === 'passed' && (
    ac.priority === 'blocking' ||          // blocking 만 반박
    ac.risk === 'high'
  )
```

blocking AC 만 반박하면 12 + 12 + (blocking 5 × 3) = 39 로 줄어든다.

### 9.2 비용 안내

```
[tene] AC 12건을 워크플로로 검증합니다.
       예상 에이전트: 약 39개 (수집 12 + 판정 12 + 반박 15)
       /workflows 에서 진행 상황을 볼 수 있습니다.
       중단하려면 /workflows 에서 x 를 누르세요.
```

**25개 초과 시 Claude Code 가 `Large workflow` 경고를 표시한다.** 사전에 알려 놀라지 않게 한다.

### 9.3 재개 특성

```
워크플로 중단 시:
  · 완료한 에이전트는 캐시 반환
  · 리플레이는 에이전트 시작 순서를 따름
  · 완료하지 않은 첫 에이전트 이후는 전부 재실행
  · 같은 세션 내에서만 재개 가능

→ 작은 에이전트 다수로 팬아웃한 워크플로가 진행을 더 많이 보존한다
```

`qa-sweep` 이 AC 별로 쪼개진 것은 이 특성에도 유리하다.

---

## 10. 워크플로 vs 순차 판단표

| 상황 | 선택 |
|---|---|
| AC 3건 QA | 순차 (워크플로 오버헤드가 더 큼) |
| AC 12건 QA | 워크플로 |
| 요구 항목 8건 대조 | 순차 |
| 요구 항목 30건 대조 | 워크플로 |
| 심볼 1개 6질문 | 에이전트 직접 (`tene:cartographer`) |
| 심볼 40개 6질문 | 워크플로 |
| PRD 인터뷰 | **항상 순차** (사용자 입력 필요) |
| 계층 규칙 스캔 | **항상 순차** (사용자 확인 필요) |
| report 작성 | **항상 순차** (해석은 하나의 맥락에서) |
