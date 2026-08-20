# tene plugin — tene-codex와의 관계 정립 및 차용 범위

> 작성: 2026-08-20 · 근거: `/Users/kaykim/Documents/GitHub/agent-kay-it/tene-codex` 전체 문서 정독
> 결론 요약: **개념과 문서 규약은 차용한다. 런타임은 공유하지 않는다.**

---

## 0. 결론

| 항목 | 결정 |
|---|---|
| `tene-workflow` Go CLI 공유 | ❌ **하지 않는다** |
| 개념·데이터 모델 차용 | ✅ 한다 (Intent/AC, blocking, waiver, 7-Layer QA, evidence manifest, Profile) |
| 문서 규약 통일 | ✅ 한다 (`docs/sprints/` 구조와 문서 양식) — **상호 읽기 가능성 확보** |
| 상태 디렉토리 | **`.tene-claude/`** — 어댑터별 분리 |
| 플러그인명 | **`tene`** (호출 `/tene:*`) |
| 라이선스 | **Apache-2.0** (tene-codex와 동일) |
| 런타임 기반 | **Claude Code 네이티브** + 경량 Node 스크립트 |

### 왜 공유하지 않는가

`tene-workflow` 는 **Codex에 Dynamic Workflow가 없기 때문에** 만드는 대체물이다. Claude Code에는 그 자리를 채우는 네이티브 기능이 이미 있다. 없는 것을 만든 도구를, 있는 쪽이 도로 가져다 쓰는 것은 역방향이다.

게다가 공유는 세 가지 비용을 만든다.

| 비용 | 내용 |
|---|---|
| **일정 종속** | `tene-workflow` 는 아직 pre-alpha 다. 의존하면 tene-claude 는 코어가 나올 때까지 착수 불가 |
| **릴리즈 커플링** | 코어 스키마가 바뀔 때마다 어댑터가 따라가야 한다 |
| **설치 부담** | 플랫폼별 Go 바이너리 번들 + checksum 검증. Claude Code 플러그인은 Node만으로 충분한데 배포 복잡도만 올라간다 |

---

## 1. 기능 대응 — Claude Code 네이티브로 무엇이 대체되는가

`tene-workflow` 의 command tree 를 기준으로 하나씩 따진다.

| tene-workflow 명령 | Claude Code 네이티브 대응 | 판정 |
|---|---|---|
| `sprint create/start/list/archive` | Skill 로직 + 상태 파일 | ✅ 대체 |
| `phase show/transition --dry-run` | Skill + **Hook(TaskCompleted exit 2)** | ✅ **더 강함** — 호스트가 완료 선언을 차단해준다 |
| `task add/start/complete/block/defer` | **Task Management (`blockedBy`)** | ✅ **더 강함** — 의존 해제를 호스트가 자동 관리 |
| `intent capture/confirm/revise` | Skill + `AskUserQuestion` + 문서 | ✅ 대체 |
| `document scaffold/validate/sync` | Skill + 경량 스크립트 | ✅ 대체 |
| `graph build/trace/impact` | **LSP** + Grep/Glob + **서브에이전트 격리** | ⚠️ 정밀도 낮음 (§3) |
| `context build --budget` | Skill 로직 + **서브에이전트 컨텍스트 격리** | ✅ **더 강함** — 조사 내용이 메인 컨텍스트에 안 들어옴 |
| `loop check/record-gap/resolve-gap` | Skill + **Dynamic Workflow** | ✅ 대체 |
| `qa plan/run/evaluate` | **Dynamic Workflow** (수집→판정→적대적 반박 pipeline) | ✅ **더 강함** (§2) |
| `evidence register/verify` | 파일 + `sha256sum` (Bash) | ✅ 대체 |
| `waiver request/approve/expire` | Skill + 상태 파일 | ✅ 대체 |
| `report generate/validate` | Skill + 경량 스크립트 | ✅ 대체 |
| `compact/clear/doctor/migrate` | Skill + 경량 스크립트 | ✅ 대체 |
| **원자적 상태 쓰기 · lock · revision** | ❌ 네이티브 없음 | **경량 스크립트 필요** (§4) |

