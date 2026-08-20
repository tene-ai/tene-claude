# D07 · Loop Check (문서 ↔ 구현 검증 루프)

> 대응: FR-1.3, W-41~W-47
> 사용자 요구: *"prd, plan, design 문서 내용대로 요구 사항과 기획 및 기능 의도, 설계대로 구현 되었는지 반복 검증 개선하여 100% 달성"*

---

## 1. "100%" 의 정의

| 잘못된 정의 | 올바른 정의 |
|---|---|
| 일치율 백분율 = 100 | **blocking 갭이 0개** |

백분율은 두 가지로 조작된다.
- 분모를 줄인다 (요구 항목을 지운다)
- 평균이 치명적 결함을 희석한다 (9개 사소한 통과가 1개 치명 실패를 가린다)

**따라서 게이트(G5)는 blocking 갭 0 을 요구한다.** 백분율은 *"얼마나 남았나"* 를 사용자에게 보여주는 **진행 표시용**으로만 쓴다.

```
G5 통과 조건:
  · blocking 갭 = 0
  · 미귀속 변경 = 0 (또는 전부 해소됨)
  · (또는) 반복 상한 도달 + waiver 승인
```

---

## 2. 요구 항목 추출

### 2.1 6개 출처

```javascript
// lib/loop/requirements.js
export function extractRequirements(docs) {
  return [
    ...fromPrdAc(docs.prd),           // 수용 기준
    ...fromPlanTasks(docs.plan),      // 작업 항목
    ...fromDesignLogic(docs.design),  // 처리 로직 소절
    ...fromDesignLayers(docs.design), // 4계층 배치
    ...fromDesignTransitions(docs.design), // 화면 전이 엣지
    ...fromDesignContracts(docs.design),   // 데이터 계약
  ]
}
```

### 2.2 Requirement 스키마

```javascript
/**
 * @typedef {Object} Requirement
 * @property {string} id                 req_1, req_2, …
 * @property {string} source             prd:ac | plan:task | design:logic |
 *                                       design:layer | design:transition | design:contract
 * @property {string} refId              원 문서의 ID (ac_1, task_2, "4.1", …)
 * @property {string} statement          요구 내용
 * @property {'blocking'|'non-blocking'} priority
 * @property {string[]} expectedAnchors  이 요구가 걸린 코드 지점 (있으면)
 * @property {number} sourceLine         문서 내 위치
 */
```

### 2.3 priority 계승

| 출처 | priority |
|---|---|
| `prd:ac` | AC 표의 값 그대로 |
| `plan:task` | 커버하는 AC 중 **가장 높은 것** |
| `design:logic` | 관련 AC 중 가장 높은 것, 없으면 `non-blocking` |
| `design:layer` | `non-blocking` (배치는 구조 품질) |
| `design:transition` | 대상 AC 의 priority |
| `design:contract` | 관련 AC 의 priority, 없으면 `blocking` (계약 위반은 치명적) |

---

## 3. 갭 판정

### 3.1 판정 4단계

```javascript
/**
 * @typedef {'implemented'|'partial'|'missing'|'unverifiable'} Judgment
 */
```

| 판정 | 의미 | 필수 근거 |
|---|---|---|
| `implemented` | 구현 확인됨 | **file:line** |
| `partial` | 일부만 구현 | file:line + **무엇이 빠졌는지** |
| `missing` | 구현 안 됨 | **"확인했으나 없음"의 근거** (질의 결과 0건 등) |
| `unverifiable` | 확인 불가 | **사유** (도구 부재, 런타임 필요 등) |

### 3.2 판정 절차

```javascript
// lib/loop/judge.js
export function judgeRequirement(req, index, rules, docs) {
  switch (req.source) {
    case 'prd:ac':
      return judgeAc(req, index)
    case 'plan:task':
      return judgeTask(req, index)
    case 'design:logic':
      return judgeLogic(req, index, docs)
    case 'design:layer':
      return judgeLayerPlacement(req, index, rules)
    case 'design:transition':
      return judgeTransition(req, docs)
    case 'design:contract':
      return judgeContract(req, index)
  }
}
```

