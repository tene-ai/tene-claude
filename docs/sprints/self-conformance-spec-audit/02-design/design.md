---
tene:
  sprint: self-conformance
  doc: design
  phase: design
  status: draft
  created: 2026-08-20
  modified: 2026-08-20
  lang: ko
  profile: strict
---

# self-conformance — Design

## 1. 설계 개요     <!-- tene:sec=overview -->

이 sprint 는 코드를 만들지 않는다. **검증 절차를 설계한다.**

그래서 이 문서의 4계층·6질문·앵커는 "새로 만들 것" 이 아니라 **판정 대상이 되는 기존 코드**를 가리킨다. 앵커의 역할도 평소와 다르다 — 평소엔 "이 AC 를 만족시킬 코드가 여기" 지만, 여기서는 "이 AC 가 관찰할 코드가 여기" 다. 코드가 바뀌면 stale 이 되는 성질은 동일하게 유효하다.

검증 대상은 **마켓플레이스 배포본** `~/.claude/plugins/cache/tene-ai/tene/0.1.0/` 이다. 인덱싱은 로컬 작업 트리에 대해 수행했고, 시작 시 `diff -rq` 로 두 트리가 빈 디렉토리를 제외하고 동일함을 확인했다.

## 2. Understanding Layer 분류     <!-- tene:sec=layers -->

<!-- tene:auto:start block=layers generated=2026-08-20T09:40:28Z -->
> 계층 키는 tene-scan 출력이고, 표기는 사람이 읽는 이름이다 (F-1 참조).

| 계층 | 파일 수 | 대표 경로 |
|---|---|---|
| Interface | 22 | `plugins/tene/bin/**`, `plugins/tene/lib/**`, `plugins/tene/workflows/**` |
| Business Logic | 39 | `plugins/tene/lib/**` |
| Persistence | 6 | `plugins/tene/lib/**` |
| Infrastructure | 3 | `scripts/**` |
| (test) | 24 | `plugins/tene/test/**` |
| **미분류** | 1 | `plugins/tene/lib/recover/resync.js` |
<!-- tene:auto:end -->

## 3. 계층 위반 점검     <!-- tene:sec=violations -->

<!-- tene:auto:start block=violations generated=2026-08-20T09:38:16Z -->
blockers **0** · warnings **20**

| 종류 | 건수 | 대표 |
|---|---|---|
| layer-skip | 20 | interface → persistence — plugins/tene/bin/tene-doc:10 |
<!-- tene:auto:end -->

### 판정

`bin/*` → `lib/state/*` 의 `layer-skip` 20건은 **의도된 것**이다. D00 §2 가 bin 을 "인자 파싱 + lib 호출만" 하는 얇은 진입점으로 정의했고, 상태를 읽는 것이 그 진입점의 일이다. 중간 계층을 하나 더 두면 통과만 하는 층이 생긴다.

`reverse` 는 0건이다. 이것이 blocker 판정 기준이며, 순환 의존의 씨앗이 없다는 뜻이다.

미분류 1건(`lib/recover/resync.js`)은 규칙에 `lib/recover/**` 가 없어서다. 추측으로 배정하지 않았다 — 이 파일은 상태를 문서에서 재구성하므로 persistence 로도, 복구 절차이므로 business-logic 으로도 읽힌다. 열린 결정 사항 D-D 로 올린다.

## 4. 처리 로직 상세     <!-- tene:sec=logic -->

### L1. RTM 전수 대조 (ac_1, ac_2)

**입력** — `docs/00-prd/06-requirements-traceability.md` 의 27개 행(1.1~1.20, 2.1~2.2, 3.1~3.3, 4.1~4.2). 각 행은 `원 요구사항` 과 `반영 위치`(문서 절 참조)를 갖는다.

**처리** — 항목마다 두 단계다.
1. `반영 위치` 가 가리키는 명세 절을 읽어 **무엇이 구현되어야 하는지** 확정한다.
2. 배포본에서 그것을 구현한 코드를 찾는다. 탐색 순서는 `bin/` → `lib/` → `skills/` → `agents/` → `hooks/` → `workflows/`.

**분기와 결과**

