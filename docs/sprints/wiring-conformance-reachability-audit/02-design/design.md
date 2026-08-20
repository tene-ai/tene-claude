---
tene:
  sprint: wiring-conformance
  doc: design
  phase: design
  status: draft
  created: 2026-08-20
  modified: 2026-08-20
  lang: ko
  profile: strict
---

# wiring-conformance — Design

## 1. 설계 개요     <!-- tene:sec=overview -->

검증 절차를 설계한다. 코드는 만들지 않되 **계측기 하나**는 만든다 — `evals/reachability.mjs`. 플러그인 밖의 외부 스크립트이며 플러그인 코드를 수정하지 않는다.

앵커는 "이 AC 를 만족시킬 코드" 가 아니라 **"이 AC 가 관찰할 코드"** 를 가리킨다. 검증 sprint 의 관례다.

검증 대상은 마켓플레이스 배포본이다. 실행 관찰은 스크래치패드의 빈 프로젝트에서 하며 이 저장소 상태를 건드리지 않는다.

## 2. Understanding Layer 분류     <!-- tene:sec=layers -->

<!-- tene:auto:start block=layers generated=2026-08-20T10:44:09Z -->
> 스캐너 키는 business-logic 이지만 검증기가 하이픈을 못 읽어 표기를 바꿨다 (ac_6 = failed, 증거: ac6-f1-regression.json).

| 계층 | 파일 수 |
|---|---|
| Interface | 22 |
| Business Logic | 39 |
| Persistence | 6 |
| Infrastructure | 3 |
| (test) | 24 |
| 미분류 | 1 — plugins/tene/lib/recover/resync.js |
<!-- tene:auto:end -->

## 3. 계층 위반 점검     <!-- tene:sec=violations -->

<!-- tene:auto:start block=violations generated=2026-08-20T10:44:09Z -->
blockers **0** · warnings **20**

| 종류 | 건수 | 대표 |
|---|---|---|
| layer-skip | 20 | interface → persistence — plugins/tene/bin/tene-doc:10 |
<!-- tene:auto:end -->

### 판정

직전 sprint 와 동일한 형태다. `reverse` 0건이 blocker 판정 기준이며 순환 의존이 없다는 뜻이다. `layer-skip` 은 `bin/*` 이 상태를 직접 읽는 얇은 진입점 구조에서 나오며 D00 §2 가 의도한 것이다.

## 4. 처리 로직 상세     <!-- tene:sec=logic -->

### L1. 도달성 계측 (ac_1, ac_2)

**입력** — 배포본 루트. 진입점 집합을 세 곳에서 모은다.

| 진입점 출처 | 수집 방법 |
|---|---|
| 훅 | `hooks/hooks.json` 의 `command` 배열에서 `bin/*` 과 인자 |
| 스킬 | `skills/*/SKILL.md` 본문의 `${CLAUDE_PLUGIN_ROOT}/bin/<tool> <sub>` |
| 워크플로 | `workflows/*.js` 의 `meta.name` |

**처리** — 진입점 파일에서 시작해 정적 `import` 그래프를 BFS 로 따라간다. 방문한 파일의 export 는 `reachable` 이며, 도달 경로(진입점 → … → 파일)를 함께 남긴다.

**동적 디스패치 처리가 이 로직의 핵심이다.** `bin/tene-hook` 은 문자열 키로 모듈을 고른다:

```js
const HANDLERS = { 'session-start': () => import('../lib/hooks/session-start.js'), … }
```

정적 그래프만 따라가면 훅 9개가 전부 도달 불가로 보인다. **오탐이다.** 그래서 `() => import('<경로>')` 패턴을 별도로 수집해 그 대상을 `dynamic` 으로 분류한다.

**분기와 결과**

| 조건 | 분류 | 뜻 |
|---|---|---|
| 진입점에서 정적 import 로 도달 | `reachable` | 정상 |
| 동적 import 등록표에만 있음 | `dynamic` | 정상. 정적 분석 한계이지 결함이 아니다 |
| `test/` 에서만 import | `test-only` | **배선 누락 후보** |
| 아무도 import 안 함 | `unreachable` | **미배선 또는 죽은 코드** |

