---
name: understand
description: 심볼이나 파일을 6가지 질문으로 조사한다. 인덱스로 답하고, 못 답하는 것은 못 답한다고 말한다.
when_to_use: "이게 뭐야, 어디서 쓰여, 누가 호출해, 이 함수 설명해줘, 구조 파악, 6질문, understand, 어디에 정의돼, 영향 범위, 이거 지워도 돼"
argument-hint: "<심볼 또는 파일> [--render]"
context: fork
agent: Explore
background: false
allowed-tools: Read Glob Grep Bash(${CLAUDE_PLUGIN_ROOT}/bin/*) Task
metadata:
  tene:
    phase: null
    standalone: true
---

# tene:understand — 6가지 질문

> 이 스킬은 **격리된 Explore 에이전트**로 실행된다 (`context: fork`).
> 대화 이력을 받지 않으므로, 필요한 것은 전부 아래 지시와 인자에 있어야 한다.
> 조사 결과만 요약해 돌려준다 — 파일 내용을 그대로 반환하지 않는다.

조사 대상: **$ARGUMENTS**

## 언제 적용되는가

사용자가 특정 심볼·파일이 무엇이고 어디서 쓰이는지 물을 때. sprint 없이도 동작한다.

## 6가지 질문

| # | 질문 | 왜 묻는가 |
|---|---|---|
| Q1 | 선언·정의된 이름 | 이름이 하나인지 확인 |
| Q2 | 정의된 파일 | 같은 이름이 여러 곳이면 모호성 |
| Q3 | import·참조 위치 | 누가 알고 있는가 |
| Q4 | 호출·사용 위치 | 실제로 쓰이는가 (orphan 검출) |
| Q5 | 입력 데이터 형태 | 무엇을 받는가 |
| Q6 | 반환·변경 데이터 | 무엇을 내놓고 **무엇을 바꾸는가** |

Q6 이 가장 자주 부실하게 답해진다. 반환값만 보고 끝내지 않는다 — DB 쓰기, 전역 상태 변경, 파일 쓰기도 Q6 의 답이다.

## 수행 규칙

1. **인덱스를 먼저 쓴다.** `"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" questions` 로 답이 나오면 파일을 읽지 않는다.
2. **못 답한 것을 채우지 않는다.** 결과의 `unanswered` 에 있는 항목은 조사하거나, 조사해도 모르면 "확인하지 못함" 이라고 적는다.
3. **어느 Tier 가 답했는지 밝힌다.** `indexed` / `investigated` / `unknown`.
4. **인덱스가 오래됐으면 먼저 말한다.** 오래된 답을 최신인 것처럼 내지 않는다.

## 단계

1. 인덱스 상태 확인:
   ```
   "${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" status
   ```
   없으면 `"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" build`, `stale: true` 면 다시 빌드할지 묻는다.

2. 질문:
   ```
   "${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" questions --symbol <name> --render
   ```

3. `unanswered` 가 있으면:
   - LSP 도구가 있으면 그것으로 (Tier 1 — 가장 정확하다)
   - 없으면 `tene:cartographer` 에 위임하거나 직접 Grep/Read (Tier 3)

4. `caveats` 를 반드시 전달한다. 그 파일에 동적 디스패치가 있으면 Q4 의 답이 불완전할 수 있다는 뜻이다.

## 출력 형식

`--render` 결과의 마크다운 표를 그대로 쓰되, 아래를 덧붙인다.

```
[tene:understand] processPayment

<6질문 표>

드러난 것
  · 정의가 2곳에 있습니다 (src/payments/a.ts:12, src/legacy/b.ts:40) — 어느 쪽이 유효합니까?
  · 호출하는 곳이 없습니다 — orphan 후보이거나 진입점입니다

조사 한계
  · src/handlers/index.ts:22 에 동적 디스패치가 있어 Q4 가 불완전할 수 있습니다
```

`드러난 것` 과 `조사 한계` 를 비우지 않는다. 없으면 "없음" 이라고 쓴다.

## 하지 않는 것

- 코드를 고치지 않는다
- 답하지 못한 질문을 그럴듯한 문장으로 덮지 않는다
- "찾지 못했다" 를 "없다" 로 바꾸지 않는다
- 파일 전문을 출력하지 않는다

## 실패 시

- `INDEX_MISSING` → `"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" build` 안내
- 심볼을 못 찾으면 → 비슷한 이름을 Grep 으로 찾아 제안한다. 조용히 빈 결과를 내지 않는다