| 조건 | 판정 | 근거 형식 |
|---|---|---|
| 구현 코드를 찾았고 동작을 실행으로 확인 | `implemented` | `파일:라인` + 실행 결과 |
| 코드는 있으나 명세의 일부만 충족 | `partial` | `파일:라인` + 빠진 부분 |
| 코드를 찾지 못함 | `missing` | 탐색한 경로 목록 |
| 코드는 있으나 이 환경에서 실행·관찰 불가 | `unverifiable` | 왜 관찰할 수 없는지 |

**`missing` 과 `unverifiable` 의 구분이 ac_2 의 전부다.** 둘을 섞으면 "없는 것" 과 "못 본 것" 이 같아지고, 다음 sprint 가 무엇을 해야 하는지 알 수 없게 된다.

**실패 처리** — 27개 중 하나라도 판정하지 못하면 그 항목은 `unverifiable` 이며, ac_1 은 "각 항목에 판정을 기록" 을 요구하므로 `unverifiable` 도 기록이면 충족이다. 반면 판정 자체를 누락하면 ac_1 은 `failed` 다.

**부작용** — 없다. 읽기 전용이다.

### L2. 가드 매트릭스 실측 (ac_3)

**입력** — `test/fixtures/commands/guard-matrix.json` 의 케이스 정의. 각 케이스는 명령 문자열과 기대 판정(`allow`/`deny`/`ask`)을 갖는다.

**처리** — 러너가 각 케이스를 `judgeBash`/`judgeRead` 에 넣고 실제 판정을 기대값과 비교한다.

**분기**
- 기대 `allow` 인데 실제 `deny` → **오탐**(false positive). 정상 작업을 막는다.
- 기대 `deny` 인데 실제 `allow` → **미탐**(false negative). 시크릿이 새어 나간다.

**판정 기준** — 오탐 0 **그리고** 미탐 0 일 때만 충족. D13 §10 이 "타협 불가" 로 지정한 두 항목 중 하나다. 케이스 수가 D13 이 명세한 240 과 다르면 그 사실을 함께 기록한다 — 케이스 수 부족은 "통과했지만 덜 봤다" 이므로 통과율과 별개로 보고해야 한다.

### L3. 게이트 미평가 기록 (ac_6)

**입력** — 임시 프로젝트의 sprint 하나. 게이트 결과 없이 `advance --force` 를 호출한다.

**처리** — `advance()` 가 `gateId && !opts.gateResult && opts.force` 조건에서 `sprint.gates[gateId] = { result: 'skipped', forced: true, ... }` 를 기록한다.

**관찰 대상** 두 가지.
1. 상태 파일에 `skipped` + `forced: true` 가 남는가
2. `computeAcSummary` 와 게이트 통과 집계에서 `skipped` 가 `pass` 로 세어지지 않는가

두 번째가 본질이다. 기록만 남고 집계에서 통과로 세어지면 "건너뛴 게이트" 가 "통과한 게이트" 와 구분되지 않는다.

### L4. 봉투 동일성 (ac_7)

**입력** — 동일한 bin 명령을 두 경로로 호출한다.
- 대화형: 이 세션에서 직접 실행
- 헤드리스: `claude -p` 가 띄운 하위 세션에서 실행

**처리** — 두 결과의 JSON 최상위 키 집합을 비교한다. 비교 대상은 `ok`·`tool`·`schemaVersion`·`data`·`warnings` 이며, `elapsedMs` 는 값이 다를 수밖에 없으므로 **키의 존재만** 본다.

**분기** — 키 집합이 다르면 `failed`. 같으면 `passed`. 헤드리스 세션이 뜨지 않으면 `insufficient` 이며 그 이유를 기록한다.

## 5. 6가지 질문     <!-- tene:sec=questions -->

<!-- tene:auto:start block=questions generated=2026-08-20T09:38:37Z -->
### `judgeAll`  ·  tier: indexed

