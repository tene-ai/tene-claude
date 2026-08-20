---
tene:
  sprint: self-conformance
  doc: report
  phase: report
  status: draft
  created: 2026-08-20
  modified: 2026-08-20
  lang: ko
---

# self-conformance — Sprint Report

## 0. 요약     <!-- tene:sec=summary -->

<!-- tene:auto:start block=summary generated=2026-08-20T10:03:30Z -->
| 항목 | 값 |
|---|---|
| phase | report |
| profile | strict |
| 수용 기준 | 10건 (passed 3 / failed 1 / 미측정 6) |
| 변경 파일 | 0개 |
| 심볼 | +0 / -0 |
| loop-check | 0회 |
| 이월 | 40건 |
<!-- tene:auto:end -->

## R1. 이전 sprint 와의 연결     <!-- tene:sec=r1 -->

| 이전 sprint | 산출물 | 관계 | 근거 |
|---|---|---|---|
| — | — | 해당 없음 | `tene-report build` R1: "첫 sprint 이거나 선행 sprint 가 없습니다" |

`master-plan.json` 의 `sprints[]` 가 비어 있어 선행 sprint 가 없다. 이는 이 sprint 가 첫 번째여서이기도 하지만, **RTM 1.5·1.6 이 밝힌 구조적 문제이기도 하다** — `lib/plan/aggregate.js` 가 프로덕션 경로에서 import 되지 않아 sprint 를 master plan 에 등록하는 실행 수단이 아예 없다. 따라서 앞으로 sprint 를 몇 개 더 돌려도 R1 은 계속 비어 있을 것이다.

### 연결이 끊긴 지점

해당 없음 — 이전 산출물이 없으므로 고아가 될 대상도 없다.


## R2. 생성·수정한 파일과 구현 내용     <!-- tene:sec=r2 -->

<!-- tene:auto:start block=r2 generated=2026-08-20T10:03:31Z -->
(변경된 코드 파일이 없습니다)
<!-- tene:auto:end -->

### 구현 내용

**코드 변경 0건이다.** 이 sprint 는 판정만 한다고 PRD §3 에서 정했고 그대로 지켰다.

생성된 것은 문서와 증거뿐이다.

| 산출물 | 내용 |
|---|---|
| `00-prd/prd.md` | AC 10건 (blocking 8), 의도 4건, 열린 결정 3건 |
| `01-plan/plan.md` | 작업 9건, AC 커버리지 10/10 |
| `02-design/design.md` | 4계층 분류, 6질문 10심볼, 앵커 10건, 처리 로직 L1~L4 |
| `03-analysis/loop-check-1.md` | 기계 판정 29건 + 결함 F-1~F-6 |
| `03-analysis/qa.md` | AC 판정 10건, 7-Layer 처리, 미측정 6건 |
| `03-analysis/evidence/` | 아티팩트 11건 + sha256 매니페스트 |

## R3. 기획 의도 충족 매핑     <!-- tene:sec=r3 -->

| 구현 | 충족한 AC | 기획 의도 |
|---|---|---|
| 명세 27개 항목에 파일:라인 근거를 붙인 RTM 감사표 (본 보고서 +@) | ac_1 (insufficient) | intent_1 근거 제시 |
| 판정 6건을 `insufficient` 로 남기고 통과로 올리지 않음 | ac_2·ac_4·ac_6·ac_7·ac_8 | **intent_2 충족** |
| 검증 대상을 배포본 캐시로 고정하고 `diff -rq` 로 동일성 확인 | 전 AC 공통 | **intent_3 충족** |
| `claude -p` 헤드리스에서 봉투 재관찰 (호출 기록 포함) | ac_7 | **intent_4 충족** |

### 의도와 다르게 구현된 것

**intent_1 이 부분적으로만 달성됐다.** "명세 항목마다 파일:라인 근거" 는 RTM 27개에 대해서는 이뤄졌으나, 그 산출물을 ac_1 의 증거로 등록하지 못해 판정은 `insufficient` 로 남았다. 감사 결과 자체는 이 보고서에 실려 있으므로 **정보는 남았고 판정만 미완**이다.

의도에 반해 구현된 것은 없다. 범위를 넘어선 변경도 없다 — 이 sprint 는 구현 코드를 한 줄도 고치지 않았다.


