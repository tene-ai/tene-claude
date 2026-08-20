---
tene:
  sprint: wiring-conformance
  doc: loop-check
  phase: loop-check
  status: draft
  created: 2026-08-20
  modified: 2026-08-20
  lang: ko
  round: 1
---

# wiring-conformance — Loop Check #1

## 1. 판정 요약     <!-- tene:sec=verdict -->

<!-- tene:auto:start block=verdict generated=2026-08-20T11:01:39Z -->
**판정: `continue`** — blocking 갭 23건 남음

| 항목 | 값 |
|---|---|
| 회차 | 1 / 3 |
| 진행률 | 진행률 28% (8 / 29) |
| blocking 갭 | 23 |
| 회귀 | 0 |
| 미귀속 미해소 | 1 |

| 판정 | 건수 |
|---|---|
| implemented | 0 |
| missing | 13 |
| partial | 16 |
| unverifiable | 0 |

> caveats: design.md 에 4계층 표가 비어 있습니다; 인덱서가 추적하지 못한 지점 6건이 있습니다 (동적 디스패치·리플렉션)
<!-- tene:auto:end -->

## 2. 문서 ↔ 구현 대조     <!-- tene:sec=comparison -->

<!-- tene:auto:start block=comparison generated=2026-08-20T11:01:40Z -->
| 출처 | 항목 | 판정 | 사유 | 근거 |
|---|---|---|---|---|
| prd:ac | ac_1 | `partial` | not_changed | plugins/tene/lib/scan/query.js:128 에 심볼은 있으나 이번 sprint 에서 변경 |
| prd:ac | ac_2 | `missing` | anchor_not_found | 앵커 심볼을 인덱스에서 찾지 못했습니다: questions |
| prd:ac | ac_3 | `partial` | not_changed | plugins/tene/lib/state/store.js:229 에 심볼은 있으나 이번 sprint 에서 변 |
| prd:ac | ac_4 | `partial` | not_changed | plugins/tene/lib/state/summary.js:79 에 심볼은 있으나 이번 sprint 에서  |
| prd:ac | ac_5 | `partial` | not_changed | plugins/tene/lib/state/store.js:437 에 심볼은 있으나 이번 sprint 에서 변 |
| prd:ac | ac_6 | `partial` | not_changed | plugins/tene/lib/loop/judge.js:287 에 심볼은 있으나 이번 sprint 에서 변경 |
| prd:ac | ac_7 | `partial` | not_changed | plugins/tene/lib/state/schema.js:163 에 심볼은 있으나 이번 sprint 에서  |
| prd:ac | ac_8 | `partial` | not_changed | plugins/tene/lib/guard/rules.js:105 에 심볼은 있으나 이번 sprint 에서 변 |
| prd:ac | ac_9 | `partial` | not_changed | plugins/tene/lib/loop/judge.js:287 에 심볼은 있으나 이번 sprint 에서 변경 |
| prd:ac | ac_10 | `partial` | not_changed | plugins/tene/lib/state/summary.js:79 에 심볼은 있으나 이번 sprint 에서  |
| plan:task | task_1 | `missing` | not_changed | 덮는 AC 의 앵커 파일이 변경되지 않았습니다: plugins/tene/lib/scan/query.js |
| plan:task | task_2 | `missing` | not_changed | 덮는 AC 의 앵커 파일이 변경되지 않았습니다: plugins/tene/lib/scan/query.js |
| plan:task | task_3 | `missing` | not_changed | 덮는 AC 의 앵커 파일이 변경되지 않았습니다: plugins/tene/lib/state/store.js |
| plan:task | task_4 | `missing` | not_changed | 덮는 AC 의 앵커 파일이 변경되지 않았습니다: plugins/tene/lib/state/summary.js |
| plan:task | task_5 | `missing` | not_changed | 덮는 AC 의 앵커 파일이 변경되지 않았습니다: plugins/tene/lib/state/store.js |
| plan:task | task_6 | `missing` | not_changed | 덮는 AC 의 앵커 파일이 변경되지 않았습니다: plugins/tene/lib/loop/judge.js |
| plan:task | task_7 | `missing` | not_changed | 덮는 AC 의 앵커 파일이 변경되지 않았습니다: plugins/tene/lib/state/schema.js |
| plan:task | task_8 | `missing` | not_changed | 덮는 AC 의 앵커 파일이 변경되지 않았습니다: plugins/tene/lib/guard/rules.js |
| plan:task | task_9 | `missing` | not_changed | 덮는 AC 의 앵커 파일이 변경되지 않았습니다: plugins/tene/lib/loop/judge.js |
| plan:task | task_10 | `missing` | not_changed | 덮는 AC 의 앵커 파일이 변경되지 않았습니다: plugins/tene/lib/state/summary.js |
| design:logic | L1. 도달성 계측 (ac_1, ac_2) | `missing` | symbol_missing | 설계에 적힌 심볼이 없습니다: command, meta.name, import, reachable, dyna |
| design:logic | L2. 헤드리스 사이클 관찰 (ac_3, ac_4) | `partial` | partial_symbol | 일부만 존재: 있음 failed@plugins/tene/test/unit/doc-validate.test.j |
| design:logic | L3. stale 전환 관찰 (ac_5) | `partial` | partial_symbol | 일부만 존재: 있음 failed@plugins/tene/test/unit/doc-validate.test.j |
| design:logic | L4. F-1 회귀 (ac_6) | `partial` | partial_symbol | 일부만 존재: 있음 layers_all_four@plugins/tene/lib/doc/validate.js: |
| design:contract | reachability.mjs | `missing` | symbol_missing | 계약 대상 'reachability.mjs' 를 찾지 못했습니다 |
| design:contract | markStaleNoLock | `partial` | schema_mismatch | 시그니처에 설계된 스키마가 보이지 않습니다: (root, id, acIds, filePath), 전환된 AC |
| design:contract | judgeBash | `partial` | schema_mismatch | 시그니처에 설계된 스키마가 보이지 않습니다: PreToolUse 페이로드, {decision, reason} |
| design:contract | orphans | `partial` | schema_mismatch | 시그니처에 설계된 스키마가 보이지 않습니다: 인덱스, 참조 0건 심볼 목록 (실제: export functi |
| design:contract | formatSummary | `partial` | schema_mismatch | 시그니처에 설계된 스키마가 보이지 않습니다: current.json, {text, tokens, trunca |
<!-- tene:auto:end -->

## 3. Understanding Layer 대조     <!-- tene:sec=layercheck -->

<!-- tene:auto:start block=layercheck generated=2026-08-20T11:01:40Z -->
| 출처 | 요구 항목 수 |
|---|---|
| design:contract | 5 |
| design:layer | 0 |
| design:logic | 4 |
| design:transition | 0 |
| plan:task | 10 |
| prd:ac | 10 |

> `design:layer` 0 은 계층 표가 요구 항목으로 추출되지 않는다는 뜻이다 (직전 sprint F-4 와 동일).
<!-- tene:auto:end -->

## 4. 미귀속 변경     <!-- tene:sec=unattributed -->

<!-- tene:auto:start block=unattributed generated=2026-08-20T11:01:41Z -->
**미귀속 변경 1건 — 탐지됨**

| 경로 | 계층 | 해소 |
|---|---|---|
| `evals/reachability.mjs` | unclassified | **(c) 무관 변경** |

**사유** — 이 파일은 제품 코드가 아니라 **이번 sprint 의 계측기**다. design §1 과 plan task_1 이 산출물로 선언했고, 플러그인 밖(`evals/`)에 두기로 design §+@ 에서 결정했다. 어떤 AC 도 이 파일의 동작을 기준으로 삼지 않는다 — ac_1 의 앵커는 비교 대상인 `orphans` 이지 계측기가 아니다.

> 이 탐지 자체가 D07 §5 미귀속 변경 검출이 실제로 동작한다는 관찰이다. 내가 스펙에 없는 파일을 추가했고 도구가 잡았다.
<!-- tene:auto:end -->

> 앵커되지 않은 변경은 (a) 앵커 추가 (b) 새 AC 승격 (c) 무관 변경 표시 중 하나로 해소해야 G5 를 통과합니다.

## 5. 계층 위반 / 기술부채     <!-- tene:sec=debt -->

`tene-scan violations` — **blocker 0 · warning 20**. 직전 sprint 와 동일하며 전부 `bin/*`(interface) → `lib/state/*`(persistence) 의 `layer-skip` 이다. D00 §2 가 정의한 얇은 진입점 구조의 결과다.

**이번 sprint 가 추가한 기술부채 관측 — 도달성 축.**

| 분류 | 건수 | 뜻 |
|---|---|---|
| reachable | 55 | 진입점에서 정적 import 로 도달 |
| dynamic | 11 | `bin/tene-hook` 의 `HANDLERS` 등록표로만 도달. 정상 |
| **test-only** | **1** | `lib/plan/aggregate.js` — 테스트만 부른다 |
| unreachable | 0 | — |

`test-only` 1건이 이 프로젝트의 배선 부채 전부다. 크기는 작지만 그것이 막고 있는 기능은 작지 않다 — master plan 집계, 이월 승격, R1 이전 sprint 연결이 전부 이 모듈에 걸려 있다.


## 6. 개선 작업     <!-- tene:sec=fixes -->

**코드를 고치지 않는다.** PRD §3 이 결함 수정을 범위 밖으로 뒀다.

이번 회차가 새로 확정한 것.

| # | 발견 | 근거 | 심각도 |
|---|---|---|---|
| W-1 | 6질문 Q3·Q4 가 테스트 참조와 프로덕션 참조를 구분하지 않는다. 배선 안 된 `aggregate` 가 Q1~Q4 전부 `high confidence` 로 "건강함" 으로 나온다 | design §5 의 6질문 표 + `ac1-reachability.json` | blocker |
| W-2 | `orphans()` 는 참조 0건만 잡는다(`lib/scan/query.js:128`). `test-only` 는 참조가 있어 걸리지 않는다 | `ac1-reachability.json` | blocker |
| W-3 | 앵커 스키마의 `resolvedAt`·`source:'human'`(D10 §3.1·§3.2 Stage 3)이 구현되지 않았다. 배포본 `lib/` 전체 grep 0건 | `ac7-rtm41-audit.json` | warning |
| W-4 | 3단계 앵커링 Stage 2 의 후반(변경 파일을 보고 앵커 자동 추가·교정)이 없다. 미귀속 보고까지만 구현됐다 | `ac7-rtm41-audit.json` | warning |
| F-1 (재확인) | `tene-scan layers` 출력을 가공 없이 넣으면 `layers_all_four` 가 막는다 | `ac6-f1-regression.json` | blocker |

직전 sprint 이월 12건은 그대로 유효하다. F-7(`lastLoopResult` 미기록)은 이번에도 재현됐다 — 아래 §7 참조.


## 7. 이번 회차에서 하지 않은 것     <!-- tene:sec=notdone -->

**갭을 0으로 만들지 않았다.** 직전 sprint 와 같은 이유다 — 이 sprint 는 구현 코드를 바꾸지 않는 검증 sprint 인데, loop-check 의 판정 모델은 **"앵커 파일이 이번에 변경됐을 때 implemented"** 이므로 검증 sprint 에는 맞지 않는다.

`missing 13` 은 plan 의 task 13건이 "앵커 파일 미변경" 으로 판정된 것이고, `partial 16` 은 AC·로직·계약이 "심볼은 있으나 미변경" 으로 판정된 것이다. **둘 다 정확한 관찰이다.** 갭을 0으로 만들려면 요구 항목을 지우거나 앵커를 왜곡하거나 판정을 위조해야 하고 전부 거부한다.

**F-7 이 이번에도 재현된다.** `tene-gate check --gate G5` 는 `sprint.lastLoopResult` 를 읽는데 그것을 쓰는 코드가 없어 "loop-check 결과가 없습니다" 로 두 검사가 모두 fail 한다. 갭이 0이어도 통과하지 못한다.

그래서 **G5 를 `--force` 로 넘긴다.** `skipped` + `forced: true` 로 남아 통과 집계에서 빠지고 R6 에 실린다.

**다음 회차를 돌리지 않는다.** 같은 방법으로 반복해도 `not_changed` 는 그대로다.


## +@ (자유 관점)