| 질문 | 답변 | 출처 |
|---|---|---|
| Q1 선언·정의된 이름 | `judgeAll` | indexed (high) |
| Q2 정의 파일 | `plugins/tene/lib/loop/judge.js:287` | indexed (high) |
| Q3 import·참조 위치 | `plugins/tene/lib/loop/run.js:14`, `plugins/tene/test/unit/loop.test.js:6` | indexed (high) |
| Q4 호출·사용 위치 | `plugins/tene/lib/loop/run.js:95`, `plugins/tene/test/unit/loop.test.js:219` | indexed (high) |
| Q5 입력 데이터 형태 | `requirements`, `ctx`, `opts = {}` | signature (low) |
| Q6 반환·변경 데이터 | **답하지 못함** | — |

### `kindOf`  ·  tier: indexed

| 질문 | 답변 | 출처 |
|---|---|---|
| Q1 선언·정의된 이름 | `kindOf` | indexed (high) |
| Q2 정의 파일 | `plugins/tene/lib/loop/judge.js:272` | indexed (high) |
| Q3 import·참조 위치 | `plugins/tene/test/unit/loop.test.js:6` | indexed (high) |
| Q4 호출·사용 위치 | `plugins/tene/lib/loop/judge.js:314`, `plugins/tene/test/unit/loop.test.js:191`, `plugins/tene/test/unit/loop.test.js:192` | indexed (high) |
| Q5 입력 데이터 형태 | `judgment`, `reason`, `wasImplemented` | signature (low) |
| Q6 반환·변경 데이터 | **답하지 못함** | — |

### `judgeBash`  ·  tier: indexed

| 질문 | 답변 | 출처 |
|---|---|---|
| Q1 선언·정의된 이름 | `judgeBash` | indexed (high) |
| Q2 정의 파일 | `plugins/tene/lib/guard/rules.js:105` | indexed (high) |
| Q3 import·참조 위치 | `plugins/tene/bin/tene-guard:9`, `plugins/tene/test/guard-matrix.test.js:16`, `plugins/tene/test/unit/guard.test.js:9` | indexed (high) |
| Q4 호출·사용 위치 | `plugins/tene/bin/tene-guard:30`, `plugins/tene/test/guard-matrix.test.js:36`, `plugins/tene/test/guard-matrix.test.js:49` 외 3건 | indexed (high) |
| Q5 입력 데이터 형태 | `payload` | signature (low) |
| Q6 반환·변경 데이터 | **답하지 못함** | — |

### `computeAcSummary`  ·  tier: indexed

| 질문 | 답변 | 출처 |
|---|---|---|
| Q1 선언·정의된 이름 | `computeAcSummary` | indexed (high) |
| Q2 정의 파일 | `plugins/tene/lib/state/schema.js:139` | indexed (high) |
| Q3 import·참조 위치 | `plugins/tene/lib/state/store.js:16` | indexed (high) |
| Q4 호출·사용 위치 | `plugins/tene/bin/tene-state:168`, `plugins/tene/bin/tene-state:168 (member-call)`, `plugins/tene/lib/state/schema.js:165` 외 3건 | indexed (medium) |
| Q5 입력 데이터 형태 | `ac = []` | signature (low) |
| Q6 반환·변경 데이터 | **답하지 못함** | — |

### `run`  ·  tier: indexed

| 질문 | 답변 | 출처 |
|---|---|---|
| Q1 선언·정의된 이름 | `run` | indexed (high) |
| Q2 정의 파일 | `plugins/tene/lib/hooks/compact.js:34`, `plugins/tene/lib/hooks/post-bash.js:28`, `plugins/tene/lib/hooks/post-edit.js:33` | indexed (high) |
| Q3 import·참조 위치 | `plugins/tene/bin/tene-doc:6`, `plugins/tene/bin/tene-gate:13`, `plugins/tene/bin/tene-loop:7` 외 4건 | indexed (high) |
| Q4 호출·사용 위치 | `plugins/tene/bin/tene-doc:80`, `plugins/tene/bin/tene-gate:169`, `plugins/tene/bin/tene-hook:50` 외 11건 | indexed (medium) |
| Q5 입력 데이터 형태 | `payload`, `event` | signature (low) |
| Q6 반환·변경 데이터 | **답하지 못함** | — |

### `advance`  ·  tier: indexed

