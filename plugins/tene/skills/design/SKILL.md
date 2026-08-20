---
name: design
description: 처리 로직을 설계하고 4계층 분류와 6질문 표를 만든다. AC 를 코드 심볼에 앵커한다.
when_to_use: "설계, 어떻게 구현할지, 처리 로직, 상세 설계, design 작성, 구조 설계, 4계층, 6질문, 앵커 정하기"
argument-hint: "[--profile strict|standard|light]"
allowed-tools: Read Write Edit Glob Grep Bash(${CLAUDE_PLUGIN_ROOT}/bin/*) Bash(git *) AskUserQuestion Task
metadata:
  tene:
    phase: design
    gate: G3
---

# tene:design — 처리 로직과 4계층

<!-- 스킬이 로드될 때 자동 실행된다. 모델이 "먼저 확인하라" 를 따를 확률에 기대지 않는다. -->

## 현재 sprint 상태

!`"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" read 2>/dev/null || echo '{"ok":false,"note":"상태 없음"}'`

## 코드 인덱스 상태

!`"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" status 2>/dev/null || echo '{"ok":false,"note":"인덱스 없음"}'`


## 언제 적용되는가

sprint 가 `plan` 을 통과했고 아직 `do` 가 아닐 때.

## 시작 전 확인

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" read
"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" status
```

- phase 가 `plan` 미만 → `/tene:plan` 을 먼저. **중단한다**
- G2 가 `pass` 가 아님 → 막힌 조건을 보여주고 중단
- 인덱스 없음/오래됨 → `"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" build` 를 먼저 실행한다. 오래된 인덱스로 앵커를 걸면 존재하지 않는 심볼에 걸린다

## 수행 규칙

1. **4계층을 모두 채운다.** 비어 있으면 "해당 없음" 이라고 명시한다. 빈칸은 "이 계층을 생각하지 않았다" 와 구분되지 않고, G3 이 막는다.
2. **미분류를 임의로 배정하지 않는다.** 규칙이 모르는 파일은 미분류 절에 사유와 함께 둔다. 계층 통계를 예쁘게 만들려고 밀어 넣지 않는다.
3. **모든 blocking AC 에 앵커를 건다.** 앵커 없는 AC 는 코드가 바뀌어도 stale 이 되지 않고, QA 가 무엇을 검증해야 할지 모른다. G3 이 막는다.
4. **존재하지 않는 심볼에 앵커하지 않는다.** 아직 만들지 않은 심볼이면 그렇다고 표시한다 — `"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" anchors` 가 `no_match` 로 보고하는데, 구현 전 설계에서는 정상이다. 구현 후에도 남아 있으면 문제다.
5. **6질문의 목적은 서술이 아니라 검사다.** 표를 채우는 것이 목적이 아니라, 채우다 발견되는 것이 목적이다. "이 답변에서 드러난 것" 절을 비우지 않는다.
6. **Q6 은 반환값만이 아니다.** DB 쓰기, 전역 상태 변경, 파일 쓰기, 외부 호출도 Q6 의 답이다.

## 단계

### 1. 처리 로직 설계

각 로직에 대해 입력 → 처리 → 출력을 적는다. 반드시 포함할 것:

- 분기 조건과 **각 분기의 결과**
- 실패 처리 — 어디로 가는가, 데이터는 남는가
- 부작용 — 무엇이 바뀌는가

실패 처리를 빠뜨리면 PRD 의 If-then AC 를 구현할 수 없다.

### 2. 4계층 분류

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" layers
```

기존 파일은 인덱스가 분류한다. **새로 만들 파일은 내가 정한다** — 어느 계층에 둘지가 곧 설계 결정이다.

`suggestions` 가 있으면 `/tene:layers scan` 으로 규칙을 다듬을지 제안한다.

### 3. 계층 위반 점검

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" violations
```

`reverse` 는 blocker 다. 설계 단계에서 발견하면 지금 고친다 — 구현 후에는 비싸진다.

### 4. 6질문

핵심 심볼(AC 앵커 대상 + 새로 만들 것)에 대해:

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" questions --symbol <name> --render
```

`unanswered` 가 있으면 `tene:cartographer` 에 위임하거나 직접 조사한다.

### 5. 화면 전이 (UX AC 가 있으면)

전이 표의 엣지 수가 **QA 전이 커버리지의 분모**가 된다. 여기서 3개만 적으면 QA 는 3개만 검증한다. 실제 화면 흐름을 빠뜨리지 않는다.

### 6. AC 앵커 확정

각 blocking AC 에 심볼 또는 파일 경로를 건다.

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" ac --id <sprint> --data '[{"id":"ac_1","anchors":["processPayment"]}]'
"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" anchors --rebuild --sprint <sprint>
```

`unresolved` 를 확인한다. 구현 전이라 `no_match` 인 것은 정상이고, `no_anchors` (앵커가 아예 없음)는 고쳐야 한다.

### 7. 문서·게이트·전이

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-doc" scaffold --doc design --sprint <id>
"${CLAUDE_PLUGIN_ROOT}/bin/tene-doc" validate --doc design --sprint <id>
"${CLAUDE_PLUGIN_ROOT}/bin/tene-gate" check --gate G3 --sprint <id>
"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" advance --id <id> --to do --result <pass|fail>
```

## 산출물

`docs/sprints/<id>-<slug>/02-design/design.md`

자동 생성 블록(`layers`, `violations`, `questions`)은 `"${CLAUDE_PLUGIN_ROOT}/bin/tene-doc" patch` 로 채운다. **블록 안을 손으로 고치지 않는다** — 다음 갱신에서 덮인다. 사람이 쓸 말은 블록 밖에 쓴다.

## 게이트 판정 (G3)

| 조건 | 결과 |
|---|---|
| 필수 섹션 + 4계층 전부 기재 + 6질문 표 존재 + 모든 blocking AC 에 앵커 + (UX AC 있으면) 전이 표 | `pass` |
| 하나라도 미충족 | `fail` |

## 하지 않는 것

- 코드를 구현하지 않는다 (설계와 구현을 같은 단계에서 하면 설계가 구현을 따라간다)
- 미분류를 임의 계층으로 배정하지 않는다
- 앵커 없이 G3 을 통과시키지 않는다
- 6질문 표를 채우고 "드러난 것" 을 비워두지 않는다
- 자동 생성 블록 안을 손으로 고치지 않는다

## 실패 시

- `INDEX_MISSING` → `"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" build` 먼저
- `DOC_INVALID` (`layers_all_four`) → 어느 계층이 비었는지 알리고 "해당 없음" 이라도 적게 한다
- `DOC_INVALID` (`anchors_resolved`) → 앵커 없는 AC 목록을 보여준다
- `GATE_BLOCKED` → `findings` 를 그대로 전달한다. 우회를 먼저 제안하지 않는다
