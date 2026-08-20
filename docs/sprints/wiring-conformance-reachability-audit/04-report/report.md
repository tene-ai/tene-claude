---
tene:
  sprint: wiring-conformance
  doc: report
  phase: report
  status: draft
  created: 2026-08-20
  modified: 2026-08-20
  lang: ko
---

# wiring-conformance — Sprint Report

## 0. 요약     <!-- tene:sec=summary -->

<!-- tene:auto:start block=summary generated=2026-08-20T12:37:16Z -->
| 항목 | 값 |
|---|---|
| phase | report |
| profile | strict |
| 수용 기준 | 10건 (passed 1 / failed 4 / 미측정 5) |
| 변경 파일 | 1개 |
| 심볼 | +27 / -0 |
| loop-check | 0회 |
| 이월 | 32건 |
<!-- tene:auto:end -->

## R1. 이전 sprint 와의 연결     <!-- tene:sec=r1 -->

| 이전 sprint | 산출물 | 관계 | 근거 |
|---|---|---|---|
| self-conformance | RTM 27개 판정 (implemented 13 / partial 13 / unverifiable 1) | **재감사로 대체** | `tene:conformance-audit` 워크플로가 23건을 재판정: implemented 3 / partial 20 |
| self-conformance | 이월 12건 (F-1~F-9, D12 표류 등) | **전부 유효** | 이번 회차가 F-7·F-1·F-3 을 독립 재확인 |
| self-conformance | `insufficient` 6건 | **원인이 갱신됨** | 당시 "내 증거 수집 실패" 로 결론냈으나 절반은 `judgeInput` 이 `ac` 필드를 안 읽는 도구 결함(W-5)이었다 |

**기계 R1 은 비어 있다** — `master-plan.json` 의 `sprints[]` 가 여전히 빈 배열이기 때문이다. RTM 1.5·1.6 이 지적한 그대로다. sprint 를 두 번 돌렸는데도 master plan 에 등록되지 않았다. 이것이 R1 이 구조적으로 동작하지 않는다는 실측 증거다.

### 연결이 끊긴 지점

해당 없음 — 이전 sprint 의 산출물은 문서뿐이고 이번 변경이 그것을 고아로 만들지 않았다.


## R2. 생성·수정한 파일과 구현 내용     <!-- tene:sec=r2 -->

<!-- tene:auto:start block=r2 generated=2026-08-20T12:37:17Z -->
| 파일 | 변경 | 계층 | 심볼 |
|---|---|---|---|
| `evals/reachability.mjs` | 신규 +0/-0 | unclassified | walk (added), isCode (added), key (added), STATIC_IMPORT (added), DYNAMIC_IMPORT (added), EXPORT_DECL (added), readOr (added), exportsOf (added), NAMED_IMPORT (added), NS_IMPORT (added), symbolUsesOf (added), edgesOf (added), entrypoints (added), reach (added), classifyTree (added), syntheticCheck (added), root (added), asJson (added), classified (added), paths (added), EXPECT (added), knownChecks (added), synthetic (added), SYMBOL_EXPECT (added), symbolChecks (added), trustworthy (added), result (added) |
<!-- tene:auto:end -->

### 구현 내용

**플러그인 코드 변경 0건.** 변경한 것은 계측기 `evals/reachability.mjs`(export 27개) 하나이며 플러그인 밖의 독립 스크립트다.

| 산출물 | 내용 |
|---|---|
| `evals/reachability.mjs` | 진입점 BFS + named/네임스페이스/동적 멤버 접근 파싱. 심볼 단위 4분류. 자체검사 12종(알려진 정답 3 · 합성 4분기 · 심볼 4분기 5) |
| `00-prd`·`01-plan`·`02-design` | AC 10건, 작업 10건, 앵커 10건 |
| `03-analysis/loop-check-1.md` | 기계 판정 29건 + 미귀속 1건 해소 |
| `03-analysis/qa.md` | 워크플로 판정 10건 |
| `03-analysis/evidence/` | 아티팩트 20+건 (워크플로 산출물 2건 포함) |

