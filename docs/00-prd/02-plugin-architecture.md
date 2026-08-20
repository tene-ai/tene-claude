# tene plugin — 아키텍처 설계

> 대응 PRD: [01-product-requirements.md](./01-product-requirements.md)
> 기술 근거: [00-rnd/02-claude-code-architecture-research.md](../00-rnd/02-claude-code-architecture-research.md)

---

## 0. 독립성 원칙 (가장 중요한 제약)

> **tene 플러그인은 어떤 외부 제품에도 의존하지 않는다.**

| 대상 | 관계 | 근거 |
|---|---|---|
| tene studio / tene MCP | ❌ **무관.** 참조·의존 금지 | studio 내장 기능이며 별도 제품 |
| bkit 등 타 워크플로 플러그인 | ❌ **무관.** 병존만 보장 | 독립 제품 |
| tene CLI | ⚠️ **선택적 통합.** 설치되어 있으면 활용, 없으면 조용히 비활성화 | 사용자 명시 요구(FR-7). 하드 의존 아님 |
| Claude Code 내장 기능 | ✅ 유일한 기반 | Skills / Agents / Hooks / Workflows / Tasks / LSP / Chrome |

**따라서 플러그인이 쓸 수 있는 것은 다음뿐이다.**

1. Claude Code가 제공하는 도구 (Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion, WebSearch/Fetch)
2. Claude Code의 확장 프리미티브 (Skills, Agents, Hooks, Workflows, Task Management, settings)
3. 선택적으로 존재할 수 있는 것 (LSP 플러그인, Chrome MCP, 프로젝트의 테스트 러너, tene CLI)
4. **플러그인이 자기 `bin/` 에 번들한 스크립트** — 외부 설치 불필요, Node 런타임만 사용

이 제약이 아키텍처의 형태를 결정한다. 특히 **Understanding Layer와 6가지 질문을 외부 코드 그래프 없이 스스로 해결해야 한다** (§2).

---

## 1. 아키텍처 개요

### 1.1 세 가지 엔지니어링의 역할 분담

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Context Engineering — "무엇을 컨텍스트에 넣을 것인가"                       │
│  · 세션 시작 주입은 상태 요약 1개(≤600 토큰)만                              │
│  · 문서는 인덱스로만 보고, 본문은 필요할 때 JIT 로드                          │
│  · 스킬은 온디맨드, 조사 결과는 서브에이전트에 격리                           │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼──────────┐ ┌───────▼──────────┐ ┌──────▼───────────────┐
│ Harness Eng.     │ │ Graph Eng.       │ │ Orchestration        │
│ "규칙을 강제한다" │ │ "구조를 확보한다" │ │ "규모를 확보한다"      │
│                  │ │                  │ │                      │
│ · Hooks (게이트) │ │ · CIA 3-Tier     │ │ · Dynamic Workflow   │
│ · Task 의존성    │ │   (LSP→인덱서→조사)│ │ · Subagents (검증)   │
│ · 상태 파일      │ │ · Layer Rules    │ │ · Task Management    │
│ · /goal (선택)   │ │ · Symbol Index   │ │                      │
└──────────────────┘ └──────────────────┘ └──────────────────────┘
```

### 1.2 4-Layer 아키텍처

```
┌──────────────────────────────────────────────────────────────────────┐
│ L4 · SURFACE     사용자가 만나는 표면                                   │
│      Skills(/tene:*) · Agents · 자연어 트리거                          │
├──────────────────────────────────────────────────────────────────────┤
│ L3 · ORCHESTRATION  사이클을 굴리는 층                                  │
│      Sprint Engine(8-phase FSM) · Gate Evaluator · Workflows          │
├──────────────────────────────────────────────────────────────────────┤
│ L2 · KNOWLEDGE   무엇이 참인지 아는 층                                   │
│      Intent Ledger(AC) · Understanding Map · Anchor Index             │
├──────────────────────────────────────────────────────────────────────┤
│ L1 · EVIDENCE    사실을 가져오는 층                                     │
│      ★ Code Intelligence Adapter (CIA)                                │
│      + Test Runner · Browser Driver · git · (선택) tene CLI            │
└──────────────────────────────────────────────────────────────────────┘
```

**의존 방향은 위→아래 단방향.** L1의 특정 수단이 없으면 신뢰 등급을 낮춰 기록할 뿐, 위 층이 멈추지 않는다(NFR-5 fail-open).

---

## 2. Code Intelligence Adapter (CIA) — 이 설계의 심장

외부 그래프 없이 **Understanding Layer 분류**와 **6가지 질문**에 답해야 한다. 해법은 하나의 수단이 아니라 **3단 폴백 어댑터**다.

### 2.1 3-Tier 구조

```
질문 (예: "processPayment 는 어디서 호출되는가?")
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│ Tier 1 · LSP                        신뢰: deterministic    │
│  Claude Code 의 code intelligence(LSP 플러그인)가 설치된    │
│  경우, Claude 는 이미 "정의로 이동 / 참조 찾기" 도구를 갖는다.│
│  스킬이 그 도구 사용을 지시한다.                             │
└───────────────┬───────────────────────────────────────────┘
                │ 없거나 실패
                ▼
