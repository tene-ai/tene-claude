---
tene:
  sprint: self-conformance
  doc: prd
  phase: prd
  status: draft
  created: 2026-08-20
  modified: 2026-08-20
  lang: ko
  profile: strict
---

# self-conformance — PRD

## 1. 배경과 문제     <!-- tene:sec=background -->

tene 플러그인은 `docs/00-prd/` 13개 문서와 `docs/02-design/` 15개 문서(합 14,288줄)로 명세되었고 구현이 끝났다고 선언되었다. 그러나 **명세와 구현의 대조가 한 번도 체계적으로 이뤄진 적이 없다.**

지금까지의 검증은 세 가지에 그쳤다 — 단위 테스트 336건(구현이 스스로를 검사), 스킬 eval 14케이스(스킬 7종만), 수동 확인. 어느 것도 "RTM 27개 요구 항목이 실제로 구현되었는가"를 묻지 않았다.

방치하면 두 가지가 일어난다. 첫째, 명세에만 있고 구현에 없는 기능이 문서를 읽은 사용자에게 "있는 것"으로 약속된다. 둘째, tene 자신이 "문서 대비 구현을 검증하는 도구"이므로, tene 이 자기 명세를 지키지 못한 채 남의 코드를 판정하면 도구의 근거가 무너진다.

## 2. 목표     <!-- tene:sec=goals -->

**마켓플레이스 배포본**(`tene@tene-ai`, 로컬 작업 트리가 아님)을 대상으로, 명세의 각 요구 항목이 구현되어 실제로 동작하는지 근거와 함께 판정한다.

성공은 다음으로 확인한다.

- RTM 27개 요구 항목 각각에 `implemented` / `partial` / `missing` / `unverifiable` 판정과 근거 경로가 붙는다
- D13 §10 출시 판정 10항 중 **타협 불가 2항**(정직성 eval, 가드 매트릭스)의 실측값이 기록된다
- 판정하지 못한 항목이 `passed` 로 넘어가지 않는다

이 sprint 는 **판정까지**다. 발견된 결함의 수정은 결과에 따라 다음 sprint 로 넘긴다.

## 3. 범위 밖 (Non-goals)     <!-- tene:sec=nongoals -->

- **발견된 결함의 수정** — 판정과 수정을 한 sprint 에 섞으면 "고치면서 기준을 바꾸는" 일이 생긴다. 수정은 이월 항목으로 남긴다.
- **성능 최적화** — 훅 예산 초과 여부는 측정하되 개선하지 않는다.
- **`docs/01-plan/` 의 마일스톤 진척 검증** — 진척은 이미 `06-progress.md` 가 추적한다. 이번 대상은 요구 명세(00-prd)와 상세 설계(02-design)다.
- **tene CLI(외부 바이너리 `tene` v1.0.16) 자체의 검증** — 연동 경계까지만 본다. CLI 내부는 이 저장소의 산출물이 아니다.
- **다중 사용자 동시성** — RTM §7 이 이미 스코프 밖으로 선언했다.

## 4. 기획 의도 (Intent)     <!-- tene:sec=intents -->

| ID | 의도 | 근거 | 행위자 | 출처 |
|---|---|---|---|---|
| intent_1 | 명세 항목마다 구현 근거를 파일:라인으로 제시한다 | 근거 없는 "구현됨"은 다음 사람이 재확인해야 하므로 검증이 아니다 | 개발자 | conversation |
| intent_2 | 측정하지 못한 것을 통과로 세탁하지 않는다 | tene 의 존재 이유가 그것이며, 자기 검증에서 어기면 도구의 근거가 사라진다 | 개발자 | conversation |
| intent_3 | 로컬 작업 트리가 아니라 마켓플레이스 배포본을 검증한다 | 사용자가 받는 것은 배포본이다. 로컬에서만 되는 것은 사용자에게 없는 기능이다 | 사용자 | conversation |
| intent_4 | 대화형 세션과 헤드리스(`claude -p`) 양쪽에서 확인한다 | 훅과 bin 은 세션 종류에 따라 다르게 동작할 수 있고, 그 차이는 대화형에서만 쓰면 드러나지 않는다 | 개발자 | conversation |

## 5. 사용자 흐름 (UX Flow)     <!-- tene:sec=uxflow -->

### 정상 경로

`/tene:sprint init` → `/tene:prd` → `/tene:plan` → `/tene:design` → (검증 실행) → `/tene:loop-check` → `/tene:qa` → `/tene:report`

각 전이에서 게이트 G0~G7 이 평가되고, 판정 결과가 상태에 남는다.

### 실패 경로

게이트가 `fail` 을 내면 전이가 막히고 phase 가 유지된다. 무엇이 왜 막혔는지 `findings` 가 그대로 노출된다. 이때 `--force` 를 쓰면 전이는 되지만 그 게이트는 `skipped` + `forced: true` 로 기록되어 통과로 세어지지 않는다.

loop-check 가 상한(strict profile 기준 3회)에 도달하면 정지하고 waiver 를 안내한다.

### 되돌아오는 경로

세션이 끊기면 `.tene-claude/state/` 에서 재개한다. 상태가 손상되면 `/tene:status --resync` 로 문서에서 복구하며, 이때 게이트 판정은 복구하지 않고 비운다(재판정 대상임을 드러내기 위해).

## 6. 데이터 처리 흐름     <!-- tene:sec=dataflow -->

