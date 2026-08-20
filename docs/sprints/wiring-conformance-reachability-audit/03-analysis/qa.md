---
tene:
  sprint: wiring-conformance
  doc: qa
  phase: qa
  status: draft
  created: 2026-08-20
  modified: 2026-08-20
  lang: ko
---

# wiring-conformance — QA

## 1. 게이트 판정     <!-- tene:sec=gate -->

<!-- tene:auto:start block=gate generated=2026-08-20T12:35:52Z -->
**G6 예상: `fail`** — blocking AC 중 `failed` 3건

| 항목 | 값 |
|---|---|
| AC 총계 | 10 |
| passed | 1 |
| failed | 4 |
| insufficient | 5 |

> `failed` 4건 중 3건(ac_1·ac_3·ac_8)은 판정자가 `passed` 를 냈으나 반박 2/3 이상으로 강등된 것이다.
> 반박 사유는 전부 **증거 충분성**이며 위반을 증명한 것이 아니다. 강등 규칙(W-6)의 결함이 이 표에 그대로 드러난다.
<!-- tene:auto:end -->

> G6: blocking AC 전부 `passed` + 증거 유효 + stale 0.
> `insufficient` 는 게이트를 막지 않으나 report R6 에 반드시 기록됩니다.

## 2. 검증 환경     <!-- tene:sec=environment -->

<!-- tene:auto:start block=environment generated=2026-08-20T12:35:52Z -->
| 항목 | 값 |
|---|---|
| 검증 방식 | **Dynamic Workflow** — `tene:qa-sweep`, `tene:conformance-audit` |
| qa-sweep | 에이전트 32 · 25분 · 1.21M 토큰 · 수집→판정→반박 |
| conformance-audit | 에이전트 47 · 21분 · 2.68M 토큰 · 감사→갭검증 |
| 검증 대상 | 마켓플레이스 배포본 `~/.claude/plugins/cache/tene-ai/tene/0.1.0/` |
| 테스트 러너 | `node --test` (자동 탐지 실패 — 수동 주입) |
| 브라우저 | 없음 — UX AC 0건이라 해당 없음 |
| 시크릿 스캔 | clean (findings 0, 바이너리 11건 미검사) |
<!-- tene:auto:end -->

## 3. Test Charter     <!-- tene:sec=charters -->

**이번 회차는 Dynamic Workflow 로 수행했다.** 직전까지 개별 에이전트를 하나씩 띄운 것이 잘못이었다 — qa 스킬은 "기준이 8건을 넘으면 `qa-sweep` 워크플로로 팬아웃한다" 고 지시하고 AC 는 10건이었다.

`tene:qa-sweep` 이 수집→판정→반박을 파이프라인으로 돌렸다. 세 단계가 각각 다른 에이전트이고 판정자는 수집자의 결론을 보지 못한다.

**수집자들이 내가 하지 않은 일을 했다.**

| AC | 수집자가 만든 것 |
|---|---|
| ac_1 | 불변식 재집계(`art_v_inv`), 결정성 2회 실행 대조(`changedCount 0`), 기준선 비교, 중복 레코드 프로브 — 아티팩트 7건 |
| ac_3 | 빈 프로젝트 CLI 독립 재현, 동일 init 2회·동시 advance 2건·게이트 2회 기록 프로브 |
| ac_5 | **음성 대조군** `src/ship.js` 를 만들어 "편집 안 한 파일의 AC 는 불변" 을 증명. 대칭·음성·Write 경로까지 5개 케이스 |

ac_5 의 음성 대조군은 앞선 회차에서 반박자가 요구했던 바로 그 관찰이다. 워크플로 수집자가 스스로 만들었다.

**수집이 4건에서 빈 결과를 냈다** (ac_2·ac_4·ac_6·ac_7). 판정자들은 전부 `insufficient` 를 내고 "코드 정적 확인으로 통과를 추정하지 않았다", "제가 저장소를 직접 조회해 근거를 만들어내는 것은 수집과 판정의 분리를 무너뜨리므로 하지 않았다" 고 적었다. **정직성 기계는 작동했고 이 실행은 불완전하다.** 둘 다 사실이다.