| 질문 | 답변 | 출처 |
|---|---|---|
| Q1 선언·정의된 이름 | `advance` | indexed (high) |
| Q2 정의 파일 | `plugins/tene/lib/state/store.js:229` | indexed (high) |
| Q3 import·참조 위치 | 없음 | indexed (medium) |
| Q4 호출·사용 위치 | `plugins/tene/bin/tene-state:135`, `plugins/tene/bin/tene-state:135 (member-call)`, `plugins/tene/test/unit/state-store.test.js:89` 외 11건 | indexed (medium) |
| Q5 입력 데이터 형태 | `root`, `id`, `toPhase` | signature (low) |
| Q6 반환·변경 데이터 | **답하지 못함** | — |

### `ok`  ·  tier: indexed

| 질문 | 답변 | 출처 |
|---|---|---|
| Q1 선언·정의된 이름 | `ok` | indexed (high) |
| Q2 정의 파일 | `plugins/tene/lib/doc/validate.js:36`, `plugins/tene/lib/util/envelope.js:13` | indexed (high) |
| Q3 import·참조 위치 | `plugins/tene/bin/tene-gate:13` | indexed (high) |
| Q4 호출·사용 위치 | `plugins/tene/lib/doc/validate.js:45`, `plugins/tene/lib/doc/validate.js:53`, `plugins/tene/lib/doc/validate.js:60` 외 302건 | indexed (medium) |
| Q5 입력 데이터 형태 | `id`, `extra = {}` | signature (low) |
| Q6 반환·변경 데이터 | **답하지 못함** | — |

### `nextActionFor`  ·  tier: indexed

| 질문 | 답변 | 출처 |
|---|---|---|
| Q1 선언·정의된 이름 | `nextActionFor` | indexed (high) |
| Q2 정의 파일 | `plugins/tene/lib/state/schema.js:163` | indexed (high) |
| Q3 import·참조 위치 | `plugins/tene/lib/state/store.js:16` | indexed (high) |
| Q4 호출·사용 위치 | `plugins/tene/bin/tene-state:145`, `plugins/tene/bin/tene-state:145 (member-call)`, `plugins/tene/lib/state/schema.js:114` 외 1건 | indexed (medium) |
| Q5 입력 데이터 형태 | `sprint` | signature (low) |
| Q6 반환·변경 데이터 | **답하지 못함** | — |

### `judgeRead`  ·  tier: indexed

| 질문 | 답변 | 출처 |
|---|---|---|
| Q1 선언·정의된 이름 | `judgeRead` | indexed (high) |
| Q2 정의 파일 | `plugins/tene/lib/guard/rules.js:153` | indexed (high) |
| Q3 import·참조 위치 | `plugins/tene/bin/tene-guard:9`, `plugins/tene/test/guard-matrix.test.js:16`, `plugins/tene/test/unit/guard.test.js:9` | indexed (high) |
| Q4 호출·사용 위치 | `plugins/tene/bin/tene-guard:30`, `plugins/tene/test/guard-matrix.test.js:61`, `plugins/tene/test/guard-matrix.test.js:65` 외 2건 | indexed (high) |
| Q5 입력 데이터 형태 | `payload` | signature (low) |
| Q6 반환·변경 데이터 | **답하지 못함** | — |

### `formatSummary`  ·  tier: indexed

| 질문 | 답변 | 출처 |
|---|---|---|
| Q1 선언·정의된 이름 | `formatSummary` | indexed (high) |
| Q2 정의 파일 | `plugins/tene/lib/state/summary.js:79` | indexed (high) |
| Q3 import·참조 위치 | `plugins/tene/test/unit/state-summary.test.js:7` | indexed (high) |
| Q4 호출·사용 위치 | `plugins/tene/test/unit/state-summary.test.js:46`, `plugins/tene/test/unit/state-summary.test.js:52`, `plugins/tene/test/unit/state-summary.test.js:61` 외 3건 | indexed (high) |
| Q5 입력 데이터 형태 | `current`, `opts = {}` | signature (low) |
| Q6 반환·변경 데이터 | **답하지 못함** | — |
<!-- tene:auto:end -->

### 이 답변에서 드러난 것