**결론**: 15개 명령군 중 14개가 네이티브로 대체되거나 더 강해진다. 남는 하나가 상태 파일의 결정론적 조작인데, 이건 Go 바이너리가 아니라 **작은 Node 스크립트로 충분하다.**

---

## 2. Dynamic Workflow 가 QA에서 더 강한 이유

`tene-workflow qa` 가 코드로 구현할 오케스트레이션을, Claude Code는 런타임이 제공한다.

```javascript
// qa-sweep.js — AC별 팬아웃, 수집/판정/반박 분리가 스크립트로 표현된다
const results = await pipeline(
  acs,
  ac  => agent(`Gather evidence for ${ac.id}. Collect observations ONLY.`, {phase:'Collect', schema: EVIDENCE}),
  (ev, ac) => agent(`Judge "${ac.statement}" against ${JSON.stringify(ev)}.
                     Verdict ∈ {passed, failed, insufficient}.`, {phase:'Judge', schema: VERDICT})
              .then(v => ({ac, ev, v})),
  r   => r.v.verdict !== 'passed' ? r :
         parallel(['correctness','edge-case','evidence-sufficiency'].map(lens => () =>
           agent(`Using the ${lens} lens, REFUTE this pass verdict.`, {phase:'Refute', schema: REFUTE})))
         .then(vs => ({...r, refuted: vs.filter(Boolean).filter(x=>x.refuted).length >= 2})),
)
```

이 한 파일이 tene-codex 설계의 **"Independent evaluator + adversarial verification"** 을 그대로 구현한다. 그리고 Claude Code가 무료로 얹어주는 것들이 있다:

| 이점 | 내용 |
|---|---|
| **컨텍스트 격리** | 중간 결과가 스크립트 변수에 머문다. 메인 컨텍스트에 최종 답만 들어온다 |
| **재개** | 같은 세션 내에서 중단 후 재개, 완료 에이전트는 캐시 반환 |
| **동시성 관리** | 최대 16 동시, 1000 총량 캡을 런타임이 관리 |
| **프롬프트 캐시 공유** | 같은 프리픽스 에이전트끼리 캐시를 읽는다 |
| **진행 가시화** | `/workflows` 뷰에서 단계별 토큰·시간·결과 |
| **스키마 검증** | `schema` 옵션이 도구 호출 층에서 검증하고 불일치 시 모델이 재시도 |

`tene-workflow` 가 Go로 구현해야 할 것들이다. Claude Code 쪽은 **런타임이 이미 한다.**

### 2.1 Dynamic Workflow 의 한계 (정직하게)

| 한계 | 영향 | 대응 |
|---|---|---|
| 스크립트에서 파일시스템·셸 접근 불가 | 상태를 직접 못 씀 | 에이전트가 `bin/` 스크립트를 호출해 쓴다 |
| 실행 중 사용자 입력 불가 | PRD 인터뷰를 워크플로로 못 함 | 인터뷰는 스킬(메인 스레드)에서. 워크플로는 검증·감사에만 |
| 모듈 로딩 불가 | 라이브러리 사용 불가 | 계산은 에이전트가 `bin/` 스크립트로 |
| `Date.now()`/`Math.random()` 불가 | 타임스탬프 생성 불가 | 워크플로 반환 후 스탬프, 또는 `args` 로 주입 |
| 재개는 같은 세션 내에서만 | 세션 종료 시 처음부터 | 상태를 파일에 남겨 스킬 수준에서 재개 |
| v2.1.154+ 필요 | 하위 버전 미지원 | 순차 서브에이전트로 degrade |

**핵심**: 워크플로는 **오케스트레이터이지 상태 저장소가 아니다.** 그래서 경량 스크립트가 여전히 필요하다(§4).

---

## 3. 그래프 — 유일하게 tene-workflow 가 앞서는 영역

`tene-workflow graph` 는 통합 그래프(Intent/AC/Journey/Symbol/DataShape/Evidence 노드 + 12종 엣지)를 만든다. Claude Code 네이티브에는 이에 대응하는 것이 없다.

