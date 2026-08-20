# tene plugin — 상태·메모리 관리와 호출/트리거 설계

> 대응 요구사항: FR-5(상태·메모리), FR-6(호출·트리거), NFR-1~3
> 기술 근거: [00-rnd/02-claude-code-architecture-research.md](../00-rnd/02-claude-code-architecture-research.md)

---

# Part A · 상태와 메모리

## A1. 저장소 3분할

Claude Code에는 성격이 다른 세 개의 저장소가 있다. 무엇을 어디에 둘지가 이 설계의 핵심이다.

| 저장소 | 주체 | 공유 | 수명 | tene 용도 |
|---|---|---|---|---|
| **프로젝트 문서** `docs/sprints/` | 사람+AI | git 공유 | 영구 | **의도·설계·판정의 정본(SSOT)** |
| **플러그인 상태** `.tene-claude/` | 플러그인 | 선택적 커밋 | sprint 수명 | 사이클 위치, 인덱스, 이력 |
| **auto memory** `~/.claude/projects/<p>/memory/` | Claude | 로컬 전용 | 프로젝트 수명 | 프로젝트 관례·함정·선호 학습 |

**분리 원칙**

- 문서에는 **사람이 읽어야 하는 것**만 (의도, 설계, 판정, 회고)
- 상태에는 **기계가 읽어야 하는 것**만 (phase, 인덱스, 카운터)
- 메모리에는 **다음 세션이 알면 좋은 것**만 (빌드 명령, 이 프로젝트의 함정)

같은 사실을 세 곳에 중복 저장하지 않는다. 중복은 드리프트를 만든다.

---

## A2. `.tene-claude/` 상태 스키마

```
.tene-claude/
├── state/                      # ← git 커밋 권장 (팀 공유 시 유용)
│   ├── current.json            # 활성 sprint 포인터
│   ├── master-plan.json        # master plan 집계
│   └── sprints/
│       └── checkout-retry.json # sprint별 상태
├── index/                      # ← git-ignore (재생성 가능)
│   ├── anchors.json            # AC ↔ 코드 역인덱스
│   └── understanding.json      # 4계층 맵
├── history/                    # ← git-ignore
│   └── events.ndjson           # 이벤트 로그 (append-only)
├── archive/                    # ← git-ignore
│   └── 2026-08/                # 월별 아카이브
└── .gitignore
```

### A2.1 `current.json` — 세션 복원의 진입점

```jsonc
{
  "schemaVersion": 1,
  "activeSprint": "checkout-retry",
  "phase": "qa",
  "trustLevel": "L3",
  "updatedAt": "2026-08-20T04:20:00Z",
  "nextAction": {
    "skill": "/tene:qa",
    "reason": "QA 게이트 미판정. AC 5건 중 3건 미검증",
    "blocking": ["AC-2 fail", "AC-3 insufficient"]
  },
  "counters": { "loopCheckLoops": 2, "qaRetries": 0 }
}
```

> 이 파일 **하나만 읽으면** 세션 복원이 끝나도록 설계한다. SessionStart 훅의 예산이 600 토큰이기 때문이다.

### A2.2 `sprints/<id>.json` — sprint 단위 상태

