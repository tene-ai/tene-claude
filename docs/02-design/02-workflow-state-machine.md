# D02 · 워크플로 상태 기계

> 대응: FR-1.1~1.6, W-2B, W-55, W-68~W-6A
> 관련: [D03 상태 스키마](./03-state-schema.md), [D05 스킬·훅](./05-skills-hooks-routing.md)

---

## 1. Phase 상태 기계

### 1.1 전이표

| From | To | 전이 이름 | 게이트 | 트리거 |
|---|---|---|---|---|
| — | `draft` | CREATE | — | `/tene:sprint init` |
| `draft` | `prd` | START | G0 (id·title 존재) | `/tene:prd` 또는 `start` |
| `prd` | `plan` | PRD_DONE | **G1** | `/tene:plan` 또는 자동 진행 |
| `plan` | `design` | PLAN_DONE | **G2** | `/tene:design` |
| `design` | `do` | DESIGN_DONE | **G3** | 구현 시작 |
| `do` | `loop-check` | DO_DONE | **G4** | `/tene:loop-check` |
| `loop-check` | `do` | LOOP_RETRY | — | 갭 발견 시 (자동) |
| `loop-check` | `qa` | LOOP_DONE | **G5** | `/tene:qa` |
| `qa` | `do` | QA_FAIL_IMPL | — | 결함 원인이 구현 |
| `qa` | `loop-check` | QA_FAIL_TRACE | — | 결함 원인이 추적·증거 |
| `qa` | `design` | QA_FAIL_DESIGN | — | 결함 원인이 설계 |
| `qa` | `prd` | QA_FAIL_SPEC | — | 결함 원인이 요구사항 |
| `qa` | `report` | QA_DONE | **G6** | `/tene:report` |
| `report` | `archived` | REPORT_DONE | **G7** | `/tene:archive` |
| any | `paused` | PAUSE | — | `/tene:sprint pause` |
| `paused` | (직전) | RESUME | — | `/tene:sprint resume` |

### 1.2 다이어그램

```
      ┌─────────┐  G0   ┌─────┐  G1   ┌──────┐  G2   ┌────────┐  G3   ┌────┐
      │  draft  ├──────▶│ prd ├──────▶│ plan ├──────▶│ design ├──────▶│ do │
      └─────────┘       └──▲──┘       └──────┘       └───▲────┘       └─┬──┘
                           │                            │              │ G4
                           │ QA_FAIL_SPEC               │ QA_FAIL_     │
                           │                            │ DESIGN       ▼
                           │                            │        ┌────────────┐
                           │                            │        │ loop-check │◀─┐
                           │                            │        └─────┬──────┘  │
                           │                            │              │ G5      │ LOOP_
                           │                            │              ▼         │ RETRY
                           │                            │         ┌────────┐     │
                           │                            └─────────┤   qa   ├─────┘
                           └──────────────────────────────────────┤        │ QA_FAIL_
                                                                  └───┬────┘ IMPL/TRACE
                                                                      │ G6
                                                                 ┌────▼─────┐  G7  ┌──────────┐
                                                                 │  report  ├─────▶│ archived │
                                                                 └──────────┘      └──────────┘
```

### 1.3 불변식

| # | 불변식 | 강제 지점 |
|---|---|---|
| I-1 | **단계를 건너뛸 수 없다** | `advance` 가 전이표에 없는 조합을 거부 |
| I-2 | `archived` 는 종착점 | `archived` 에서 나가는 전이 없음 |
| I-3 | Profile 이 `light` 여도 phase·파일은 유지 | 필수 **섹션 수**만 줄어든다 |
| I-4 | 게이트 실패 시 전이 없음 | `--force` 는 사용자 확인 + 이벤트 기록 필수 |
| I-5 | `paused` 는 phase 를 덮지 않는다 | `status: paused` + `phase` 는 그대로 |

**I-1 예외**: `--force` 로만 우회 가능하며, 반드시 사용자 확인을 받고 `PhaseForced` 이벤트를 남긴다.

---

