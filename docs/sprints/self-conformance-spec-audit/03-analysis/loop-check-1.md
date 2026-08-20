---
tene:
  sprint: self-conformance
  doc: loop-check
  phase: loop-check
  status: draft
  created: 2026-08-20
  modified: 2026-08-20
  lang: ko
  round: 1
---

# self-conformance — Loop Check #1

## 1. 판정 요약     <!-- tene:sec=verdict -->

<!-- tene:auto:start block=verdict generated=2026-08-20T09:48:28Z -->
**판정: `continue`** — blocking 갭 22건 남음

| 항목 | 값 |
|---|---|
| 회차 | 1 / 3 |
| 진행률 | 진행률 33% (9.5 / 29) |
| blocking 갭 | 22 |
| 회귀 | 0 |
| 미귀속 미해소 | 0 |

| 판정 | 건수 |
|---|---|
| implemented | 0 |
| missing | 10 |
| partial | 19 |
| unverifiable | 0 |

> caveats: design.md 에 4계층 표가 비어 있습니다; 인덱서가 추적하지 못한 지점 6건이 있습니다 (동적 디스패치·리플렉션)
<!-- tene:auto:end -->

## 2. 문서 ↔ 구현 대조     <!-- tene:sec=comparison -->

<!-- tene:auto:start block=comparison generated=2026-08-20T09:48:28Z -->
| 출처 | 항목 | 판정 | 사유 | 근거 |
|---|---|---|---|---|
| prd:ac | ac_1 | `partial` | not_changed | plugins/tene/lib/loop/judge.js:287 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 |
| prd:ac | ac_2 | `partial` | not_changed | plugins/tene/lib/loop/judge.js:272 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 |
| prd:ac | ac_3 | `partial` | not_changed | plugins/tene/lib/guard/rules.js:105 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 |
| prd:ac | ac_4 | `partial` | not_changed | plugins/tene/lib/state/schema.js:139 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 |
| prd:ac | ac_5 | `partial` | not_changed | plugins/tene/lib/hooks/compact.js:34 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 |
| prd:ac | ac_6 | `partial` | not_changed | plugins/tene/lib/state/store.js:229 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 |
| prd:ac | ac_7 | `partial` | not_changed | plugins/tene/lib/doc/validate.js:36 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 |
| prd:ac | ac_8 | `partial` | not_changed | plugins/tene/lib/state/schema.js:163 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 |
| prd:ac | ac_9 | `partial` | not_changed | plugins/tene/lib/guard/rules.js:153 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 |
| prd:ac | ac_10 | `partial` | not_changed | plugins/tene/lib/state/summary.js:79 에 심볼은 있으나 이번 sprint 에서 변경되지 않았습니다 |
| plan:task | task_1 | `missing` | not_changed | 덮는 AC 의 앵커 파일이 변경되지 않았습니다: plugins/tene/lib/loop/judge.js |
| plan:task | task_2 | `missing` | not_changed | 덮는 AC 의 앵커 파일이 변경되지 않았습니다: plugins/tene/lib/guard/rules.js |
| plan:task | task_3 | `missing` | not_changed | 덮는 AC 의 앵커 파일이 변경되지 않았습니다: plugins/tene/lib/state/schema.js |
| plan:task | task_4 | `missing` | not_changed | 덮는 AC 의 앵커 파일이 변경되지 않았습니다: plugins/tene/lib/hooks/compact.js, plugins/ |
| plan:task | task_5 | `missing` | not_changed | 덮는 AC 의 앵커 파일이 변경되지 않았습니다: plugins/tene/lib/state/store.js |
| plan:task | task_6 | `missing` | not_changed | 덮는 AC 의 앵커 파일이 변경되지 않았습니다: plugins/tene/lib/doc/validate.js, plugins/t |
| plan:task | task_7 | `missing` | not_changed | 덮는 AC 의 앵커 파일이 변경되지 않았습니다: plugins/tene/lib/state/schema.js |
| plan:task | task_8 | `missing` | not_changed | 덮는 AC 의 앵커 파일이 변경되지 않았습니다: plugins/tene/lib/guard/rules.js |
| plan:task | task_9 | `missing` | not_changed | 덮는 AC 의 앵커 파일이 변경되지 않았습니다: plugins/tene/lib/state/summary.js |
| design:logic | L1. RTM 전수 대조 (ac_1, ac_2) | `partial` | partial_symbol | 일부만 존재: 있음 failed@plugins/tene/test/unit/doc-validate.test.js:34 / 없음  |
| design:logic | L2. 가드 매트릭스 실측 (ac_3) | `partial` | partial_symbol | 일부만 존재: 있음 allow@plugins/tene/lib/guard/rules.js:69, deny@plugins/tene |
| design:logic | L3. 게이트 미평가 기록 (ac_6) | `partial` | partial_symbol | 일부만 존재: 있음 computeAcSummary@plugins/tene/lib/state/schema.js:139, pass |
| design:logic | L4. 봉투 동일성 (ac_7) | `partial` | partial_symbol | 일부만 존재: 있음 ok@plugins/tene/lib/doc/validate.js:36 / 없음 tool, schemaVer |
| design:contract | bin/* 공통 봉투 | `missing` | symbol_missing | 계약 대상 'bin/* 공통 봉투' 를 찾지 못했습니다 |
| design:contract | judgeBash | `partial` | schema_mismatch | 시그니처에 설계된 스키마가 보이지 않습니다: {command} (PreToolUse 페이로드), {decision: allow |
| design:contract | judgeAll | `partial` | schema_mismatch | 시그니처에 설계된 스키마가 보이지 않습니다: requirements[], ctx, {judgments[], score} — 판 |
| design:contract | advance | `partial` | schema_mismatch | 시그니처에 설계된 스키마가 보이지 않습니다: (root, id, to, {force, gateResult, expectedRe |
| design:contract | computeAcSummary | `partial` | schema_mismatch | 시그니처에 설계된 스키마가 보이지 않습니다: ac[], {total, passed, failed, insufficient, s |
| design:contract | formatSummary | `partial` | schema_mismatch | 시그니처에 설계된 스키마가 보이지 않습니다: current.json, {budget}, {text, tokens, trunca |
<!-- tene:auto:end -->

## 3. Understanding Layer 대조     <!-- tene:sec=layercheck -->

<!-- tene:auto:start block=layercheck generated=2026-08-20T09:48:29Z -->
| 출처 | 요구 항목 수 |
|---|---|
| design:contract | 6 |
| design:layer | 0 |
| design:logic | 4 |
| design:transition | 0 |
| plan:task | 9 |
| prd:ac | 10 |

> `design:layer` 가 0 인 것은 계층 표가 요구 항목으로 추출되지 않았다는 뜻이다 (F-5).
<!-- tene:auto:end -->

## 4. 미귀속 변경     <!-- tene:sec=unattributed -->

<!-- tene:auto:start block=unattributed generated=2026-08-20T09:48:49Z -->
**미귀속 변경 0건** — 앵커에 걸리지 않은 코드 변경이 없다.

| 항목 | 값 |
|---|---|
| git 가용 | true |
| 미귀속 항목 | 0 |
| 미해소 | 0 |

> 이번 sprint 는 구현 코드를 고치지 않았다. 변경은 전부 `docs/sprints/` 아래 문서다.
> 따라서 미귀속 0 은 "해소했다" 가 아니라 **"애초에 코드 변경이 없다"** 는 뜻이다.
<!-- tene:auto:end -->

> 앵커되지 않은 변경은 (a) 앵커 추가 (b) 새 AC 승격 (c) 무관 변경 표시 중 하나로 해소해야 G5 를 통과합니다.

## 5. 계층 위반 / 기술부채     <!-- tene:sec=debt -->

`tene-scan violations` 실측: **blocker 0 · warning 20**.

warning 20건은 전부 `bin/*`(interface) → `lib/state/*`(persistence) 의 `layer-skip` 이며 D00 §2 가 정의한 얇은 진입점 구조에서 의도된 것이다. `reverse` 는 0건으로 순환 의존의 씨앗이 없다.

미분류 1건 — `plugins/tene/lib/recover/resync.js`. 규칙에 `lib/recover/**` 가 없다. 추측 배정하지 않았다 (열린 결정 D-D).

인덱서 자체 한계 6건(동적 디스패치·리플렉션)은 도구가 스스로 `caution` 으로 신고했다. 숨기지 않은 것이 정상 동작이다.


## 6. 개선 작업     <!-- tene:sec=fixes -->

**이번 회차는 코드를 고치지 않는다.** PRD 범위 밖(§3)이 "발견된 결함의 수정" 을 명시적으로 제외했다.

대신 이 회차가 발견한 것을 기록한다. 아래는 전부 **tene 자체의 결함**이며 다음 sprint 이월 후보다.

| # | 결함 | 근거 | 심각도 |
|---|---|---|---|
| F-1 | `tene-scan layers` 는 계층 키를 `business-logic` 으로 내보내는데 `tene-doc validate` 의 `layers_all_four` 정규식은 하이픈을 받지 않는다. 스캐너 출력을 자동 블록에 그대로 넣으면 **G3 가 막힌다** | `lib/doc/validate.js:21` vs `tene-scan layers` 의 stats 키 | blocker |
| F-2 | `tene-doc validate --doc prd` 를 `--sprint` 없이 부르면 활성 sprint 가 있어도 처리되지 않은 TypeError 로 죽어 exit 10(INTERNAL). `tene-gate` 는 같은 상황에서 활성 sprint 를 찾아 정상 동작한다 | `bin/tene-doc` 의 `docPathFor` | warning |
| F-3 | `tene-loop check` 는 앵커를 **PRD 의 AC 표**에서 읽고 `tene-gate G3` 의 `anchors_resolved` 는 **상태**에서 읽는다. design 스킬은 상태에만 쓰라고 지시하므로 지시대로 하면 G3 는 통과하고 loop-check 는 전 AC 를 `unverifiable` 로 판정한다 | `lib/loop/requirements.js:49` vs `lib/gate/rules.js:124` | blocker |
| F-4 | `design.md` 의 계층 표를 채워도 `requirements.bySource` 의 `design:layer` 가 0 이고 caveat 은 "4계층 표가 비어 있습니다" 라고 말한다 | loop-check 출력의 caveats | warning |
| F-5 | 계약 표는 설계에 쓴 스키마 **문자열**이 시그니처 텍스트에 그대로 있는지를 본다. `judgeBash(payload)` 는 `{command}` 를 포함하지 않으므로 항상 `partial/schema_mismatch` 가 된다 | 계약 6건 전부 동일 사유 | info |
| F-6 | 테스트 러너 탐지가 저장소 루트만 본다. 플러그인이 하위 디렉토리에 있는 마켓플레이스 배치에서는 `package.json` 을 못 찾아 UNIT 검증이 전부 insufficient 가 된다 | `tene-state doctor` 의 `qa.testRunner: null` | warning |


## 7. 이번 회차에서 하지 않은 것     <!-- tene:sec=notdone -->

**갭을 0으로 만들지 않았다.** 만들 수 없어서가 아니라 **만들면 거짓이 되기 때문**이다.

`partial/not_changed` 19건은 "앵커 심볼이 존재하나 이번 sprint 에서 변경되지 않았다" 는 정확한 관찰이다. 이 sprint 는 검증 sprint 이므로 구현 코드를 의도적으로 바꾸지 않았다. loop-check 의 판정 모델은 **"AC 는 앵커 파일이 이번에 변경됐을 때 implemented"** 인데 이 모델은 구현 sprint 를 전제한다. 검증 sprint 에는 맞지 않는다.

이것은 tene 의 결함이 아니라 **적용 범위의 한계**다. 갭을 0으로 만들려면 셋 중 하나를 해야 하는데 전부 부정직하다.

- 요구 항목을 지운다 → 분모 조작
- 앵커를 이번에 바꾼 파일로 옮긴다 → 앵커가 가리키는 대상을 왜곡
- 판정을 손으로 `implemented` 로 덮어쓴다 → 기계 판정 위조

그래서 **G5 를 통과시키지 않고 `--force` 로 넘긴다.** G5 는 `skipped` + `forced: true` 로 남아 통과 집계에서 빠지고 보고서 R6 에 그대로 실린다. 이것이 정직한 처리이며, 동시에 ac_6 이 실제 sprint 에서 동작하는지 보는 관찰이기도 하다.

**다음 회차를 돌리지 않는다.** 같은 방법으로 반복해도 `not_changed` 는 그대로다 — 스킬이 정한 "진전이 없으면 반복을 늘리지 않는다" 에 해당한다.


## +@ (자유 관점)
