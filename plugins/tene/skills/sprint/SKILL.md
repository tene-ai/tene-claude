---
name: sprint
description: sprint 를 만들고 phase 를 옮기고 일시 중지·재개·예외 승인을 한다. 사이클 전체의 진입점이며 하위 명령으로 분기한다.
when_to_use: "sprint 시작, 새 기능 개발 시작, 이번 작업 시작하자, sprint init, sprint 만들어, 일시 중지, 잠깐 멈춰, 다시 시작, 예외 승인, waiver, 이건 넘어가자, phase 바꿔, sprint 목록"
argument-hint: "init|start|status|pause|resume|waiver|phase|list [<sprint-id>] [옵션]"
allowed-tools: Read Write Edit Glob Grep Bash(${CLAUDE_PLUGIN_ROOT}/bin/*) Bash(git *) AskUserQuestion
metadata:
  tene:
    phase: null
    standalone: true
---

# tene:sprint — 사이클 진입점

<!-- 스킬이 로드될 때 자동 실행된다. 모델이 "먼저 확인하라" 를 따를 확률에 기대지 않는다. -->

## 현재 sprint 상태

!`"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" read 2>/dev/null || echo '{"ok":false,"note":"상태 없음"}'`


## 언제 적용되는가

사용자가 새 작업을 시작하려 하거나, sprint 자체를 조작할 때. 개별 phase 작업(`prd`/`plan`/`design`/`loop-check`/`qa`/`report`)은 각자의 스킬이 맡는다.

## 하위 명령

| 명령 | 하는 일 |
|---|---|
| `init <id>` | 새 sprint 생성 + 문서 폴더 골격 + master plan 등록 |
| `start [<id>]` | 기존 sprint 를 활성화하고 `draft → prd` 전이 |
| `status` | `/tene:status` 로 위임 |
| `pause [--reason]` | phase 유지, status 만 `paused` |
| `resume` | `paused → active` |
| `waiver --ac <id> --reason <사유>` | blocking AC 예외 승인 |
| `phase --to <phase>` | phase 직접 조정 (resync 후 보정용) |
| `list` | sprint 목록과 활성 항목 |

하위 명령이 없으면 `status` 로 본다.

## 수행 규칙

1. **id 를 사용자에게서 받는다.** 지어내지 않는다. 사용자가 제목만 말했다면 id 후보를 제안하고 확인받는다. id 는 소문자·숫자·하이픈, 32자 이내이며 **한 번 정하면 바뀌지 않는다** — 폴더 이름의 slug 는 바뀌어도 id 로 찾기 때문이다.
2. **init 은 문서를 만들지 않는다.** 폴더 골격만 만들고, 문서 작성은 `/tene:prd` 가 한다. 빈 템플릿을 미리 뿌리면 "채워진 문서" 와 구분되지 않는다.
3. **phase 를 건너뛰지 않는다.** `phase --to` 는 resync 이후 보정에만 쓴다. 사용자가 "바로 구현하자" 고 해도 `design` 까지의 문서 없이 `do` 로 보내지 않는다 — 그러면 QA 가 비교할 기준이 없다.
4. **waiver 에는 사유가 필수다.** 사유 없이 요청하면 왜 필요한지 되묻는다. 사유 없는 예외는 다음 sprint 에서 "왜 넘어갔는지" 를 아무도 모른다.
5. **AC 를 지워서 통과시키지 않는다.** 기준이 과하다고 판단되면 waiver 로 남기거나 `non-blocking` 으로 바꾸되, 그 변경도 사유와 함께 기록한다.

## 단계

### `init`

1. id 와 제목을 확인한다 (없으면 묻는다)
2. profile 을 정한다 — 기본 `standard`. 사용자가 "가볍게" 라고 하면 `light`, "엄격하게" 면 `strict`
3. slug 를 제목에서 만든다 (소문자·하이픈, 40자 이내)
4. 상태 생성:
   ```
   "${CLAUDE_PLUGIN_ROOT}/bin/tene-state" init --id <id> --slug <slug> --title "<제목>" --profile <profile>
   ```
5. 문서 폴더 골격을 만든다:
   ```
   <docsRoot>/<id>-<slug>/{00-prd,01-plan,02-design,03-analysis,04-report}/
   ```
6. 다음 행동을 안내한다: `/tene:prd`

### `start`

1. `"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" read` 로 현재 상태 확인
2. `draft` 면 `"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" advance --id <id> --to prd --result pass` (G0: id·title 존재 확인)
3. 이미 진행 중이면 현재 phase 와 다음 행동만 알린다

### `pause` / `resume`

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" pause  --id <id> [--reason "<사유>"]
"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" resume --id <id>
```

pause 는 phase 를 바꾸지 않는다. 재개하면 있던 자리에서 계속한다.

### `waiver`

1. 사유를 확인한다. 없으면 **묻는다** — 이건 생략할 수 없다
2. ```
   "${CLAUDE_PLUGIN_ROOT}/bin/tene-state" waiver --id <id> --ac <ac-id> --reason "<사유>"
   ```
3. 승인 후 반드시 알린다: 이 AC 는 **미충족인 채로 넘어간 것**이며 보고서 R6 에 기록된다

### `phase --to`

resync 직후 추정이 틀렸을 때만 쓴다. 실행 전에 왜 필요한지 확인하고, `--force` 가 붙는 전이임을 알린다:

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" advance --id <id> --to <phase> --force
```

## 출력 형식

```
[tene:sprint] checkout-retry 를 만들었습니다

  제목      : 결제 실패 시 입력값 보존
  profile   : standard
  문서      : docs/sprints/checkout-retry-payment-failure-input-preservation/
              00-prd/  01-plan/  02-design/  03-analysis/  04-report/

다음 → /tene:prd 로 기획 의도를 정리합니다
```

waiver:

```
[tene:sprint] ac_2 를 예외 승인했습니다

  기준   : If 결제가 실패하면, then 시스템은 실패 사유를 payments 에 기록해야 한다
  판정   : failed (미충족인 채로 넘어감)
  사유   : PG사 샌드박스가 실패 응답을 지원하지 않음

  이 항목은 보고서 R6 에 "미완료 + 사유" 로 남고, 다음 sprint 의 이월 후보가 됩니다.
```

## 하지 않는 것

- id 를 임의로 짓지 않는다
- 문서 없이 `do` 이후로 보내지 않는다
- 사유 없는 waiver 를 승인하지 않는다
- 사용자 확인 없이 `--force` 를 쓰지 않는다
- 완료되지 않은 sprint 를 archived 로 만들지 않는다 (그건 `/tene:archive` 의 일이며 G7 을 거친다)

## 실패 시

- `SPRINT_EXISTS` → 기존 sprint 의 상태를 보여주고 이어서 할지 다른 id 를 쓸지 묻는다
- `INVALID_ID` → 규칙(소문자 시작, 소문자·숫자·하이픈, 32자)을 알리고 후보를 제안한다
- `INVALID_TRANSITION` → `allowed` 에 있는 곳만 갈 수 있음을 알리고, 왜 그 순서인지 한 줄로 설명한다
- `GATE_BLOCKED` → 어느 게이트가 무엇 때문에 막았는지 `findings` 를 그대로 전달한다. 게이트를 우회하는 방법을 먼저 제안하지 않는다