**출처별 판정 방법**

| 출처 | 확인 방법 |
|---|---|
| `prd:ac` | 앵커된 심볼이 존재하고 변경되었는가 (`git diff` + `scan defs`) |
| `plan:task` | 작업이 명시한 대상 파일이 변경되었는가 |
| `design:logic` | 설계된 분기·처리가 코드에 있는가 (심볼 존재 + 본문 키워드) |
| `design:layer` | 설계한 계층에 실제로 배치되었는가 (`scan layer`) |
| `design:transition` | 전이를 구현하는 코드가 있는가 (라우팅·상태 전환 심볼) |
| `design:contract` | 시그니처·스키마가 설계와 일치하는가 |

### 3.3 `unverifiable` 을 분모에서 빼는 이유

```
진행률 = Σ score / (전체 - unverifiable)
```

확인할 수 없는 것을 0 으로 세면 진행률이 영원히 100% 가 되지 않는다.

**단 `unverifiable` 개수를 항상 병기한다.**

```
진행률 87% (13.0 / 15) · 확인 불가 2건
```

### 3.4 점수

| 판정 | score |
|---|---|
| `implemented` | 1.0 |
| `partial` | 0.5 |
| `missing` | 0.0 |
| `unverifiable` | 분모에서 제외 |

**score 는 표시용이다.** 게이트는 `blocking && (partial|missing)` 개수만 본다.

---

## 4. Gap 레코드

```javascript
/**
 * @typedef {Object} Gap
 * @property {string} id                 gap_1, gap_2, …
 * @property {'blocker'|'warning'|'info'} severity
 * @property {'missing'|'mismatch'|'unverified'|'regression'|'debt'} kind
 * @property {string} requirementId
 * @property {string} subject            대상 (ac_2, "processPayment", …)
 * @property {string} detail             무엇이 문제인가
 * @property {string} evidence           근거 (file:line 또는 "질의 결과 0건")
 * @property {string} suggestedFix       제안 조치
 * @property {'open'|'resolved'|'waived'} status
 * @property {number} round              발견된 반복 회차
 */
```

### 4.1 severity 결정

```javascript
function severityOf(req, judgment) {
  if (judgment === 'unverifiable') return 'info'
  if (req.priority === 'blocking' && judgment !== 'implemented') return 'blocker'
  if (judgment === 'missing') return 'warning'
  return 'info'
}
```

### 4.2 kind 분류

| kind | 의미 |
|---|---|
| `missing` | 요구된 것이 아예 없음 |
| `mismatch` | 있지만 설계와 다름 (타임아웃 3초 설계 → 5초 구현) |
| `unverified` | 구현은 있으나 확인 수단이 없음 |
| `regression` | 이전 회차에 implemented 였는데 다시 missing |
| `debt` | non-blocking 구조 품질 (계층 위반 등) |

**`regression` 탐지**: 이전 회차 결과와 비교한다. 개선하다가 다른 것을 깨뜨리는 경우를 잡는다.

---

## 4.3 `bin/tene-loop` — 별도 실행파일인 이유

> ⚠️ **구현 중 추가** — 초기 설계에는 loop-check 전용 CLI 가 없었다.

loop-check 판정은 **상태·인덱스·문서를 동시에** 읽는다. 기존 실행파일 어디에 넣어도
경계가 무너진다.

| 넣을 곳 | 무너지는 것 |
|---|---|
| `tene-scan` | 인덱서가 문서와 sprint 상태를 알아야 한다 |
| `tene-state` | 상태 저장소가 코드 인덱스와 문서 파싱을 알아야 한다 |
| `tene-doc` | 문서 계층이 코드 인덱스를 알아야 한다 |

세 계층의 **조합**이므로 조합하는 자리를 따로 둔다.

