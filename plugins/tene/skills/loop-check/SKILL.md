---
name: loop-check
description: 문서의 요구가 실제로 구현되었는지 대조하고 갭이 0이 될 때까지 반복한다. 문서에 없는데 구현된 것도 함께 찾는다.
when_to_use: "구현 검증, 문서대로 됐나, 갭 분석, 빠진 거 없나, loop check, 대조, 일치 확인, 다 됐나, 검증해줘, 확인해줘"
argument-hint: "[--round <n>] [--no-working]"
allowed-tools: Read Write Edit Glob Grep Bash(${CLAUDE_PLUGIN_ROOT}/bin/*) Bash(git *) AskUserQuestion Task
metadata:
  tene:
    phase: loop-check
    gate: G5
---

# tene:loop-check — 문서 ↔ 구현 대조

<!-- 스킬이 로드될 때 자동 실행된다. 모델이 "먼저 확인하라" 를 따를 확률에 기대지 않는다. -->

## 현재 sprint 상태

!`"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" read 2>/dev/null || echo '{"ok":false,"note":"상태 없음"}'`

## 코드 인덱스 상태

!`"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" status 2>/dev/null || echo '{"ok":false,"note":"인덱스 없음"}'`


## 언제 적용되는가

sprint 가 `do` 를 지나 구현이 어느 정도 된 뒤. `qa` 로 가기 전에 반드시 거친다.

## "100%" 의 뜻

**백분율이 아니다. blocking 갭이 0개라는 뜻이다.**

백분율은 두 가지로 조작된다 — 분모(요구 항목)를 줄이거나, 사소한 통과 아홉 개가 치명적 실패 하나를 평균으로 가리거나. 그래서 게이트는 백분율을 보지 않는다.

진행률은 사용자에게 *"얼마나 남았나"* 를 보여주는 표시용이다.

## 시작 전 확인

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" read
"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" status
```

- 인덱스 없음/오래됨 → `"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" build` 를 먼저. 오래된 인덱스로 판정하면 이미 고친 것을 missing 이라 한다
- `startCommit` 없음 → 미귀속 변경을 확인할 수 없다. 그 사실을 문서에 남긴다

## 수행 규칙

1. **판정 넷을 구분한다.** `implemented` / `partial` / `missing` / `unverifiable`. 넷 다 근거가 필요하다.
2. **`missing` 과 `unverifiable` 을 섞지 않는다.** 앵커가 없어서 어디를 볼지 모르는 것은 `unverifiable` 이다. 봤는데 없는 것이 `missing` 이다.
3. **`unverifiable` 을 분모에서 뺀다.** 확인할 수 없는 것을 0점으로 세면 진행률이 영원히 100% 가 되지 않는다. **개수는 항상 병기한다.**
4. **미귀속 변경을 반드시 해소한다.** 앵커에 걸리지 않은 코드 변경은 셋 중 하나로 처리해야 G5 를 통과한다. 이것이 spec driven 의 실질적 강제 수단이다.
5. **진전이 없으면 반복을 늘리지 않는다.** 2회 연속 blocking 갭이 줄지 않으면 방법이 잘못된 것이다. 설계·요구를 고치거나 waiver 로 가야 한다.
6. **회귀를 맨 위에 놓는다.** 개선하다 깨뜨린 것이 새 갭보다 급하다.

## 단계

### 1. 판정

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-loop" check --render
```

이것이 기계 판정이다. `caveats` 를 반드시 읽는다 — 인덱스가 없거나 git 을 못 읽었으면 판정 전체의 신뢰가 낮다.

### 2. 감사 (선택)

`unverifiable` 이 많거나 동적 디스패치가 있는 코드베이스면 `tene:gap-auditor` 에 위임한다. 기계가 못 보는 것을 찾는다:

- 분기 조건의 **값** (설계 3초 vs 코드 5초 — 심볼은 있으니 기계는 통과시킨다)
- 부작용 (DB 쓰기, 전역 변경)
- 조건이 반대로 구현된 경우

요구 항목이 15개를 넘으면 `conformance-audit` 워크플로로 팬아웃한다.

### 3. 미귀속 변경 해소

각 항목마다 **사용자에게 묻는다**. 자유 서술로 두지 않는다 — "나중에 정리" 는 해소가 아니다.

| 선택 | 뜻 | 그 다음 |
|---|---|---|
| **(a) 앵커 추가** | 누락된 앵커였다 | `design.md` 앵커 표에 추가 |
| **(b) 새 AC 로 승격** | PRD 에 없던 요구가 구현됐다 = **범위 확장** | PRD 를 갱신한다. 사용자 확인 필수 |
| **(c) 무관한 변경** | 리팩터링·오타·포맷팅 | 사유를 문서에 기록 |

(b) 를 고르면 범위가 늘어난 것이다. 조용히 넘기지 말고 명시적으로 말한다.

### 4. 문서 작성

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-doc" scaffold --doc loop-check --sprint <id> --round <n>
```

자동 생성 블록(`verdict`, `comparison`, `layercheck`, `unattributed`)을 채운다. 사람이 쓸 판단은 블록 **밖**에 쓴다.

### 5. 개선 또는 전진

| 판정 | 다음 |
|---|---|
| `pass` | G5 검사 후 `qa` 로 전이 |
| `continue` | 갭을 고치고 다음 회차 |
| `stalled` | **반복하지 않는다.** 설계·요구 조정 또는 waiver 를 사용자와 결정 |
| `exhausted` | 상한 도달. waiver 또는 상한 조정 |

### 6. 게이트

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-gate" check --gate G5 --sprint <id>
"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" advance --id <id> --to qa --result <pass|fail>
```

## 산출물

`docs/sprints/<id>-<slug>/03-analysis/loop-check-<n>.md`

회차마다 새 파일을 만든다. 덮어쓰지 않는다 — 회차 간 비교가 수렴 판단의 근거다.

## 게이트 판정 (G5)

| 조건 | 결과 |
|---|---|
| blocking 갭 0 + 미귀속 전부 해소 | `pass` |
| blocking 갭 있음 | `fail` |
| 미귀속 미해소 | `fail` |
| 상한 도달 + waiver 승인 | `pass` (waiver 는 보고서 R6 에 기록됨) |

## 하지 않는 것

- 진행률을 게이트 기준으로 쓰지 않는다
- 요구 항목을 지워서 통과시키지 않는다
- `unverifiable` 을 `implemented` 로 올리지 않는다
- 미귀속 변경을 "사소하니까" 로 넘기지 않는다
- 정체 상태에서 같은 방법으로 반복하지 않는다

## 실패 시

- `INDEX_MISSING` → `"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" build` 먼저
- git 을 못 읽음 → 미귀속 변경을 **0건이라고 하지 않는다.** "확인하지 못함" 으로 문서에 남긴다
- `GATE_BLOCKED` → 남은 blocking 갭과 미해소 미귀속을 그대로 보여준다
