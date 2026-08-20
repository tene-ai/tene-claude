---
tene:
  sprint: wiring-conformance
  doc: prd
  phase: prd
  status: draft
  created: 2026-08-20
  modified: 2026-08-20
  lang: ko
  profile: strict
---

# wiring-conformance — PRD

## 1. 배경과 문제     <!-- tene:sec=background -->

직전 sprint `self-conformance` 가 명세 27개 항목을 감사해 `implemented 13 · partial 13 · unverifiable 1 · missing 0` 을 냈다. **`missing` 이 0건인데 `partial` 이 13건**이고, 그 대부분이 같은 모양이었다 — 코드는 있는데 진입점에서 부르지 않는다.

`lib/plan/aggregate.js`, `crossJudgeDataFlow`, `lastLoopResult` 쓰기, `promote()` 가 전부 그렇다. 잘 쓰인 모듈이 호출자 없이 떠 있다.

**더 큰 문제는 tene 이 그것을 보지 못한다는 것이다.** 배선이 안 된 `aggregate` 에 6질문을 던지면 Q1~Q4 가 전부 `high confidence` 로 답한다 — Q3·Q4 가 테스트 참조를 프로덕션 참조와 구분하지 않기 때문이다. `orphans()` 는 참조 0건만 잡으므로(`lib/scan/query.js:128`) 걸리지 않는다. 계층 판정도 정상, 게이트도 통과.

tene 이 검사하는 축은 셋이다 — **배치**(4계층), **존재**(Q1·Q2), **참조**(Q3·Q4). 배선 누락은 이 셋이 전부 정상인데 **도달만 안 되는** 상태다. 그래서 통과한다.

또 직전 sprint 는 판정 10건 중 6건이 `insufficient` 로 끝났다. 원인은 구현이 아니라 **내 증거 수집**이었다 — AC 에 귀속되지 않은 아티팩트, 동일 sha256 의 복제 증거, 판정 후 등록. 판정자 6명이 전부 거부했다.

## 2. 목표     <!-- tene:sec=goals -->

**"실제 동작하도록 구현했는가" 를 도달성과 실행으로 답한다.** 심볼이 존재하는지가 아니라, 진입점에서 그 심볼까지 경로가 있고 그 경로가 실제로 실행되는지를 본다.

성공은 다음으로 확인한다.

- 플러그인의 모든 export 가 `reachable` / `dynamic` / `test-only` / `unreachable` 중 하나로 분류되고 도달 경로가 기록된다
- `claude -p` 헤드리스 세션에서 빈 프로젝트에 사이클을 돌려 게이트 판정이 실제로 남는다
- 직전 sprint 가 `unverifiable` 로 남긴 RTM 4.1 이 판정된다
- 판정 시점에 모든 AC 가 귀속 증거를 갖는다 — `insufficient` 의 원인이 증거 수집이 되지 않는다

이 sprint 도 **판정까지**다. 결함 수정은 결과에 따라 다음 sprint 로 넘긴다.

## 3. 범위 밖 (Non-goals)     <!-- tene:sec=nongoals -->

- **발견된 결함의 수정** — 직전 sprint 의 이월 12건과 이번에 나올 것 모두. 판정과 수정을 섞으면 기준이 움직인다.
- **도달성 검사를 tene 에 기능으로 추가하는 것** — 이번에는 **외부 계측기**로 측정만 한다. 플러그인에 넣는 것은 설계 변경이므로 별도 sprint.
- **UX 검증** — 이 플러그인에 화면이 없다. 브라우저 경로는 해당 없음.
- **성능 개선** — 훅 예산은 측정하되 고치지 않는다.
- **tene CLI 내부** — 연동 경계까지만 본다.

## 4. 기획 의도 (Intent)     <!-- tene:sec=intents -->

| ID | 의도 | 근거 | 행위자 | 출처 |
|---|---|---|---|---|
| intent_1 | 존재가 아니라 도달로 구현 여부를 판정한다 | 배선 누락은 존재·참조 검사를 전부 통과하므로 축을 하나 더 봐야 잡힌다 | 개발자 | conversation |
| intent_2 | 정적 판독이 아니라 실행으로 확인한다 | 직전 sprint 감사 4건이 전부 "정적 읽기만 했다" 는 한계를 스스로 붙였다 | 개발자 | conversation |
| intent_3 | 판정 전에 증거를 귀속시킨다 | 직전 sprint 의 insufficient 6건은 전부 증거 수집 실패였다 | 개발자 | conversation |
| intent_4 | 빈 프로젝트에서 헤드리스로 돌려 사용자 조건을 재현한다 | 이 저장소에는 이미 상태·인덱스·규칙이 있어 첫 사용자의 조건이 아니다 | 사용자 | conversation |

## 5. 사용자 흐름 (UX Flow)     <!-- tene:sec=uxflow -->

### 정상 경로

계측기 작성 → 도달성 측정 → 빈 프로젝트 헤드리스 사이클 → RTM 4.1 재감사 → 증거 등록 → 판정 → 반박 → 보고

### 실패 경로

헤드리스 세션이 뜨지 않거나 게이트가 판정을 남기지 않으면 해당 AC 는 `insufficient` 이며 사유를 기록한다. 계측기가 동적 디스패치를 구분하지 못하면 그 사실을 함께 보고한다 — 구분 실패를 `unreachable` 로 세면 오탐이 된다.

### 되돌아오는 경로

판정이 `insufficient` 로 나오면 증거를 보강해 **같은 sprint 안에서 재판정**한다. 직전 sprint 는 이것을 하지 않고 넘겨 6건을 미측정으로 남겼다.