**우리의 대응 — 범위를 줄인다.**

| tene-codex 그래프 | tene-claude 대응 |
|---|---|
| 통합 그래프 DB (nodes.ndjson + edges.ndjson + index) | **역인덱스 2개만** — `anchors.json`(AC↔파일), `symbols.json`(심볼↔위치/참조) |
| `impact <node>` 다중 홉 순회 | **1홉 조회** + 필요 시 서브에이전트 조사 |
| Provider 5단계 negotiation | **3단계** — LSP(있으면) → 경량 인덱서 → 서브에이전트 조사 |
| `confidence` 실수값 | `high｜medium｜low` 3단계 |

**근거**: 이 플러그인이 그래프에서 실제로 필요로 하는 것은 두 가지뿐이다.

1. **6가지 질문에 답하기** — 정의·참조·호출·입출력. 1홉 조회로 충분하다
2. **편집된 파일 → 영향 AC 찾기** — `PostToolUse` 훅의 200ms 예산 안에서. 역인덱스 O(1) 조회

다중 홉 영향 분석은 **있으면 좋지만 없어도 제품이 성립한다.** 없는 것은 없다고 표기하고(§5 정직성), 필요하면 서브에이전트가 조사한다. Go 그래프 엔진을 기다릴 이유가 되지 않는다.

---

## 4. 남는 것 — 경량 스크립트 5종

Claude Code 네이티브로 대체되지 않는 것만 남긴다. **전부 순수 Node, 외부 의존 0.**

| 스크립트 | 책임 | 왜 스크립트여야 하는가 |
|---|---|---|
| `tene-state` | 상태 JSON의 원자적 읽기/쓰기, revision 비교, 이벤트 append | LLM이 JSON을 손편집하면 깨진다. 원자성·동시성은 결정론이 필요 |
| `tene-doc` | 문서 섹션 앵커 파싱, 필수 항목 검증, 자동 블록 patch | 검증 규칙이 비결정적이면 게이트가 무의미해진다 |
| `tene-scan` | 심볼 정의/참조/import 인덱스, 계층 판정 | 훅 200ms 예산. 매번 grep 하면 못 지킨다 |
| `tene-gate` | 상태를 읽어 게이트 판정 | 게이트는 반드시 결정론적이어야 한다 |
| `tene-guard` | 시크릿 명령 차단 (fail-closed) | 보안 판정에 LLM 개입 금지 |

**총량 추정**: 5개 합쳐 2,000~3,000 LOC. Go 바이너리 배포·플랫폼 매트릭스·checksum 검증이 필요 없다.

> 이것이 08번 문서의 원래 설계다. tene-codex 정독 후 이를 폐기하려 했던 것이 잘못이었고, **원안이 맞다.**

---

## 5. tene-codex 에서 차용하는 것 (개념·스키마)

런타임은 공유하지 않지만, **설계 개념은 tene-codex 쪽이 더 성숙하다.** 다음을 채택한다.

### 5.1 Intent / AC 분리 ✅ 채택

기존 tene-claude 설계는 AC만 있었다.

```ts
Intent { intent_id, status: candidate|confirmed|superseded|deprecated,
         statement, rationale, actors, desired_outcomes, non_goals, policies,
         source: { kind: conversation|document|user, locator } }

AcceptanceCriterion { ac_id, intent_id, statement,
                      priority: blocking | non-blocking,
                      observable, preconditions, expected[], forbidden[] }
```

**왜 나은가**
- `source.kind: conversation` + `locator` 가 **"어느 대화에서 나온 의도인가"** 를 추적한다. 사용자 요구인 "대화에서 의도 추출·보관"의 정확한 구현
- 의도 변경을 in-place rewrite 가 아니라 **supersede** 로 표현 → 변경 이력이 남는다
- `forbidden[]` — "이러면 안 된다"를 기준에 명시한다
- 하나의 의도가 여러 AC를 낳는 관계를 표현할 수 있다