┌───────────────────────────────────────────────────────────┐
│ Tier 2 · 자체 인덱서  bin/tene-scan   신뢰: indexed         │
│  플러그인이 번들한 Node 스크립트. 외부 설치 불필요.           │
│  · 파일 스캔 → 심볼 정의/ import / 호출 후보 추출            │
│  · 언어별 패턴 팩 (ts/js, py, go, java, rb, rs, php, kt)   │
│  · 결과를 .tene-claude/index/symbols.json 에 캐시            │
└───────────────┬───────────────────────────────────────────┘
                │ 인덱스 미스 / 저신뢰
                ▼
┌───────────────────────────────────────────────────────────┐
│ Tier 3 · 에이전트 조사               신뢰: investigated     │
│  Explore/서브에이전트가 Glob+Grep+Read 로 직접 조사.         │
│  느리지만 항상 가능. 결과를 인덱스에 피드백.                  │
└───────────────────────────────────────────────────────────┘
```

**어느 Tier가 답했는지를 항상 문서에 표기한다.** (`source: lsp | indexed | investigated`)

### 2.2 Tier 2 자체 인덱서 설계

**기술 제약**: 외부 바이너리(ripgrep/tree-sitter) 설치를 요구하지 않는다. Claude Code가 Node 런타임 위에서 돌므로 **순수 Node로 구현**한다. 있으면 `rg` 를 쓰고, 없으면 Node `fs` 순회 + 정규식으로 폴백한다.

```
bin/tene-scan  <subcommand>
  build      전체 인덱스 생성 (증분 지원)
  defs       <symbol>            → 정의 후보
  refs       <symbol>            → 참조 후보
  callers    <symbol>            → 호출 후보
  imports    <file>              → import 목록
  layer      <file>              → Understanding Layer 판정
  touched    <file...>           → 해당 파일에 앵커된 AC
```

**인덱스 스키마** (`.tene-claude/index/symbols.json`, git-ignore)

```jsonc
{
  "schemaVersion": 1,
  "builtAt": "2026-08-20T04:00:00Z",
  "engine": "node-regex",           // node-regex | ripgrep
  "files": 412,
  "symbols": {
    "processPayment": [{
      "kind": "function",
      "file": "src/payments/processPayment.ts",
      "line": 42,
      "exported": true,
      "confidence": "high",         // high | medium | low
      "signatureText": "export async function processPayment(input: PaymentInput): Promise<PaymentResult>"
    }]
  },
  "imports": {
    "src/api/routes/payments.ts": [
      { "from": "../../payments/processPayment", "names": ["processPayment"], "line": 3 }
    ]
  },
  "refs": {
    "processPayment": [
      { "file": "src/api/routes/payments.ts", "line": 18, "kind": "call", "confidence": "high" },
      { "file": "src/jobs/retry.ts",          "line": 7,  "kind": "call", "confidence": "medium" }
    ]
  }
}
```

**정확도 정책 — 정직성이 정확도보다 우선한다**

| 상황 | 처리 |
|---|---|
| 동명이인 심볼 다수 | 전부 나열하고 `confidence: medium` |
| 동적 디스패치·리플렉션 | 추적 불가를 명시. `unresolved` 목록에 기록 |
| 문자열/주석 내 일치 | 제외 규칙 적용, 실패 시 `low` |
| 언어 팩 미지원 | 확장자 기준으로 파일만 분류하고 심볼은 `not_indexed` |

> **인덱서는 "완벽한 콜그래프"를 목표하지 않는다.** 목표는 *"LLM이 눈앞의 파일만 보고 판단하는 것을 막을 만큼의 사실"* 이다. 불확실은 불확실로 표기한다(PP3).

### 2.3 Understanding Layer 분류 규칙

외부 엔진 없이 계층을 정하는 방법: **경로 규칙 + import 시그널 + 사용자 오버라이드**.

**(a) 기본 프리셋** — `templates/layers.default.yml`

```yaml
version: 1
layers:
  interface:
    paths: ["**/pages/**","**/app/**","**/views/**","**/components/**","**/routes/**",
            "**/controllers/**","**/handlers/http/**","**/api/**","**/cli/**",
            "**/cmd/**","**/webhooks/**","**/schedulers/**"]
    imports: ["express","fastify","next","react","vue","svelte","cobra","gin","fastapi","flask","spring-web"]
  business-logic:
    paths: ["**/services/**","**/usecases/**","**/domain/**","**/core/**",
            "**/reducers/**","**/store/**","**/logic/**","**/workflows/**"]
    imports: []
  persistence:
    paths: ["**/repositories/**","**/repository/**","**/models/**","**/entities/**",
            "**/db/**","**/dao/**","**/migrations/**","**/schema/**","**/cache/**","**/queue/**"]
    imports: ["prisma","typeorm","sequelize","mongoose","knex","drizzle","sqlalchemy",
              "gorm","redis","ioredis","kafkajs","amqplib"]
  infrastructure:
    paths: ["**/config/**","**/infra/**","**/deploy/**","**/.github/workflows/**",
            "Dockerfile*","**/terraform/**","**/k8s/**","**/auth/**","**/middleware/**"]
    imports: ["dotenv","aws-sdk","@aws-sdk/*","googleapis","passport","jsonwebtoken"]