```
tene-loop check          판정 + 갭 + 미귀속 (기본)
tene-loop requirements   요구 항목만
tene-loop unattributed   미귀속 변경만
```

**판정만 한다. 문서를 쓰지 않는다.** 회차 문서 작성은 `/tene:loop-check` 스킬의 일이다 —
판정(결정론)과 서술(자연어)의 분리를 여기서도 지킨다.

---

## 5. 미귀속 변경 검사

이 검사가 **spec driven 강제의 실질적 수단**이다.

### 5.1 알고리즘

```javascript
// lib/loop/unattributed.js
export function detectUnattributed(sprint, index, anchors) {
  const changed = gitDiffNames(sprint.startCommit, 'HEAD')
  const out = []

  for (const path of changed) {
    if (isDocOrState(path) || isConfigFile(path) || isTestFile(path)) continue
    const acIds = anchors.byPath?.[path] ?? []
    if (acIds.length) continue

    out.push({
      path,
      layer: judgeLayer(path, index, rules).layer,
      symbols: symbolsInFile(index, path),
      linesChanged: gitDiffStat(path),
    })
  }
  return out
}
```

### 5.2 해소 방법 3가지

미귀속 변경은 **반드시 셋 중 하나로 해소**되어야 G5 를 통과한다.

| 해소 | 의미 | 기록 |
|---|---|---|
| **(a) 앵커 추가** | 누락된 앵커였음 | `design.md` 앵커 표에 추가 |
| **(b) 새 AC 로 승격** | PRD 에 없던 요구가 구현됨 → **범위 확장** | 사용자 확인 필수. PRD 갱신 |
| **(c) 무관 변경 표시** | 리팩터링·오타·포맷팅 | `loop-check` 문서에 사유 기록 |

```
[tene:loop-check] 미귀속 변경 3건

  src/utils/format.ts (business-logic, +12/-3)
    이 변경이 어떤 수용 기준을 위한 것입니까?
    (a) ac_2 의 앵커로 추가
    (b) 새 수용 기준으로 추가 (범위 확장 — PRD 갱신)
    (c) 무관 변경 (사유를 적어주세요)
```

### 5.3 자동 판정 가능한 경우

```javascript
// 무관 변경으로 자동 분류 가능한 패턴
const LIKELY_UNRELATED = [
  { test: p => /\.(test|spec)\.[jt]sx?$/.test(p), reason: '테스트 파일' },
  { test: p => /^(README|CHANGELOG|LICENSE)/i.test(basename(p)), reason: '문서' },
  { test: (p, stat) => stat.added === stat.removed && stat.added < 5, reason: '소규모 리팩터링 추정' },
]
```

**자동 분류해도 사용자에게 보여준다.** 조용히 넘어가면 검사의 의미가 없다.

---

## 6. 반복 루프

### 6.1 루프 구조

```javascript
// /tene:loop-check 스킬이 수행하는 로직
async function loopCheck(sprintId) {
  const sprint = loadSprint(sprintId)
  const round = sprint.counters.loopChecks + 1

  // 1. 상한 검사
  if (round > sprint.counters.maxLoopChecks) {
    return {
      status: 'limit-reached',
      message: `반복 상한 ${sprint.counters.maxLoopChecks}회에 도달했습니다.`,
      options: [
        '남은 갭을 해결하고 다시 실행',
        `/tene:sprint waiver 로 예외 승인 후 qa 진행`,
        '범위를 줄이고 PRD 를 갱신',
      ],
      remainingGaps: sprint.gaps.filter(g => g.status === 'open'),
    }
  }

  // 2. 인덱스 최신화
  if (isIndexStale()) await run('tene-scan build --incremental')
  await run(`tene-scan anchors --sprint ${sprintId} --rebuild`)

  // 3. 판정 (항목 수에 따라 워크플로 전환)
  const reqs = extractRequirements(docs)
  const judgments = reqs.length >= 15
    ? await runWorkflow('conformance-audit', { requirements: reqs })
    : await runAgent('tene-gap-auditor', { requirements: reqs })

  // 4. 미귀속 변경
  const unattributed = detectUnattributed(sprint, index, anchors)

  // 5. 회귀 탐지
  const regressions = detectRegressions(sprint, judgments, round)

  // 6. 진행률·수렴
  const progress = computeProgress(judgments)
  const converged = detectConvergence(sprint, progress, round)

  // 7. 문서 작성
  writeLoopCheckDoc(sprintId, round, { judgments, unattributed, regressions, progress })

  // 8. 판정
  const blockers = judgments.filter(j => j.severity === 'blocker' && j.status === 'open')
  if (!blockers.length && !unattributed.length) {
    return { status: 'pass', progress }
  }
  if (converged) {
    return { status: 'stalled', progress, blockers, diagnosis: converged.reason }
  }
  createFixTasks(blockers)
  return { status: 'continue', progress, blockers, round }
}
```