**ac_2 가 요구하는 구분이 `dynamic` 과 `test-only`/`unreachable` 의 분리다.** 이것을 못 하면 계측기가 멀쩡한 훅을 결함으로 신고한다.

**교차 확인** — 알려진 정답 셋으로 계측기를 검사한다. `lib/plan/aggregate.js` → `test-only`, `lib/hooks/session-start.js` → `dynamic`, `lib/state/store.js` → `reachable`. 셋 중 하나라도 어긋나면 계측기를 신뢰하지 않고 ac_1·ac_2 를 `insufficient` 로 둔다.

**부작용** — 없다. 읽기 전용.

### L2. 헤드리스 사이클 관찰 (ac_3, ac_4)

**입력** — 스크래치패드의 빈 git 프로젝트. 이 저장소가 아니다.

**처리** — `claude -p` 로 세션을 띄우고 `/tene:sprint init` 부터 `/tene:design` 까지 진행시킨다. `--output-format stream-json --verbose` 로 로그를 남긴다.

**관찰 대상 둘.**

1. **게이트 기록** (ac_3) — 종료 후 `.tene-claude/state/sprints/<id>.json` 의 `gates` 에 G0~G3 판정이 남았는가. 상태 파일을 직접 읽는다.
2. **SessionStart 주입** (ac_4) — stream-json 로그의 시스템 이벤트에서 훅이 주입한 텍스트를 추출해, 대화형 `tene-state summary` 출력과 대조한다.

**실패 처리** — 세션이 스킬을 호출하지 않으면 그 사실을 기록하고 `insufficient`. 헤드리스가 게이트를 건너뛰면 `failed` 가 아니라 관찰된 그대로 기록한다.

### L3. stale 전환 관찰 (ac_5)

의도 보존의 핵심 장치다. PRD 04 A2.2 와 D10 §3.4 가 정의한 흐름을 실행으로 확인한다.

**입력** — 임시 프로젝트에 sprint 를 만들고 AC 하나를 특정 파일 심볼에 앵커한 뒤 `verdict: passed` 로 둔다.

**처리** — 그 파일을 실제로 편집하고 `PostToolUse` 경로를 태운다.

**관찰** — 상태 파일에서 그 AC 의 판정이 `passed → stale` 로 바뀌었는가. 그리고 `failed`/`insufficient` 인 AC 는 **바뀌지 않아야** 한다 — D10 §3.4 가 "이미 fail 인 것을 stale 로 바꾸면 실패 사실이 가려진다" 고 정한 규칙이다.

**분기** — `passed` 만 전환되면 `passed`. 전부 전환되거나 아무것도 전환되지 않으면 `failed`. 훅을 태울 수 없으면 `insufficient`.

### L4. F-1 회귀 (ac_6)

**입력** — `tene-scan layers` 의 원본 출력.

**처리** — 가공 없이 계층 이름을 그대로 써서 design 자동 블록을 만들고 `tene-doc validate` 를 돌린다.

**분기** — 통과하면 `passed`. `layers_all_four` 가 막으면 `failed` 이며 F-1 이 여전히 재현된다는 뜻이다. 직전 sprint 에서 사람이 읽는 이름으로 바꿔 우회했으므로 **이번에는 우회하지 않고 그대로 넣어 관찰한다.**

## 5. 6가지 질문     <!-- tene:sec=questions -->

<!-- tene:auto:start block=questions generated=2026-08-20T10:44:11Z -->
### `orphans` · tier: indexed

| 질문 | 답변 | 출처 |
|---|---|---|
| Q1 이름 | `orphans` | indexed (high) |
| Q2 정의 파일 | `plugins/tene/lib/scan/query.js:128` | indexed (high) |
| Q3 import·참조 | `plugins/tene/test/unit/scan.test.js:10` | indexed (high) |
| Q4 호출·사용 | `plugins/tene/lib/scan/query.js:172` | indexed (high) |
| Q5 입력 | `index`, `{ includeTypes = false } = {}` | signature (low) |
| Q6 반환·변경 | **답하지 못함** | — |

