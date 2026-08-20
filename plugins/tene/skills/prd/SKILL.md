---
name: prd
description: 기획 의도를 인터뷰로 추출해 PRD 문서와 수용 기준을 만든다. 실패 경로와 범위 밖을 반드시 캐낸다.
when_to_use: "기획, 요구사항 정리, 뭘 만들지 정하자, PRD 작성, 수용 기준, AC 정의, 이거 만들어줘, 새 기능 기획, 의도 정리, 스펙 정리"
argument-hint: "[<하고 싶은 것>] [--profile strict|standard|light]"
allowed-tools: Read Write Edit Glob Grep Bash(${CLAUDE_PLUGIN_ROOT}/bin/*) Bash(git *) AskUserQuestion Task
metadata:
  tene:
    phase: prd
    gate: G1
---

# tene:prd — 기획 의도 추출

<!-- 스킬이 로드될 때 자동 실행된다. 모델이 "먼저 확인하라" 를 따를 확률에 기대지 않는다. -->

## 현재 sprint 상태

!`"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" read 2>/dev/null || echo '{"ok":false,"note":"상태 없음"}'`


## 언제 적용되는가

sprint 가 `draft` 또는 `prd` phase 일 때. 사용자가 무엇을 만들고 싶은지 말했지만 아직 문서가 없을 때.

## 시작 전 확인

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" read
```

- `activeSprint` 없음 → `/tene:sprint init` 을 제안하고 **중단한다**
- phase 가 `plan` 이후 → 이미 지난 단계다. 보완인지 되돌아가는 것인지 묻는다

## 수행 규칙

이 스킬이 활성인 동안 항상 유효하다.

1. **의도는 사용자의 것이다.** 대신 정하지 않는다. 정보가 없으면 묻거나 "열린 결정 사항" 에 남긴다.
2. **판정할 수 없는 말은 수용 기준이 아니다.** "빠르게", "직관적으로", "적절히", "자연스럽게", "사용자 친화적으로" 를 문서에 넣지 않는다. 무엇을 재면 되는지 물어 숫자나 관찰 가능한 상태로 바꾼다.
3. **실패 경로 없이 끝내지 않는다.** If-then 형태의 수용 기준이 최소 1개 있어야 한다. 이것이 없으면 게이트 G1 이 막는다 — 막히기 전에 채운다.
4. **화면과 데이터를 따로 묻는다.** "실패해도 입력값이 남는가" (UX) 와 "실패 기록이 저장되는가" (DATA) 는 다른 질문이다. 하나만 묻고 둘 다 답한 것으로 치지 않는다.
5. **범위 밖을 비워두지 않는다.** 없으면 "없음" 이라고 명시적으로 쓴다. 빈칸은 "생각 안 함" 과 구분되지 않는다.
6. **문서를 먼저 쓰고 검증한다.** 검증이 통과할 때까지 전이하지 않는다.

## 단계

### 1. 조사

질문하기 전에 본다. 이미 있는 것을 묻지 않기 위해서다.

- 관련 코드와 기존 패턴
- 이전 sprint 의 이월 항목 (`"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" read` 의 `masterPlan.carryOver`)
- 기존 데이터 구조

### 2. 인터뷰

`tene:interviewer` 에이전트에 위임한다. 조사 결과를 프롬프트에 함께 넘긴다.

에이전트가 반환한 `openDecisions` 와 `assumptions` 는 **문서에 반드시 남긴다.** 특히 `assumptions` 는 "우리가 정한 것" 이므로 사용자가 나중에 뒤집을 수 있어야 한다.

인터뷰가 짧게 끝날 수 있는 경우(사용자가 이미 상세히 말했을 때)는 위임하지 않고 직접 정리해도 된다. 다만 §반드시 캐낼 다섯 가지는 그대로 적용한다.

### 3. 문서 작성

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-doc" scaffold --doc prd --sprint <id>
```

스캐폴드된 파일을 채운다. **자동 생성 블록 밖의 사람 영역만 쓴다.**

### 4. 검증

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-doc" validate --doc prd --sprint <id>
```

`failed` 에 있는 규칙을 하나씩 해소한다. 특히:

| 규칙 | 뜻 | 대응 |
|---|---|---|
| `nongoals_nonempty` | 범위 밖이 비어 있음 | "없음" 이라도 쓴다 |
| `intent_count` | 확정된 의도가 없음 | 인터뷰로 돌아간다 |
| `ac_unwanted_min` | If-then 기준이 없음 | 실패 조건을 묻는다 |
| `ac_no_vague` | 판정 불가능한 형용사 | 측정 가능한 말로 바꾼다 |
| `ac_method_tagged` | 검증 방식 누락 | UNIT/DATA/UX 를 정한다 |

**검증을 우회하려고 AC 를 지우지 않는다.** 기준이 과하면 `non-blocking` 으로 낮추되 왜 낮췄는지 남긴다.

### 5. 상태 반영

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-doc" extract --what ac --doc prd --sprint <id>
"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" ac --id <id> --data '<추출된 JSON>'
"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" intents --id <id> --data '<의도 JSON>'
```

### 6. 게이트와 전이

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-gate" check --gate G1 --sprint <id>
"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" advance --id <id> --to plan --result <pass|fail>
```

게이트가 막으면 **막힌 이유를 그대로 보여주고 멈춘다.** `--force` 를 먼저 제안하지 않는다.

## 산출물

`docs/sprints/<id>-<slug>/00-prd/prd.md`

## 게이트 판정 (G1)

| 조건 | 결과 |
|---|---|
| 필수 섹션 존재 + 범위 밖 비어있지 않음 + 의도 ≥1 + AC ≥1 + If-then ≥1 + 전 AC 태깅 + 모호어 없음 | `pass` |
| 하나라도 미충족 | `fail` — 무엇이 왜 막혔는지 제시 |

## 하지 않는 것

- 코드를 쓰지 않는다
- 구현 방법을 정하지 않는다 (design 의 일)
- 사용자가 정하지 않은 것을 정한 것처럼 쓰지 않는다
- 게이트를 통과시키려고 기준을 지우지 않는다
- 자동 생성 블록 안을 손으로 고치지 않는다

## 실패 시

- `SPRINT_NOT_FOUND` / `NO_ACTIVE_SPRINT` → `/tene:sprint init` 안내 후 중단
- `DOC_INVALID` → `failed` 목록과 `suggestion` 을 그대로 전달하고, 어느 섹션을 어떻게 고칠지 제안한다
- `GATE_BLOCKED` → `findings` 를 그대로 보여준다. 우회 방법을 먼저 말하지 않는다
