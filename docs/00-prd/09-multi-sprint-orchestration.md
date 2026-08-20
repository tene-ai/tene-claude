# tene plugin — 멀티 sprint 오케스트레이션

> 대응 갭: G-d ("sprint 의 모음으로 workflow 와 task management system 을 이용해 체계적으로 작업")
> 목적: 단일 sprint 를 넘어 **여러 sprint 를 하나의 계획으로 굴리는** 구조를 규정

---

## 0. 세 개의 층위

사용자 요구를 정확히 읽으면 관리 단위가 셋이다.

```
┌─────────────────────────────────────────────────────────────┐
│ Master Plan   여러 sprint 를 묶는 상위 계획                    │
│               목표 · 순서 · 의존 · 공통 제약 · 이월 집계        │
├─────────────────────────────────────────────────────────────┤
│ Sprint        8단계 사이클 1회전                              │
│               prd→plan→design→do→check→qa→report→archive    │
├─────────────────────────────────────────────────────────────┤
│ Task          Claude Code Task Management 항목                │
│               phase 태스크 + do 작업 태스크                    │
└─────────────────────────────────────────────────────────────┘
```

각 층위가 쓰는 Claude Code 기능이 다르다.

| 층위 | 주 수단 | 이유 |
|---|---|---|
| Master Plan | **문서 + 상태 파일** | 사람이 읽고 결정하는 대상. 자동화 대상이 아님 |
| Sprint | **스킬 + 훅 + 게이트** | 절차 강제가 핵심 |
| Task | **Task Management (blockedBy)** | Claude Code가 의존을 자동 관리해줌 |
| 대량 반복 작업 | **Dynamic Workflow** | 컨텍스트를 오염시키지 않고 팬아웃 |

---

## 1. Master Plan 의 책임

Master Plan 이 하는 일은 **네 가지뿐**이다. 그 이상을 자동화하려 하면 사람의 판단을 빼앗는다.

| # | 책임 | 자동/수동 |
|---|---|---|
| M-1 | sprint 목록·순서·의존을 **선언**한다 | 수동 (사람이 결정) |
| M-2 | 각 sprint 의 **현재 상태를 집계**해 보여준다 | 자동 |
| M-3 | sprint 들의 **이월·미결 항목을 한 곳에 모은다** | 자동 |
| M-4 | 다음에 할 sprint 를 **추천**한다 | 자동 (추천만, 실행은 사람) |

> sprint 간 의존을 자동 추론하지 않는다(06 §7). 사람이 master plan 에 선언한다. 잘못 추론한 의존은 잘못된 순서로 이어지고, 그 비용이 수동 선언 비용보다 크다.

---

## 2. `/tene:master-plan` 동작

```bash
/tene:master-plan                    # 집계 갱신 + 렌더링
/tene:master-plan --add <id>         # sprint 를 계획에 추가
/tene:master-plan --order            # 순서·의존 편집 (AskUserQuestion)
/tene:master-plan --next             # 다음 sprint 추천
/tene:master-plan --carry            # 이월·미결만 보기
```

### 2.1 집계 알고리즘

```
1. .tene-claude/state/sprints/*.json 전부 로드
2. docs/sprints/*/ 스캔 → 상태에 없는 sprint 발견 시 추가 (문서가 정본)
3. 각 sprint 에서 추출:
     status, phase, 게이트 요약, 일치율(G5), QA 결과(G6),
     AC 통계, 전이 커버리지, carryOver[]
4. master-plan.json 갱신
5. master-plan.md 의 자동 생성 영역만 patch
```

### 2.2 `--next` 추천 규칙

```
후보 = status가 planned 이고 모든 선행 sprint 가 archived 인 sprint

정렬 우선순위:
  1. 다른 sprint 가 이 sprint 를 선행으로 지정한 개수 (많을수록 먼저)
  2. master plan 에 선언된 순서
  3. 생성 시각

추천 시 함께 표시:
  · 이 sprint 를 막고 있는 미결 결정 사항 (carryOver 중 kind=decision)
  · 이 sprint 가 상속받는 이월 작업 (kind=deferred 중 대상이 이 sprint 인 것)
```

**결정 대기 항목이 있는 sprint 는 추천하되 경고를 붙인다.** 결정 없이 시작하면 design 에서 막힌다.

### 2.3 상태 스키마