입력은 두 갈래다.

- **명세** — `docs/00-prd/*.md`, `docs/02-design/*.md` 를 읽어 요구 항목을 뽑는다. 읽기 전용이며 이 sprint 는 명세를 고치지 않는다.
- **구현** — 마켓플레이스 캐시 `~/.claude/plugins/cache/tene-ai/tene/0.1.0/` 의 `lib/`, `bin/`, `skills/`, `agents/`, `hooks/`, `workflows/` 를 인덱싱한다.

판정 결과는 `docs/sprints/self-conformance-spec-audit/03-analysis/` 에 남고, 증거 파일은 `03-analysis/evidence/` 에 해시 매니페스트와 함께 남는다. 상태는 `.tene-claude/state/sprints/self-conformance.json` 에 원자적으로 기록된다.

검증 실행이 중간에 실패해도 그때까지의 관찰 기록은 증거 디렉토리에 남는다 — 판정만 `insufficient` 가 된다.

## 7. 수용 기준 (AC)     <!-- tene:sec=ac -->

| ID | 기준 (EARS) | 우선도 | 방식 | 앵커 | 상태 |
|---|---|---|---|---|---|
| ac_1 | **When** RTM 27개 요구 항목을 구현과 대조하면, 시스템은 각 항목에 implemented·partial·missing·unverifiable 중 하나의 판정과 근거 경로를 기록해야 한다 | blocking | DATA | `judgeAll` | pending |
| ac_2 | **If** 요구 항목의 근거를 찾지 못하면, **then** 시스템은 그것을 missing 과 unverifiable 로 구분해 기록해야 한다 | blocking | DATA | `kindOf` | pending |
| ac_3 | **When** 가드 매트릭스를 실행하면, 시스템은 전 케이스의 기대값 대비 오탐 건수와 미탐 건수를 0으로 기록해야 한다 | blocking | UNIT | `judgeBash` | pending |
| ac_4 | **When** 정직성 eval 을 실행하면, 시스템은 5종 전부에서 미측정 항목을 passed 로 표기하지 않아야 한다 | blocking | UNIT | `computeAcSummary` | pending |
| ac_5 | **When** 16개 스킬 본문이 지시하는 bin 명령을 각각 실행하면, 시스템은 종료 코드 0 또는 D12 에 정의된 오류 코드를 반환해야 한다 | blocking | UNIT | `run` | pending |
| ac_6 | **If** 게이트를 평가하지 않고 전이가 일어나면, **then** 시스템은 그 게이트를 skipped 로 기록하고 통과 집계에서 제외해야 한다 | blocking | DATA | `advance` | pending |
| ac_7 | **When** `claude -p` 헤드리스로 bin 명령을 호출하면, 시스템은 대화형 세션과 동일한 JSON 봉투 필드(ok·tool·schemaVersion·data·warnings)를 반환해야 한다 | blocking | UNIT | `ok` | pending |
| ac_8 | **When** sprint 를 draft 에서 report 까지 진행하면, 시스템은 G0~G7 각 게이트의 판정 결과를 상태 파일에 남겨야 한다 | blocking | DATA | `nextActionFor` | pending |
| ac_9 | **When** 동기 훅을 벤치마크하면, 시스템은 각 훅의 로직 시간과 D05 가 정한 예산을 함께 보고해야 한다 | non-blocking | UNIT | `judgeRead` | pending |
| ac_10 | **When** 세션이 시작되면, 시스템은 주입한 컨텍스트의 토큰 수를 D05 §3.3 예산(600 토큰)과 함께 보고해야 한다 | non-blocking | DATA | `formatSummary` | pending |

> 규칙: EARS 5패턴만 · 하나의 AC 는 하나의 판정 · **If-then 최소 1개** · 모호 형용사 금지
> 우선도: blocking(게이트를 막음) / non-blocking(점수로만 반영)
> 방식: UNIT(테스트) / DATA(데이터 흐름) / UX(화면 전이)

## 8. 열린 결정 사항     <!-- tene:sec=decisions -->

| # | 결정할 것 | 선택지 | 기본 제안 | 결정자 |
|---|---|---|---|---|
| D-A | D13 §1 이 명세한 픽스처(docs/state/code 하위)가 비어 있음 | 명세대로 채운다 / 명세를 현실에 맞게 고친다 | 판정만 하고 이월 | 사용자 |
| D-B | 가드 매트릭스 케이스 수 — D13 은 240, 구현은 다름 | 240까지 늘린다 / 실제 수로 명세 정정 | 실측값 기록 후 이월 | 사용자 |
| D-C | 테스트 러너 탐지가 하위 디렉토리 package.json 을 못 봄 | 탐지 범위 확장 / 현 동작 유지 | 판정만 하고 이월 | 사용자 |

## +@ (자유 관점)

### 이 sprint 가 스스로에게 거는 조건

이 sprint 는 tene 으로 tene 을 검증한다. 그래서 **검증 도구가 고장 나면 검증 결과도 못 믿는다**는 순환이 있다.

이를 끊기 위해 두 가지를 지킨다.

1. tene 이 낸 판정 중 blocking AC 에 해당하는 것은 **tene 밖의 수단으로 교차 확인**한다 (직접 실행, `claude -p`, 파일 대조).
2. tene 자신의 결함으로 판정이 불가능해지면 그 AC 는 `insufficient` 로 남기고, 그 사실 자체를 결과로 보고한다.
