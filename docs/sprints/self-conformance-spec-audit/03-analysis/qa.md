---
tene:
  sprint: self-conformance
  doc: qa
  phase: qa
  status: draft
  created: 2026-08-20
  modified: 2026-08-20
  lang: ko
---

# self-conformance — QA

## 1. 게이트 판정     <!-- tene:sec=gate -->

<!-- tene:auto:start block=gate generated=2026-08-20T10:01:30Z -->
**G6 예상 판정: `fail`** — blocking AC 중 `failed` 1건(ac_5)

| 항목 | 값 |
|---|---|
| AC 총계 | 10 |
| passed | 3 |
| failed | 1 |
| insufficient | 6 |
| blocking failed | 1 (ac_5) |
| waived | 0 |

> `insufficient` 는 게이트를 막지 않는다. 그러나 6건은 **측정하지 못한 것**이며 R6 에 그대로 싣는다.
<!-- tene:auto:end -->

> G6: blocking AC 전부 `passed` + 증거 유효 + stale 0.
> `insufficient` 는 게이트를 막지 않으나 report R6 에 반드시 기록됩니다.

## 2. 검증 환경     <!-- tene:sec=environment -->

<!-- tene:auto:start block=environment generated=2026-08-20T10:01:30Z -->
| 항목 | 값 |
|---|---|
| 검증 대상 | 마켓플레이스 배포본 `~/.claude/plugins/cache/tene-ai/tene/0.1.0/` |
| Claude Code | 2.1.237 (workflow 가능: True) |
| Node | 26.0.0 |
| 테스트 러너 | 자동 탐지 실패(F-6) — `node --test` 를 수동 주입 |
| 브라우저 | Chrome MCP (사용하지 않음 — UX AC 없음) |
| 타입체크 | 없음 → L1 insufficient |
| 인덱스 | 심볼 917 / 참조 8853 |
| 시크릿 스캔 | clean (findings 0) |
<!-- tene:auto:end -->

## 3. Test Charter     <!-- tene:sec=charters -->

`tene-qa plan` 이 AC 10건에서 charter 10건을 생성했다. `edgeTotal: 0` — 전이 엣지가 없다는 설계 결론과 일치한다.

**수집·판정·반박 분리를 실제로 적용했다.** 수집은 이 세션이, 판정은 `tene:judge` 8개 인스턴스가 독립적으로 했다. 판정자에게는 Read 도구만 있고 수집자의 결론이 입력에서 제거된다.

**그 분리가 실제로 작동했다.** 판정자들이 수집자(나)의 증거 결함 네 가지를 잡아냈다.

| 판정자 | 잡아낸 것 |
|---|---|
| ac_7 | 대화형·헤드리스 두 증거 파일의 sha256 이 동일 — 복제본이지 독립 관찰이 아님 |
| ac_1 | 증거의 분모가 RTM 27개가 아니라 sprint 문서 요구 29건 — 대상이 다름 |
| ac_2·ac_6·ac_8 | 해당 AC 에 귀속된 아티팩트가 0건인데 정적 심볼 확인으로 DATA 기준을 통과시키려 함 |
| ac_5 | D12 §1.2 종료 코드 표가 0~8 인데 exit 10 관찰 — 내가 "정의된 코드" 라고 판단한 것을 명세로 반박 |

ac_5 의 지적은 내 판단을 뒤집었다. 나는 `lib/util/errors.js` 의 `EXIT` 상수를 보고 INTERNAL 이 정의돼 있다고 했으나, 판정자는 명세(D12)를 봤고 거기에는 없었다.

**반박(refuter) 단계는 실행하지 않았다.** `passed` 판정이 3건(ac_3·ac_9·ac_10)인데 ac_9·ac_10 은 독립 판정을 거치지 않은 수집자 판정이다. 이 둘은 반박 대상 자격이 없으므로 R6 에 한계로 기록한다.


## 4. AC 별 판정     <!-- tene:sec=acverdicts -->