## R3. 기획 의도 충족 매핑     <!-- tene:sec=r3 -->

| 구현 | 충족한 AC | 기획 의도 |
|---|---|---|
| 도달성 계측기 — export 408건 4분류 | ac_1 (failed·강등) | intent_1 존재가 아닌 도달로 판정 |
| 빈 프로젝트 `claude -p` 실행 + 상태 파일 원본 대조 | ac_3 (failed·강등) | intent_2 정적 판독이 아닌 실행 확인 · intent_4 헤드리스 |
| 음성 대조군 포함 stale 전환 5케이스 | ac_5 (**passed**) | intent_2 |
| 판정 전 증거 귀속 + case 등록 | 전 AC | intent_3 |
| **Dynamic Workflow 사용** | — | 사용자 지적으로 교정 |

### 의도와 다르게 구현된 것

**intent_2(실행으로 확인) 는 달성됐으나 판정으로 이어지지 않았다.** 워크플로 수집자들이 실제로 실행했고(빈 프로젝트 CLI 재현, 중복 레코드 프로브, 음성 대조군) 그 관찰이 판정자에게 전달됐는데, 반박 단계에서 증거 충분성으로 강등됐다. 관찰 자체가 부족한 것이 아니라 **강등 규칙이 미측정과 위반을 구분하지 못한다**(W-6).

**intent_1 은 계측기 정확도가 아니라 강등 규칙 때문에 failed 다.** ac_1 판정자는 "DATA 증거가 기준을 직접 충족한다" 로 시작해 불변식 재집계·결정성 2회 대조·중복 프로브까지 인용했다.

의도에 반해 구현된 것은 없다. 이 sprint 는 플러그인 코드를 한 줄도 고치지 않았다.


## R4. Understanding Layer 기준 작업 내역     <!-- tene:sec=r4 -->

<!-- tene:auto:start block=r4 generated=2026-08-20T12:37:17Z -->
### Interface (Entry Point)

해당 없음

### Business Logic (Processing rules)

해당 없음

### Persistence (Data)

해당 없음

### Infrastructure (Runtime)

해당 없음

### 미분류

계층 규칙에 걸리지 않은 파일입니다. 추측으로 배정하지 않았습니다.

- `evals/reachability.mjs`
<!-- tene:auto:end -->

### 계층 균형 평가

변경 파일이 계측기 1개뿐이라 R4 기계 출력이 거의 비어 있다. 쏠림이 아니라 관찰 대상이 없다.

**판정 대상 코드베이스**의 분포는 직전 sprint 와 같다 — Business Logic 39 · Interface 22 · Persistence 6 · Infrastructure 3 · test 24 · 미분류 1. 위반은 blocker 0 · warning 20(전부 `bin/*` → `lib/state/*` 의 `layer-skip`, 의도된 구조).

**이번에 추가된 축은 도달성이다.**

| 분류 | export | 뜻 |
|---|---|---|
| reachable | 211 | 진입점에서 심볼까지 도달 |
| dynamic | 12 | 동적 디스패치 (과대근사, `approximated` 표시) |
| **test-only** | **61** | 테스트만 부름 — `lib/plan/aggregate.js` 전체 |
| **unreachable** | **124** | 외부에서 import·접근 없음 |

`unreachable 124` 는 죽은 코드 확정이 아니라 **상위집합**이다. 진짜 미배선(`isAutoBlock`, `patchBlocks`, 중복 `extractRequirements`)과 과다 export(`SECTIONS`, `templatePath`)가 섞여 있다.

## R5. 6가지 질문 답변     <!-- tene:sec=r5 -->

기계 출력은 비어 있다 — 변경 심볼이 계측기(`evals/reachability.mjs`) 하나뿐이라 대상 선정 결과가 없다.

**대신 이번 sprint 가 6질문 자체를 검증했고 두 가지가 드러났다.**

