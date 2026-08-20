---
name: report
description: R1~R6 여섯 항목을 갖춘 sprint 회고 보고서를 만든다. 이월 항목은 사유와 함께 기록한다.
when_to_use: "회고, 보고서, 정리, 뭐 했는지 정리, report 작성, sprint 마무리, 결과 정리, 이번에 한 일"
argument-hint: "[--question-limit <n>]"
allowed-tools: Read Write Edit Glob Grep Bash(${CLAUDE_PLUGIN_ROOT}/bin/*) Bash(git *) AskUserQuestion Task
metadata:
  tene:
    phase: report
    gate: G7
---

# tene:report — sprint 회고

<!-- 스킬이 로드될 때 자동 실행된다. 모델이 "먼저 확인하라" 를 따를 확률에 기대지 않는다. -->

## 현재 sprint 상태

!`"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" read 2>/dev/null || echo '{"ok":false,"note":"상태 없음"}'`


## 언제 적용되는가

sprint 가 `qa` 를 통과한 뒤. G6 이 pass 여야 한다.

## R1~R6 은 선택이 아니다

여섯 항목 모두 채워야 G7 을 통과한다. 각각이 방어하는 실패가 다르다:

| # | 없으면 생기는 일 |
|---|---|
| R1 | 이전 sprint 산출물이 고아가 된 것을 아무도 모른다 |
| R2 | 무엇이 바뀌었는지 다음 sprint 가 모른다 |
| R3 | 요구와 무관한 코드가 쌓인다 |
| R4 | 계층 쏠림·위반이 누적된다 |
| R5 | 심볼 단위 단절이 쌓인다 |
| R6 | 미결이 조용히 사라진다 |

## 수행 규칙

1. **표는 기계가, 서술은 내가.** `"${CLAUDE_PLUGIN_ROOT}/bin/tene-report" build` 의 표를 자동 블록에 넣고, 블록 밖에 *왜* 와 *어떻게* 를 쓴다.
2. **사유 없는 이월을 만들지 않는다.** "나중에" 는 사유가 아니다. G7 이 막는다.
3. **R5 의 "드러난 것" 을 비우지 않는다.** 없으면 무엇을 확인했는지 쓴다.
4. **미측정을 성과로 포장하지 않는다.** QA 의 `insufficient` 는 R6 에 그대로 실린다.
5. **orphan 을 판단한다.** R1 이 참조 0건 산출물을 찾으면 삭제 대상인지 동적 호출인지 정하거나 R6 으로 이월한다.

## 단계

1. 표 생성:
   ```
   "${CLAUDE_PLUGIN_ROOT}/bin/tene-report" build
   ```
   `blockers` 를 먼저 본다. 사유 없는 이월이 있으면 그것부터 채운다.

2. 문서 스캐폴드 + 자동 블록 채우기:
   ```
   "${CLAUDE_PLUGIN_ROOT}/bin/tene-doc" scaffold --doc report --sprint <id>
   ```

3. 서술 작성 — `tene:reporter` 에 위임하거나 직접 쓴다

4. 검증과 게이트:
   ```
   "${CLAUDE_PLUGIN_ROOT}/bin/tene-doc" validate --doc report --sprint <id>
   "${CLAUDE_PLUGIN_ROOT}/bin/tene-gate" check --gate G7 --sprint <id>
   ```

## 산출물

`docs/sprints/<id>-<slug>/04-report/report.md`

## 게이트 판정 (G7)

| 조건 | 결과 |
|---|---|
| R1~R6 전부 존재 + 비어 있지 않음 + R4 4계층 전부 기재 + 이월 항목에 사유 | `pass` |
| 하나라도 미충족 | `fail` |

## 하지 않는 것

- 표를 손으로 다시 만들지 않는다
- 미측정을 통과로 쓰지 않는다
- 사유 없이 이월하지 않는다
- 실패한 것을 빼고 성공한 것만 쓰지 않는다

## 실패 시

- `DOC_INVALID` (`r1_to_r6_present`) → 어느 항목이 비었는지 알린다
- `DOC_INVALID` (`r6_reasons`) → 사유 없는 이월 항목을 목록으로 보여준다
- 인덱스 없음 → R1/R5 가 비게 된다. `"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" build` 를 먼저 제안한다