```jsonc
{
  "schemaVersion": 1,
  "id": "checkout-retry",
  "title": "결제 실패 시 입력값 보존",
  "status": "active",              // planned | active | paused | archived
  "phase": "qa",
  "createdAt": "2026-08-18T02:00:00Z",
  "updatedAt": "2026-08-20T04:20:00Z",

  "docs": {
    "prd":      "docs/sprints/checkout-retry/00-prd/prd.md",
    "plan":     "docs/sprints/checkout-retry/01-plan/plan.md",
    "design":   "docs/sprints/checkout-retry/02-design/design.md",
    "analysis": ["docs/sprints/checkout-retry/03-analysis/loop-check-1.md",
                 "docs/sprints/checkout-retry/03-analysis/loop-check-2.md"],
    "qa":       "docs/sprints/checkout-retry/03-analysis/qa.md",
    "report":   null
  },

  "gates": {
    "G1": { "result": "pass", "at": "2026-08-18T03:10:00Z" },
    "G2": { "result": "pass", "at": "2026-08-18T05:00:00Z" },
    "G3": { "result": "pass", "at": "2026-08-19T01:00:00Z" },
    "G4": { "result": "pass", "at": "2026-08-19T22:00:00Z" },
    "G5": { "result": "pass", "at": "2026-08-20T03:00:00Z", "matchRate": 100 },
    "G6": { "result": "fail", "at": "2026-08-20T04:20:00Z",
            "detail": { "pass": 3, "fail": 1, "insufficient": 1, "stale": 0 } },
    "G7": null
  },

  "ac": [
    { "id": "AC-1", "method": "UX",   "status": "pass",         "anchors": ["CheckoutPage"] },
    { "id": "AC-2", "method": "DATA", "status": "fail",         "anchors": ["processPayment"] },
    { "id": "AC-3", "method": "UX",   "status": "insufficient", "anchors": ["CheckoutPage"] }
  ],

  "coverage": { "transitionEdges": { "measured": 3, "total": 5 } },
  "counters": { "loopCheckLoops": 2, "qaRetries": 0, "maxLoopCheckLoops": 5, "maxQaRetries": 3 },
  "carryOver": [
    { "id": "C1", "kind": "deferred", "title": "5xx → ErrorPage 전이 검증", "reason": "5xx 재현 환경 부재" },
    { "id": "D1", "kind": "decision", "title": "재시도 잡의 멱등키 정책", "reason": "R5에서 발견" }
  ]
}
```

**설계 결정**
- `ac[]` 는 문서(PRD)의 AC 표를 **미러링한 요약**이다. 정본은 문서다. 상태에는 판정만 둔다
- `gates` 는 phase 전이 기록. 감사 추적과 재개에 쓰인다
- `counters` 로 무한 루프를 막는다 (loop-check 3회, qa 재시도 3회 상한)
- `carryOver` 가 report R6 → master plan 집계로 승격되는 경로

### A2.3 `history/events.ndjson` — append-only 이벤트

```jsonl
{"ts":"2026-08-18T02:00:00Z","sprint":"checkout-retry","event":"sprint_created"}
{"ts":"2026-08-18T03:10:00Z","sprint":"checkout-retry","event":"gate_passed","gate":"G1"}
{"ts":"2026-08-19T22:14:00Z","sprint":"checkout-retry","event":"ac_stale","ac":"AC-2","cause":"src/payments/processPayment.ts"}
{"ts":"2026-08-20T04:20:00Z","sprint":"checkout-retry","event":"gate_failed","gate":"G6","detail":{"fail":1}}
```

한 줄 = 한 이벤트. 부분 쓰기에도 파일 전체가 깨지지 않는다.

---

## A3. 세션 간 맥락 복원

### A3.1 SessionStart 훅이 주입하는 것 (≤600 토큰)

```
[tene] 진행 중: checkout-retry (phase: qa, Trust L3)
  · 게이트 G6 FAIL — AC 5건 중 pass 3 / fail 1 / 미측정 1
  · 차단 원인: AC-2(DATA) 실패 — payments 테이블에 실패 기록 없음
  · 전이 커버리지 3/5 (60%)
  · 다음 행동: /tene:qa 재실행 또는 /tene:loop-check 로 복귀
  · 문서: docs/sprints/checkout-retry/
```

**절대 주입하지 않는 것**: 문서 본문, AC 전문, 코드 지능(CIA) 조회 결과, 이전 대화 요약. 이것들은 스킬이 호출될 때 JIT로 읽는다.

### A3.2 컴팩션 대비

| 훅 | 동작 |
|---|---|
| `PreCompact` | `current.json` 을 최신 상태로 flush. 진행 중 판정 결과를 파일에 확정 |
| `PostCompact` | A3.1과 동일한 요약을 재주입 |

컴팩션은 초기 지시를 잃는다. **상태를 대화가 아니라 파일에 두는 이유가 여기 있다.**

### A3.3 auto memory와의 역할 분담