**Q6 가 전 심볼에서 `unanswered` 다.** 인덱서는 시그니처만 보므로 JS 처럼 타입 표기가 없는 언어에서는 반환·변경 데이터를 답할 수 없다. 이것은 결함이 아니라 **정직한 한계 보고**이며, D06 이 정한 "못 답하면 못 답한다고 말한다" 가 실제로 지켜지고 있다는 증거다. 다만 README 가 Q6 를 "가장 중요한 질문" 으로 규정하므로, 이 한계는 사용자가 사람 손으로 채워야 하는 칸임을 뜻한다.

**Q3 에 네임스페이스 import 사각지대가 있다.** `advance` 의 Q3 는 "import 하는 파일이 없습니다" 인데, 실제로는 `bin/tene-state` 가 `import * as store` 로 가져간다. Q4 는 호출 위치(`bin/tene-state:135`)를 정확히 찾았으므로 실사용 추적은 되지만, Q3 만 보면 orphan 으로 오독할 수 있다. 결함 후보로 기록한다.

## 6. 데이터 계약     <!-- tene:sec=contracts -->

| 대상 | 입력 스키마 | 출력 스키마 | 출처 |
|---|---|---|---|
| `bin/*` 공통 봉투 | CLI 인자 + 선택적 stdin JSON | `{ok, tool, schemaVersion, data, warnings, elapsedMs}` \| `{ok:false, error:{code,detail,hint}}` | D08 §1 |
| `judgeBash` | `{command}` (PreToolUse 페이로드) | `{decision: allow\|deny\|ask, reason}` | D11 §3 |
| `judgeAll` | `requirements[]`, `ctx` | `{judgments[], score}` — 판정 어휘 4종 | D07 §2 |
| `advance` | `(root, id, to, {force, gateResult, expectedRev})` | `{from, to, gate, forced, sprint}` | D03 §5 |
| `computeAcSummary` | `ac[]` | `{total, passed, failed, insufficient, stale, pending, blockingPending, blockingFailed, waived}` | D03 §4 |
| `formatSummary` | `current.json`, `{budget}` | `{text, tokens, truncated}` — 600 토큰 예산 | D05 §3.3 |

## 7. 화면 전이 설계     <!-- tene:sec=transitions -->

**해당 없음.** 이 sprint 의 AC 10건은 전부 UNIT(5) 또는 DATA(5) 이며 UX 방식이 없다. 검증 대상이 CLI 와 훅이라 화면 전이가 존재하지 않는다.

전이 커버리지의 분모가 0 이므로 QA 단계에서 커버리지 비율을 계산하지 않고 `not-applicable` 로 보고한다. 0/0 을 100% 로 표기하면 "전이를 다 봤다" 는 거짓이 된다.

## 8. AC 앵커 확정     <!-- tene:sec=anchors -->

| AC | 앵커 |
|---|---|
| ac_1 | `judgeAll` |
| ac_2 | `kindOf` |
| ac_3 | `judgeBash` |
| ac_4 | `computeAcSummary` |
| ac_5 | `run` |
| ac_6 | `advance` |
| ac_7 | `ok` |
| ac_8 | `nextActionFor` |
| ac_9 | `judgeRead` |
| ac_10 | `formatSummary` |

앵커는 **파일 경로가 아니라 코드 심볼**이다. 파일 경로 앵커는 그 파일 안에서 무엇이 바뀌든 stale 이 되지 않아 앵커의 목적을 잃는다.

## +@ (자유 관점)

### 이 설계가 스스로 만든 순환

ac_2 는 "missing 과 unverifiable 을 구분해 기록" 을 요구하고, 그 판정을 내리는 코드가 `kindOf`(ac_2 의 앵커)다. 즉 **판정 로직이 자기 자신의 판정 대상**이다.

이 순환을 끊는 방법은 하나뿐이다 — `kindOf` 의 판정을 `kindOf` 로 검사하지 않고, 코드를 직접 읽고 테스트를 직접 실행해 교차 확인한다. Plan §5 의 첫 번째 위험 대비가 이것이며, QA 단계에서 blocking AC 에 한해 적용한다.

### 열린 결정 사항 (PRD §8 에 추가)

| # | 결정할 것 | 선택지 | 기본 제안 |
|---|---|---|---|
| D-D | `lib/recover/**` 의 계층 | persistence / business-logic / 미분류 유지 | 미분류 유지 후 사용자 판단 |