## 2. 게이트 규칙 (G0~G7)

### 2.1 규칙 정의

```javascript
// lib/gate/rules.js
export const GATES = {
  G0: { from: 'draft', to: 'prd', checks: ['sprint_identity'] },
  G1: { from: 'prd', to: 'plan', checks: [
    'doc_exists:prd', 'doc_sections:prd', 'nongoals_nonempty',
    'intent_count_min:1', 'ac_count_min:1', 'ac_method_tagged',
    'ac_unwanted_min:1', 'ac_no_vague_adjective',
  ]},
  G2: { from: 'plan', to: 'design', checks: [
    'doc_exists:plan', 'doc_sections:plan', 'ac_coverage_full',
  ]},
  G3: { from: 'design', to: 'do', checks: [
    'doc_exists:design', 'doc_sections:design',
    'layers_all_four', 'questions_present',
    'transitions_present_if_ux_ac', 'anchors_resolved',
  ]},
  G4: { from: 'do', to: 'loop-check', checks: [
    'changed_files_min:1', 'build_ok_if_configured',
  ]},
  G5: { from: 'loop-check', to: 'qa', checks: [
    'doc_exists:loop-check', 'blocking_gaps_zero', 'unattributed_resolved',
  ]},
  G6: { from: 'qa', to: 'report', checks: [
    'doc_exists:qa', 'all_ac_judged', 'blocking_ac_all_passed',
    'evidence_valid', 'stale_zero', 'required_layers_resolved',
  ]},
  G7: { from: 'report', to: 'archived', checks: [
    'doc_exists:report', 'r1_to_r6_present', 'r4_all_four_layers', 'r6_reasons_present',
  ]},
}
```

### 2.2 검사 항목 상세

| 검사 ID | 판정 로직 | 실패 메시지 예 |
|---|---|---|
| `sprint_identity` | id 형식 `^[a-z][a-z0-9-]*$`, title 비어있지 않음 | "sprint id 는 소문자·숫자·하이픈만" |
| `doc_exists:<t>` | 해당 문서 파일 존재 | "`00-prd/prd.md` 가 없습니다" |
| `doc_sections:<t>` | 필수 섹션 앵커 전부 존재 | "누락 섹션: nongoals, dataflow" |
| `nongoals_nonempty` | `nongoals` 섹션이 플레이스홀더가 아님 | "범위 밖이 비어 있습니다. '없음'이라도 명시하세요" |
| `intent_count_min:N` | Intent 표 행 ≥ N | "확정된 의도가 없습니다" |
| `ac_count_min:N` | AC 표 행 ≥ N | "수용 기준이 없습니다" |
| `ac_method_tagged` | 모든 AC 의 방식 ∈ {UNIT,DATA,UX} | "AC-3 에 검증 방식이 없습니다" |
| `ac_unwanted_min:N` | If-then 패턴 AC ≥ N | "실패 조건(If-then) 기준이 없습니다" |
| `ac_no_vague_adjective` | 금지 형용사 미포함 | "AC-2 의 '빠르게' 는 판정 불가합니다" |
| `ac_coverage_full` | uncovered AC = 0 | "AC-4 를 커버하는 작업이 없습니다" |
| `layers_all_four` | 4개 하위 섹션 존재 (내용 무관) | "Infrastructure 계층이 기재되지 않았습니다" |
| `questions_present` | 6질문 표 ≥ 1 | "6가지 질문 표가 없습니다" |
| `transitions_present_if_ux_ac` | UX AC 있으면 전이 표 ≥ 1 행 | "UX 기준이 있는데 화면 전이가 없습니다" |
| `anchors_resolved` | 모든 AC 에 앵커 ≥ 1 | "AC-3 에 앵커가 없습니다" |
| `changed_files_min:N` | git diff 파일 수 ≥ N | "변경된 파일이 없습니다" |
| `build_ok_if_configured` | 빌드 명령 설정 시 exit 0 | "타입체크 실패: ..." |
| `blocking_gaps_zero` | severity=blocker 갭 = 0 | "blocking 갭 2건 남음" |
| `unattributed_resolved` | 미귀속 변경 = 0 | "3개 파일이 어떤 AC 에도 앵커되지 않았습니다" |
| `all_ac_judged` | 모든 AC 에 verdict 존재 | "AC-5 가 판정되지 않았습니다" |
| `blocking_ac_all_passed` | blocking AC 전부 `passed` | "AC-2 가 failed 입니다" |
| `evidence_valid` | passed AC 의 증거 hash 유효 | "AC-1 의 증거 해시가 불일치합니다" |
| `stale_zero` | stale AC = 0 | "AC-2 가 코드 변경 후 재검증되지 않았습니다" |
| `required_layers_resolved` | required 레이어 전부 처리 | "L6 이 미해결입니다" |
| `r1_to_r6_present` | R1~R6 섹션 존재+비어있지 않음 | "R3 이 비어 있습니다" |
| `r4_all_four_layers` | R4 에 4계층 전부 | "R4 에 Persistence 가 없습니다" |
| `r6_reasons_present` | 각 이월 항목에 사유 | "C1 에 사유가 없습니다" |

