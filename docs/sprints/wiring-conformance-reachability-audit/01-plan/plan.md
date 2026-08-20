---
tene:
  sprint: wiring-conformance
  doc: plan
  phase: plan
  status: draft
  created: 2026-08-20
  modified: 2026-08-20
  lang: ko
  profile: strict
---

# wiring-conformance — Plan

## 1. 작업 항목     <!-- tene:sec=tasks -->

| # | 작업 | 커버하는 AC | 예상 계층 | 선행 |
|---|---|---|---|---|
| task_1 | 도달성 계측기를 만든다 — 진입점 집합(hooks.json 명령 · SKILL.md 의 bin 호출 · workflows meta)에서 정적 import·call 그래프를 따라가고, `bin/tene-hook` 의 HANDLERS 처럼 동적 디스패치로 등록된 것을 별도 집합으로 수집한다 | ac_1, ac_2 | — | — |
| task_2 | 계측기를 배포본에 돌려 export 를 reachable·dynamic·test-only·unreachable 로 분류하고 도달 경로를 기록한다 | ac_1, ac_2 | — | task_1 |
| task_3 | 스크래치패드에 빈 git 프로젝트를 만들고 `claude -p` 로 `/tene:sprint init` → `/tene:prd` → `/tene:plan` → `/tene:design` 을 진행시킨 뒤 상태 파일의 게이트 기록을 수집한다 | ac_3 | Interface | — |
| task_4 | 같은 헤드리스 세션의 stream-json 로그에서 SessionStart 훅 주입 컨텍스트를 추출해 대화형 `tene-state summary` 와 대조한다 | ac_4 | Infrastructure | task_3 |
| task_5 | 임시 프로젝트에서 AC 에 앵커된 파일을 실제로 편집하고 PostToolUse 훅이 그 AC 를 stale 로 바꾸는지 상태 파일로 확인한다 | ac_5 | Business Logic | — |
| task_6 | `tene-scan layers` 출력을 가공 없이 design 자동 블록에 넣고 `tene-doc validate` 결과를 기록한다 (F-1 회귀) | ac_6 | Business Logic | — |
| task_7 | RTM 4.1 을 재감사한다 — 3단계 앵커링 Stage 2·3 과 stale 마킹 분기값을 파일:라인으로 확정한다 | ac_7 | — | — |
| task_8 | 전체 테스트 스위트를 실행해 실패 건수를 기록한다 | ac_8 | — | — |
| task_9 | 27개 요구 항목 판정을 직전 sprint 결과와 대조해 변동을 기록한다 | ac_9 | — | task_2, task_7 |
| task_10 | 훅 벤치마크를 실행해 로직 시간과 예산을 기록한다 | ac_10 | Infrastructure | — |


## 2. AC 커버리지     <!-- tene:sec=coverage -->

<!-- tene:auto:start block=coverage generated=2026-08-20T10:41:31Z -->
| AC | 커버 작업 | 상태 |
|---|---|---|
| ac_1 | task_1, task_2 | pending |
| ac_2 | task_1, task_2 | pending |
| ac_3 | task_3 | pending |
| ac_4 | task_4 | pending |
| ac_5 | task_5 | pending |
| ac_6 | task_6 | pending |
| ac_7 | task_7 | pending |
| ac_8 | task_8 | pending |
| ac_9 | task_9 | pending |
| ac_10 | task_10 | pending |
<!-- tene:auto:end -->

> 커버되지 않은 AC 가 있으면 G2 게이트가 막습니다.

## 3. 영향 범위     <!-- tene:sec=impact -->

<!-- tene:auto:start block=impact -->
| 대상 | 영향 | 출처 |
|---|---|---|
<!-- tene:auto:end -->

## 4. 순서와 의존     <!-- tene:sec=order -->

**병렬 가능** — task_1, task_3, task_5, task_6, task_7, task_8, task_10 은 서로 독립이다.

**직렬 구간** — task_2 는 task_1 의 계측기를 쓴다. task_4 는 task_3 이 남긴 세션 로그를 읽는다. task_9 는 task_2·task_7 의 결과를 직전 sprint 와 대조한다.

**증거 등록 시점을 고정한다.** 각 task 가 끝나면 **그 자리에서** `tene-qa evidence` 로 해당 AC 에 귀속시킨다. 전부 모아서 나중에 등록하지 않는다 — 직전 sprint 가 그렇게 해서 판정 6건을 잃었다.


## 5. 위험과 대비     <!-- tene:sec=risks -->

| 위험 | 영향 | 대비 |
|---|---|---|
| 계측기가 동적 디스패치를 미배선으로 오판 | `unreachable` 오탐. 멀쩡한 훅 9개가 죽은 코드로 보인다 | `bin/tene-hook` 의 `HANDLERS` 처럼 문자열 키로 등록된 동적 import 를 별도로 수집해 `dynamic` 집합으로 분리한다. 구분 못 하면 그 사실을 보고한다 |
| 헤드리스 세션이 스킬을 호출하지 않음 | ac_3·ac_4 판정 불가 | 프롬프트에서 스킬을 명시 호출하고, 실패하면 `insufficient` + 사유. 억지로 성공시키지 않는다 |
| 헤드리스가 이 저장소 상태를 건드림 | 진행 중 sprint 오염 | 스크래치패드의 별도 git 프로젝트에서만 실행하고 `--project` 를 고정한다 |
| stale 마킹 관찰이 이 저장소 AC 를 바꿈 | 이번 sprint 판정 오염 | 임시 프로젝트에서 별도 sprint 를 만들어 관찰한다 |
| 계측기가 내 손으로 만든 것이라 계측기 자체가 틀릴 수 있다 | ac_1·ac_2 신뢰 하락 | 알려진 정답으로 교차 확인한다 — `aggregate` 는 test-only, `session-start` 는 dynamic, `store.js` 는 reachable 이어야 한다 |


## 6. 이번에 하지 않는 것     <!-- tene:sec=notdoing -->

- **결함 수정** — PRD §3 과 동일. 직전 sprint 이월 12건도 그대로 둔다.
- **도달성 검사를 플러그인에 넣기** — 이번 계측기는 `evals/` 아래 외부 스크립트다. 플러그인 코드에 손대지 않는다.
- **Q6 부작용 탐지 구현** — RTM 1.11 이 미구현으로 확정했다. 구현은 별도 sprint.
- **UX 검증** — 화면이 없다. 전이 분모 0.


## +@ (자유 관점)