### `advance` · tier: indexed

| 질문 | 답변 | 출처 |
|---|---|---|
| Q1 이름 | `advance` | indexed (high) |
| Q2 정의 파일 | `plugins/tene/lib/state/store.js:229` | indexed (high) |
| Q3 import·참조 | 없음 | indexed (medium) |
| Q4 호출·사용 | `plugins/tene/bin/tene-state:135`, `plugins/tene/bin/tene-state:135 (member-call)` 외 12건 | indexed (medium) |
| Q5 입력 | `root`, `id` | signature (low) |
| Q6 반환·변경 | **답하지 못함** | — |

### `formatSummary` · tier: indexed

| 질문 | 답변 | 출처 |
|---|---|---|
| Q1 이름 | `formatSummary` | indexed (high) |
| Q2 정의 파일 | `plugins/tene/lib/state/summary.js:79` | indexed (high) |
| Q3 import·참조 | `plugins/tene/test/unit/state-summary.test.js:7` | indexed (high) |
| Q4 호출·사용 | `plugins/tene/test/unit/state-summary.test.js:46`, `plugins/tene/test/unit/state-summary.test.js:52` 외 4건 | indexed (high) |
| Q5 입력 | `current`, `opts = {}` | signature (low) |
| Q6 반환·변경 | **답하지 못함** | — |

### `markStaleNoLock` · tier: indexed

| 질문 | 답변 | 출처 |
|---|---|---|
| Q1 이름 | `markStaleNoLock` | indexed (high) |
| Q2 정의 파일 | `plugins/tene/lib/state/store.js:437` | indexed (high) |
| Q3 import·참조 | `plugins/tene/lib/hooks/post-edit.js:17` | indexed (high) |
| Q4 호출·사용 | `plugins/tene/lib/hooks/post-edit.js:64`, `plugins/tene/test/unit/state-store.test.js:129` 외 1건 | indexed (medium) |
| Q5 입력 | `root`, `id` | signature (low) |
| Q6 반환·변경 | **답하지 못함** | — |

### `judgeAll` · tier: indexed

| 질문 | 답변 | 출처 |
|---|---|---|
| Q1 이름 | `judgeAll` | indexed (high) |
| Q2 정의 파일 | `plugins/tene/lib/loop/judge.js:287` | indexed (high) |
| Q3 import·참조 | `plugins/tene/lib/loop/run.js:14`, `plugins/tene/test/unit/loop.test.js:6` | indexed (high) |
| Q4 호출·사용 | `plugins/tene/lib/loop/run.js:95`, `plugins/tene/test/unit/loop.test.js:219` | indexed (high) |
| Q5 입력 | `requirements`, `ctx` | signature (low) |
| Q6 반환·변경 | **답하지 못함** | — |

### `nextActionFor` · tier: indexed

| 질문 | 답변 | 출처 |
|---|---|---|
| Q1 이름 | `nextActionFor` | indexed (high) |
| Q2 정의 파일 | `plugins/tene/lib/state/schema.js:163` | indexed (high) |
| Q3 import·참조 | `plugins/tene/lib/state/store.js:16` | indexed (high) |
| Q4 호출·사용 | `plugins/tene/bin/tene-state:145`, `plugins/tene/bin/tene-state:145 (member-call)` 외 2건 | indexed (medium) |
| Q5 입력 | `sprint` | signature (low) |
| Q6 반환·변경 | **답하지 못함** | — |

### `judgeBash` · tier: indexed

| 질문 | 답변 | 출처 |
|---|---|---|
| Q1 이름 | `judgeBash` | indexed (high) |
| Q2 정의 파일 | `plugins/tene/lib/guard/rules.js:105` | indexed (high) |
| Q3 import·참조 | `plugins/tene/bin/tene-guard:9`, `plugins/tene/test/guard-matrix.test.js:16` 외 1건 | indexed (high) |
| Q4 호출·사용 | `plugins/tene/bin/tene-guard:30`, `plugins/tene/test/guard-matrix.test.js:36` 외 4건 | indexed (high) |
| Q5 입력 | `payload` | signature (low) |
| Q6 반환·변경 | **답하지 못함** | — |

