---
name: status
description: 현재 sprint 가 어느 phase 에 있고 무엇이 막고 있는지 보여준다. 상태 파일이 문서와 어긋났을 때 --resync 로 문서에서 복구한다.
when_to_use: "지금 어디까지 했지, 상태 확인, 진행 상황, 뭐가 막혀 있어, 어디까지 왔어, sprint 상태, status, 진행률, 남은 일, 다음에 뭐 해, resync, 상태 복구"
argument-hint: "[<sprint-id>] [--resync] [--dry-run] [--json]"
allowed-tools: Read Glob Bash(${CLAUDE_PLUGIN_ROOT}/bin/*)
metadata:
  tene:
    phase: null
    standalone: true
---

# tene:status — 상태 확인과 복구

<!-- 스킬이 로드될 때 자동 실행된다. 모델이 "먼저 확인하라" 를 따를 확률에 기대지 않는다. -->

## 현재 sprint 상태

!`"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" read 2>/dev/null || echo '{"ok":false,"note":"상태 없음"}'`


## 언제 적용되는가

사용자가 진행 상황을 묻거나, 다음에 무엇을 할지 모를 때. sprint 가 없어도 동작한다 — 그때는 master plan 의 다음 후보를 보여준다.

## 원칙

1. **막고 있는 것을 맨 위에 놓는다.** 잘 되고 있는 것보다 막힌 것이 먼저다. 사용자는 다음 행동을 알려고 이 명령을 부른다.
2. **비율을 만들어내지 않는다.** "80% 완료" 같은 표현을 쓰지 않는다. 분모를 줄이면 올라가는 숫자다. 대신 `blocking AC 3건 중 1건 미충족` 처럼 센 것을 그대로 말한다.
3. **미측정을 통과로 포장하지 않는다.** `insufficient` 는 `passed` 가 아니다. 색이나 배치로 뭉뚱그리지 않는다.
4. **상태를 바꾸지 않는다.** `--resync` 를 명시했을 때만 쓴다.

## 단계

### 기본 (읽기)

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" read
```

반환된 `current` / `sprint` 를 §출력 형식으로 렌더링한다. `sprint` 가 null 이면 `"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" summary` 의 추천을 보여준다.

### `--resync` (문서에서 복구)

상태 파일이 손상됐거나, 문서를 직접 편집해서 상태와 어긋났을 때 쓴다.

1. **먼저 dry-run 으로 보여준다** — 사용자가 확인하기 전에 덮어쓰지 않는다:
   ```
   "${CLAUDE_PLUGIN_ROOT}/bin/tene-state" resync --id <sprint-id> --dry-run
   ```
2. 반환된 `report` 를 그대로 보여주고, 추정된 phase 가 맞는지 **묻는다**
3. 사용자가 동의하면:
   ```
   "${CLAUDE_PLUGIN_ROOT}/bin/tene-state" resync --id <sprint-id>
   ```
4. 결과의 `warnings` 를 빠짐없이 전달한다. 특히:
   - `orphanIds` — qa 에만 있고 prd 에 없는 AC. 문서 불일치를 뜻하므로 사용자가 어느 쪽이 맞는지 정해야 한다
   - 게이트는 복구되지 않았다는 사실

**resync 는 추론이다.** "복구했습니다" 로 끝내지 말고 "추정한 것이며 다르면 조정하라" 를 반드시 함께 말한다.

## 출력 형식

```
[tene:status] checkout-retry — 결제 실패 시 입력값 보존

  phase    : qa (profile: standard)
  게이트    : G6 FAIL — blocking AC 1건 미충족

막고 있는 것
  ⛔ ac_2 (DATA, blocking) — payments 테이블에 실패 기록 없음
  ⚠️ ac_3 (UNIT) — insufficient: 테스트 러너 없음

수용 기준 5건
  passed 3 · failed 1 · insufficient 1 · stale 0

진행
  loop-check  2/3회
  전이 커버리지 3/5

다음
  → /tene:loop-check 로 복귀 (권장)
  → /tene:qa --only DATA 로 재검증
  → /tene:sprint waiver ac_2 로 예외 승인 (사유 필수)

문서 docs/sprints/checkout-retry-payment-failure-input-preservation/
```

sprint 가 없을 때:

```
[tene:status] 진행 중인 sprint 가 없습니다.

  다음 추천 : refund-flow (선행 payment-core 완료됨)
  이월 대기 : checkout-retry:D1 — 재시도 잡의 멱등키 정책

  → /tene:sprint start refund-flow
```

`--json` 이면 렌더링 없이 봉투를 그대로 보여준다.

## 하지 않는 것

- 상태를 바꾸지 않는다 (`--resync` 제외)
- 게이트를 재판정하지 않는다 — 그건 전이 시점의 일이다
- 막힌 것을 "거의 다 됐다" 로 완화하지 않는다

## 실패 시

- `STATE_CORRUPT` → 격리된 백업 경로를 알리고 `--resync` 를 제안한다
- `SPRINT_NOT_FOUND` → `"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" list` 로 목록을 보여준다
- `SCHEMA_TOO_NEW` → 상태를 건드리지 말고 플러그인 업데이트를 안내한다