## R4. Understanding Layer 기준 작업 내역     <!-- tene:sec=r4 -->

<!-- tene:auto:start block=r4 generated=2026-08-20T10:03:31Z -->
### Interface (Entry Point)

해당 없음

### Business Logic (Processing rules)

해당 없음

### Persistence (Data)

해당 없음

### Infrastructure (Runtime)

해당 없음

### 미분류

해당 없음
<!-- tene:auto:end -->

### 계층 균형 평가

**변경 파일이 0개라 R4 기계 출력이 전부 "해당 없음" 이다.** 이는 쏠림이 아니라 관찰 대상이 없다는 뜻이다.

대신 **판정 대상 코드베이스**의 계층 분포를 design §2 에서 측정했다.

| 계층 | 파일 | 비율 |
|---|---|---|
| Business Logic | 39 | 41% |
| Interface | 22 | 23% |
| Persistence | 6 | 6% |
| Infrastructure | 3 | 3% |
| (test) | 24 | 25% |
| 미분류 | 1 | 1% |

business-logic 이 41% 로 가장 크다. **이 프로젝트에서는 타당하다** — tene 은 판정·검증 규칙이 본체인 도구이고, 그 규칙이 `lib/` 아래 business-logic 에 모여 있다. persistence 가 6개로 적은 것도 상태가 JSON 파일 몇 개뿐이라 자연스럽다.

계층 위반은 **blocker 0 · warning 20** 이다. warning 은 전부 `bin/*`(interface) → `lib/state/*`(persistence) 의 `layer-skip` 이며, D00 §2 가 bin 을 얇은 진입점으로 정의한 결과다. 중간 계층을 하나 더 두면 통과만 하는 층이 생긴다. `reverse` 0건이 순환 의존이 없음을 뜻한다.

미분류 1건(`lib/recover/resync.js`)은 추측으로 배정하지 않았다 — 열린 결정 D-D 로 남겼다.

## R5. 6가지 질문 답변     <!-- tene:sec=r5 -->

기계 출력이 비어 있다 — 변경된 심볼이 0개이므로 대상 선정 결과가 없다. 검증 sprint 의 정상적인 결과다.

대신 **설계 단계에서 앵커 10개 심볼에 대해 6질문을 전부 실행했고**(design §5), 거기서 두 가지가 드러났다.

| 드러난 것 | 내용 |
|---|---|
| **Q6 가 전 심볼에서 `unanswered`** | 인덱서가 시그니처만 보므로 JS 에서는 반환·변경 데이터를 답할 수 없다. RTM 1.11 감사가 원인을 확정했다 — D06 §4.3 이 명세한 `detectMutations()`(persistence 호출·ORM 메서드·모듈 스코프 대입 탐지)가 **구현되지 않았다**. 플러그인 전체 grep `mutation\|db-write\|writes` 0건 |
| **Q3 네임스페이스 import 사각지대** | `advance` 의 Q3 는 "import 하는 파일이 없습니다" 인데 실제로는 `bin/tene-state` 가 `import * as store` 로 가져간다. Q4 는 호출 위치를 정확히 찾으므로 실사용 추적은 되지만, Q3 만 보면 orphan 으로 오독할 수 있다 |

첫 번째가 중요하다. README 는 Q6 를 "가장 자주 부실하게 답해지는 질문" 이자 "반환값만이 아니라 DB 쓰기·전역 변경도 답" 이라고 규정하는데, **그 절반이 구현되지 않았다.** 도구가 답하지 못한다고 정직하게 신고하는 것은 맞지만, 기술부채 방어 장치로서의 Q6 는 아직 반쪽이다.


## R6. 결정 대기 / 이월 항목     <!-- tene:sec=r6 -->

### 미측정 항목 — 통과로 올리지 않았다