### 2.3 게이트 판정 출력

```javascript
// lib/gate/finding.js
/**
 * @typedef {Object} Finding
 * @property {string} code            검사 ID
 * @property {'blocker'|'warning'|'info'} severity
 * @property {string} message         사람이 읽는 설명
 * @property {string[]} subjects      관련 대상 (AC id, 파일 경로 등)
 * @property {string[]} evidence      근거 (file:line, 증거 경로)
 * @property {Object} remediation
 * @property {string} remediation.skill        복구 스킬 (호스트 접두사 없음: "qa")
 * @property {string} remediation.description  구체적 행동
 * @property {boolean} waivable       waiver 로 우회 가능한가
 */
```

```jsonc
// tene-gate check --gate G6 --json 출력
{ "ok": true, "data": {
  "gate": "G6", "result": "fail",
  "checks": [
    { "code": "doc_exists:qa",         "pass": true },
    { "code": "all_ac_judged",         "pass": true },
    { "code": "blocking_ac_all_passed","pass": false },
    { "code": "evidence_valid",        "pass": true },
    { "code": "stale_zero",            "pass": true },
    { "code": "required_layers_resolved","pass": false }
  ],
  "findings": [
    { "code": "blocking_ac_all_passed", "severity": "blocker",
      "message": "AC-2 (blocking) 가 failed 입니다",
      "subjects": ["ac_2"],
      "evidence": ["docs/sprints/checkout-retry-.../evidence/run_01/AC-2.json"],
      "remediation": { "skill": "loop-check",
                       "description": "payments 테이블 실패 기록 구현을 확인하세요" },
      "waivable": false },
    { "code": "required_layers_resolved", "severity": "blocker",
      "message": "L6 (Adversarial/Recovery) 가 미해결입니다",
      "subjects": ["L6"],
      "evidence": [],
      "remediation": { "skill": "qa",
                       "description": "L6 을 실행하거나 not-applicable 사유를 기록하세요" },
      "waivable": true }
  ],
  "insufficient": [
    { "ac": "ac_3", "reason": "타임아웃 재현 환경 부재",
      "toMeasure": "목 서버에 지연 주입 필요" }
  ]
}}
```

**`remediation.skill` 은 호스트 접두사 없이** 반환한다. 어댑터(스킬/훅)가 `/tene:` 를 붙인다.

### 2.4 `insufficient` 의 게이트 취급

| 판정 | G6 차단? | report 기록 |
|---|---|---|
| `passed` | 아니오 | R3 매핑 |
| `failed` (blocking) | **예** | R6 |
| `failed` (non-blocking) | 아니오 (debt 로 기록) | R6 |
| `insufficient` | **아니오** | **R6 에 사유 + 측정 조건 필수** |
| `not-applicable` | 아니오 (승인된 근거 필요) | R4 |