## 6. 데이터 처리 흐름     <!-- tene:sec=dataflow -->

입력 셋.

- **명세** — `docs/00-prd/` 13개, `docs/02-design/` 15개. 읽기 전용.
- **구현** — 마켓플레이스 배포본 `~/.claude/plugins/cache/tene-ai/tene/0.1.0/` 의 `bin/`·`lib/`·`hooks/`·`skills/`·`workflows/`.
- **진입점 집합** — `hooks/hooks.json` 이 호출하는 명령, `skills/*/SKILL.md` 본문의 bin 호출, `workflows/*.js` 의 `meta`.

산출은 `03-analysis/evidence/` 에 아티팩트로 남고 매니페스트에 sha256 과 함께 귀속된다. **AC 마다 최소 1개의 귀속 아티팩트를 판정 전에 등록한다.**

헤드리스 실행은 스크래치패드의 빈 프로젝트에서 수행하며 이 저장소의 상태를 건드리지 않는다.

## 7. 수용 기준 (AC)     <!-- tene:sec=ac -->

| ID | 기준 (EARS) | 우선도 | 방식 | 앵커 | 상태 |
|---|---|---|---|---|---|
| ac_1 | **When** 플러그인의 export 를 진입점 기준으로 조사하면, 시스템은 각 export 를 reachable·dynamic·test-only·unreachable 중 하나로 분류하고 도달 경로를 기록해야 한다 | blocking | DATA | `orphans` | pending |
| ac_2 | **If** export 가 정적 경로로 도달 불가하면, **then** 시스템은 동적 디스패치로 도달하는 것과 미배선을 구분해 기록해야 한다 | blocking | DATA | `questions` | pending |
| ac_3 | **When** 빈 프로젝트에서 `claude -p` 로 sprint 를 draft 에서 design 까지 진행하면, 시스템은 G0~G3 각 게이트의 판정을 상태 파일에 남겨야 한다 | blocking | DATA | `advance` | pending |
| ac_4 | **When** `claude -p` 헤드리스 세션이 시작되면, 시스템은 SessionStart 훅이 주입한 컨텍스트를 세션 로그에 남겨야 한다 | blocking | DATA | `formatSummary` | pending |
| ac_5 | **When** 앵커된 코드 파일을 편집하면, 시스템은 그 파일에 걸린 AC 의 판정을 stale 로 전환해야 한다 | blocking | DATA | `markStaleNoLock` | pending |
| ac_6 | **If** `tene-scan layers` 의 출력을 그대로 design 문서 자동 블록에 넣으면, **then** 시스템은 `tene-doc validate` 를 통과시켜야 한다 | blocking | UNIT | `judgeAll` | pending |
| ac_7 | **When** RTM 4.1 의 3단계 앵커링과 stale 마킹을 감사하면, 시스템은 Stage 2·Stage 3 각각의 구현 여부를 파일:라인 근거와 함께 기록해야 한다 | blocking | DATA | `nextActionFor` | pending |
| ac_8 | **When** 전체 테스트 스위트를 실행하면, 시스템은 실패 건수를 0으로 기록해야 한다 | blocking | UNIT | `judgeBash` | pending |
| ac_9 | **When** 명세 27개 요구 항목의 판정을 직전 sprint 결과와 대조하면, 시스템은 변동 항목을 기록해야 한다 | non-blocking | DATA | `judgeAll` | pending |
| ac_10 | **When** 동기 훅을 벤치마크하면, 시스템은 각 훅의 로직 시간과 D05 예산을 함께 기록해야 한다 | non-blocking | UNIT | `formatSummary` | pending |

> 규칙: EARS 5패턴만 · 하나의 AC 는 하나의 판정 · **If-then 최소 1개** · 모호 형용사 금지
> 우선도: blocking(게이트를 막음) / non-blocking(점수로만 반영)
> 방식: UNIT(테스트) / DATA(데이터 흐름) / UX(화면 전이)

## 8. 열린 결정 사항     <!-- tene:sec=decisions -->

| # | 결정할 것 | 선택지 | 기본 제안 | 결정자 |
|---|---|---|---|---|
| E-A | 도달성 축을 tene 에 넣을 것인가 | Q7 로 6질문 확장 / G4 검사 추가 / 둘 다 / 안 함 | **둘 다** — Q7 은 보고, G4 는 강제 | 사용자 |
| E-B | Q3·Q4 가 테스트 참조를 구분할 것인가 | 구분 표기 / 프로덕션만 집계 / 현행 유지 | **구분 표기** — 집계에서 빼면 테스트 커버리지가 안 보인다 | 사용자 |
| E-C | 직전 sprint 이월 12건의 처리 순서 | F-7 우선 / D12 표류 우선 / 일괄 | **F-7 우선** — 사이클 자체가 안 돈다 | 사용자 |

## +@ (자유 관점)

### 직전 sprint 와 무엇이 다른가

| | self-conformance | wiring-conformance |
|---|---|---|
| AC 의 축 | 부품이 규격에 맞는가 | **진입점에서 도달해 실행되는가** |
| 증거 시점 | 판정 후 등록 (6건 insufficient) | **판정 전 귀속** |
| 실행 환경 | 이 저장소 (상태·인덱스 기존재) | **빈 프로젝트 + `claude -p`** |
| 감사 방식 | 정적 읽기 | 정적 + **실행 관찰** |

직전 sprint 는 "부품이 맞는가" 를 물었고 부품은 대체로 맞았다. 이번에는 **"이어져 있는가"** 를 묻는다. 그것이 사용자가 반복해서 겪는 문제이고, 직전 sprint 가 `partial 13` 으로 가리킨 곳이다.