## 4. AC 별 판정     <!-- tene:sec=acverdicts -->

<!-- tene:auto:start block=acverdicts generated=2026-08-20T12:35:53Z -->
| ID | 우선도 | 방식 | 판정 | 증거 | 사유 |
|---|---|---|---|---|---|
| ac_1 | blocking | DATA | `failed` | art_v_run1 | 판정자는 'DATA 증거가 기준을 직접 충족' 으로 passed 를 냈으나 반박 2/3(correctness·evidence-sufficiency)으로 강등. 반박은 증거 |
| ac_2 | blocking | DATA | `insufficient` | — | 수집 단계가 빈 결과를 냈다. 판정자: '코드 정적 확인으로 통과를 추정하지 않았다' |
| ac_3 | blocking | DATA | `failed` | art_ac3_state_raw | 판정자는 상태 파일 원본(sha256 848e95f1)에서 G0~G3 pass 를 직접 확인하고 빈 프로젝트 CLI 재현까지 했으나 반박 3/3 으로 강등. W-6 동일 |
| ac_4 | blocking | DATA | `insufficient` | — | 수집 단계 빈 결과. 헤드리스 세션 로그가 제출되지 않았다 |
| ac_5 | blocking | DATA | `passed` | art_ac5_l3_transition | 음성 대조군 포함 5개 L3 케이스로 양방향 증명. src/pay.js 편집 → pay 앵커 AC 만 stale, ship.js 앵커 2건 불변. 대칭·음성·Write 경 |
| ac_6 | blocking | UNIT | `insufficient` | — | 수집 단계 빈 결과. tene-doc validate 실행 기록이 제출되지 않았다 |
| ac_7 | blocking | DATA | `insufficient` | — | 수집 단계 빈 결과. 판정자가 스스로 저장소를 조회해 근거를 만드는 것을 거부했다 — 수집·판정 분리 유지 |
| ac_8 | blocking | UNIT | `failed` | art_ac8_run | tests 336 / pass 336 / fail 0 / exit 0 을 직접 실행 확인했으나 반박 3/3 으로 강등. W-6 동일 |
| ac_9 | non-blocking | DATA | `insufficient` | — | 수집 단계 빈 결과 |
| ac_10 | non-blocking | UNIT | `failed` | — | 반박 강등 |
<!-- tene:auto:end -->

## 5. UX 흐름 검증     <!-- tene:sec=uxflow -->

<!-- tene:auto:start block=uxflow generated=2026-08-20T12:35:53Z -->
**전이 커버리지: `not-applicable`** — AC 10건이 DATA 6 · UNIT 4 이며 UX 방식이 없다. 이 플러그인은 CLI 와 훅으로만 동작한다.

분모가 0 이므로 비율을 계산하지 않는다. 0/0 을 100% 로 쓰면 거짓이 된다.

| 되돌아오는 경로 | 결과 | 사유 |
|---|---|---|
| 새로고침 후 복구 | `insufficient` | 화면이 없어 측정 대상이 아니다 |
| 중복 제출 방지 | `insufficient` | 화면이 없어 측정 대상이 아니다 |
| 실패 후 재시도 | `insufficient` | 화면이 없어 측정 대상이 아니다 |
<!-- tene:auto:end -->

## 6. 데이터 처리 흐름 검증     <!-- tene:sec=dataflow -->

DATA 방식 6건 중 실제 데이터 관찰이 이뤄진 것은 ac_1·ac_3·ac_5 세 건이다.

| 경로 | 관찰 | 결과 |
|---|---|---|
| 진입점 → export 도달 | export 408건 전수 분류, 버킷 합 408 = totals, 중복 0 | reachable 211 / dynamic 12 / test-only 61 / unreachable 124 |
| `claude -p` → 상태 파일 | 빈 프로젝트 실행 후 상태 파일 원본(sha256 `848e95f1…`) 직접 읽기 | G0~G3 `result:pass`, G4~G7 `null`, `forced` 키 없음 |
| 편집 → stale 전환 | 앵커 파일 편집 + 음성 대조군 | pay 앵커 AC 만 stale, ship 앵커 2건 불변 |
| 중복 레코드 프로브 | 동일 init 2회 / 동시 advance 2건 / 게이트 2회 기록 | 각각 `SPRINT_EXISTS`, `INVALID_TRANSITION`, `BAD_ARGS` 로 거절 — 레코드 1건 유지 |