> `insufficient` 가 게이트를 막지 않는 이유: 환경 부재는 개발자 잘못이 아니다. 하지만 **반드시 report 에 남아** 다음 sprint 로 이월된다.

---

## 3. Profile 과 자동 진행

### 3.1 Profile — 규율 강도

| Profile | 문서 | 게이트 | 인터뷰 | 용도 |
|---|---|---|---|---|
| `strict` | 7종 전부 분리 | 전 게이트 + waiver 승인 필요 | 전 라운드 | 규제·핵심 기능 |
| `standard` | 7종 전부 | 전 게이트 | R1~R7 | **기본값** |
| `light` | prd+plan 합침, design+loop-check 합침 | 전 게이트 (기준 완화) | R1,R3,R6 만 | 소규모 변경 |
| `off` | 스캐폴드만 | 검사만 (차단 없음) | 없음 | 탐색·프로토타입 |

**`light` 에서도 phase 는 전부 거친다.** 문서 파일이 합쳐질 뿐 게이트 이벤트는 동일하게 기록된다(I-3).

**Profile 은 파일 개수가 아니라 섹션 수를 줄인다.** 모든 Profile 에서 문서 파일은 동일하게 분리된다 — 파서·검증기·patch 로직이 Profile 에 따라 갈라지지 않아야 하기 때문이다.

```javascript
// lib/doc/sections.js — Profile 별 필수 섹션
const REQUIRED_BY_PROFILE = {
  strict:   SECTIONS,                                    // 전 섹션
  standard: SECTIONS,                                    // 전 섹션 (기본)
  light: {
    prd:          ['nongoals', 'intents', 'ac'],         // 배경·목표·흐름 생략 가능
    plan:         ['tasks', 'coverage'],
    design:       ['layers', 'questions', 'anchors'],    // 4계층·6질문은 light 에서도 필수
    'loop-check': ['verdict', 'comparison'],
    qa:           ['gate', 'acverdicts', 'insufficient'],
    report:       ['r1','r2','r3','r4','r5','r6'],       // R1~R6 은 어느 Profile 에서도 필수
    'master-plan':['status', 'sprints'],
  },
  off: {},                                               // 검증하되 게이트가 차단하지 않음
}
```

| Profile | 파일 | 섹션 | 게이트 |
|---|---|---|---|
| `strict` | 7종 분리 | 전부 | 전 게이트 + waiver 명시 승인 |
| `standard` | 7종 분리 | 전부 | 전 게이트 |
| `light` | **7종 분리 (동일)** | 축소 | 전 게이트 (기준 완화) |
| `off` | 7종 분리 (동일) | 축소 | 검사만, 차단 없음 |

> **`light` 에서도 4계층·6질문·R1~R6 은 필수다.** 이것이 제품 정체성이므로 어느 Profile 에서도 면제하지 않는다.

### 3.2 자동 진행 (`--auto-until`)

Profile 과 **독립된 축**이다. 어디까지 사용자 확인 없이 진행할지.

```
/tene:sprint start checkout-retry --auto-until qa

prd → plan → design → do → loop-check → qa 까지 자동
report 진입 전 사용자 확인
```

| 값 | 자동 진행 범위 | 기본 |
|---|---|---|
| `prd` | PRD 작성 후 정지 | |
| `design` | 설계까지 | **기본값** |
| `loop-check` | 검증 루프까지 | |
| `qa` | QA 판정까지 | |
| `archived` | 전부 | |

**자동 진행 중에도 게이트는 그대로 작동한다.** 실패하면 정지하고 사용자에게 알린다.

### 3.3 정지 조건

```
자동 진행 루프는 다음 중 하나에서 정지한다:
  1. 게이트 실패
  2. --auto-until 경계 도달
  3. 반복 상한 도달 (loop-check)
  4. 사용자 입력이 필요한 시점 (PRD 인터뷰는 항상 사용자 상호작용)
  5. 사용자 중단 (Esc)
```

---

## 4. Waiver

### 4.1 개념