### 6.2 수렴 감지

```javascript
// lib/loop/progress.js
export function detectConvergence(sprint, current, round) {
  if (round < 3) return null                          // 최소 2회 이력 필요
  const history = sprint.loopHistory ?? []            // [{ round, progress, blockerCount }]
  const prev = history[history.length - 1]
  const prev2 = history[history.length - 2]
  if (!prev || !prev2) return null

  const delta1 = current.percent - prev.progress
  const delta2 = prev.progress - prev2.progress

  if (Math.abs(delta1) < 1 && Math.abs(delta2) < 1) {
    return {
      reason: '연속 2회 진행률 변화가 1%p 미만입니다',
      diagnosis: diagnoseStall(sprint, current),
    }
  }
  return null
}

function diagnoseStall(sprint, current) {
  const blockers = sprint.gaps.filter(g => g.severity === 'blocker' && g.status === 'open')
  const byKind = groupBy(blockers, 'kind')

  if (byKind.mismatch?.length > byKind.missing?.length) {
    return '설계와 구현이 계속 어긋납니다. 설계 자체를 재검토하세요 (design 으로 복귀).'
  }
  if (byKind.unverified?.length) {
    return '구현은 되었으나 확인 수단이 없습니다. 검증 방식(AC method)을 재검토하세요.'
  }
  return '같은 갭이 반복 보고됩니다. 요구사항이 실현 불가능하거나 해석이 다를 수 있습니다.'
}
```

**수렴 감지가 필요한 이유**: 상한 3회를 다 쓰는 것보다, 2회 연속 제자리면 **접근법 자체가 잘못된 것**이다. 조기에 사람을 부르는 편이 싸다.

### 6.3 회차별 문서

```
03-analysis/
├── loop-check-1.md
├── loop-check-2.md
└── loop-check-3.md
```

**덮어쓰지 않는다.** 개선 궤적이 남아야 무엇을 시도했는지 알 수 있다.

---

## 7. 문서 양식