**교차 판정(정적 × 동적)은 이번에도 수행되지 않았다.** RTM 1.3 감사가 원인을 재확인했다 — `crossJudgeDataFlow` 가 `bin/tene-qa` 에 import 되지 않아 파이프라인에 배선되어 있지 않다.


## 7. 7-Layer 처리     <!-- tene:sec=layers -->

<!-- tene:auto:start block=layers generated=2026-08-20T12:35:53Z -->
| Layer | 처리 | 사유 |
|---|---|---|
| L1 린터·타입체커 | `insufficient` | 타입체커 없음 |
| L2 테스트 러너 | `measured` | node --test 336/336, 워크플로가 독립 재실행 |
| L3 API·데이터 상태 | `measured` | 상태 파일 원본 대조, 빈 프로젝트 CLI 재현, 중복 레코드 프로브 |
| L4 시스템 경로 | `not-applicable` | 브라우저 경로 없음 |
| L5 화면 전이 | `not-applicable` | UX AC 0건 (분모 0) |
| L6 실패·권한·재시도 주입 | `partial` | 중복 요청·동시 전이 프로브만 수행 |
| L7 기존 테스트 재실행 | `measured` | 기준선 336 대조, 드리프트 0 |
<!-- tene:auto:end -->

## 8. 미측정 항목     <!-- tene:sec=insufficient -->

**5건이 `insufficient` 다. 하나도 통과로 올리지 않았다.**

| AC | 왜 측정하지 못했나 |
|---|---|
| ac_2 | 워크플로 수집 단계가 빈 결과. 도달 불가 export 의 dynamic/미배선 구분 레코드가 제출되지 않았다 |
| ac_4 | 수집 빈 결과. 헤드리스 세션 로그가 이번 실행에서 제출되지 않았다 |
| ac_6 | 수집 빈 결과. `tene-doc validate` 실행 기록이 제출되지 않았다 |
| ac_7 | 수집 빈 결과. 판정자가 스스로 조사해 근거를 만드는 것을 거부했다 |
| ac_9 | 수집 빈 결과 |

원인은 **워크플로 에이전트 8건이 빈 결과를 반환**한 것이다(`agents_empty_result: 8`). 스키마 호출 실패 3건이 함께 보고됐다.

**측정하지 못한 레이어**: L1(타입체커 없음) · L4·L5(화면 없음) · L6(부분 — 중복·동시성 프로브만).

`conformance-audit` 도 27개 중 4건이 스키마 실패로 판정을 못 받았다. **판정된 23건만 센다.**


## 9. 후속 조치     <!-- tene:sec=followup -->

**G6 는 `fail` 이다.** blocking AC 중 `failed` 3건이 있다. 우회하지 않는다.

다만 그 3건의 성격을 정확히 적어야 한다. **ac_1·ac_3·ac_8 은 판정자가 `passed` 를 냈고 반박 2/3 이상으로 강등된 것**이며, 반박 사유는 전부 증거 충분성이지 위반 증명이 아니다. 실제 복귀 지점은 다르다.

| 원인 | 해당 | 복귀 |
|---|---|---|
| 강등 규칙의 결함 (W-6) | ac_1·ac_3·ac_8 | 규칙 수정 후 재판정 — 코드 복귀 아님 |
| 수집 단계 실패 | ac_2·ac_4·ac_6·ac_7·ac_9 | `qa` 재실행 |
| 구현 결함 | RTM 감사가 찾은 20건 | `do` — 다음 sprint |

이 sprint 는 **판정까지**가 범위이므로 여기서 복귀하지 않고 report 로 간다.


## +@ (자유 관점)