**Claude 어댑터에서의 저장**: 별도 DB 없이 PRD 문서의 두 표(Intent 표 + AC 표)로 표현하고, `tene-state` 가 요약을 상태 파일에 미러링한다.

### 5.2 "100%" 의 정의 변경 ✅ 채택

| 기존 (내 설계) | 변경 |
|---|---|
| 일치율 백분율 ≥ 100% | **blocking AC 전부가 evidence 로 증명됨** |

```text
for each blocking AC:
  reject if no charter
  reject if required layer unresolved
  reject if verdict != passed
  reject if evidence hash/freshness invalid
reject if open blocker gap or expired waiver
otherwise pass
```

백분율은 분모를 줄이면 조작되고, 평균은 치명적 결함을 희석한다. **blocking 은 이진 판정, non-blocking 은 점수와 debt 로 표시하되 blocker 를 상쇄하지 않는다.**

단 loop-check 의 **진행 표시용 백분율**은 유지한다 — 사용자가 "얼마나 남았나"를 알아야 한다. 게이트 판정에는 쓰지 않는다.

### 5.3 Waiver ✅ 채택

내 설계에 없던 개념. blocking AC 를 **명시적으로 예외 승인**하는 절차.

없으면 사용자는 게이트에 막혔을 때 AC를 몰래 지우거나 non-blocking 으로 강등한다. **예외를 절차로 만들어야 기록에 남는다.**

```
/tene:sprint waiver --ac ac_xxx --reason "..." --expires 2026-09-30
```

### 5.4 QA 7-Layer ✅ 채택 (3갈래 대체)

| 기존 | 변경 |
|---|---|
| UNIT / DATA / UX | L1 Static · L2 Unit/Contract · L3 Integration/Data · L4 System E2E · L5 Intent/UX · **L6 Adversarial/Recovery** · **L7 Regression/Drift** |

3갈래는 L6(실패·권한·retry·rollback)와 L7(회귀)을 놓친다. 각 레이어에 `required` / `not-applicable(reason)` / `waived` 중 하나를 **반드시 기록**한다.

### 5.5 Test Charter + Evidence Manifest ✅ 채택

```ts
TestCharter { charter_id, ac_ids[], actor, preconditions[], steps[],
              variants: happy|alternate|empty|error|permission|retry|recovery,
              forbidden_outcomes[], required_layers[], risk }

EvidenceManifest { run_id, sprint_id, environment, tool_versions,
                   cases[{case_id, ac_ids, status, assertions, artifacts}],
                   redaction: { policy_version, scan_status } }
Artifact { id, kind, uri, sha256, size, created_at }
```

**규칙 차용**: *"screenshot 단독은 data flow 를 증명하지 않는다"*, *"deterministic assertion 을 LLM 판단으로 뒤집을 수 없다"*.

### 5.6 Verdict 용어 ✅ 채택

| 기존 | 변경 |
|---|---|
| `pass` / `fail` / `not_measured` | `passed` / `failed` / `insufficient` / `not-applicable` |

`insufficient`(증거 누락·오염·stale)와 `not-applicable`(승인된 근거로 해당 없음)을 구분하는 것이 정확하다.

### 5.7 Phase 명칭 ✅ 채택

`draft｜prd｜plan｜design｜do｜loop-check｜qa｜report｜archived`

`check` → **`loop-check`** 로 개명. 사용자 원 요구사항의 표현("loop check")과도 일치한다.

### 5.8 Profile ✅ 채택 (Trust Level 과 병행)

| 축 | 값 | 의미 |
|---|---|---|
| **Profile** | `strict｜standard｜light｜off` | 규율 강도 (기본 `standard`) |
| **자동 진행** | `--auto-until <phase>` | 사용자 확인 없이 진행할 상한 |

두 개념은 축이 다르다. `light` 는 **필수 섹션 수만 줄고 파일·phase·guard 는 유지한다** — 단계를 건너뛰지 않는다 (D02 §3.1).

기존 Trust Level L0~L4 는 `--auto-until` 로 대체한다(같은 개념의 더 명확한 표현).