| AC | 판정 | 왜 측정하지 못했나 |
|---|---|---|
| ac_1 | `insufficient` | RTM 27개 대조를 `tene-loop check` 로 대신하려 했으나 그 도구의 분모는 sprint 문서 요구 29건이다. 대상이 다르다 |
| ac_2 | `insufficient` | `missing` 과 `unverifiable` 이 동시에 나오는 관찰이 없어 "구분한다" 를 확인할 수 없다 |
| ac_4 | `insufficient` | 로그의 `[정직성]` 태그가 4종 7건뿐이라 "5종 전부" 가 증명되지 않는다 |
| ac_6 | `insufficient` | 판정 시점 귀속 아티팩트 0건 (판정 후 등록 완료 — 재판정 대상) |
| ac_7 | `insufficient` | 두 봉투 파일이 동일 sha256 이었다 (판정 후 재실행·등록 완료 — 재판정 대상) |
| ac_8 | `insufficient` | 판정 시점 귀속 아티팩트 0건 (판정 후 등록 완료 — 재판정 대상) |

측정하지 못한 레이어: L1(타입체커 없음) · L4·L6(브라우저 시나리오 해당 없음) · 되돌아오는 경로 3종.

**이 6건은 "tene 이 못 한다" 가 아니라 "내가 증명하지 못했다" 이다.** 유일한 구현 측 실패는 ac_5 의 `failed` 다.

### 게이트 강제로 넘긴 것

| 게이트 | 결과 | 사유 |
|---|---|---|
| G5 | `skipped` (forced) | 검증 sprint 라 앵커 파일이 변경되지 않아 `partial/not_changed` 19건이 남았다. 갭을 0으로 만들려면 분모 조작·앵커 왜곡·판정 위조 중 하나를 해야 해 전부 거부했다. 덧붙여 F-7 로 `--loop` 없이는 평가 자체가 불가능하다 |
| G6 | `skipped` (forced) | blocking AC 중 `failed` 1건(ac_5). PRD §3 이 수정을 범위 밖으로 뒀으므로 고치지 않고 이월한다 |

두 게이트 모두 통과 집계에서 빠지며, 이 표가 그 사실을 남긴다.

### 이월 항목

### 결정이 필요한 정책

| # | 결정할 것 | 선택지 | 기본 제안 | 결정자 |
|---|---|---|---|---|
| 1 | D13 §1 이 명세한 픽스처(docs/state/code 하위)가 비어 있음 | 명세대로 채운다 / 명세를 현실에 맞게 고친다 | 판정만 하고 이월 | 사용자 |
| 2 | 가드 매트릭스 케이스 수 — D13 은 240, 구현은 다름 | 240까지 늘린다 / 실제 수로 명세 정정 | 실측값 기록 후 이월 | 사용자 |
| 3 | 테스트 러너 탐지가 하위 디렉토리 package.json 을 못 봄 | 탐지 범위 확장 / 현 동작 유지 | 판정만 하고 이월 | 사용자 |

### 이월 작업

