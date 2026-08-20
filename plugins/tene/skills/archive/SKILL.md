---
name: archive
description: sprint 를 아카이브하고 미결 항목을 master plan 으로 승격한다. 이월이 사라지지 않게 한다.
when_to_use: "아카이브, sprint 종료, 마무리, 닫기, archive, 완료 처리, 다음 sprint 준비"
argument-hint: "[<sprint-id>]"
disable-model-invocation: true
allowed-tools: Read Write Edit Glob Bash(${CLAUDE_PLUGIN_ROOT}/bin/*) Bash(git *) AskUserQuestion
metadata:
  tene:
    phase: archive
    gate: G7
    standalone: true
---

# tene:archive — sprint 종료

<!-- 스킬이 로드될 때 자동 실행된다. 모델이 "먼저 확인하라" 를 따를 확률에 기대지 않는다. -->

## 현재 sprint 상태

!`"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" read 2>/dev/null || echo '{"ok":false,"note":"상태 없음"}'`


## 언제 적용되는가

보고서가 완성되고 G7 을 통과한 뒤. 사용자가 명시적으로 요청할 때만 실행한다 — 모델이 스스로 sprint 를 닫지 않는다.

## 이 단계의 핵심

**미결 항목을 master plan 으로 승격하는 것.**

이 경로가 없으면 각 sprint 보고서에 미결이 적히고 아무도 다시 읽지 않는다. 승격해야 다음 sprint 를 시작할 때 보인다.

## 수행 규칙

1. **G7 을 먼저 확인한다.** 보고서가 없거나 R1~R6 이 비면 아카이브하지 않는다. 닫힌 sprint 는 다시 열기 번거롭다.
2. **이월을 빠짐없이 승격한다.** R6 의 결정 대기·이월 작업·미측정을 전부 옮긴다. waiver 는 그 sprint 의 기록으로 남긴다.
3. **문서를 지우지 않는다.** `_archive/<YYYY-MM>/` 으로 **옮긴다.** 문서가 정본이므로 지우면 복구할 수 없다.
4. **사용자에게 확인받는다.** 아카이브는 되돌리기 번거로운 조작이다.

## 단계

1. 게이트 확인:
   ```
   "${CLAUDE_PLUGIN_ROOT}/bin/tene-gate" check --gate G7 --sprint <id>
   ```
   fail 이면 무엇이 막는지 보여주고 **중단한다**.

2. 승격 대상 확인:
   ```
   "${CLAUDE_PLUGIN_ROOT}/bin/tene-report" carry --id <id>
   ```
   `promotable` 을 사용자에게 보여주고 확인받는다.

3. 문서 이동:
   ```
   docs/sprints/<id>-<slug>/  →  docs/sprints/_archive/<YYYY-MM>/<id>-<slug>/
   ```

4. 상태 전이와 승격:
   ```
   "${CLAUDE_PLUGIN_ROOT}/bin/tene-state" advance --id <id> --to archived --result pass
   ```
   master plan 의 `carryOver` 에 승격 항목을 추가한다.

5. 다음 sprint 추천:
   ```
   "${CLAUDE_PLUGIN_ROOT}/bin/tene-state" summary
   ```

## 출력 형식

```
[tene:archive] checkout-retry 를 아카이브했습니다

  문서    docs/sprints/_archive/2026-08/checkout-retry-payment-failure/
  기간    2026-08-14 ~ 2026-08-20 (loop-check 2회)
  결과    수용 기준 5건 — passed 4 / 예외 승인 1

master plan 으로 승격된 미결 3건
  · [decision] 재시도 잡의 멱등키 정책 — design 6질문에서 미설계 경로 발견
  · [unmeasured] ac_3 (UNIT) — 테스트 러너 없음
  · [work] markFailed 의 롤백 처리 — PG사 응답 스펙 확인 필요

다음 추천: refund-flow (선행 payment-core, checkout-retry 완료됨)
  단, 위 [decision] 항목이 refund-flow 를 막습니다. 먼저 정하세요.
```

## 하지 않는 것

- G7 미통과 상태로 아카이브하지 않는다
- 문서를 삭제하지 않는다 (이동만)
- 미결 항목을 빠뜨리지 않는다
- 사용자 확인 없이 실행하지 않는다
- 모델이 스스로 부르지 않는다

## 실패 시

- `GATE_BLOCKED` (G7) → 보고서의 어느 항목이 비었는지 알리고 `/tene:report` 로 안내한다
- 문서 이동 실패 → 상태를 바꾸지 않는다. 문서와 상태가 어긋나면 `--resync` 로도 복구가 어렵다