```markdown
# <제목> — Loop Check #2

## 1. 판정 요약     <!-- tene:sec=verdict -->

<!-- tene:auto:start block=verdict -->
| 항목 | 값 |
|---|---|
| 반복 회차 | 2 / 3 |
| 진행률 | 87% (13.0 / 15) |
| 확인 불가 | 2건 |
| **blocking 갭** | **1건** |
| 미귀속 변경 | 0건 |
| 회귀 | 0건 |
| **판정** | ❌ **미달 — 개선 계속** |
<!-- tene:auto:end -->

## 2. 문서 ↔ 구현 대조     <!-- tene:sec=comparison -->

<!-- tene:auto:start block=comparison -->
| 출처 | 요구 항목 | 우선도 | 판정 | 근거 |
|---|---|---|---|---|
| prd:ac_1 | 실패 시 입력값 보존 | blocking | ✅ implemented | src/pages/CheckoutPage.tsx:88 |
| prd:ac_2 | status='failed' 기록 | blocking | ❌ missing | scan callers markFailed → 0건 |
| design:logic 4.1 | 3초 타임아웃 분기 | non-blocking | ⚠️ partial | 값이 5초로 하드코딩 (processPayment.ts:55) |
| design:layer persistence | markFailed 신규 | non-blocking | ❌ missing | 심볼 없음 |
| design:transition edge_3 | Processing → ErrorPage | non-blocking | ⬜ unverifiable | 런타임 확인 필요 |
<!-- tene:auto:end -->

## 3. Understanding Layer 대조     <!-- tene:sec=layercheck -->

<!-- tene:auto:start block=layercheck -->
| 계층 | 설계 | 실제 | 차이 |
|---|---|---|---|
| Interface | CheckoutPage 수정 | 수정됨 | — |
| Business Logic | processPayment 분기 추가 | 수정됨 | — |
| Persistence | markFailed 신규 | **미생성** | ac_2 missing 의 원인 |
| Infrastructure | 해당 없음 | 변경 없음 | — |
<!-- tene:auto:end -->

## 4. 미귀속 변경     <!-- tene:sec=unattributed -->

<!-- tene:auto:start block=unattributed -->
(없음)
<!-- tene:auto:end -->

## 5. 계층 위반 / 기술부채     <!-- tene:sec=debt -->

| 종류 | 내용 | 근거 | 심각도 |
|---|---|---|---|
| layer-skip | CheckoutPage → paymentsRepo 직접 참조 | indexed, medium | warning |

## 6. 개선 작업     <!-- tene:sec=fixes -->

| # | 갭 | 조치 | 대상 | 태스크 |
|---|---|---|---|---|
| gap_3 | ac_2 미구현 | paymentsRepo 에 markFailed 추가 후 실패 분기에서 호출 | persistence | 생성됨 |
| gap_4 | 타임아웃 값 불일치 | 5초 → 3초 (설계 §4.1) | business-logic | 생성됨 |

## 7. 이번 회차에서 하지 않은 것     <!-- tene:sec=notdone -->

- edge_3 (Processing → ErrorPage) 는 런타임 확인이 필요해 QA 단계로 미룸

## +@ (자유 관점)
```

---

## 8. `tene-gap-auditor` 에이전트

```yaml
---
name: tene-gap-auditor
description: 문서와 구현의 차이를 찾는다. 코드를 고치지 않는다.
tools: Read, Glob, Grep, Bash
model: inherit
---
```

**시스템 프롬프트 골자**

```
당신은 문서와 구현의 차이를 찾는 감사자다. 코드를 고치지 않는다.

절차:
1. `tene-doc extract --what requirements` 로 요구 항목을 받는다
2. 각 항목이 구현되었는지 확인한다
   · 우선 tene-scan 으로 심볼 존재·참조를 조회한다
   · 인덱스가 답하지 못하면 Read 로 직접 확인한다
3. 판정: implemented(1.0) / partial(0.5) / missing(0.0) / unverifiable(제외)
4. 각 판정에 근거를 붙인다
   · implemented → file:line
   · partial     → file:line + 무엇이 빠졌는지
   · missing     → "확인했으나 없음" 의 근거 (질의 결과 0건 등)
   · unverifiable→ 사유 + 무엇이 있으면 확인 가능한지

절대 금지:
· 진행률을 올리려고 요구 항목을 제외하지 마라
· "아마 되어 있을 것" 으로 implemented 판정하지 마라. 근거가 없으면 unverifiable 이다
· 요구 항목을 재해석해 통과시키지 마라. 문서 문장 그대로 판정한다
· 코드를 수정하지 마라. 갭 목록만 반환한다

반환 (JSON):
{ "judgments": [{ requirementId, judgment, evidence, detail, suggestedFix }],
  "unverifiable": [{ requirementId, reason, toVerify }] }
```

---

## 9. `conformance-audit` 워크플로

요구 항목 15개 이상일 때 전환.