<!-- tene:auto:start block=acverdicts generated=2026-08-20T10:01:30Z -->
| ID | 우선도 | 검증 | 판정 | 증거 | 사유 |
|---|---|---|---|---|---|
| ac_1 | blocking | DATA | `insufficient` | art_loop | 증거의 분모가 RTM 27개가 아니라 sprint 문서 요구 29건이다. 증거 자신이 task_1(27개 대조)을 missing 으로 기록한다 |
| ac_2 | blocking | DATA | `insufficient` | — | ac_2 에 귀속된 아티팩트가 0건. 관찰된 10건이 전부 missing 쪽이고 unverifiable 로 분류된 사례가 없어 '구분해 기록'  |
| ac_3 | blocking | UNIT | `passed` | art_guard | false-negative 0 · false-positive 0 · pass 5 / fail 0, '매트릭스가 비어 있지 않다' 가 공허한 참을 |
| ac_4 | blocking | UNIT | `insufficient` | art_honesty | [정직성] 태그 테스트가 E-4·E-7·E-10·E-12 4종 7건뿐이라 '5종 전부' 가 관찰되지 않았고 computeAcSummary 의 미 |
| ac_5 | blocking | UNIT | `failed` | art_bins | 34행 중 10행이 D12 §1.3 코드 표에 없는 코드를 반환한다. exit 10(INTERNAL)은 D12 §1.2 범위(0~8) 밖이며 § |
| ac_6 | blocking | DATA | `insufficient` | art_gate_skip | 판정 시점에 ac_6 귀속 아티팩트가 0건이었다. 판정 후 관찰 기록을 등록했으므로 다음 회차 재판정 대상 |
| ac_7 | blocking | UNIT | `insufficient` | art_env_h2 | 판정 시점의 두 봉투 파일이 sha256 동일(복제본)이었다. 판정 후 호출 기록을 남긴 헤드리스 재실행을 등록했으므로 다음 회차 재판정 대상 |
| ac_8 | blocking | DATA | `insufficient` | art_gate_rec | 판정 시점에 ac_8 귀속 아티팩트가 0건이었다. 판정 후 상태 파일 게이트 기록을 등록했으므로 다음 회차 재판정 대상 |
| ac_9 | non-blocking | UNIT | `passed` | art_bench | SessionStart 85ms · PostToolUse 104ms · UserPromptSubmit 68ms · 가드 36ms, 러너가 '모든 |
| ac_10 | non-blocking | DATA | `passed` | art_ctx | tokens 69 / 예산 600, truncated false. 독립 판정 없음(수집자 판정) |
<!-- tene:auto:end -->

## 5. UX 흐름 검증     <!-- tene:sec=uxflow -->

<!-- tene:auto:start block=uxflow generated=2026-08-20T10:01:31Z -->
**전이 커버리지: `not-applicable`** — 이 sprint 의 AC 10건은 전부 UNIT·DATA 이며 UX 방식이 없다. design §7 이 전이표를 '해당 없음' 으로 확정했고 분모가 0 이다.

0/0 을 100% 로 표기하지 않는다.

| 되돌아오는 경로 | 결과 | 사유 |
|---|---|---|
| 새로고침 후 복구 | `insufficient` | 측정하지 않았습니다 |
| 중복 제출 방지 | `insufficient` | 측정하지 않았습니다 |
| 실패 후 재시도 | `insufficient` | 측정하지 않았습니다 |
<!-- tene:auto:end -->

## 6. 데이터 처리 흐름 검증     <!-- tene:sec=dataflow -->

DATA 방식 AC 5건(ac_1·ac_2·ac_6·ac_8·ac_10) 중 판정된 것은 ac_10 뿐이다.

관찰한 데이터 경로:

| 경로 | 관찰 | 결과 |
|---|---|---|
| `advance --force` → 상태 파일 `gates` | 임시 프로젝트에서 G0 을 미평가 전이 | `skipped` + `forced: true` 기록, `pass` 집계에서 제외 |
| sprint 진행 → `gates` 누적 | self-conformance 를 draft→qa 로 진행 | G0~G4 `pass`, G5 `skipped/forced`, G6·G7 미기록 |
| `current.json` → SessionStart 주입 | `tene-state summary` | 69 토큰 / 예산 600, `truncated: false` |
| 증거 등록 → 매니페스트 | 아티팩트 11건 | sha256·bytes 기록, 시크릿 스캔 clean |