blocking AC 또는 required 레이어를 **명시적으로 예외 승인**한다. 없으면 사용자가 AC 를 몰래 지우거나 non-blocking 으로 강등한다.

```javascript
/**
 * @typedef {Object} Waiver
 * @property {string} waiver_id
 * @property {'ac'|'layer'|'gap'} target_kind
 * @property {string} target_id
 * @property {string} reason           왜 예외인가 (필수)
 * @property {string} requested_by
 * @property {string} requested_at
 * @property {string} [approved_by]
 * @property {string} [approved_at]
 * @property {string} [expires_at]     만료 후 자동 무효
 * @property {'requested'|'approved'|'expired'|'revoked'} status
 */
```

### 4.2 절차

```
/tene:sprint waiver --ac ac_3 --reason "타임아웃 재현 환경이 없어 이번 sprint 에서 측정 불가"
  │
  ├─ Profile=strict  → AskUserQuestion 으로 명시 승인 요구
  ├─ Profile=standard → 사유 확인 후 승인 (사용자가 요청한 것 자체가 승인)
  └─ Profile=off      → waiver 불필요 (게이트가 차단 안 함)
  │
  ▼
상태에 기록 + events.ndjson 에 WaiverGranted
  │
  ▼
G6 재판정: waiver 가 있는 AC 는 blocking 판정에서 제외
  │
  ▼
report R6 에 "waiver 로 처리된 항목" 으로 자동 기재 (사유 포함)
```

### 4.3 규칙

| 규칙 | 내용 |
|---|---|
| 사유 필수 | 빈 사유는 거부 |
| 만료 | 기본 만료 없음. 지정 시 만료 후 자동 `expired` → 게이트 재차단 |
| 승계 금지 | sprint 를 fork 해도 waiver 는 복사되지 않는다 |
| 보고 | report R6 에 반드시 기재. 조용히 넘어가지 않는다 |
| 취소 | `--revoke <waiver_id>` |

---

## 5. Task Management 매핑

### 5.1 태스크 생성 규칙

```
sprint 생성 시:
  [Sprint] <title>                                          (in_progress)

phase 진입 시 (해당 phase 태스크가 없으면):
  [PRD]       의도 인터뷰 및 수용 기준 정의
  [Plan]      작업 계획 수립                blockedBy: [PRD]
  [Design]    처리 로직 설계 + 4계층 분류    blockedBy: [Plan]
  [Do] T1 …                                blockedBy: [Design]
  [Do] T2 …                                blockedBy: [Design]
  [LoopCheck] 문서-구현 일치 검증            blockedBy: [Do] 전부
  [QA]        수용 기준 검증 및 게이트 판정   blockedBy: [LoopCheck]
  [Report]    회고 문서 작성                blockedBy: [QA]
```

**`[Do]` 태스크는 plan 단계에서 작업 항목별로 생성**한다. 나머지는 phase 진입 시.

### 5.2 태스크 ↔ 상태 동기화

| 방향 | 시점 | 동작 |
|---|---|---|
| 상태 → 태스크 | phase 전이 | 해당 phase 태스크를 `completed`, 다음을 `in_progress` |
| 태스크 → 상태 | `TaskCompleted` 훅 | **게이트 검사만.** 상태를 바꾸지 않는다 |

**태스크는 미러다.** 불일치 시 상태 파일이 이긴다(D03 §8).

### 5.3 `TaskCompleted` 훅 로직

```javascript
// lib/hooks/task-completed.js
export function run(payload) {
  const phase = parsePhaseFromTitle(payload.task.title)   // [QA] → 'qa'
  if (!phase) return { exit: 0 }                          // tene 태스크가 아님

  const sprint = loadActiveSprint()
  if (!sprint) return { exit: 0 }

  const gate = GATE_BY_PHASE[phase]                       // qa → G6
  const result = evaluateGate(sprint, gate)

  if (result.result === 'fail') {
    return {
      exit: 2,
      stderr: formatBlockMessage(gate, result.findings),  // §5.4
    }
  }
  return { exit: 0 }
}
```

### 5.4 차단 메시지 형식