| 드러난 것 | 근거 |
|---|---|
| **Q3 가 참조를 놓친다** | `tene-scan questions --symbol isAutoBlock` 의 q3 는 "import 하는 파일이 없습니다" 인데 `bin/tene-doc:16` 이 `{ DOC_PATH, DOC_TYPES, requiredSections }` 를 named import 한다. 네임스페이스 import 뿐 아니라 평범한 named import 도 놓친다 |
| **Q6 가 절반만 답한다** | RTM 1.11 재감사에서 `detectMutations()` 미구현 확정. 시그니처의 반환 타입만 답하고 DB 쓰기·전역 변경을 못 본다 |

**그리고 6질문에 없는 축이 배선 누락을 만든다.** 6질문은 존재(Q1·Q2)와 참조(Q3·Q4)를 묻고 **도달**을 묻지 않는다. 배선 안 된 `aggregate` 가 Q1~Q4 전부 `high confidence` 로 답한다. 이번 계측기가 그 빈칸을 외부에서 메웠고, export 408건 중 `test-only 61` · `unreachable 124` 를 찾았다.


## R6. 결정 대기 / 이월 항목     <!-- tene:sec=r6 -->

### 이번 회차의 방법 변경

**Dynamic Workflow 를 썼다.** 직전까지 개별 에이전트를 하나씩 띄운 것이 잘못이었다 — qa 스킬은 AC 8건 초과 시 `qa-sweep`, loop-check 스킬은 요구 15건 초과 시 `conformance-audit` 으로 팬아웃하라고 지시하는데 둘 다 해당인데도 따르지 않았다.

| | 수동 (직전 회차) | 워크플로 (이번) |
|---|---|---|
| RTM 감사 | implemented 13 / partial 13 | **implemented 3 / partial 20 · 오탐 0** |
| AC 판정 | passed 7 / failed 1 / insufficient 3 | passed 1 / failed 4 / insufficient 5 |
| 에이전트 | 산발적 | 79개 (47 + 32) |
| 소요 | 여러 턴에 걸쳐 중단 | 21분 + 25분, 각 1회 |

**워크플로가 훨씬 나쁜 결과를 냈고 그게 더 정확하다.** 갭 검증 단계에서 오탐 0건이 나온 것이 그 근거다.

### 미측정 항목 — 통과로 올리지 않았다

| AC | 판정 | 사유 |
|---|---|---|
| ac_2·ac_4·ac_6·ac_7·ac_9 | `insufficient` | 워크플로 수집 단계가 빈 결과. 판정자들이 "코드 정적 확인으로 통과를 추정하지 않았다" 로 거부 |

원인은 워크플로 에이전트 8건의 빈 결과(`agents_empty_result: 8`)와 스키마 호출 실패 3건이다. `conformance-audit` 도 27건 중 4건이 스키마 실패로 미판정이라 **23건만 셌다.**

### 강등된 판정 — 규칙의 결함

`ac_1`·`ac_3`·`ac_8` 은 판정자가 `passed` 를 냈고 반박 2/3 이상으로 `failed` 가 됐다. 반박 사유는 **전부 증거 충분성**이며 위반을 증명한 것이 아니다.

qa 스킬의 "2/3 이상 반박 성공 → `failed` 로 강등" 규칙이 **"모른다" 를 "위반했다" 로 바꾼다.** PP3(미측정을 통과로 뭉개지 않는다)과 ADR-12(`insufficient` 를 1급 판정으로)를 정확히 반대로 어긴다. 착지점에 `insufficient` 가 있어야 한다.

### 게이트 강제로 넘긴 것

| 게이트 | 결과 | 사유 |
|---|---|---|
| G5 | `skipped` (forced) | 검증 sprint 라 앵커 파일 미변경. F-7 로 `--loop` 없이는 평가 자체가 불가 |
| G6 | `skipped` (forced) | blocking `failed` 3건. 판정과 수정을 섞지 않기로 한 범위(PRD §3) |

### 이월 항목

### 결정이 필요한 정책

