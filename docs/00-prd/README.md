# 00-prd — tene plugin 기획 요구사항 및 아키텍처 설계

> 작성일: 2026-08-20 · 선행 조사: [docs/00-rnd](../00-rnd/README.md)
> 대상: Claude Code plugin `tene` (독립 배포)

---

## 문서 목록

**Why / What — 무엇을 왜 만드는가**

| # | 문서 | 다루는 것 |
|---|---|---|
| 01 | [제품 요구사항 (PRD)](./01-product-requirements.md) | 문제 정의, 제품 원칙, 사용자·시나리오, FR 8군 / NFR 10항, report 필수 6항목, 성공 지표, 리스크, 마일스톤 |
| 06 | [요구사항 추적성 (RTM)](./06-requirements-traceability.md) | 원 요구사항 ↔ 문서 매핑, 커버리지 판정, 미결정 사항 D1~D13, 명시적 제외 범위 |

**How — 어떤 구조로 만드는가**

| # | 문서 | 다루는 것 |
|---|---|---|
| 02 | [플러그인 아키텍처](./02-plugin-architecture.md) | 독립성 원칙, **Code Intelligence Adapter(CIA)**, sprint 상태기계와 게이트, 컴포넌트 카탈로그, 훅 배치도, 디렉토리 구조, ADR 13건 |
| 03 | [문서 표준](./03-document-standards.md) | prd/plan/design/analysis/qa/report/master-plan 7종 필수 섹션 템플릿, AC 작성 규칙, 신뢰 등급 표기 |
| 04 | [상태·메모리와 트리거](./04-state-memory-and-triggers.md) | `.tene-claude/` 상태 스키마, 세션 복원, 비대화 방지, Task 연동, 직접 호출·자연어 트리거 |
| 09 | [멀티 sprint 오케스트레이션](./09-multi-sprint-orchestration.md) | Master Plan 책임, Task 계층, **이월·미결 승격 경로**, 워크플로 사용 기준 |

**Build — 무엇을 어떤 로직으로 구현하는가**

| # | 문서 | 다루는 것 |
|---|---|---|
| 07 | [스킬·에이전트 명세](./07-skill-and-agent-specs.md) | 14개 스킬의 단계별 로직·수행 규칙·게이트 판정, 8개 에이전트 시스템 프롬프트 골자 |
| 08 | [런타임 계약](./08-runtime-contracts.md) | `bin/` 5종 스크립트 I/O, 훅별 입출력 계약, userConfig, 오류 코드표, 성능 예산 |
| 10 | [핵심 알고리즘](./10-core-algorithms.md) | 계층 판정, **일치율 산출**, **AC 앵커링 3단계**, 전이 커버리지, report 자동 생성, 다국어 문서 검증기 |
| 05 | [tene CLI 선택적 연동](./05-tene-cli-integration.md) | CLI 분석, 4대 안전 규칙, 가드 훅(fail-closed), `.env` 감지, 검증 시나리오 12종 |

**Ship — 어떻게 검증하고 전달하는가**

| # | 문서 | 다루는 것 |
|---|---|---|
| 12 | [tene-codex와의 관계](./12-relation-to-tene-codex.md) | 개념 차용 범위, 런타임 분리 근거, 명칭 확정, 역제안 |
| 11 | [배포와 자체 QA](./11-delivery-and-self-qa.md) | 온보딩, 버전 호환성, **3층 검증(단위/Eval/Dogfooding)**, 정직성 테스트, 배포 체크리스트, 출시 판정 기준 |

---

## 한 장 요약

### 제품

> **tene 은 기획 의도를 문서로 붙잡아 코드에 앵커링하고, 그 의도를 판정 기준 삼아 sprint 사이클마다 반복 검증하는 Claude Code 플러그인이다.**

### 독립성 (가장 중요한 제약)

| 대상 | 관계 |
|---|---|
| tene studio / tene MCP | ❌ 무관. 참조·의존 금지 |
| bkit 등 타 워크플로 플러그인 | ❌ 무관. 병존만 보장 |
| tene CLI | ⚠️ 선택적 연동 (없으면 조용히 비활성화) |
| Claude Code 내장 기능 | ✅ 유일한 기반 |