| 종류 | 저장 위치 | 예 |
|---|---|---|
| sprint 진행 상태 | `.tene-claude/state/` | phase=qa, G6 fail |
| 의도·설계·판정 | `docs/sprints/` | AC-2 문장, 판정 근거 |
| **프로젝트 학습** | auto memory `MEMORY.md` | "이 프로젝트는 pnpm 사용", "결제 테스트는 목 서버 필요", "payments 테이블은 소프트 삭제 안 함" |

auto memory에 **sprint 상태를 쓰지 않는다.** `MEMORY.md` 는 200줄/25KB 제한이 있고 매 세션 로드되므로, 변동이 잦은 상태를 넣으면 예산을 낭비한다.

메모리에 저장할 가치가 있는 것의 판별 기준: **다음 sprint에도, 그 다음 sprint에도 유효한가?**

---

## A4. 상태 비대화 방지 (FR-5.4)

### A4.1 상한과 자동 정리

| 파일 | 상한 | 초과 시 |
|---|---|---|
| `events.ndjson` | 5,000줄 또는 256KB | 오래된 절반을 `archive/<YYYY-MM>/events.ndjson` 으로 이동 |
| `sprints/` 활성 항목 | 50개 | `archived` 상태 항목을 월별 아카이브로 이동 |
| `index/*.json` | — | sprint 아카이브 시 해당 항목 제거 |
| `master-plan.json` 이월 집계 | 200개 | 해결된 항목 정리 |

정리 시점: `SessionEnd` 훅 (예산 1.5초 내에서 크기 확인만 하고, 초과 시 다음 세션 시작에 정리) 또는 `/tene:clear` 수동 실행.

### A4.2 `/tene:clear` — 명시적 정리

```
/tene:clear                    # 상태 요약 + 정리 후보 표시 (실행 안 함)
/tene:clear --archived         # archived sprint를 아카이브로 이동
/tene:clear --history          # 이벤트 로그 압축
/tene:clear --index            # 인덱스 재생성 (손상 복구)
/tene:clear --all --yes        # 전부 (확인 필수)
```

**`disable-model-invocation: true`** — 파괴적 조작이므로 모델이 스스로 호출하지 못한다.

**안전 규칙**
1. `docs/sprints/` 는 **절대 건드리지 않는다.** 정리 대상은 `.tene-claude/` 뿐이다
2. 아카이브는 삭제가 아니라 **이동**이다. 완전 삭제는 `--purge` 를 명시해야 한다
3. 정리 전 대상 목록을 보여주고 확인을 받는다

---

## A5. Task Management 연동

Claude Code의 `TaskCreate`/`TaskUpdate`/`TaskGet`/`TaskList` 를 사이클과 연결한다.

### A5.1 태스크 구조

```
[Sprint] checkout-retry
  ├─ [PRD]    의도 인터뷰 및 AC 정의              (completed)
  ├─ [Plan]   작업 계획 수립                      (completed)   blockedBy: PRD
  ├─ [Design] 처리 로직 설계 + 4계층 분류          (completed)   blockedBy: Plan
  ├─ [Do]     T1 결제 실패 응답 처리 (AC-2)        (completed)   blockedBy: Design
  ├─ [Do]     T2 입력값 보존 상태 관리 (AC-1)      (completed)   blockedBy: Design
  ├─ [LoopCheck]  문서-구현 일치율 100% 달성           (completed)   blockedBy: Do
  ├─ [QA]     AC 검증 및 게이트 판정               (in_progress) blockedBy: Check
  └─ [Report] 회고 문서 작성                       (pending)     blockedBy: QA
```

`blockedBy` 로 phase 순서를 표현하면, **Claude Code가 의존을 자동 관리**한다 — 선행 태스크 완료 시 후속이 자동 unblock된다.

### A5.2 훅 연동

| 훅 | 동작 |
|---|---|
| `TaskCreated` | 태스크 제목에서 phase를 파싱해 상태에 연결 |
| `TaskCompleted` | **게이트 검사**. 해당 phase의 게이트가 fail이면 exit 2로 완료 차단 |

