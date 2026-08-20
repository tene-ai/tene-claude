---
name: plan
description: 수용 기준을 작업으로 나누고 모든 AC 가 최소 한 작업에 덮이는지 확인한다. 덮이지 않은 기준이 있으면 게이트가 막는다.
when_to_use: "작업 계획, 어떻게 나눌지, 태스크 분해, plan 작성, 일감 쪼개기, 순서 정하기, 무엇부터 할지, 계획 세우자"
argument-hint: "[--profile strict|standard|light]"
allowed-tools: Read Write Edit Glob Grep Bash(${CLAUDE_PLUGIN_ROOT}/bin/*) Bash(git *) AskUserQuestion Task
metadata:
  tene:
    phase: plan
    gate: G2
---

# tene:plan — 작업 분해와 커버리지

<!-- 스킬이 로드될 때 자동 실행된다. 모델이 "먼저 확인하라" 를 따를 확률에 기대지 않는다. -->

## 현재 sprint 상태

!`"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" read 2>/dev/null || echo '{"ok":false,"note":"상태 없음"}'`


## 언제 적용되는가

sprint 가 `prd` 를 통과했고 아직 `design` 이 아닐 때.

## 시작 전 확인

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" read
```

- phase 가 `prd` 미만 → `/tene:prd` 를 먼저 해야 한다. **중단한다**
- G1 이 `pass` 가 아님 → 어느 조건이 막혔는지 보여주고 중단한다

계획의 입력은 PRD 의 수용 기준이다. 기준이 확정되지 않았는데 작업을 나누면 나중에 기준이 바뀔 때 계획 전체가 어긋난다.

## 수행 규칙

1. **모든 blocking AC 는 최소 한 작업에 덮여야 한다.** 덮이지 않은 기준이 하나라도 있으면 게이트 G2 가 막는다. 이건 "누가 이걸 하는가" 가 정해지지 않았다는 뜻이다.
2. **작업이 AC 를 덮는다고 쓸 때 어떤 AC 인지 명시한다.** "결제 관련 작업" 이 아니라 "ac_2, ac_3 을 덮음" 이라고 쓴다.
3. **한 작업이 여러 AC 를 덮어도 되고, 한 AC 가 여러 작업에 걸쳐도 된다.** 1:1 로 강제하지 않는다. 다만 어느 쪽이든 표에 나타나야 한다.
4. **순서는 의존으로 표현한다.** "먼저/나중" 이 아니라 "T2 는 T1 이 끝나야 함" 으로 쓴다. 그래야 Task 의 `blockedBy` 로 옮길 수 있다.
5. **추정치를 지어내지 않는다.** 시간 추정이 필요 없으면 쓰지 않는다. 근거 없는 숫자는 계획을 신뢰하게 만들 뿐 정확하게 만들지 않는다.
6. **작업을 나눌 수 없으면 그렇게 말한다.** 조사가 더 필요한 항목은 "조사 작업" 으로 두되, 무엇을 알아내면 되는지 적는다.

## 단계

### 1. AC 를 읽는다

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-doc" extract --what ac --doc prd --sprint <id>
```

### 2. 작업으로 나눈다

각 작업에 대해:

- 무엇을 하는가 (한 문장)
- 어떤 AC 를 덮는가 (id 목록)
- 무엇에 막히는가 (선행 작업 id)
- 어느 계층을 건드리는가 (interface / business-logic / persistence / infrastructure)

계층을 여기서 적어두면 design 단계에서 4계층 분류가 수월해지고, 빠진 계층도 일찍 보인다. **모르면 비워둔다** — 추측해서 채우면 design 에서 그 추측을 사실로 읽는다.

### 3. 커버리지 표

모든 AC × 그것을 덮는 작업. 이 표가 게이트의 판단 근거다.

덮이지 않은 AC 가 남으면 셋 중 하나다:
- 작업을 빠뜨렸다 → 작업을 추가한다
- 그 AC 는 이번에 안 한다 → PRD 로 돌아가 범위 밖으로 옮기거나 `non-blocking` 으로 낮춘다
- 다른 작업에 이미 포함돼 있다 → 그 작업의 커버 목록에 추가한다

**표에서 AC 를 지워서 덮은 것으로 만들지 않는다.**

### 4. 문서 작성과 검증

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-doc" scaffold --doc plan --sprint <id>
"${CLAUDE_PLUGIN_ROOT}/bin/tene-doc" validate --doc plan --sprint <id>
```

`ac_coverage_full` 이 실패하면 §3 으로 돌아간다.

### 5. 게이트와 전이

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-gate" check --gate G2 --sprint <id>
"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" advance --id <id> --to design --result <pass|fail>
```

### 6. Task 생성 (선택)

사용자가 원하면 작업을 Claude Code 태스크로 만든다. 제목에 phase 접두어와 AC 를 넣는다:

```
[Do] T1 결제 실패 응답 처리 (ac_2)
[Do] T2 입력값 보존 상태 관리 (ac_1)
```

`blockedBy` 로 의존을 표현하면 선행 완료 시 자동으로 풀린다. 태스크를 만들지 않아도 계획 문서만으로 사이클은 돈다.

## 산출물

`docs/sprints/<id>-<slug>/01-plan/plan.md`

## 게이트 판정 (G2)

| 조건 | 결과 |
|---|---|
| 필수 섹션 존재 + 모든 blocking AC 가 최소 1개 작업에 덮임 | `pass` |
| 덮이지 않은 blocking AC 존재 | `fail` — 어느 AC 인지 명시 |

## 하지 않는 것

- 구현 방법을 정하지 않는다 (design 의 일)
- 커버리지를 맞추려고 AC 를 지우거나 표에서 빼지 않는다
- 근거 없는 시간 추정을 쓰지 않는다
- 모르는 계층을 추측해서 채우지 않는다

## 실패 시

- `PHASE_MISMATCH` → 현재 phase 와 필요한 phase 를 알리고 무엇을 먼저 해야 하는지 안내한다
- `DOC_INVALID` (`ac_coverage_full`) → 덮이지 않은 AC 목록을 보여주고 세 가지 선택지(작업 추가 / 범위 밖으로 / non-blocking)를 제시한다
- `GATE_BLOCKED` → `findings` 를 그대로 전달한다