**교차 판정(정적 × 동적)은 수행하지 못했다.** RTM 감사(1.3)가 그 이유를 밝혔다 — `crossJudgeDataFlow` 는 `lib/qa/coverage.js:128-141` 에 정의돼 있으나 `bin/tene-qa` 가 import 하지 않는다. 호출자는 `test/unit/qa-gate.test.js:179` 뿐이다. 즉 **DATA 교차 판정이 실제 파이프라인에 배선되어 있지 않다.**


## 7. 7-Layer 처리     <!-- tene:sec=layers -->

<!-- tene:auto:start block=layers generated=2026-08-20T10:01:31Z -->
| Layer | 처리 | 사유 |
|---|---|---|
| L1 린터·타입체커 | `insufficient` | 타입체커 없음 |
| L2 테스트 러너 | `measured` | node --test 336/336 · 가드 403 단언 · 정직성 35건 |
| L3 API·데이터 상태 | `partial` | 상태 파일 직접 조회로 게이트 기록 관찰. DB 없음 |
| L4 시스템 경로 | `insufficient` | 브라우저 경로 해당 없음 |
| L5 화면 전이 | `not-applicable` | UX AC 없음 (분모 0) |
| L6 실패·권한·재시도 주입 | `insufficient` | faultInject 없음 |
| L7 기존 테스트 재실행 | `measured` | 전체 스위트 336/336 재실행 |
<!-- tene:auto:end -->

## 8. 미측정 항목     <!-- tene:sec=insufficient -->

**6건이 `insufficient` 다. 하나도 통과로 올리지 않았다.**

| AC | 왜 측정하지 못했나 | 책임 소재 |
|---|---|---|
| ac_1 | RTM 27개 전수 대조를 `tene-loop check` 로 대신하려 했으나 그 도구의 분모는 sprint 문서 요구 29건이다. 대상이 다르다 | 수집 설계 오류 |
| ac_2 | `missing` 과 `unverifiable` 이 **동시에** 나오는 관찰이 없었다. 10건 전부 `missing` 쪽으로만 분류돼 "구분한다" 를 확인할 수 없다 | 관찰 조건 부족 |
| ac_4 | 로그의 `[정직성]` 태그가 4종 7건뿐. E-2 는 `agent-contract.test.js` 에 있으나 태그가 없어 "5종 전부" 가 로그로 증명되지 않는다 | 증거 형식 |
| ac_6 | 판정 시점에 귀속 아티팩트 0건. 관찰은 했으나 등록하지 않았다 | 수집 누락 (판정 후 등록 완료) |
| ac_7 | 두 봉투 파일이 동일 sha256 이었다. 헤드리스 호출 기록이 없었다 | 수집 오염 (판정 후 재실행·등록 완료) |
| ac_8 | 판정 시점에 귀속 아티팩트 0건 | 수집 누락 (판정 후 등록 완료) |

**중요한 구분** — 이 6건은 "tene 이 그 기능을 못 한다" 가 아니다. **내가 그것을 증명할 증거를 제대로 모으지 못했다** 는 뜻이다. ac_6·ac_7·ac_8 은 판정 후 증거를 갖췄으므로 다음 회차에서 재판정하면 결론이 달라질 수 있다.

반대로 **ac_5 의 `failed` 는 구현 측 문제**다. 증거 부족이 아니라 관찰된 동작이 명세와 어긋난다.

측정하지 못한 레이어: L1(타입체커 없음) · L4·L6(브라우저 시나리오 해당 없음) · 되돌아오는 경로 3종(측정하지 않음).


## 9. 후속 조치     <!-- tene:sec=followup -->

**G6 는 `fail` 이다.** blocking AC 중 `failed` 1건(ac_5)이 있다. 우회하지 않는다.

QA 실패의 원인은 하나가 아니므로 복귀 지점도 하나가 아니다.

| 원인 | 해당 | 복귀 |
|---|---|---|
| 구현 결함 | ac_5 — bin 오류 코드가 D12 표 밖 | `do` |
| 증거·추적 부족 | ac_1·ac_2·ac_4 | `loop-check` |
| 수집 누락 (증거 확보 완료) | ac_6·ac_7·ac_8 | `qa` 재실행 |

이 sprint 는 **판정까지**가 범위이므로(PRD §3) 여기서 복귀하지 않고 report 로 간다. 위 표는 다음 sprint 의 입력이다.

발견한 tene 자체 결함 9건은 loop-check §6 과 보고서 R6 에 이월 항목으로 싣는다.


## +@ (자유 관점)