```
[QA] 태스크 완료 시도
  → TaskCompleted 훅
  → sprints/checkout-retry.json 의 gates.G6 확인
  → result === "fail" → exit 2
  → 메시지: "G6 게이트 실패: AC-2 fail. /tene:loop-check 로 복귀하거나
             AC-2를 범위 밖으로 재정의한 뒤 다시 시도하세요."
```

> 이것이 **하네스 엔지니어링의 핵심 구현**이다. "완료했다"는 선언을 상태 파일이 반증한다.

### A5.3 Agent Teams (선택)

`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 환경에서는 공유 태스크 리스트로 팀 작업이 가능하다. tene은 이를 **요구하지 않지만 방해하지도 않는다**. 팀 모드에서는 `TeammateIdle` 훅으로 "미완 AC가 있으면 계속 일하라"를 강제할 수 있다.

---

# Part B · 호출과 트리거

## B1. 두 갈래 진입

```
        직접 호출                        자연어 요청
    /tene:qa checkout-retry         "결제 기능 QA 좀 해줘"
            │                                │
            │                                ▼
            │                    ① 스킬 description 매칭 (모델 판단)
            │                                +
            │                    ② UserPromptSubmit 훅 키워드 라우터 (제안)
            │                                │
            └────────────────┬───────────────┘
                             ▼
                        스킬 본문 로드 → 실행
```

## B2. 직접 호출 (FR-6.1)

| 명령 | 인자 |
|---|---|
| `/tene:sprint <action> [id] [--trust L0-L4]` | `init｜start｜status｜phase｜pause｜resume｜list｜fork` |
| `/tene:master-plan [--refresh]` | |
| `/tene:prd [id]` | |
| `/tene:plan [id]` | |
| `/tene:design [id]` | |
| `/tene:loop-check [id] [--target 100]` | |
| `/tene:qa [id] [--only UX｜DATA｜UNIT]` | |
| `/tene:report [id]` | |
| `/tene:understand <symbol｜file｜feature>` | 사이클 밖 단독 사용 |
| `/tene:secrets [action]` | |
| `/tene:doctor` | |
| `/tene:archive <id>` | 모델 호출 금지 |
| `/tene:clear [--flags]` | 모델 호출 금지 |

## B3. 자연어 트리거 (FR-6.2)

### B3.1 1차 — 스킬 `description` + `when_to_use`

Claude Code는 세션 시작에 모든 스킬의 `description`(+ `when_to_use`)을 컨텍스트에 싣고, 관련성을 판단해 자동 호출한다. **합산 1,536자 캡**이 있으므로 압축이 중요하다.

```yaml
description: 기능의 기획 의도를 대화로 추출해 PRD와 수용 기준(AC)을 작성한다.
when_to_use: "새 기능, 만들고 싶어, 기획, 요구사항, PRD, 스펙, 뭘 만들지, feature, requirement, spec"
```

**작성 규칙**
1. 첫 문장에 **핵심 용도**를 둔다 (캡에 잘려도 살아남도록)
2. `when_to_use` 에 **한국어 + 영어 트리거 어휘**를 함께 넣는다 (FR-6.4)
3. 스킬 간 트리거 어휘가 겹치지 않게 한다 — 겹치면 모델이 어느 것을 쓸지 모른다

### B3.2 2차 — `UserPromptSubmit` 훅 키워드 라우터

모델 판단만으로는 놓치는 경우가 있으므로, 훅이 **결정론적 힌트**를 보탠다.

```jsonc
// 라우팅 규칙 (요지)
{
  "rules": [
    { "any": ["새 기능","기능 추가","만들어","구현해","feature","implement"],
      "suggest": "/tene:sprint init", "when": "no-active-sprint" },
    { "any": ["QA","테스트","검증","동작 확인","test","verify"],
      "suggest": "/tene:qa", "when": "phase>=do" },
    { "any": ["설계","구조","아키텍처","design"],  "suggest": "/tene:design" },
    { "any": ["점검","일치","제대로","맞게 됐","check","conform"], "suggest": "/tene:loop-check" },
    { "any": ["회고","보고서","정리","report","retro"], "suggest": "/tene:report" },
    { "any": ["어디서 쓰","누가 호출","영향","impact","references"], "suggest": "/tene:understand" },
    { "any": ["키","시크릿","토큰","비밀","API key","secret",".env"], "suggest": "/tene:secrets" }
  ]
}
```

훅은 `additionalContext` 로 **제안만** 한다. 차단하지 않는다(exit 0).

```
[tene] 이 요청은 QA 단계로 보입니다. 현재 sprint: checkout-retry (phase: qa).
       /tene:qa 를 실행하면 AC 5건에 대해 UNIT/DATA/UX 검증을 수행합니다.