```
G6 게이트 실패로 [QA] 태스크를 완료할 수 없습니다.

차단 원인:
  · AC-2 (blocking) failed — payments 테이블에 실패 기록 없음
    증거: docs/sprints/checkout-retry-.../evidence/run_01/AC-2.json
  · L6 (Adversarial/Recovery) 미해결

복구 경로:
  · /tene:loop-check 로 돌아가 구현 갭을 메우세요
  · L6 을 실행하거나 not-applicable 사유를 기록하세요
  · 환경상 불가하다면: /tene:sprint waiver --layer L6 --reason "..."

미측정 (게이트를 막지 않으나 report 에 기록됩니다):
  · AC-3 — 타임아웃 재현 환경 부재
```

**세 부분이 반드시 있어야 한다**: 차단 원인 / 복구 경로 / 미측정 항목. 차단만 하고 길을 알려주지 않으면 사용자가 막힌다.

---

## 6. Master Plan

### 6.1 책임 (4가지)

| # | 책임 | 자동/수동 |
|---|---|---|
| M-1 | sprint 목록·순서·의존 **선언** | 수동 |
| M-2 | 각 sprint 상태 **집계** | 자동 |
| M-3 | 이월·미결 **집결** | 자동 |
| M-4 | 다음 sprint **추천** | 자동 (추천만) |

### 6.2 집계 알고리즘

```javascript
// lib/plan/aggregate.js
export function aggregate(stateDir, docsRoot) {
  const fromState = loadAllSprintStates(stateDir)
  const fromDocs  = scanSprintDirs(docsRoot)          // 문서가 정본

  const merged = new Map()
  for (const s of fromDocs) merged.set(s.id, { ...s, source: 'docs' })
  for (const s of fromState) {
    merged.set(s.id, { ...merged.get(s.id), ...s, source: 'state+docs' })
  }
  // 상태에만 있고 문서가 없는 sprint → 경고 (문서 삭제됨)
  // 문서에만 있고 상태가 없는 sprint → resync 대상

  return {
    sprints: [...merged.values()].map(summarize),
    carryOver: collectCarryOver([...merged.values()]),
    warnings: detectInconsistencies(merged),
  }
}
```

### 6.3 `--next` 추천

```javascript
export function recommendNext(plan) {
  const candidates = plan.sprints.filter(s =>
    s.status === 'planned' &&
    s.dependsOn.every(d => plan.sprints.find(x => x.id === d)?.status === 'archived')
  )
  if (!candidates.length) return { next: null, reason: '선행 sprint 미완료' }

  candidates.sort((a, b) =>
    countDependents(plan, b.id) - countDependents(plan, a.id) ||   // 많이 막는 것 먼저
    a.order - b.order ||
    a.createdAt.localeCompare(b.createdAt)
  )

  const next = candidates[0]
  return {
    next: next.id,
    blockedByDecisions: plan.carryOver.filter(c =>
      c.kind === 'decision' && c.status === 'open' && c.blocks?.includes(next.id)),
    inheritedDeferred: plan.carryOver.filter(c =>
      c.kind === 'deferred' && c.status === 'open' && c.targetSprint === next.id),
  }
}
```

**결정 대기 항목이 있어도 추천하되 경고를 붙인다.** 결정 없이 시작하면 design 에서 막힌다.

### 6.4 이월 승격 경로

```
sprint 진행 중 발견
   ├─ QA insufficient
   ├─ loop-check 잔여 갭 (상한 도달)
   ├─ PRD 미해결 열린 결정
   ├─ design 6질문에서 드러난 위험
   └─ waiver 승인 항목
          │
          ▼ 상태 sprints/<id>.json  carryOver[]
          │
          ▼ report R6 에 사유와 함께 기재  (G7 이 사유 존재를 검사)
          │
          ▼ archive 시 master-plan.json carryOver[] 로 승격 (from: <sprint>)
          │
   ┌──────┴──────┐
   ▼             ▼
decision      deferred
· --next 시 경고   · 새 sprint PRD 인터뷰에서 "이월 항목이 있습니다" 제시
· blocks[] 차단    · 채택 시 그 sprint 의 AC 로 승격, status: adopted
· 해결 시 resolved · 폐기도 사유 필수
```

