---
tene:
  sprint: self-conformance
  doc: plan
  phase: plan
  status: draft
  created: 2026-08-20
  modified: 2026-08-20
  lang: ko
  profile: strict
---

# self-conformance — Plan

## 1. 작업 항목     <!-- tene:sec=tasks -->

| # | 작업 | 커버하는 AC | 예상 계층 | 선행 |
|---|---|---|---|---|
| task_1 | `docs/00-prd/06-requirements-traceability.md` 의 27개 요구 항목을 표에서 뽑아 대조 목록을 만들고, 각 항목의 구현 근거를 배포본 `lib/`·`bin/`·`skills/`·`agents/`·`hooks/` 에서 찾는다 | ac_1, ac_2 | — | — |
| task_2 | 가드 매트릭스 러너를 실행해 케이스 수·오탐 건수·미탐 건수를 실측하고 D13 §10 이 요구한 240 과 대조한다 | ac_3 | Infrastructure | — |
| task_3 | D13 §4.4 가 정의한 정직성 5종을 식별하고 해당 테스트를 실행해 미측정이 passed 로 표기되지 않음을 확인한다 | ac_4 | Business Logic | — |
| task_4 | 16개 스킬 SKILL.md 본문에서 `bin/` 호출 문자열을 추출해 각각 실행하고 종료 코드와 오류 코드를 수집한다 | ac_5 | Interface | — |
| task_5 | 게이트를 평가하지 않고 `--force` 로 전이시킨 뒤 상태 파일에 `skipped` + `forced` 가 남는지, 통과 집계에서 빠지는지 확인한다 | ac_6 | Business Logic | — |
| task_6 | `claude -p` 헤드리스 세션에서 bin 명령을 호출해 JSON 봉투 필드를 대화형 결과와 대조한다 | ac_7 | Interface | task_4 |
| task_7 | 이 sprint 자체를 draft 에서 report 까지 진행시키며 G0~G7 각각의 판정이 상태 파일에 남는지 확인한다 | ac_8 | Persistence | task_1, task_2, task_3, task_4, task_5, task_6 |
| task_8 | 훅 벤치마크를 실행해 각 동기 훅의 로직 시간을 D05 예산과 함께 기록한다 | ac_9 | Infrastructure | — |
| task_9 | SessionStart 가 주입하는 컨텍스트의 토큰 수를 측정해 D05 §3.3 의 600 토큰 예산과 대조한다 | ac_10 | Infrastructure | — |

## 2. AC 커버리지     <!-- tene:sec=coverage -->

<!-- tene:auto:start block=coverage generated=2026-08-20T09:35:13Z -->
| AC | 커버 작업 | 상태 |
|---|---|---|
| ac_1 | task_1 | pending |
| ac_2 | task_1 | pending |
| ac_3 | task_2 | pending |
| ac_4 | task_3 | pending |
| ac_5 | task_4 | pending |
| ac_6 | task_5 | pending |
| ac_7 | task_6 | pending |
| ac_8 | task_7 | pending |
| ac_9 | task_8 | pending |
| ac_10 | task_9 | pending |
<!-- tene:auto:end -->

> 커버되지 않은 AC 가 있으면 G2 게이트가 막습니다.

## 3. 영향 범위     <!-- tene:sec=impact -->

<!-- tene:auto:start block=impact -->
| 대상 | 영향 | 출처 |
|---|---|---|
<!-- tene:auto:end -->

## 4. 순서와 의존     <!-- tene:sec=order -->

**병렬 가능** — task_1, task_2, task_3, task_4, task_5, task_8, task_9 는 서로 의존하지 않는다. 각각 다른 증거를 수집하므로 동시에 돌 수 있다.

**직렬 구간** — task_6 은 task_4 가 추출한 명령 목록을 입력으로 받는다. task_7 은 나머지 전부가 끝나야 한다 — 이 sprint 의 사이클 완주 자체가 관찰 대상이기 때문이다.

task_7 의 특수성: 이 작업은 **자기 자신을 관찰한다.** sprint 를 report 까지 진행시키는 행위가 곧 ac_8 의 증거다. 그래서 task_7 은 별도로 실행하는 것이 아니라, 이 sprint 의 phase 전이 기록을 사후에 읽는 방식으로 수행한다.

## 5. 위험과 대비     <!-- tene:sec=risks -->

| 위험 | 영향 | 대비 |
|---|---|---|
| 검증 도구(tene)와 검증 대상(tene)이 같아 결함이 자기를 가린다 | 오판정. 특히 "통과" 오판정은 발견되지 않는다 | blocking AC 는 tene 밖의 수단(직접 실행, `claude -p`, 파일 대조)으로 교차 확인한다 |
| 배포본 캐시와 로컬 작업 트리가 갈라지면 무엇을 검증했는지 불명확해진다 | 결과의 의미가 사라진다 | 시작 시 `diff -rq` 로 동일성을 확인했고, sprint 중 로컬 코드를 고치지 않는다 |
| 테스트 러너 미탐지로 UNIT 방식 AC 가 전부 insufficient 가 된다 | ac_3·ac_4·ac_5·ac_7·ac_9 판정 불가 | 러너를 직접 지정해 실행하고, 탐지 실패 사실은 별도 결함으로 기록한다 |
| D13 명세와 실제 구현의 차이가 커서 "명세가 틀린 것"과 "구현이 빠진 것"이 섞인다 | 이월 항목의 성격이 모호해진다 | 판정 어휘를 분리한다 — 구현 부재는 `missing`, 명세 자체가 낡은 것은 열린 결정 사항으로 올린다 |

## 6. 이번에 하지 않는 것     <!-- tene:sec=notdoing -->

- **발견된 결함의 수정** — PRD 범위 밖과 동일. 판정과 수정을 섞지 않는다.
- **`docs/01-plan/` 대조** — 진척 추적은 `06-progress.md` 의 일이며 요구 명세가 아니다.
- **외부 프로젝트 도입 시나리오(D13 A-1, A-10)** — 빈 프로젝트 설치와 제거 후 정상 동작은 별도 환경이 필요하다. 이번에는 `claude -p` 로 대체 가능한 범위(ac_7)까지만 본다. 나머지는 이월한다.
- **Task 생성** — 작업 9건은 한 세션에서 끝나므로 Claude Code 태스크로 만들지 않는다.

## +@ (자유 관점)

### 왜 27개 전부를 보는가

표본을 뽑으면 "뽑히지 않은 항목이 통과한 것처럼" 보인다. RTM 은 27개가 전부이고 이미 목록이 있으므로 전수 대조가 가능하다. 전수를 보지 않을 이유가 없다.

### task_1 이 가장 크다

나머지 8개는 명령을 실행해 숫자를 읽으면 끝난다. task_1 만은 27개 항목마다 명세를 읽고 구현을 찾아야 하므로 분량이 다르다. AC 8개 이상이므로 D12(워크플로 사용 기준)에 따라 Dynamic Workflow 사용 대상이며, `tene:conformance-audit` 워크플로가 이 경우를 위해 존재한다.