순정 Claude Code + 이 플러그인만으로 전 사이클이 동작해야 한다.

### Sprint 사이클

```
prd → plan → design → do → loop-check → qa → report → archive
 G1     G2      G3      G4      G5         G6     G7
```

각 게이트가 **하네스 엔지니어링의 실체**다. 차단은 게이트 지점에서만 하고, 나머지는 알림만 한다.

| 게이트 | 통과 조건 |
|---|---|
| G1 | PRD 필수 섹션 + AC≥1 + **범위 밖 명시** + If-then AC≥1 |
| G2 | 모든 AC가 작업에 커버됨 |
| G3 | **4계층 전부 기재** + 6질문 표 + 화면 전이 엣지 + AC 앵커 |
| G4 | 빌드/타입체크 통과 |
| G5 | blocking gap 0 (진행률은 표시용) 또는 상한 후 waiver |
| G6 | blocking AC 전부 `passed` + evidence 유효 + `stale == 0` |
| G7 | R1~R6 완비 |

### 문서 구조

```
docs/sprints/
├── master-plan.md
├── _meta/layers.yml                  ← 계층 규칙 (팀 공유)
└── <sprint-id>/
    ├── 00-prd/prd.md
    ├── 01-plan/plan.md
    ├── 02-design/design.md
    ├── 03-analysis/{loop-check-1.md, loop-check-2.md, qa.md}
    ├── 04-report/report.md
    └── evidence/
```

상태는 `.tene-claude/` 에 분리 저장한다 (tene CLI의 `.tene/` 와 충돌 방지).

### 기술부채 방어의 두 축

**① Understanding Layer 4계층** — 매 sprint 숲을 보게 한다

Interface(Entry Point) · Business Logic(Processing rules) · Persistence(Data) · Infrastructure(Runtime)
→ **규칙 파일**로 결정론적 분류. 매칭 안 되면 **미분류로 남긴다** (지어내지 않음)

**② 6가지 질문** — 매 sprint 나무를 보게 한다

정의명 · 정의위치 · 참조위치 · 호출위치 · 입력형태 · 출력·변경형태
→ **Code Intelligence Adapter 3단 폴백**으로 수집, 어느 Tier가 답했는지 항상 표기

```
Tier 1  LSP (설치되어 있으면)        신뢰: 높음
Tier 2  자체 인덱서 bin/tene-scan    신뢰: 중간   ← 외부 설치 불필요, 순수 Node
Tier 3  에이전트 조사 (Glob/Grep/Read) 신뢰: 중간   ← 항상 가능
```

**핵심**: 절차(4계층+6질문을 반드시 답한다)는 어떤 Tier에서도 유지된다. 정밀도만 달라지고, 그 차이가 문서에 남는다.

### QA — 의도를 판정 기준으로

```
PRD 인터뷰 → AC (EARS 정규화, UNIT/DATA/UX 태깅) → 코드 앵커링
                                                        ↓
    코드 편집 → PostToolUse 훅 → 영향 AC를 stale 마킹
                                                        ↓
    /tene:qa → 수집(qa-runner) → 판정(judge) → 적대적 반박(refuter)
               UNIT: 테스트 러너
               DATA: CIA 질의 + 실행 결과 대조
               UX  : Chrome MCP / Playwright + 전이 커버리지
                                                        ↓
    G6 게이트: fail 0, stale 0 이어야 report 진입 허용
```

**미측정을 통과로 뭉개지 않는다.** `insufficient` 는 `passed`도 `failed`도 아닌 1급 판정이다.

### Report 필수 6항목

| # | 내용 |
|---|---|
| R1 | 이전 sprint와 어떻게 이어지는가 |
| R2 | 어떤 파일을 생성·수정했고 무엇을 어떻게 구현했는가 |
| R3 | 어떤 기획 의도를 충족시키기 위한 것인가 |
| R4 | **Understanding Layer 4계층** 기준 작업 내역 |
| R5 | **6가지 질문** 답변 |
| R6 | 사용자가 정할 정책 · 이월 작업과 그 사유 |