### 5.9 ID 체계 ✅ 부분 채택

`sprint_`, `task_`, `intent_`, `ac_`, `run_`, `evidence_`, `waiver_` 접두사는 채택. **ULID 대신 짧은 슬러그 + 순번**을 쓴다(`ac_1`, `intent_2`) — 사람이 문서에서 읽고 쓰는 값이므로.

### 5.10 채택하지 않는 것

| 항목 | 이유 |
|---|---|
| Event journal 해시 체인 | MVP 과잉. 단순 append NDJSON 으로 시작하고, 감사 요구가 생기면 추가 |
| `revision` uint64 + `--expected-revision` | 단일 사용자 시나리오에서 과잉. `updatedAt` 비교 낙관적 잠금으로 충분 |
| Provider 5단계 + confidence 실수 | 3단계 + 3등급으로 축소 (§3) |
| 통합 그래프 DB | 역인덱스 2개로 축소 (§3) |
| App Server / 원격 orchestration | Claude Code 에 해당 개념 없음 |
| Go 바이너리 배포 | Node 스크립트로 충분 |

---

## 6. 문서 규약 통일 — 유일한 실질적 호환 지점

런타임은 분리하지만 **`docs/sprints/` 는 통일한다.**

```
docs/sprints/
├── master-plan.md
├── _meta/layers.yml
├── <sprint-id>-<slug>/
│   ├── 00-prd/prd.md
│   ├── 01-plan/plan.md
│   ├── 02-design/design.md
│   ├── 03-analysis/{loop-check-1.md, qa.md}
│   ├── 04-report/report.md
│   └── evidence/
└── _archive/YYYY-MM/<sprint-id>-<slug>/
```

**이유**: 문서가 정본이고 상태는 파생물이다. 문서 규약만 같으면

- Codex 로 만든 sprint 문서를 Claude 가 읽고 이어받을 수 있다 (`/tene:sprint status --resync` 로 상태 재구성)
- 반대도 가능하다
- 팀에서 사람마다 다른 호스트를 써도 산출물이 일관된다

**상태 디렉토리는 분리한다.**

| 디렉토리 | 소유 | git |
|---|---|---|
| `docs/sprints/` | **공유** (문서 = 정본) | 커밋 |
| `.tene-claude/` | Claude 어댑터 | 상태만 커밋, 인덱스는 ignore |
| `.tene-workflow/` | Codex 어댑터 | (tene-codex 소관) |
| `.tene/` | tene 시크릿 CLI | ignore |

> 상태 디렉토리를 같은 이름으로 두면 "스키마 호환"을 암시하는데, 실제로는 다르다. **다른 이름이 정직하다.**

---

## 7. 확정된 명칭 (D1 · D7 해소)

| 항목 | 확정 | 근거 |
|---|---|---|
| **플러그인명** | `tene` | tene-codex 와 동일 브랜드 |
| **Claude 호출** | `/tene:sprint`, `/tene:prd` … | Claude Code 네임스페이스 규약 |
| **스킬 디렉토리** | `tene-sprint`, `tene-prd`, `tene-loop-check` … | tene-codex 와 파일명 정합 (이식·비교 용이) |
| **상태 디렉토리** | **`.tene-claude/`** | 어댑터별 분리. `.tene/`(시크릿)·`.tene-workflow/`(Codex)와 명확히 구분 |
| **문서 루트** | `docs/sprints/<sprint-id>-<slug>/` | tene-codex 와 통일 |
| **경량 스크립트** | `bin/tene-{state,doc,scan,gate,guard}` | 어댑터 로컬 |
| **라이선스** | **Apache-2.0** | tene-codex 와 동일 |
| **저장소** | `tene-claude` | 어댑터별 저장소 |

---

## 8. 이 결정으로 달라지는 것

### 8.1 개발 착수 가능 시점

| 이전 (코어 공유 안) | 현재 (네이티브 안) |
|---|---|
| `tene-workflow` MVP 완성까지 **착수 불가** | **지금 착수 가능** |