precedence: [interface, persistence, infrastructure, business-logic]  # 충돌 시 우선순위
unmatched: unclassified   # 규칙에 안 걸리면 미분류로 남긴다 (지어내지 않음)
```

**(b) 프로젝트 오버라이드** — `docs/sprints/_meta/layers.yml` (git 커밋)

`/tene:sprint init` 또는 `/tene:doctor` 가 프로젝트 구조를 스캔해 **초안을 제안**하고, 사용자가 확인·수정한 뒤 커밋한다. 팀이 같은 규칙을 공유하게 된다.

```
[tene] 프로젝트 구조를 스캔했습니다. 계층 규칙 초안:
  interface      ← src/app/**, src/components/**        (파일 87개)
  business-logic ← src/services/**, src/lib/**          (파일 34개)
  persistence    ← src/db/**, prisma/**                 (파일 12개)
  infrastructure ← src/config/**, .github/workflows/**  (파일 8개)
  미분류         ← src/utils/**, src/types/**           (파일 41개)  ← 확인 필요

이 규칙을 docs/sprints/_meta/layers.yml 로 저장할까요?
```

**(c) 판정 절차**

```
파일 경로 → (b) 프로젝트 규칙 매칭 → 매칭 시 확정 (source: rules-project)
          → (a) 기본 프리셋 매칭   → 매칭 시 확정 (source: rules-default)
          → import 시그널 판정      → 판정 시 후보 (source: imports, provenance: inferred)
          → 미분류                 → unclassified (사유 기록)
```

**미분류를 억지로 채우지 않는다.** 미분류 목록이 곧 "이 프로젝트의 구조가 규칙으로 안 잡히는 지점"이며, 사용자가 규칙을 다듬을 신호다.

### 2.4 6가지 질문 → CIA 매핑

| # | 질문 | Tier1 (LSP) | Tier2 (인덱서) | Tier3 (조사) |
|---|---|---|---|---|
| Q1 | 선언·정의된 **이름** | documentSymbol | `tene-scan defs` | Glob+Grep 패턴 |
| Q2 | 어떤 **파일**에 정의 | definition | `defs` 의 file:line | Grep 결과 |
| Q3 | 어디서 **import·참조** | references | `refs` + `imports` | Grep `import.*<name>` |
| Q4 | 어디서 **호출·사용** | references(call) | `callers` | Grep `<name>\s*\(` |
| Q5 | 어떤 데이터를 **입력** | hover/signature | `signatureText` 파싱 | 정의부 Read |
| Q6 | 어떤 데이터를 **반환·변경** | hover/signature | 반환 타입 + 쓰기 패턴 휴리스틱 | 함수 본문 Read |

**Q6의 "변경" 판정 휴리스틱** (Tier2):
- persistence 계층 심볼 호출 (`repo.save`, `db.insert`, `prisma.*.create` …)
- 전역/모듈 스코프 변수 대입
- 파라미터 객체 프로퍼티 대입 (mutation)
→ 전부 `confidence: medium` 이하. 확정은 Tier3 조사나 사람 확인.

### 2.5 왜 이것이 기술부채를 막는가 (외부 그래프 없이도)

| LLM의 단편적 판단 | tene의 방어 | 필요 Tier |
|---|---|---|
| "이 파일만 고치면 됨" | Q3·Q4가 참조·호출 후보를 강제 제시 | Tier2 이상 |
| 같은 기능을 새로 구현 | Q1이 기존 동명/유사 심볼을 먼저 노출 | Tier2 |
| 잘못된 계층에 코드 배치 | 파일 경로 → 계층 판정 + 위반 경고 | 규칙만으로 가능 |
| 데이터 변경 부작용 간과 | Q6 휴리스틱 + persistence 호출 탐지 | Tier2 |
| 숲을 못 봄 | report R4가 4계층 전체를 매 sprint 강제 리뷰 | 규칙만으로 가능 |

**핵심**: 절차(4계층 + 6질문을 반드시 답한다)는 **어떤 Tier에서도 유지된다.** 답의 정밀도만 달라지고, 그 차이는 문서에 표기된다.

---

## 3. Sprint 사이클 엔진 (L3)

### 3.1 상태 기계

```
        ┌──────────────────────── (pause/resume 어느 phase에서나) ────┐
        │                                                            │
   ┌────▼────┐   G1   ┌──────┐   G2   ┌────────┐   G3   ┌────┐      │
   │   prd   ├───────▶│ plan ├───────▶│ design ├───────▶│ do │      │
   └─────────┘        └──────┘        └────────┘        └─┬──┘      │
                                                          │ G4      │
                          ┌───────────────────────────────▼──┐      │
                          │            check (loop)          │◀──┐  │
                          │  일치율 < 목표 → 개선 → 재검증     │   │  │
                          └───────────────┬──────────────────┘   │  │
                                    G5    │  일치율 ≥ 목표         │  │
                                   ┌──────▼──────┐                │  │
                                   │     qa      ├─ fail ─────────┘  │
                                   └──────┬──────┘  (개선 복귀)       │
                                    G6    │ pass                     │
                                   ┌──────▼──────┐   G7   ┌─────────┐│
                                   │   report    ├───────▶│ archive ││
                                   └─────────────┘        └─────────┘│
   ※ 반복 상한 도달 시 정지 → 사용자 결정 대기 ───────────────────────┘
```

### 3.2 게이트 정의 (하네스 엔지니어링의 실체)

| 게이트 | 전이 | 통과 조건 | 실패 시 |
|---|---|---|---|
| **G1** | prd → plan | PRD 필수 섹션 완비 + AC ≥ 1 + 범위 밖 명시 + If-then AC ≥ 1 | 누락 항목 제시, 인터뷰 재개 |
| **G2** | plan → design | 모든 AC가 최소 1개 작업에 커버됨 | 미커버 AC 목록 |
| **G3** | design → do | **4계층 전부 기재**(해당없음 포함) + 6질문 표 존재 + 화면 전이 엣지 정의 + AC 앵커 확정 | 미기재 항목 지적 |
| **G4** | do → check | 변경 파일 존재 + 빌드/타입체크 통과 (프로젝트 명령이 있을 때) | 실패 로그 |
| **G5** | check → qa | 일치율 ≥ 목표(기본 100%) **또는** 반복 상한 후 사용자 승인 | 갭 목록 → 개선 루프 |
| **G6** | qa → report | `fail == 0` **및** `stale == 0` | fail/stale 목록 → do 또는 check 복귀 |
| **G7** | report → archive | R1~R6 완비 | 누락 항목 |

> **차단은 게이트에서만.** 나머지 지점은 알림만 한다.

### 3.3 Trust Level

| Level | 자동 진행 | 사용자 확인 |
|---|---|---|
| L0 | 없음 | 모든 전이 |
| L1 | prd → plan | design 이후 |
| L2 | prd → design | do 이후 |
| L3 | prd → check | qa 판정, report |
| L4 | prd → archive | 게이트 실패 시에만 |

---

## 4. 컴포넌트 카탈로그 (L4)

### 4.1 Skills

| 스킬 | 모델 자동호출 | 역할 |
|---|---|---|
| `/tene:sprint` | ✅ | 사이클 라우터 (`init/start/status/phase/pause/resume/list/fork`) |
| `/tene:master-plan` | ✅ | master plan 작성·갱신·집계 |
| `/tene:prd` | ✅ | 대화형 의도 인터뷰 → PRD + AC |
| `/tene:plan` | ✅ | AC → 작업 계획, 커버리지 확인 |
| `/tene:design` | ✅ | 처리 로직 설계 + 4계층 분류 + 6질문 |
| `/tene:loop-check` | ✅ | 문서 대비 일치율 산출 + 반복 개선 |
| `/tene:qa` | ✅ | UNIT/DATA/UX 3갈래 검증 + 게이트 판정 |
| `/tene:report` | ✅ | R1~R6 회고 문서 |
| `/tene:understand` | ✅ | 임의 심볼/기능에 4계층+6질문 즉시 답변 (사이클 밖 단독 사용) |
| `/tene:layers` | ✅ | 계층 규칙 스캔·제안·수정 |
| `/tene:secrets` | ✅ | tene CLI 시크릿 안내 (선택적) |
| `/tene:doctor` | ✅ | 환경 진단 (LSP/인덱서/브라우저/테스트러너/tene CLI) |
| `/tene:archive` | ❌ | 아카이브 (부작용) |
| `/tene:clear` | ❌ | 상태 정리 (부작용) |
| `tene-conventions` | `user-invocable: false` | 프로젝트 관례 배경지식 |

**스킬 frontmatter 규약**

```yaml
---
name: design
description: 처리 로직을 상세 설계하고 Understanding Layer 4계층으로 분류한다.
when_to_use: "설계, 구조, 아키텍처, 어떻게 만들지, design, architecture"
argument-hint: "[sprint-id]"
allowed-tools: Read Write Edit Glob Grep Bash AskUserQuestion
metadata:
  tene: { phase: design, gate: G3, next: do, doc: "02-design" }
---
```

`metadata` 는 Claude Code가 읽지 않는 자유 필드다. 우리 훅과 `bin/` 스크립트가 읽는다.

### 4.2 Agents

| 에이전트 | 도구 | 역할 | 사용 단계 |
|---|---|---|---|
| `tene-interviewer` | Read, Glob, Grep, AskUserQuestion, Write | 의도 인터뷰 | prd |
| `tene-cartographer` | Read, Glob, Grep, Bash | **CIA 호출 + 4계층 매핑 + 6질문 수집** | design, check, report |
| `tene-gap-auditor` | Read, Glob, Grep, Bash | 문서 ↔ 구현 일치율 산출 | check |
| `tene-qa-planner` | Read, Glob, Grep, Bash | AC → 검증 계획 | qa |
| `tene-qa-runner` | Bash, Read, (Chrome) | **증거 수집만** (판정 금지) | qa |
| `tene-judge` | Read | 증거 대비 AC 판정 | qa |
| `tene-refuter` | Read | 통과 판정 적대적 반박 | qa |
| `tene-reporter` | Read, Glob, Bash, Write | R1~R6 회고 작성 | report |

**핵심 원칙**: `tene-qa-runner`(수집)와 `tene-judge`(판정)를 **반드시 분리**한다. 같은 에이전트가 실행하고 채점하면 편향된다(PP4).

**컨텍스트 격리 효과**: `tene-cartographer` 가 수십 파일을 읽어도 그 내용은 메인 컨텍스트에 들어오지 않는다. 요약된 4계층 맵과 6질문 표만 돌아온다.

### 4.3 Hooks — 하네스 배치도

| 이벤트 | matcher | 동작 | 차단 |
|---|---|---|---|
| `SessionStart` | `startup\|resume\|clear` | 진행 sprint·phase·차단 원인 요약 주입 (≤600 토큰) | ✗ |
| `UserPromptSubmit` | — | 키워드 라우터 → 스킬 **제안** (`additionalContext`) | ✗ |
| `PreToolUse` | `Bash` | **시크릿 가드**: `tene get`, 비암호화 `tene export` → deny | ✅ fail-closed |
| `PreToolUse` | `Read` | `.tene/**` 읽기 → deny | ✅ fail-closed |
| `PreToolUse` | `Edit\|Write` | phase가 `do` 이전인데 소스 편집 → escalate | 조건부 |
| `PostToolUse` | `Edit\|Write` | 편집 파일 → anchors 인덱스 O(1) 조회 → 영향 AC `stale` 마킹 | ✗ |
| `PostToolUse` | `Bash` | `.env` 생성/수정 감지 → 경고 | ✗ |
| `TaskCreated` | — | 태스크에 sprint/phase 메타 부착 | ✗ |
| `TaskCompleted` | — | **게이트 검사**: 해당 phase 게이트 fail 시 exit 2 | ✅ |
| `Stop` | — | phase 전이 가능 여부 + 다음 행동 가이던스 | 조건부 |
| `PreCompact` | — | 상태 스냅샷 flush | ✗ |
| `PostCompact` | — | 상태 요약 재주입 | ✗ |
| `SubagentStop` | `tene-*` | 산출물을 상태에 반영 | ✗ |
| `SessionEnd` | — | 크기 점검 + 아카이브 예약 (1.5초 예산 준수) | ✗ |

**훅 규칙**
1. 동기 훅은 **200ms 이내** 종료. 무거운 조회 금지 — 인덱스 O(1) 룩업만
2. 시크릿 가드 외 전부 **fail-open** (내부 오류 시 exit 0)
3. **exec 폼** 사용 (`${user_config.*}` 는 셸 폼에서 거부됨)
4. 경로는 `${CLAUDE_PLUGIN_ROOT}` 기준

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{ "type": "command",
                  "command": ["${CLAUDE_PLUGIN_ROOT}/bin/tene-guard", "--event", "pretooluse"],
                  "timeout": 10 }]
    }],
    "TaskCompleted": [{
      "hooks": [{ "type": "command",
                  "command": ["${CLAUDE_PLUGIN_ROOT}/bin/tene-gate", "--gate", "task-complete"],
                  "timeout": 15 }]
    }]
  }
}
```

### 4.4 Workflows (Dynamic Workflow)

| 워크플로 | 목적 | 규모 |
|---|---|---|
| `/tene:qa-sweep` | AC별 팬아웃 → 수집 → 판정 → 적대적 반박 | AC 수 × 2~3 |
| `/tene:conformance-audit` | 문서 항목별 구현 대조 병렬 감사 | 항목 수 |
| `/tene:understand-sweep` | 다수 심볼 6질문 일괄 수집 | 심볼 수 |

```javascript
export const meta = {
  name: 'qa-sweep',          // → /tene:qa-sweep
  description: 'Verify every acceptance criterion: collect evidence, judge, then refute passes',
  phases: [{title:'Collect'},{title:'Judge'},{title:'Refute'}],
}

const acs = args?.criteria ?? (await agent(
  'Read the sprint PRD AC table and return every criterion with id, statement, method, anchors.',
  { schema: AC_SCHEMA })).criteria

const results = await pipeline(
  acs,
  ac => agent(`Gather evidence for ${ac.id} (method=${ac.method}). Collect observations ONLY. Do not judge.`,
              { phase:'Collect', label:ac.id, schema: EVIDENCE_SCHEMA }),
  (ev, ac) => agent(`Judge "${ac.statement}" against evidence ${JSON.stringify(ev)}.
                     Verdict ∈ {pass, fail, insufficient}. If evidence is absent, return insufficient. Never guess.`,
              { phase:'Judge', label:ac.id, schema: VERDICT_SCHEMA }).then(v => ({ac, ev, v})),
  r => r.v.verdict !== 'pass' ? r :
       parallel(['correctness','edge-case','evidence-sufficiency'].map(lens => () =>
         agent(`Using the ${lens} lens, try to REFUTE this pass verdict: ${JSON.stringify(r)}.
                Default refuted=true when evidence is insufficient.`,
               { phase:'Refute', schema: REFUTE_SCHEMA })))
       .then(vs => ({...r, refuted: vs.filter(Boolean).filter(x=>x.refuted).length >= 2})),
)
return results.filter(Boolean)
```

`pipeline` 을 쓴 이유: AC별 독립 진행이므로 배리어 불필요. 배리어를 쓰면 가장 느린 AC가 전체를 붙잡는다.

### 4.5 외부 도구와의 관계

| 도구 | 관계 | 부재 시 |
|---|---|---|
| LSP 플러그인 | 선택. 있으면 CIA Tier 1 | Tier 2/3로 degrade |
| Chrome MCP | 선택. UX 검증 | Playwright 감지 → 없으면 `insufficient` |
| 프로젝트 테스트 러너 | 선택. 자동 감지 | UNIT 검증 `insufficient` |
| tene CLI | 선택. 시크릿 스킬 | 스킬 조용히 비활성화 |

**플러그인은 MCP 서버를 제공하지도, 요구하지도 않는다.**

---

## 5. Knowledge Layer 설계 (L2)

### 5.1 Intent Ledger — AC 저장소

AC는 PRD 문서 안의 **표**로 산다. 별도 DB를 만들지 않는다(NFR-7 가역성).

```markdown
| ID | 기준 (EARS) | 방식 | 앵커 | 상태 |
|---|---|---|---|---|
| AC-1 | **If** 카드가 만료되었다면, **then** 시스템은 결제 화면으로 복귀하고 입력값을 보존해야 한다 | UX | `CheckoutPage` | pass |
| AC-2 | **When** 결제 API가 4xx를 반환하면, 시스템은 payments에 status='failed'로 기록해야 한다 | DATA | `processPayment` | stale |
```

**EARS 5패턴 정규화** 이유: 문장 모호성 제거 → LLM 판정 비결정성 감소, 각 문장이 테스트 1개에 대응.

| 패턴 | 템플릿 |
|---|---|
| Ubiquitous | 시스템은 `<응답>` 해야 한다 |
| Event-driven | **When** `<트리거>`, 시스템은 `<응답>` 해야 한다 |
| State-driven | **While** `<상태>`, 시스템은 `<응답>` 해야 한다 |
| Unwanted | **If** `<조건>`, **then** 시스템은 `<응답>` 해야 한다 |
| Optional | **Where** `<기능 포함>`, 시스템은 `<응답>` 해야 한다 |

인터뷰는 **Unwanted(If-then) 패턴을 가장 집요하게** 캐낸다. 바이브 코딩이 가장 잘 빠뜨리는 영역이다.

### 5.2 Anchor Index

훅이 200ms 안에 답해야 하므로 문서를 파싱하지 않고 **역인덱스**를 조회한다.

```jsonc
// .tene-claude/index/anchors.json  (git-ignore, 재생성 가능)
{
  "version": 1,
  "generatedAt": "2026-08-20T04:15:00Z",
  "byPath": {
    "src/payments/processPayment.ts": ["checkout-retry:AC-2"],
    "src/pages/CheckoutPage.tsx":     ["checkout-retry:AC-1", "checkout-retry:AC-3"]
  },
  "bySymbol": { "processPayment": ["checkout-retry:AC-2"] }
}
```

`PostToolUse` 훅이 편집된 `file_path` 로 `byPath` 를 조회해 해당 AC를 `stale` 로 마킹한다.

### 5.3 Understanding Map

```jsonc
// .tene-claude/index/understanding.json
{
  "sprint": "checkout-retry",
  "generatedAt": "2026-08-20T04:20:00Z",
  "cia": { "tier": "indexed", "engine": "node-regex", "lspAvailable": false },
  "rules": "docs/sprints/_meta/layers.yml",
  "layers": {
    "interface":      [{ "symbol": "CheckoutPage", "file": "src/pages/CheckoutPage.tsx:12",
                         "source": "rules-project", "confidence": "high" }],
    "business-logic": [{ "symbol": "processPayment", "file": "src/payments/processPayment.ts:42",
                         "source": "rules-project", "confidence": "high" }],
    "persistence":    [{ "symbol": "paymentsRepo.insert", "file": "src/db/payments.ts:30",
                         "source": "imports", "confidence": "medium" }],
    "infrastructure": [],
    "unclassified":   [{ "symbol": "retryJob", "file": "src/jobs/retry.ts:7",
                         "reason": "no rule matched; consider adding src/jobs/** to layers.yml" }]
  },
  "violations": [
    { "kind": "layer-skip", "from": "interface", "to": "persistence",
      "detail": "CheckoutPage 가 paymentsRepo 를 직접 참조", "source": "indexed", "confidence": "medium" }
  ],
  "unresolved": [
    { "symbol": "handler", "reason": "동명 심볼 7개 — 특정 불가" }
  ]
}
```

> `unclassified` 와 `unresolved` 를 빈 배열로 위장하지 않는다.

---

## 6. Context Engineering 설계

### 6.1 로드 예산

| 시점 | 대상 | 예산 |
|---|---|---|
| SessionStart | 상태 요약 | ≤ 600 토큰 |
| 스킬 description (상시) | 15개 | ≤ 1,400 토큰 |
| 스킬 본문 | 호출 시 | ≤ 3,000 토큰/스킬 |
| CIA 결과 | 질의 단위 | ≤ 2,000 토큰 |
| 문서 본문 | 필요 섹션만 | 요청 시 |

**상시 부담 ≤ 2,000 토큰** (NFR-1).

### 6.2 절대 하지 않는 것

| 금지 | 이유 |
|---|---|
| 전체 sprint 문서를 세션 시작에 로드 | Context Rot |
| 인덱스 전체 덤프 | 동일 |
| CLAUDE.md에 절차 서술 | 절차는 스킬. CLAUDE.md는 사실만 |
| 스킬 본문에 "1회성 단계" 서술 | 스킬 본문은 세션 내 재-읽기 안 됨 → **상시 지시** 형태로 |
| 조사를 메인 컨텍스트에서 수행 | 서브에이전트로 격리 |

### 6.3 컴팩션 대비

- `PreCompact`: 상태 스냅샷 flush → 소실 방지
- `PostCompact`: 상태 요약 재주입
- 프로젝트 루트 CLAUDE.md는 컴팩션 후 자동 재주입되나 **중첩 CLAUDE.md와 `paths:` 규칙은 재주입되지 않는다** → 중요 규칙을 그곳에만 두지 않는다

---

## 7. 데이터 흐름 — sprint 전체 시퀀스

```
[사용자] "결제 실패 시 입력값 보존 기능 만들어줘"
    │  UserPromptSubmit 훅 → /tene:sprint init 제안
    ▼
/tene:sprint init checkout-retry
    ├─▶ 상태 생성 .tene-claude/state/sprints/checkout-retry.json (phase=prd)
    ├─▶ 문서 폴더 생성 docs/sprints/checkout-retry/{00-prd,…,04-report}/
    └─▶ 계층 규칙 없으면 /tene:layers 제안 (구조 스캔 → layers.yml 초안)
    ▼
/tene:prd ── tene-interviewer
    AskUserQuestion 인터뷰 (목적/가치/범위밖/되돌아오는경로/실패조건/검증방식)
    → 00-prd/prd.md (필수 섹션 + AC 표, EARS 정규화)
    ▼ G1
/tene:plan
    AC 커버리지 확인 → 01-plan/plan.md
    TaskCreate 로 phase 태스크 생성 (blockedBy 체인)
    ▼ G2
/tene:design ── tene-cartographer
    CIA: layer 판정 + defs/refs/callers/imports 수집
    → 4계층 분류 + 6질문 표 + 처리 로직 상세 + 화면 전이 엣지
    → 02-design/design.md, index/understanding.json, index/anchors.json
    ▼ G3
do (구현)
    PostToolUse 훅: 편집 파일 → anchors 조회 → 영향 AC stale
    ▼ G4 (빌드/타입체크)
/tene:loop-check ── tene-gap-auditor      ◀─ ─ ─ ─ ─ ─ ┐
    문서 ↔ 구현 대조 → 일치율 → 03-analysis/check-<n>.md │ 미달 시 개선
    미달 항목 → 개선 태스크 → 구현 → 재검증 ─────────┘ (상한 3회)
    ▼ G5
/tene:qa ── qa-planner → qa-runner(수집) → judge(판정) → refuter(반박)
    UNIT: 프로젝트 테스트 러너
    DATA: CIA 질의(변경 지점·계약) + 실행 결과 대조
    UX  : Chrome MCP / Playwright 시나리오 → 전이 커버리지 + 증거
    → 03-analysis/qa.md
    ▼ G6 (fail=0, stale=0)  ── fail이면 do/check 복귀
/tene:report ── tene-reporter
    R1 이전 sprint 연결 (이전 report + CIA refs)
    R2 생성/수정 파일 (git diff + 계층 판정)
    R3 의도 충족 매핑 (AC 앵커 역참조)
    R4 4계층 작업 내역 (understanding.json)
    R5 6가지 질문 (CIA 결과 렌더링)
    R6 미결 정책 · 이월 작업
    → 04-report/report.md
    ▼ G7
/tene:archive → 상태 archived, 이력 아카이브, master-plan 집계 갱신
```

---

## 8. 디렉토리 구조

### 8.1 플러그인 저장소 (배포물)

```
tene-claude/
├── .claude-plugin/marketplace.json
├── plugins/tene/
│   ├── .claude-plugin/plugin.json
│   ├── skills/{sprint,master-plan,prd,plan,design,check,qa,report,
│   │           understand,layers,secrets,doctor,archive,clear,conventions}/SKILL.md
│   ├── agents/{tene-interviewer,tene-cartographer,tene-gap-auditor,
│   │           tene-qa-planner,tene-qa-runner,tene-judge,tene-refuter,tene-reporter}.md
│   ├── workflows/{qa-sweep,conformance-audit,understand-sweep}.js
│   ├── hooks/hooks.json
│   ├── bin/
│   │   ├── tene-scan        ← CIA Tier2 인덱서 (순수 Node)
│   │   ├── tene-guard       ← 시크릿/phase 가드
│   │   ├── tene-gate        ← 게이트 판정
│   │   ├── tene-state       ← 상태 CRUD
│   │   └── tene-doc         ← 문서 생성·검증
│   ├── lib/
│   │   ├── cia/             ← 어댑터, 언어 팩, 계층 규칙 엔진
│   │   ├── state/
│   │   ├── doc/
│   │   └── gate/
│   ├── templates/           ← 문서 템플릿 7종 + layers.default.yml
│   ├── settings.json
│   ├── package.json
│   └── README.md
├── docs/{00-rnd,00-prd}/
└── .github/workflows/validate.yml
```

### 8.2 사용자 프로젝트 (런타임 산출물)

```
<user-project>/
├── docs/sprints/                      ← git 커밋 (사람이 읽는 산출물)
│   ├── master-plan.md
│   ├── _meta/layers.yml               ← 계층 규칙 (팀 공유)
│   ├── checkout-retry/
│   │   ├── 00-prd/prd.md
│   │   ├── 01-plan/plan.md
│   │   ├── 02-design/design.md
│   │   ├── 03-analysis/{loop-check-1.md,loop-check-2.md,qa.md}
│   │   ├── 04-report/report.md
│   │   └── evidence/                  ← 스크린샷·GIF·로그
│   └── _archive/2026-08/
│
├── .tene-claude/                        ← 플러그인 상태
│   ├── state/{current.json,master-plan.json,sprints/*.json}   ← 커밋 권장
│   ├── index/{symbols.json,anchors.json,understanding.json}   ← git-ignore
│   ├── history/events.ndjson                                  ← git-ignore
│   ├── archive/2026-08/                                       ← git-ignore
│   └── .gitignore
│
└── .tene/                             ← ⛔ tene CLI 소유. 접근 절대 금지
```

---

## 9. Degrade 전략

| 부재 | 영향 | 대응 | 표기 |
|---|---|---|---|
| LSP | 심볼 해석 정밀도 하락 | CIA Tier2 인덱서 | `source: indexed` |
| 인덱서 실패 (언어 미지원) | 심볼 추출 불가 | Tier3 에이전트 조사 | `source: investigated` |
| 계층 규칙 미설정 | 분류 불가 | 기본 프리셋 → 미분류 명시 + 규칙 제안 | `unclassified` |
| Chrome MCP | UX 검증 불가 | Playwright 감지 → 없으면 미측정 | `insufficient` |
| 테스트 러너 | UNIT 불가 | 미측정 | `insufficient` |
| tene CLI | 시크릿 스킬 비활성 | `.env` 경고만 유지 | — |
| Dynamic Workflow (CC<2.1.154) | 팬아웃 불가 | 순차 서브에이전트 | 소요 안내 |

**원칙**: 부재는 실패가 아니라 **정직한 미측정**이다(PP3).

---

## 10. 확장 지점

| 확장 | 방법 |
|---|---|
| 프로젝트 계층 구조가 특이함 | `docs/sprints/_meta/layers.yml` 편집 |
| 언어 팩 추가 | `lib/cia/langs/<ext>.js` 추가 |
| 문서 섹션 추가 | 템플릿을 프로젝트 `.claude/skills/` 로 오버라이드 |
| 게이트 임계값 | `userConfig.gate_thresholds` |
| 문서 경로 | `userConfig.docs_root` |
| 검증 방식 추가 | AC 방식 태그 추가 + 러너 스크립트 |
| 더 정밀한 코드 지능 | LSP 플러그인 설치 → 자동으로 Tier1 승격 |

---

## 11. 아키텍처 결정 기록 (ADR)

| # | 결정 | 대안 | 근거 |
|---|---|---|---|
| ADR-1 | **어떤 외부 제품에도 의존하지 않는다** | 코드 그래프 MCP 의존 | 어떤 프로젝트에서도 설치만으로 동작해야 함(FR-8.2) |
| ADR-2 | 코드 지능을 **3-Tier 어댑터**로 추상화 | 단일 수단 | 환경 편차 흡수. 절차는 유지, 정밀도만 degrade |
| ADR-3 | 자체 인덱서를 **순수 Node**로 구현 | tree-sitter/ripgrep 필수 | 외부 설치 요구 시 도입 장벽. 있으면 쓰고 없으면 폴백 |
| ADR-4 | 계층 분류를 **규칙 파일**로 | AI 추론 | 결정론적·재현 가능·팀 공유·사용자 교정 가능 |
| ADR-5 | 미분류를 **억지로 채우지 않는다** | 추론으로 채움 | 환각 방지. 미분류 목록이 규칙 개선 신호 |
| ADR-6 | 상태를 **파일**로 저장 | DB | 가역성, git 리뷰 가능, 사람이 편집 가능 |
| ADR-7 | AC를 **PRD 문서 내 표**로 | 별도 ledger | 의도와 기준의 분리는 드리프트를 만든다 |
| ADR-8 | 파생 인덱스는 **git-ignore** | 커밋 | 재생성 가능, 머지 충돌 방지 |
| ADR-9 | 차단은 **게이트 지점에서만** | 상시 차단 | 마찰 최소화 |
| ADR-10 | 수집자와 판정자 **분리** | 단일 에이전트 | 자기 채점 편향 제거 |
| ADR-11 | `.tene-claude/` 사용, `.tene/` 접근 금지 | 공용 디렉토리 | tene CLI 볼트와 충돌·오접근 방지 |
| ADR-12 | `insufficient` 를 1급 판정으로 | pass/fail 이분 | 미측정 은폐 방지 |
| ADR-13 | MCP 서버를 제공하지 않는다 | 자체 MCP | 설치 부담 + 컨텍스트 비용. 훅과 bin으로 충분 |