### `questions` · tier: needs-investigation

| 질문 | 답변 | 출처 |
|---|---|---|
| Q1 이름 | **답하지 못함** | — |
| Q2 정의 파일 | **답하지 못함** | — |
| Q3 import·참조 | 없음 | indexed (medium) |
| Q4 호출·사용 | **답하지 못함** | — |
| Q5 입력 | **답하지 못함** | — |
| Q6 반환·변경 | **답하지 못함** | — |
<!-- tene:auto:end -->

### 이 답변에서 드러난 것

이 표 자체가 이번 sprint 의 문제를 보여준다. **Q3·Q4 는 참조·호출 위치를 정확히 답하지만 그 위치가 프로덕션인지 테스트인지 말하지 않는다.** `orphans` 심볼을 보면 참조가 있고 confidence 가 high 이지만, 그 참조가 어디서 왔는지는 표에 없다.

Q6 는 여전히 전 심볼에서 `unanswered` 다 — D06 §4.3 의 `detectMutations()` 가 미구현이기 때문이며 RTM 1.11 이 확정한 사실이다.

**결론: 6질문은 "존재와 참조" 를 답하고 "도달" 은 답하지 않는다.** 이번 계측기가 그 빈칸을 외부에서 메운다.

## 6. 데이터 계약     <!-- tene:sec=contracts -->

| 대상 | 입력 | 출력 | 출처 |
|---|---|---|---|
| `reachability.mjs` | 배포본 루트 경로 | `{entrypoints[], classified{reachable,dynamic,testOnly,unreachable}, paths{}}` | 본 문서 L1 |
| `markStaleNoLock` | `(root, id, acIds, filePath)` | 전환된 AC id 배열 | D03 |
| `judgeBash` | PreToolUse 페이로드 | `{decision, reason}` | D11 |
| `orphans` | 인덱스 | 참조 0건 심볼 목록 | D06 |
| `formatSummary` | `current.json` | `{text, tokens, truncated}` | D05 |

## 7. 화면 전이 설계     <!-- tene:sec=transitions -->

**해당 없음.** AC 10건이 DATA 6 · UNIT 4 이며 UX 방식이 없다. 이 플러그인은 CLI 와 훅으로만 동작하고 화면이 없다.

전이 분모가 0 이므로 커버리지를 비율로 계산하지 않고 `not-applicable` 로 보고한다. 0/0 을 100% 로 쓰면 "전이를 다 봤다" 는 거짓이 된다.

## 8. AC 앵커 확정     <!-- tene:sec=anchors -->

| AC | 앵커 |
|---|---|
| ac_1 | `orphans` |
| ac_2 | `questions` |
| ac_3 | `advance` |
| ac_4 | `formatSummary` |
| ac_5 | `markStaleNoLock` |
| ac_6 | `judgeAll` |
| ac_7 | `nextActionFor` |
| ac_8 | `judgeBash` |
| ac_9 | `judgeAll` |
| ac_10 | `formatSummary` |

앵커는 코드 심볼이다. ac_1 이 `orphans` 를 가리키는 이유는 그 함수가 **현재의 도달성 판정 전부**이기 때문이다 — 참조 0건만 본다. 계측기가 그것과 무엇이 다른지가 이 sprint 의 답이다.

`questions` 는 인덱스에서 `needs-investigation` 으로 나온다. 파일명과 같은 이름이라 심볼로 해석되지 않는다. **그대로 둔다** — 앵커가 해석되지 않는 것도 관찰 결과다.

## +@ (자유 관점)

### 계측기를 플러그인 밖에 두는 이유

도달성 검사를 `lib/` 에 넣으면 그 자체가 배선을 필요로 한다. **배선을 검사하는 코드가 배선되지 않는 사고**가 바로 이 sprint 가 조사하는 실패다.

그래서 이번에는 `evals/` 아래 독립 스크립트로 두고 `node evals/reachability.mjs` 로 직접 실행한다. 진입점이 명령줄 하나뿐이라 배선될 여지가 없다.

플러그인에 넣는 것은 열린 결정 E-A 이며 사용자 판단이다.