```jsonc
// .tene-claude/state/master-plan.json
{
  "schemaVersion": 1,
  "title": "결제 흐름 개선",
  "goal": "결제 실패로 인한 이탈률을 절반으로 줄인다",
  "updatedAt": "2026-08-20T04:30:00Z",
  "sprints": [
    { "id": "payment-core",   "order": 1, "dependsOn": [],               "status": "archived" },
    { "id": "checkout-retry", "order": 2, "dependsOn": ["payment-core"], "status": "active"   },
    { "id": "refund-flow",    "order": 3, "dependsOn": ["payment-core"], "status": "planned"  }
  ],
  "carryOver": [
    { "id": "D1", "from": "checkout-retry", "kind": "decision",
      "title": "재시도 잡의 멱등키 정책", "reason": "R5에서 미설계 호출 경로 발견",
      "status": "open", "blocks": ["refund-flow"], "raisedAt": "2026-08-20T04:20:00Z" },
    { "id": "C1", "from": "checkout-retry", "kind": "deferred",
      "title": "5xx → ErrorPage 전이 검증", "reason": "5xx 재현 환경 부재",
      "status": "open", "targetSprint": null }
  ],
  "constraints": ["PG사 응답 지연 3초 가정", "모바일 우선"]
}
```

---

## 3. Task Management 연동

### 3.1 태스크 계층

```
[Master] 결제 흐름 개선                              ← 선택적. sprint 3개 이상일 때만
  ├─ [Sprint] payment-core                    (completed)
  ├─ [Sprint] checkout-retry                  (in_progress)
  │    ├─ [PRD]    의도 인터뷰 및 AC 정의       (completed)
  │    ├─ [Plan]   작업 계획 수립               (completed)  blockedBy: PRD
  │    ├─ [Design] 처리 로직 설계 + 4계층 분류   (completed)  blockedBy: Plan
  │    ├─ [Do] T1 결제 실패 응답 처리 (AC-2)     (completed)  blockedBy: Design
  │    ├─ [Do] T2 입력값 보존 상태 관리 (AC-1)   (completed)  blockedBy: Design
  │    ├─ [LoopCheck] 일치율 100% 달성              (completed)  blockedBy: T1,T2
  │    ├─ [QA]    AC 검증 및 게이트 판정         (in_progress) blockedBy: Check
  │    └─ [Report] 회고 문서 작성               (pending)    blockedBy: QA
  └─ [Sprint] refund-flow                     (pending)    blockedBy: checkout-retry
```

### 3.2 이 구조가 주는 것

| 효과 | 메커니즘 |
|---|---|
| phase 순서 자동 강제 | `blockedBy` — 선행 미완료 시 claim 불가 |
| 완료 선언의 반증 | `TaskCompleted` 훅이 게이트로 검사 (08 §6.3) |
| sprint 간 순서 강제 | sprint 태스크의 `blockedBy` |
| 진행 가시화 | Claude Code 기본 태스크 뷰 |
| 세션 간 유지 | `~/.claude/tasks/` 에 로컬 영속 |

### 3.3 태스크와 상태 파일의 관계

**태스크가 정본이 아니다.** 상태 파일이 정본이고, 태스크는 미러다.

| 이유 | 설명 |
|---|---|
| 태스크는 세션 파생 이름(`session-xxxxxxxx`)에 묶인다 | 세션이 바뀌면 다른 태스크 리스트가 될 수 있다 |
| 태스크 상태 지연이 알려진 한계다 | 팀메이트가 완료 표시를 누락하는 경우가 보고됨 |
| 태스크는 업로드되지 않고 로컬에만 있다 | 팀 공유 불가 |

→ **`/tene:sprint status` 는 상태 파일을 읽는다.** 태스크는 사용자 가시성을 위한 표면일 뿐이다. 불일치 시 상태 파일이 이긴다.

---

## 4. 이월·미결의 승격 경로

이 경로가 **"조용히 사라지는 미결 항목"을 막는 장치**다.

```
sprint 진행 중 발견
      │
      ├─ QA insufficient        ──┐
      ├─ check 잔여 갭 (상한 도달) ─┤
      ├─ PRD 미해결 열린 결정      ─┤
      └─ design 6질문에서 드러난 위험 ┘
                                  │
                                  ▼
                   상태 sprints/<id>.json  carryOver[]
                                  │  (report 단계)
                                  ▼
                       report R6 에 사유와 함께 기재
                                  │  (report 완료 시 자동)
                                  ▼
                   master-plan.json  carryOver[]  (from: <sprint>)
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
        kind: decision                  kind: deferred
        · 다음 sprint 추천 시 경고        · 새 sprint 의 PRD 인터뷰에서
        · blocks[] 로 특정 sprint 차단      "이월 항목이 있습니다" 제시
        · 해결 시 status: resolved         · 채택하면 그 sprint 의 AC 로 승격
```

### 4.1 승격 규칙

| 출처 | kind | 처리 |
|---|---|---|
| QA `insufficient` | `deferred` | "무엇이 있으면 측정 가능한지"를 reason 에 포함 |
| check 잔여 갭 | `deferred` | 갭 목록과 일치율을 reason 에 포함 |
| PRD 열린 결정 | `decision` | 결정자와 선택지를 포함 |
| design 6질문 발견 위험 | `decision` 또는 `deferred` | 위험도에 따라 판단, 기본 `decision` |

### 4.2 해결 처리