### 8.2 기존 문서 수정 범위

| 문서 | 수정 |
|---|---|
| 01 PRD | Trust Level → Profile + `--auto-until`. Intent/AC 분리 반영. FR-4에 waiver 추가 |
| 02 아키텍처 | `.tene-flow/` → `.tene-claude/`. CIA 3-Tier 유지(명칭만 Provider 정합). ADR에 "코어 비공유" 근거 추가 |
| 03 문서 표준 | PRD에 Intent 표 추가, AC 표에 `priority` 열 추가. QA 문서를 7-Layer 구조로. verdict 용어 변경 |
| 04 상태·트리거 | 상태 스키마에 intent/waiver 추가. 디렉토리명 변경 |
| 05 tene CLI | 변경 없음 |
| 06 RTM | D1/D7/D8/D11 확정 반영 |
| 07 스킬·에이전트 | 스킬명 `tene-*`. `check`→`loop-check`. `tene-status` 분리 |
| 08 런타임 계약 | **유지** (원안이 맞았음). verdict 용어와 게이트 규칙만 정합화 |
| 09 멀티 sprint | 변경 없음 |
| 10 알고리즘 | 일치율 → 진행 표시용 격하. 게이트는 blocking AC 규칙으로 교체 |
| 11 배포·자체QA | Apache-2.0 명시. Go 바이너리 관련 내용 제거 |

### 8.3 tene-codex 와의 관계

| 관계 | 내용 |
|---|---|
| 코드 | 공유 없음 |
| 개념·스키마 | tene-claude 가 tene-codex 를 따른다 |
| 문서 규약 | 통일 (양방향 읽기 가능) |
| 상태 | 분리 |
| 개선 역류 | tene-claude 에서 나온 것 중 유용한 것은 tene-codex 에 제안 (§9) |

---

## 9. tene-codex 에 역제안할 만한 것

tene-claude 설계에서 나왔으나 tene-codex 문서에 없는 것.

| # | 제안 | 근거 |
|---|---|---|
| **P-1** | **언어 무관 섹션 앵커** `<!-- tene:sec=nongoals -->` | 문서가 사용자 언어를 따르면 제목 문자열 검증이 깨진다. HTML 주석은 컨텍스트 주입 전 제거되어 토큰 비용 0 |
| **P-2** | **`/tene:understand` 같은 단독 진입점** | 사이클 도입 없이 6질문+4계층만 써볼 수 있는 진입점. 도입 장벽 완화 |
| **P-3** | **미귀속 변경 검사** | 이번 sprint 에서 바뀌었는데 어떤 AC 에도 앵커되지 않은 파일을 보고. 스펙 밖 변경 유입 차단 |
| **P-4** | **report R1 "연결이 끊긴 지점"** | 이전 sprint 산출물이 이번 변경으로 고아가 되는 것을 탐지 |
| **P-5** | **계층 규칙 파일** `docs/sprints/_meta/layers.yml` | 계층 분류를 프로젝트가 커밋해 팀이 공유. 경로명 추정보다 신뢰도 높음 |
| **P-6** | **loop 수렴 감지** | 연속 2회 개선 없으면 상한 전에 정지. 접근법 자체가 잘못된 경우 조기 발견 |

---

## 10. 남은 미결정

| # | 항목 | 제안 |
|---|---|---|
| D2 | 문서 루트 경로 | `docs/sprints/` (userConfig 로 변경 가능) |
| D3 | loop-check 반복 상한 | **3회** (tene-codex 기본값과 통일) |
| D6 | UX 검증 도구 우선순위 | Chrome MCP → Playwright → `not-applicable` |
| D10 | 문서 언어 | 감지 후 첫 sprint 에서 고정, `_meta/` 에 기록 |
| D12 | 워크플로 전환 기준 | AC 8개 이상 또는 명시 요청 |
| **D14** | Intent/AC 를 문서 표로만 둘지, 상태에도 전량 미러링할지 | **요약만 미러링** (문서가 정본, 상태는 판정 캐시) |