### 6.5 승격 시점

**`archive` 시점**에 승격한다. report 작성 중에는 아직 sprint 소유다.

```javascript
// lib/plan/promote.js
export function promoteOnArchive(sprintState, masterPlan) {
  const promoted = sprintState.carryOver.map(c => ({
    ...c,
    id: `${sprintState.id}:${c.id}`,       // 출처 포함 ID
    from: sprintState.id,
    status: 'open',
    promotedAt: nowIso(),
  }))
  return { ...masterPlan, carryOver: [...masterPlan.carryOver, ...promoted] }
}
```

---

## 7. 전이 실행 (`tene-state advance`)

```javascript
// lib/state/store.js
export async function advance(sprintId, toPhase, opts = {}) {
  return withLock(async () => {
    const sprint = await loadSprint(sprintId)

    // 1. 전이 유효성
    const transition = findTransition(sprint.phase, toPhase)
    if (!transition) {
      if (!opts.force) throw new TeneError('INVALID_TRANSITION', {
        from: sprint.phase, to: toPhase,
        hint: `허용된 전이: ${allowedFrom(sprint.phase).join(', ')}`,
      })
    }

    // 2. 게이트
    if (transition?.gate && !opts.skipGate) {
      const gate = evaluateGate(sprint, transition.gate)
      if (gate.result === 'fail' && !opts.force) {
        throw new TeneError('GATE_BLOCKED', { gate: transition.gate, findings: gate.findings })
      }
      sprint.gates[transition.gate] = {
        result: gate.result, at: nowIso(),
        detail: gate.summary, forced: !!opts.force,
      }
    }

    // 3. 낙관적 잠금 — rev 비교 (D12 §3.3)
    if (opts.expectedRev !== undefined && opts.expectedRev !== sprint.rev) {
      throw new TeneError('STALE_WRITE', { expectedRev: opts.expectedRev, actualRev: sprint.rev })
    }

    // 4. 전이
    const from = sprint.phase
    sprint.phase = toPhase
    sprint.updatedAt = nowIso()
    await saveSprint(sprint)
    await appendEvent({ type: opts.force ? 'PhaseForced' : 'PhaseTransitioned',
                        sprint: sprintId, from, to: toPhase, gate: transition?.gate })
    await updateCurrent(sprint)

    return { from, to: toPhase, gate: transition?.gate ?? null }
  })
}
```

### 7.1 `--dry-run`

```
tene-state advance --sprint x --to qa --dry-run
→ 실제 전이 없이 게이트 판정 결과만 반환
```

**`--dry-run` 과 실제 전이는 같은 게이트 함수를 호출한다.** 다른 코드 경로를 쓰면 판정이 갈린다.

---

## 8. 이벤트 타입

| 이벤트 | 발생 | payload |
|---|---|---|
| `SprintCreated` | init | `{ id, title, profile }` |
| `PhaseTransitioned` | advance | `{ from, to, gate }` |
| `PhaseForced` | advance --force | `{ from, to, gate, reason }` |
| `GateEvaluated` | 게이트 판정 | `{ gate, result, blockerCount }` |
| `IntentCaptured` | PRD 인터뷰 | `{ intentId, source }` |
| `AcJudged` | QA 판정 | `{ acId, verdict, evidenceRef }` |
| `AcStaled` | 코드 변경 | `{ acId, cause }` |
| `GapRecorded` | loop-check | `{ gapId, severity }` |
| `WaiverGranted` | waiver | `{ waiverId, target, reason }` |
| `EvidenceRegistered` | QA 실행 | `{ runId, artifactCount }` |
| `SprintPaused` / `SprintResumed` | pause/resume | `{ reason }` |
| `SprintArchived` | archive | `{ carryOverCount }` |
| `StateResynced` | resync | `{ recoveredFrom }` |