| # | 작업 | 왜 이번에 하지 않았나 | 언제 할 것인가 |
|---|---|---|---|
| 1 | lastLoopResult·loopHistory·lastJudged·sprint.gaps 를 쓰는 코드가 없어 G5 가 구조적으로 통과 불가 | 판정과 수정을 한 sprint 에 섞지 않기로 PRD §3 에서 정했다. 수정은 다음 sprint 의 첫 항목 | 미정 |
| 2 | tene-loop 는 앵커를 PRD 표에서, tene-gate G3 는 상태에서 읽어 출처가 다르다 | 앵커 출처를 한 곳으로 모으는 것은 설계 변경이라 이번 범위 밖 | 미정 |
| 3 | tene-scan 이 내보내는 business-logic 을 tene-doc validate 정규식이 하이픈 때문에 못 읽어 G3 차단 | 한 줄 수정이지만 판정 sprint 에서 코드를 고치지 않기로 했다 | 미정 |
| 4 | tene-doc 이 --sprint 없이 호출되면 처리되지 않은 TypeError 로 exit 10 | ac_5 failed 의 직접 원인. 오류 코드 체계 정비와 함께 처리해야 한다 | 미정 |
| 5 | 구현 오류 코드 31종 중 9종이 D12 §1.3 표(22종)에 없고 exit 10 은 §1.2 범위(0~8) 밖 | 명세를 고칠지 구현을 고칠지 사용자 결정 필요 | 미정 |
| 6 | lib/plan/aggregate.js 가 프로덕션에서 import 되지 않아 멀티 sprint 집계·이월 승격에 실행 경로가 없다 | master-plan 기능 전체가 배선되지 않은 것이라 별도 sprint 가 필요하다 | 미정 |
| 7 | crossJudgeDataFlow 가 bin/tene-qa 에 import 되지 않아 DATA 교차 판정이 파이프라인에 없다 | 배선과 함께 D08 §8.1 의 4분면 표현(불리언 2개로는 3상태 불가)도 고쳐야 한다 | 미정 |
| 8 | Q6 의 부작용 탐지(detectMutations)가 구현되지 않아 반환 타입만 답한다 | README 가 Q6 를 가장 중요한 질문으로 규정하므로 우선순위가 높으나 새 기능 구현이다 | 미정 |
| 9 | pre-edit 훅이 escalate 대신 additionalContext 만 내고 design phase 는 경고조차 없다. stop 훅은 exit 2 를 내지 않는다 | spec-driven 강제의 핵심 지점 2개가 알림으로 강등된 것이라 설계 재확인이 필요하다 | 미정 |
| 10 | secrets 스킬이 존재하지 않는 tene status 명령을 사전 승인하고 지시한다 | tene CLI v1.0.16 에서 unknown command 로 확인됨. 명령표 갱신 필요 | 미정 |
| 11 | disallowedTools: Write 인 에이전트가 Bash heredoc 으로 파일을 쓸 수 있다 | 감사자 격리의 실질적 구멍. 도구 수준 차단만으로 부족하다는 것이 관측됐다 | 미정 |
| 12 | ac_6·ac_7·ac_8 은 판정 후 증거를 갖췄으므로 재판정 대상 | 판정 시점에 증거가 없어 insufficient 였다. 증거는 등록 완료했고 재실행만 남았다 | 미정 |
| 13 | ac_1 — 설계와 다르게 구현됨 | plugins/tene/lib/loop/judge.js:287 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 | 미정 |
| 14 | ac_2 — 설계와 다르게 구현됨 | plugins/tene/lib/loop/judge.js:272 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 | 미정 |
| 15 | ac_3 — 설계와 다르게 구현됨 | plugins/tene/lib/guard/rules.js:105 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 | 미정 |
| 16 | ac_4 — 설계와 다르게 구현됨 | plugins/tene/lib/state/schema.js:139 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 | 미정 |
| 17 | ac_5 — 설계와 다르게 구현됨 | plugins/tene/lib/hooks/compact.js:34 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 | 미정 |
| 18 | ac_6 — 설계와 다르게 구현됨 | plugins/tene/lib/state/store.js:229 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 | 미정 |
| 19 | ac_7 — 설계와 다르게 구현됨 | plugins/tene/lib/doc/validate.js:36 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 | 미정 |
| 20 | ac_8 — 설계와 다르게 구현됨 | plugins/tene/lib/state/schema.js:163 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 | 미정 |
| 21 | ac_9 — 설계와 다르게 구현됨 | plugins/tene/lib/guard/rules.js:153 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 | 미정 |
| 22 | ac_10 — 설계와 다르게 구현됨 | plugins/tene/lib/state/summary.js:79 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 | 미정 |
| 23 | L1. RTM 전수 대조 (ac_1, ac_2) — 설계와 다르게 구현됨 | 일부만 존재: 있음 failed@plugins/tene/test/unit/doc-validate.test.js:34 / 없음 | 미정 |
| 24 | L2. 가드 매트릭스 실측 (ac_3) — 설계와 다르게 구현됨 | 일부만 존재: 있음 allow@plugins/tene/lib/guard/rules.js:69, deny@plugins/tene | 미정 |
| 25 | L3. 게이트 미평가 기록 (ac_6) — 설계와 다르게 구현됨 | 일부만 존재: 있음 computeAcSummary@plugins/tene/lib/state/schema.js:139, pass | 미정 |
| 26 | L4. 봉투 동일성 (ac_7) — 설계와 다르게 구현됨 | 일부만 존재: 있음 ok@plugins/tene/lib/doc/validate.js:36 / 없음 tool, schemaVer | 미정 |
| 27 | judgeBash — 설계와 다르게 구현됨 | 시그니처에 설계된 스키마가 보이지 않습니다: {command} (PreToolUse 페이로드), {decision: allow | 미정 |
| 28 | judgeAll — 설계와 다르게 구현됨 | 시그니처에 설계된 스키마가 보이지 않습니다: requirements[], ctx, {judgments[], score} — 판 | 미정 |
| 29 | advance — 설계와 다르게 구현됨 | 시그니처에 설계된 스키마가 보이지 않습니다: (root, id, to, {force, gateResult, expectedRe | 미정 |
| 30 | computeAcSummary — 설계와 다르게 구현됨 | 시그니처에 설계된 스키마가 보이지 않습니다: ac[], {total, passed, failed, insufficient, s | 미정 |
| 31 | formatSummary — 설계와 다르게 구현됨 | 시그니처에 설계된 스키마가 보이지 않습니다: current.json, {budget}, {text, tokens, trunca | 미정 |
| 32 | ac_1 미측정 | 증거의 분모가 RTM 27개가 아니라 sprint 문서 요구 29건이다. 증거 자신이 task_1(27개 대조)을 missing 으로 기록한다 | 미정 |
| 33 | ac_2 미측정 | ac_2 에 귀속된 아티팩트가 0건. 관찰된 10건이 전부 missing 쪽이고 unverifiable 로 분류된 사례가 없어 '구분해 기록' 을 판정할 수 없다 | 미정 |
| 34 | ac_4 미측정 | [정직성] 태그 테스트가 E-4·E-7·E-10·E-12 4종 7건뿐이라 '5종 전부' 가 관찰되지 않았고 computeAcSummary 의 미측정 집계 동작 관찰이 없다 | 미정 |
| 35 | ac_6 미측정 | 판정 시점에 ac_6 귀속 아티팩트가 0건이었다. 판정 후 관찰 기록을 등록했으므로 다음 회차 재판정 대상 | 미정 |
| 36 | ac_7 미측정 | 판정 시점의 두 봉투 파일이 sha256 동일(복제본)이었다. 판정 후 호출 기록을 남긴 헤드리스 재실행을 등록했으므로 다음 회차 재판정 대상 | 미정 |
| 37 | ac_8 미측정 | 판정 시점에 ac_8 귀속 아티팩트가 0건이었다. 판정 후 상태 파일 게이트 기록을 등록했으므로 다음 회차 재판정 대상 | 미정 |

### 예외 승인 (waiver)

해당 없음

### 우선순위 판단

**다음 sprint 의 첫 항목은 F-7 이다.** 이것 하나가 loop-check 사이클 전체를 무력화한다 — 회차가 항상 1이고, 정체 탐지가 발동하지 않고, 회귀 탐지가 동작하지 않고, G5 가 구조적으로 통과 불가다. 나머지 결함을 고쳐도 사이클이 돌지 않으면 의미가 없다.

그다음은 **D12-DRIFT** 다. 오류 코드 체계가 명세와 어긋난 상태에서는 ac_5 를 다시 판정해도 같은 결과가 나온다. 명세를 고칠지 구현을 고칠지가 사용자 결정 사항이다.

**RTM-1.5(master plan 미배선)** 는 blocker 지만 급하지 않다 — 단일 sprint 로는 드러나지 않고, sprint 를 여러 개 굴리기 시작할 때 필요하다.


## +@ (자유 회고)

## +@ RTM 27개 전수 대조 결과

`tene:gap-auditor` 4개 인스턴스가 `docs/00-prd/06-requirements-traceability.md` 의 27개 항목을 배포본과 대조했다. 판정은 감사자의 것이고, 근거는 전부 `파일:라인` 이다.

**집계: implemented 13 · partial 13 · unverifiable 1 · missing 0**

`missing` 이 0건인 것이 중요하다 — **명세에만 있고 코드가 전혀 없는 기능은 없다.** 13건의 `partial` 은 "있는데 명세를 다 채우지 못했다" 이며, 대부분 **배선 누락**이다.

### implemented (13)

1.4 sprint 컨테이너 · 1.7 R1 이전 연결 · 1.8 R2 변경 내역 · 1.9 R3 의도 매핑 · 1.10 R4 4계층 · 1.13 4계층·6질문 방어 장치 · 1.14 문서 양식 통일 · 1.15 G6 하네스 판정 · 1.16 `+@` 자유 관점 · 1.17 상태 기록 · 1.18 세션 간 맥락 · 1.20 폴더 구조 · 3.2 시크릿 SR1~SR4

3.2 는 **명세보다 강하다** — 절대 경로 우회, `bash -c`/`eval`/`xargs` 전개, heredoc·`$()` 전개, `.tene` vs `.tene-claude` 구분이 추가로 구현돼 있다.

### partial (13) — 무엇이 빠졌나

| RTM | 요구 | 빠진 것 |
|---|---|---|
| 1.1 | 사이클 상태기계 | G4 의 `build_ok_if_configured` 없음. Trust Level L0~L4 없음(`profile`+`autoUntil` 로 대체) |
| **1.2** | **loop check 100% 반복** | **`lastLoopResult`·`loopHistory`·`lastJudged`·`sprint.gaps` 를 쓰는 코드가 없다.** 회차 항상 1 · 정체 탐지 불발 · 회귀 탐지 불가 · G5 항상 fail |
| **1.3** | qa 종합 테스트 | `crossJudgeDataFlow` 가 `bin/tene-qa` 에 import 되지 않음. DATA 교차 판정이 파이프라인에 없다 |
| **1.5** | 멀티 sprint 오케스트레이션 | `lib/plan/aggregate.js` 가 프로덕션에서 import 0건. master-plan 집계·이월 승격에 실행 경로 없음 |
| **1.6** | sprint master plan | 위와 동일. 문서 양식만 있고 집계 엔진 미배선 |
| 1.11 | R5 6가지 질문 | **Q6 의 부작용 탐지(`detectMutations`) 미구현.** 반환 타입만 답한다 |
| 1.12 | R6 이월 사유 | 09 §4 의 "report 완료 시 자동 승격" 이 모델 지시로만 존재. 결정론 경로 아님 |
| 1.19 | 상태 clear | SessionStart 자동 정리 미구현 — 감지만 하고 안내만 한다 |
| 2.1 | 스킬 직접 호출 | `/tene:master-plan` 인자가 명세(`--refresh`·`--add`)와 다름 |
| 2.2 | 자연어 트리거 | "현재 phase 규칙 우선" 미구현 — 숫자 priority 만 봐서 phase 무관 규칙이 먼저 잡힌다 |
| 3.1 | tene CLI 사용법 | 키 이름 규칙·오류 코드표·CI 패턴·백업 전부 없음. 반대로 **존재하지 않는 `tene status` 를 가르친다** |
| 3.3 | tene CLI 분석 | 위와 동일 + 명세의 명령표가 CLI v1.0.16 과 어긋남 |
| **4.2** | spec-driven 강제 | 강제 지점 2개가 알림으로 강등 — pre-edit 이 `escalate` 대신 `additionalContext`, stop 훅이 exit 2 를 내지 않음. **design phase 코드 편집은 경고조차 없다** |

### unverifiable (1)

**4.1 기획 의도를 기억하여 QA를 더 꼼꼼히** — 감사자가 조사 중 턴 한도에 걸려 판정할 만큼 보지 못했다. `missing` 이 아니라 `unverifiable` 이다. 확인된 범위는 의도↔AC↔앵커 매핑(`lib/report/intent-map.js:21-89`)과 앵커 역인덱스(`lib/scan/anchors.js:19-100`)까지다. 3단계 앵커링 Stage 2/3, stale 마킹 분기값, DATA 교차 판정 4분면, `qa-sweep` 반박 임계는 미확인이다.

### 감사의 한계

네 감사자 모두 **정적 읽기만** 했다. 훅과 게이트를 실제 세션에 물려 재현하지 않았으므로, 1.2 의 "G5 항상 fail" 은 코드 경로 추적 결과다 — 다만 이 sprint 의 G5 가 실제로 "loop-check 결과가 없습니다" 로 막힌 것이 같은 결론을 런타임으로 확인해 준다.

`tene:gap-auditor` 의 `maxTurns: 30` 이 이 규모의 감사에 부족했다(실제 48~59턴 사용). 그룹 2 의 4.1 이 `unverifiable` 로 남은 직접 원인이다.