```

### B3.3 트리거 우선순위와 충돌 처리

| 상황 | 처리 |
|---|---|
| 직접 호출 + 훅 제안 충돌 | **직접 호출 우선** |
| 여러 스킬이 매칭 | 현재 phase에 해당하는 스킬 우선 |
| 진행 중 sprint 없음 | `sprint init` 만 제안 |
| 사용자가 제안을 무시 | 같은 세션에서 같은 제안을 **반복하지 않는다** |

### B3.4 오탐 제어 (FR-6.5)

```jsonc
// userConfig
{
  "auto_trigger": { "type": "boolean", "default": true,
                    "title": "자연어 자동 트리거", "description": "끄면 직접 호출만 동작" }
}
```

`disable-model-invocation: true` 를 쓰는 스킬(`archive`, `clear`)은 애초에 모델이 호출하지 못한다.

---

## B4. 다국어 (FR-6.4)

| 요소 | 방식 |
|---|---|
| 트리거 어휘 | `when_to_use` 에 ko/en 병기 |
| 훅 라우터 | 규칙 파일에 언어별 키워드 배열 |
| 생성 문서 언어 | **사용자 요청 언어를 따른다.** 세션 첫 요청 언어를 감지해 상태에 기록 |
| 문서 섹션 제목 | 언어별 템플릿 (검증기는 언어 무관하게 `tene:` frontmatter와 섹션 순서로 판별) |

> 섹션 제목을 언어에 따라 바꾸므로, **검증기는 제목 문자열이 아니라 순서와 frontmatter로 판별**해야 한다. 이 제약을 템플릿 설계에 반영한다.

---

## B5. 컨텍스트 예산 검증

| 항목 | 예상 | 근거 |
|---|---|---|
| 스킬 description 14개 | ~1,300 토큰 | 스킬당 평균 90 토큰 |
| SessionStart 주입 | ~350 토큰 | A3.1 예시 기준 |
| 훅 제안 (요청당) | ~80 토큰 | B3.2 예시 기준 |
| **상시 합계** | **~1,650 토큰** | NFR-1(2,000) 이내 ✅ |

여유가 부족해지면 줄이는 순서: ① `when_to_use` 어휘 축약 → ② 사용 빈도 낮은 스킬에 `disable-model-invocation: true` (description이 컨텍스트에서 빠짐) → ③ 스킬 통합.

---

## B6. 실패 모드와 대응

| 실패 | 증상 | 대응 |
|---|---|---|
| 상태 파일 손상 | JSON 파싱 실패 | 훅 fail-open + `/tene:doctor` 가 복구 제안. 인덱스는 재생성 |
| 상태 파일과 문서 불일치 | 게이트 판정이 실제와 다름 | `/tene:sprint status --resync` 로 문서에서 상태 재구성 (**문서가 정본**) |
| 두 세션이 동시 편집 | 마지막 쓰기 승리 | 쓰기 전 `updatedAt` 비교, 충돌 시 경고 후 사용자 선택 |
| 훅이 느려짐 | 입력 지연 | 인덱스 O(1) 조회만 허용. 200ms 초과 시 스스로 exit 0 |
| 트리거 과다 | 제안 피로 | 세션당 동일 제안 1회 제한 |
| 인덱스 최신성 결여 | stale 마킹 누락 | design 단계와 `/tene:loop-check` 시작 시 인덱스 재생성 |