```
/tene:master-plan --carry
  → open 항목 목록 표시
  → 사용자가 결정을 내리면:
      decision → status: resolved, resolution 기록
      deferred → 특정 sprint 의 AC 로 승격하거나 폐기(reason 필수)
```

**폐기에도 사유를 요구한다.** 사유 없는 폐기는 "조용히 사라짐"과 같다.

---

## 5. Dynamic Workflow 를 쓰는 지점

워크플로는 **비싸다**. 아무 데나 쓰지 않는다.

### 5.1 판단 기준

| 쓴다 | 쓰지 않는다 |
|---|---|
| 같은 작업을 **N개 항목에 반복** | 단일 대상 작업 |
| 중간 결과가 **컨텍스트를 오염**시킬 규모 | 결과가 짧은 작업 |
| **적대적 검증**이 필요 | 사실 조회 |
| N ≥ `workflow_threshold` (기본 8) | N < 8 |

### 5.2 워크플로 3종

**① `qa-sweep`** — AC별 검증 (02 §4.4)
```
AC 수 ≥ 8 일 때 /tene:qa 가 자동 전환
수집 → 판정 → 적대적 반박, AC별 독립 pipeline
```

**② `conformance-audit`** — loop-check 단계 대량 대조
```
요구 항목 수 ≥ 15 일 때 /tene:loop-check 가 자동 전환
항목별 구현 확인을 병렬로, 결과를 일치율로 집계
```

**③ `understand-sweep`** — 대형 리팩터링 전 사전 조사
```
사용자가 명시 호출: /tene:understand-sweep src/payments/**
심볼별 6질문을 팬아웃 수집 → 영향 맵 반환
```

### 5.3 멀티 sprint 워크플로를 만들지 않는 이유

여러 sprint 를 하나의 워크플로로 자동 진행하는 것은 **의도적으로 지원하지 않는다.**

| 이유 | 설명 |
|---|---|
| 사용자 입력 불가 | 워크플로 실행 중에는 사용자 입력을 받을 수 없다. PRD 인터뷰가 불가능하다 |
| 게이트의 의미 상실 | 사람 확인 지점을 전부 건너뛰면 게이트가 형식이 된다 |
| 재개 비용 | 팬아웃 중단 시, 중단 지점 이후 완료분까지 재실행된다 |
| 실패 폭발 | sprint 1의 잘못된 설계가 sprint 3까지 전파된 뒤에야 발견된다 |

→ **멀티 sprint 진행은 `/tene:sprint start` 를 sprint 마다 호출하는 방식**으로 한다. Trust Level 이 자동화 범위를 정하고, 사람이 sprint 경계에서 한 번 본다.

---

## 6. 세션을 넘는 진행 (요구 1.18 의 멀티 sprint 버전)

```
새 세션 시작
  │
  ▼ SessionStart 훅
  tene-state read --summary
  · 활성 sprint 있음  → 그 sprint 의 phase·차단 원인·다음 행동
  · 활성 sprint 없음 + master plan 있음
                      → "다음 추천 sprint: refund-flow (선행 완료됨).
                         단, D1 결정 대기 중입니다"
  · 둘 다 없음        → 아무것도 주입하지 않음 (조용함)
```

**"둘 다 없으면 조용하다"가 중요하다.** 플러그인을 설치했다고 모든 세션에서 말을 걸면 안 된다.

---

## 7. 대표 시나리오

### 7.1 3개 sprint 를 계획하고 순차 진행

```
1) /tene:master-plan --add payment-core --add checkout-retry --add refund-flow
   → 순서와 의존을 AskUserQuestion 으로 확정
   → master-plan.md 생성

2) /tene:master-plan --next
   → "payment-core 부터 시작하세요"

3) /tene:sprint init payment-core → /tene:sprint start payment-core --trust L3
   → prd~check 까지 자동, qa 판정에서 사용자 확인

4) archive 후 /tene:master-plan
   → 집계 갱신. payment-core 의 carryOver 가 master plan 으로 승격

5) /tene:master-plan --next
   → "checkout-retry. 단, payment-core 에서 넘어온 결정 대기 D1 이 있습니다"
```

### 7.2 이전 sprint 의 이월 작업을 새 sprint 로 흡수

```
/tene:sprint init timeout-handling
  → PRD 인터뷰 시작 시:
    "master plan 에 이 영역과 관련된 이월 항목이 있습니다:
       C1  5xx → ErrorPage 전이 검증 (from: checkout-retry)
           사유: 5xx 재현 환경 부재
     이번 sprint 에 포함할까요?"
  → 채택 시 AC 로 승격되고 carryOver 는 status: adopted 로 갱신
```

이 흐름이 **R6 → master plan → 다음 sprint PRD** 의 순환을 완성한다. 한 번 적힌 미결 항목은 해결되거나, 사유와 함께 폐기되기 전까지 계속 눈에 띈다.