R4·R5가 이 제품의 방어 장치다. LLM이 눈앞의 파일만 보고 판단해 기술부채를 만드는 것을, 매 sprint **전체 구조와 개별 심볼을 동시에** 강제 확인시켜 막는다.

### 호출

- **직접**: `/tene:sprint`, `/tene:prd`, `/tene:design`, `/tene:loop-check`, `/tene:qa`, `/tene:report`, `/tene:understand`, `/tene:layers`, `/tene:secrets`, `/tene:doctor` …
- **자연어**: 스킬 `description`+`when_to_use`(ko/en 병기) + `UserPromptSubmit` 훅 키워드 라우터가 **제안**
- **부작용 큰 것**(`archive`, `clear`)은 `disable-model-invocation: true` 로 모델 자동 호출 금지

### 시크릿

`tene get` / 비암호화 `tene export` / `.tene/` 읽기를 **훅으로 차단**한다. 플러그인에서 유일하게 **fail-closed** 인 컴포넌트다. tene CLI가 없으면 조용히 비활성화된다.

---

## 지금 결정이 필요한 것

| # | 항목 | 기본 제안 |
|---|---|---|
| D1 | 상태 디렉토리 이름 | `.tene-claude/` |
| D2 | 문서 루트 경로 | `docs/sprints/` (userConfig로 변경 가능) |
| D3 | loop-check 반복 상한 | 3회 (tene-codex 정합) |
| D4 | QA 게이트 차단 강도 | Profile 연동 (strict/standard/light/off) |
| D5 | 상태 이력 보존 | 활성 50개, 초과분 월별 아카이브 |
| D6 | UX 검증 도구 우선순위 | Chrome MCP → Playwright → `insufficient` |
| D7 | 플러그인 이름 | `tene` (네임스페이스 `/tene:*`) |
| D8 | ~~일치율 가중치~~ | **불필요** — blocking AC 이진 판정으로 대체 |
| D9 | AC 앵커링 시점 | 혼합 — design 예상 → do 이후 실측 교정 |
| D10 | 문서 언어 | 감지 후 첫 sprint 에서 고정 |
| D11 | loop-check 상한 도달 시 | waiver 절차로 명시 승인 |
| D12 | 워크플로 전환 기준 | AC 8개 이상 또는 명시 요청 |
| D13 | 인덱서 1차 지원 언어 | ts/js/py/go 4종 |

D1·D7은 **이름 충돌 여지**가, D13은 **초기 개발 범위**가 걸려 있어 먼저 확정하는 편이 좋습니다. 나머지는 기본값으로 진행해도 `userConfig` 로 바꿀 수 있습니다.

---

## 구현 순서

| 단계 | 범위 | 완료 기준 |
|---|---|---|
| **M1 · 골격** | 스캐폴딩, 문서 템플릿 7종, `/tene:sprint init/status` | 빈 프로젝트에서 sprint 폴더와 PRD가 생성된다 |
| **M2 · 사이클** | 8단계 전이 엔진, 상태 파일, SessionStart 복원 | 세션을 넘겨도 진행 상태가 이어진다 |
| **M3 · 이해 계층** | 계층 규칙 엔진 + CIA(3-Tier) + 6질문 자동 답변 | design/report에 4계층·6질문이 자동으로 채워진다 |
| **M4 · 검증 루프** | `check` 일치율 산출과 반복 개선 | 목표 달성 또는 상한까지 반복된다 |
| **M5 · QA 게이트** | UNIT/DATA/UX 3갈래, 게이트 판정, 전이 커버리지 | 게이트 미달 시 report 진입이 차단된다 |
| **M6 · 회고** | report R1~R6 자동 생성, master plan 집계 | 회고가 사람 개입 최소로 완성된다 |
| **M7 · 시크릿** | tene CLI 스킬 이식 + 가드 훅 | 검증 시나리오 V1~V12 통과 |
| **M8 · 배포** | 마켓플레이스, CI 검증, 문서 | 외부 프로젝트에서 설치·동작한다 |

**M1~M3이 나머지 전부의 전제조건이다.** 문서 양식과 이해 계층 없이 QA부터 만들면 판정 기준이 없어 "또 하나의 AI 테스터"가 된다.
