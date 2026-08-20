---
name: qa
description: 수용 기준을 7-Layer로 검증하고 증거와 함께 판정한다. 수집·판정·반박을 분리해 통과를 증명하게 한다.
when_to_use: "QA, 검증, 테스트, 제대로 되나 확인, 품질 검사, 다 되는지 봐줘, 동작 확인, qa 실행, 증거, 판정"
argument-hint: "[--only UNIT|DATA|UX] [--ac <id>] [--layer L1..L7]"
effort: high
allowed-tools: Read Write Edit Glob Grep Bash(${CLAUDE_PLUGIN_ROOT}/bin/*) Bash(git *) Bash(npm *) Bash(npx *) Bash(curl *) AskUserQuestion Task
metadata:
  tene:
    phase: qa
    gate: G6
---

# tene:qa — 7-Layer 검증

<!-- 스킬이 로드될 때 자동 실행된다. 모델이 "먼저 확인하라" 를 따를 확률에 기대지 않는다. -->

## 현재 sprint 상태

!`"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" read 2>/dev/null || echo '{"ok":false,"note":"상태 없음"}'`


## 언제 적용되는가

sprint 가 `loop-check` 를 통과한 뒤. G5 가 pass 여야 시작한다 — 문서와 구현이 맞는지 모르는 상태에서 검증하면 무엇을 검증하는지도 모른다.

## 이 스킬의 구조 — 왜 나누는가

```
계획(planner) → 수집(runner) → 판정(judge) → 반박(refuter) → 게이트("${CLAUDE_PLUGIN_ROOT}/bin/tene-gate")
                    │              │             │
                    │              └─ Read 만    └─ Read 만
                    └─ 판정하지 않음
```

**수집자가 판정하면 "내가 해보니 되더라" 가 판정이 된다.** 그래서 판정자에게는 실행 도구를 주지 않고, 수집자의 결론은 판정자 입력에서 제거된다.

## 수행 규칙

1. **미측정을 통과로 만들지 않는다.** `insufficient` 는 `passed` 가 아니다. 게이트를 막지 않지만 보고서 R6 에 반드시 남는다.
2. **도구 없음과 해당 없음을 구분한다.** 테스트 러너가 없어서 못 한 것은 `insufficient`, 이 기능에 해당하지 않는 것은 `not-applicable` + 사유.
3. **증거 종류가 기준과 맞아야 한다.** DATA 기준을 스크린샷으로 판정하지 않는다. 화면의 "저장 완료" 는 데이터가 저장됐다는 증거가 아니다.
4. **결정론을 자연어로 뒤집지 않는다.** 테스트가 fail 이면 fail 이다. HTTP 500 을 "의도된 것" 으로 판정하지 않는다.
5. **금지 조건이 관찰되면 즉시 failed.** expected 가 전부 충족돼도 마찬가지다.
6. **passed 는 반박을 거친다.** 3개 렌즈 중 2개 이상이 반박하면 failed 로 강등한다.

## 단계

### 1. 준비

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" read
"${CLAUDE_PLUGIN_ROOT}/bin/tene-qa" capability --capability '{"browser":{"kind":"chrome-mcp"}}'
```

**Chrome MCP 는 내가 판단한다.** 스크립트는 MCP 도구 가용 여부를 알 수 없다. 내 도구 목록에 `mcp__claude-in-chrome__*` 가 있으면 `--capability` 로 주입한다. 없으면 주입하지 않는다 — 없는 것을 있다고 하면 UX 검증이 거짓으로 통과한다.

### 2. 계획

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-qa" plan --render
```

`warnings` 를 사용자에게 **먼저** 보여준다. 브라우저가 없으면 UX 기준이 전부 `insufficient` 가 될 것이고, 그 사실은 시작 전에 알아야 한다.

기준이 8건을 넘으면 `qa-sweep` 워크플로로 팬아웃한다.

### 3. 수집

`tene:qa-runner` 에 charter 를 주고 실행시킨다. 레이어별로:

| Layer | 확인 |
|---|---|
| L1 | 린터·타입체커 |
| L2 | 테스트 러너 |
| L3 | **API 응답 + 데이터 상태 직접 조회** |
| L4 | 시스템 경로 |
| L5 | 화면 전이 |
| L6 | 실패·권한·재시도 주입 |
| L7 | 기존 테스트 재실행 |

증거를 등록한다:
```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-qa" evidence --data '{"artifact":{...}}'
```

**브라우저 사용 시 대화상자를 띄우는 요소를 클릭하지 않는다.** alert/confirm 이 뜨면 이후 모든 명령이 멈춘다.

### 4. 판정

AC 마다:
```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-qa" judge-input --ac <id>
```

이 입력을 `tene:judge` 에 준다. 입력에는 runner 의 결론이 없다 — 판정자가 남의 판정을 읽으면 그것을 따라간다.

### 5. 반박

`passed` 판정만 `tene:refuter` 에 3개 렌즈로 보낸다. 각 렌즈는 독립적으로 판단한다.

```
2/3 이상 반박 성공 → failed 로 강등
```

### 6. 기록

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" ac --id <sprint> --data '[{"id":"ac_1","verdict":"passed","evidenceRef":"artifact_3"}]'
"${CLAUDE_PLUGIN_ROOT}/bin/tene-qa" coverage --render
"${CLAUDE_PLUGIN_ROOT}/bin/tene-qa" scan-secrets
```

`scan-secrets` 를 반드시 돌린다. 증거는 저장소에 커밋되고 공유된다 — 로그 한 줄의 토큰이 그대로 유출된다.

### 7. 문서와 게이트

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-doc" scaffold --doc qa --sprint <id>
"${CLAUDE_PLUGIN_ROOT}/bin/tene-gate" check --gate G6 --sprint <id>
```

## 산출물

- `docs/sprints/<id>-<slug>/03-analysis/qa.md`
- `docs/sprints/<id>-<slug>/03-analysis/evidence/` (매니페스트 + 아티팩트)

## 게이트 판정 (G6)

| 조건 | 결과 |
|---|---|
| 모든 AC 판정됨 + blocking 전부 passed(또는 waived) + 증거 유효 + stale 0 + required 레이어 전부 처리 | `pass` |
| 하나라도 미충족 | `fail` |

`insufficient` 는 막지 않는다. 대신 **보고서 R6 에 반드시 실린다** — 무엇을 측정하지 못했는지가 다음 sprint 의 입력이다.

## QA 실패 시 어디로 돌아가는가

원인에 따라 다르다. 무조건 `do` 로 보내지 않는다.

| 원인 | 복귀 |
|---|---|
| 구현 결함 | `do` |
| 추적·증거 부족 | `loop-check` |
| 설계가 요구를 만족 못 함 | `design` |
| 요구가 모호하거나 잘못됨 | `prd` |

원인을 정하지 않고 되돌리면 같은 실패가 반복된다.

## 하지 않는 것

- 미측정을 통과로 기록하지 않는다
- 증거 없이 `passed` 를 주지 않는다
- UX 증거로 DATA 기준을 판정하지 않는다
- 통과시키려고 기준을 재해석하지 않는다
- 실패한 실행을 다시 돌려 성공한 것만 기록하지 않는다
- 대화상자를 띄우는 요소를 클릭하지 않는다

## 실패 시

- 브라우저 없음 → UX 기준을 `insufficient` 로 기록하고 **사유를 적는다.** 건너뛰지 않는다
- 테스트 러너 없음 → UNIT/DATA 를 정적 확인만으로 처리하고 그 한계를 명시한다
- `GATE_BLOCKED` → 어느 AC 가 왜 막았는지 그대로 보여준다. 우회를 먼저 제안하지 않는다