| # | 결정할 것 | 선택지 | 기본 제안 | 결정자 |
|---|---|---|---|---|
| 1 | 도달성 축을 tene 에 넣을 것인가 | Q7 로 6질문 확장 / G4 검사 추가 / 둘 다 / 안 함 | 둘 다 — Q7 은 보고, G4 는 강제 | 사용자 |
| 2 | Q3·Q4 가 테스트 참조를 구분할 것인가 | 구분 표기 / 프로덕션만 집계 / 현행 유지 | 구분 표기 — 집계에서 빼면 테스트 커버리지가 안 보인다 | 사용자 |
| 3 | 직전 sprint 이월 12건의 처리 순서 | F-7 우선 / D12 표류 우선 / 일괄 | F-7 우선 — 사이클 자체가 안 돈다 | 사용자 |

### 이월 작업

| # | 작업 | 왜 이번에 하지 않았나 | 언제 할 것인가 |
|---|---|---|---|
| 1 | 게이트가 모델 자기신고다 — store.advance() 가 evaluateGate 를 부르지 않고 --result 문자열을 받아 기록만 한다 | 스킬이 gate check 와 advance --result 를 두 줄로 지시하므로 모델이 게이트를 건너뛰거나 fail 을 pass 로 적어도 전이가 성립한다. rules.js:4-8 의 주석과 배선이 어긋난다. 이번 sprint 의 게이트 기록도 전부 자기신고다 | 미정 |
| 2 | 반박 2/3 강등의 착지점이 failed 하나뿐이라 미측정이 위반으로 기록된다 | qa-sweep 이 ac_1·ac_3·ac_8 을 passed→failed 로 강등했는데 반박 사유는 전부 증거 충분성이다. PP3·ADR-12 를 반대로 어긴다. insufficient 착지점이 필요하다 | 미정 |
| 3 | markStaleNoLock 이 syncCurrent 를 부르지 않아 current.json 의 summary.ac 가 sprint 파일과 어긋난다 | sprint 는 stale 1 인데 current 는 {passed:3, stale:0} 로 남는다. 세션 주입과 게이트가 이 캐시를 읽는다 | 미정 |
| 4 | lib/qa/evidence.js:156 이 같은 id 의 case 중복 등록을 허용한다 | 증거 매니페스트의 무결성이 깨진다 | 미정 |
| 5 | GATE_BY_PHASE 가 schema.js 와 bin/tene-gate 두 곳에 중복 정의되고 이미 어긋났다 | bin 쪽에 draft/G0 이 없어 [draft] 태스크는 TaskCompleted 훅에서 무검사 통과한다 | 미정 |
| 6 | 스킬 전부가 tene-gate 의 존재하지 않는 --sprint 플래그를 가르친다 | parseArgs 에 sprint 가 없고 strict:false 라 조용히 무시된다. 다른 sprint 를 지정할 방법이 실제로 없다 | 미정 |
| 7 | 워크플로 에이전트 8건이 빈 결과를 반환해 AC 5건이 insufficient 로 끝났다 | 스키마 호출 실패 3건 포함. 워크플로 자체의 신뢰성 문제이며 재실행으로 확인해야 한다 | 미정 |
| 8 | conformance-audit 27건 중 4건이 스키마 실패로 판정을 못 받았다 | 판정된 23건만 세야 한다. 미판정을 판정으로 세면 분모 조작이다 | 미정 |
| 9 | ac_1 — 설계와 다르게 구현됨 | plugins/tene/lib/scan/query.js:128 에 심볼은 있으나 이번 sprint 에서 변경 | 미정 |
| 10 | ac_3 — 설계와 다르게 구현됨 | plugins/tene/lib/state/store.js:229 에 심볼은 있으나 이번 sprint 에서 변 | 미정 |
| 11 | ac_4 — 설계와 다르게 구현됨 | plugins/tene/lib/state/summary.js:79 에 심볼은 있으나 이번 sprint 에서 | 미정 |
| 12 | ac_5 — 설계와 다르게 구현됨 | plugins/tene/lib/state/store.js:437 에 심볼은 있으나 이번 sprint 에서 변 | 미정 |
| 13 | ac_6 — 설계와 다르게 구현됨 | plugins/tene/lib/loop/judge.js:287 에 심볼은 있으나 이번 sprint 에서 변경 | 미정 |
| 14 | ac_7 — 설계와 다르게 구현됨 | plugins/tene/lib/state/schema.js:163 에 심볼은 있으나 이번 sprint 에서 | 미정 |
| 15 | ac_8 — 설계와 다르게 구현됨 | plugins/tene/lib/guard/rules.js:105 에 심볼은 있으나 이번 sprint 에서 변 | 미정 |
| 16 | ac_9 — 설계와 다르게 구현됨 | plugins/tene/lib/loop/judge.js:287 에 심볼은 있으나 이번 sprint 에서 변경 | 미정 |
| 17 | ac_10 — 설계와 다르게 구현됨 | plugins/tene/lib/state/summary.js:79 에 심볼은 있으나 이번 sprint 에서 | 미정 |
| 18 | L2. 헤드리스 사이클 관찰 (ac_3, ac_4) — 설계와 다르게 구현됨 | 일부만 존재: 있음 failed@plugins/tene/test/unit/doc-validate.test.j | 미정 |
| 19 | L3. stale 전환 관찰 (ac_5) — 설계와 다르게 구현됨 | 일부만 존재: 있음 failed@plugins/tene/test/unit/doc-validate.test.j | 미정 |
| 20 | L4. F-1 회귀 (ac_6) — 설계와 다르게 구현됨 | 일부만 존재: 있음 layers_all_four@plugins/tene/lib/doc/validate.js: | 미정 |
| 21 | markStaleNoLock — 설계와 다르게 구현됨 | 시그니처에 설계된 스키마가 보이지 않습니다: (root, id, acIds, filePath), 전환된 AC | 미정 |
| 22 | judgeBash — 설계와 다르게 구현됨 | 시그니처에 설계된 스키마가 보이지 않습니다: PreToolUse 페이로드, {decision, reason} | 미정 |
| 23 | orphans — 설계와 다르게 구현됨 | 시그니처에 설계된 스키마가 보이지 않습니다: 인덱스, 참조 0건 심볼 목록 (실제: export functi | 미정 |
| 24 | formatSummary — 설계와 다르게 구현됨 | 시그니처에 설계된 스키마가 보이지 않습니다: current.json, {text, tokens, trunca | 미정 |
| 25 | ac_2 미측정 | 수집 단계가 빈 결과를 냈다. 판정자: '코드 정적 확인으로 통과를 추정하지 않았다' | 미정 |
| 26 | ac_4 미측정 | 수집 단계 빈 결과. 헤드리스 세션 로그가 제출되지 않았다 | 미정 |
| 27 | ac_6 미측정 | 수집 단계 빈 결과. tene-doc validate 실행 기록이 제출되지 않았다 | 미정 |
| 28 | ac_7 미측정 | 수집 단계 빈 결과. 판정자가 스스로 저장소를 조회해 근거를 만드는 것을 거부했다 — 수집·판정 분리 유지 | 미정 |
| 29 | ac_9 미측정 | 수집 단계 빈 결과 | 미정 |

### 예외 승인 (waiver)

해당 없음

### 우선순위

**1순위는 W-0 이다.** 게이트가 모델 자기신고인 한 나머지 게이트 개선은 의미가 없다. `store.advance()` 가 `evaluateGate` 를 직접 부르고 `--result` 를 감사 기록용으로만 남기면 된다.

**2순위는 F-7 · W-6 이다.** F-7(`lastLoopResult` 미기록)이 사이클을 못 돌게 하고, W-6(강등 착지점)이 판정 어휘를 무너뜨린다. 둘 다 tene 의 정체성에 직접 닿는다.

**3순위는 배선 묶음이다.** `aggregate.js`(master plan), `crossJudgeDataFlow`(DATA 교차 판정), `detectMutations`(Q6), `judgeInput` 의 `ac` 필드. 전부 코드는 있고 호출자가 없다.


## +@ (자유 회고)