```javascript
export const meta = {
  name: 'conformance-audit', // → /tene:conformance-audit
  description: 'Audit each requirement against the implementation in parallel',
  phases: [{ title: 'Audit' }, { title: 'Verify' }],
}

const reqs = args.requirements

const results = await pipeline(
  reqs,
  // 항목별 독립 감사
  r => agent(
    `Requirement: ${r.statement}\n` +
    `Source: ${r.source} (${r.refId})\n` +
    `Expected anchors: ${JSON.stringify(r.expectedAnchors)}\n\n` +
    `이 요구가 구현되었는지 확인하라. tene-scan 을 먼저 쓰고, 답하지 못하면 Read 로 확인하라.\n` +
    `판정: implemented | partial | missing | unverifiable\n` +
    `근거 없는 implemented 는 금지. 근거가 없으면 unverifiable 이다.`,
    { phase: 'Audit', label: r.id, schema: JUDGMENT_SCHEMA }
  ),
  // missing/partial 판정만 재확인 (오탐 방지)
  (j, r) => j.judgment === 'implemented' ? { r, j } :
    agent(
      `다음 판정을 반박하라: "${r.statement}" 가 ${j.judgment} 이다.\n` +
      `근거: ${j.evidence}\n\n` +
      `실제로 구현되어 있는데 놓친 것은 아닌가? 다른 이름·다른 파일에 있을 수 있다.`,
      { phase: 'Verify', label: r.id, schema: REFUTE_SCHEMA }
    ).then(v => ({ r, j: v.refuted ? { ...j, judgment: 'implemented', note: v.reason } : j }))
)

return results.filter(Boolean)
```

**`missing`/`partial` 을 재확인하는 이유**: 인덱서가 못 찾은 것을 미구현으로 오판하면 사용자가 이미 있는 것을 다시 만든다. **오탐이 미탐보다 비싸다.**

---

## 10. 개선 태스크 생성

```javascript
function createFixTasks(gaps) {
  for (const gap of gaps) {
    TaskCreate({
      title: `[Do] ${gap.suggestedFix}`,
      description:
        `갭: ${gap.detail}\n` +
        `요구 출처: ${gap.requirementId}\n` +
        `근거: ${gap.evidence}\n` +
        `대상 계층: ${gap.layer ?? '미분류'}`,
      blockedBy: [],                       // 즉시 착수 가능
    })
  }
}
```

**태스크 제목에 `[Do]` 를 붙인다** — `TaskCompleted` 훅이 phase 를 파싱하고, do 단계 태스크는 게이트 검사 대상이 아니다(G4 는 빌드만 본다).

---

## 11. 상한 도달 처리 (D11)

```
반복 3회 후에도 blocking 갭이 남으면:

[tene:loop-check] 반복 상한 3회에 도달했습니다.

남은 blocking 갭:
  · gap_3  ac_2 미구현 — paymentsRepo.markFailed 없음
    3회 모두 같은 갭이 보고되었습니다.

진단: 같은 갭이 반복 보고됩니다. 요구사항이 실현 불가능하거나 해석이 다를 수 있습니다.

선택하세요:
  1. 갭을 해결하고 /tene:loop-check 를 다시 실행
  2. /tene:sprint waiver --ac ac_2 --reason "..." 로 예외 승인 후 qa 진행
  3. PRD 를 갱신해 ac_2 를 범위 밖으로 이동 (범위 축소)

어느 쪽이든 report R6 에 기록됩니다.
```

**세 선택지가 전부 기록을 남긴다.** 조용히 넘어가는 경로는 없다.

---

## 12. 진행률 표시 형식

```
진행률 87% (13.0 / 15) · 확인 불가 2건 · blocking 갭 1건

  ██████████████████░░  87%

  implemented    11 ████████████████
  partial         4 ██████
  missing         0
  unverifiable    2 (분모 제외)
```

**blocking 갭 개수를 항상 함께 표시한다.** 87% 만 보면 거의 다 된 것 같지만, blocking 이 1건이면 게이트를 통과하지 못한다.
