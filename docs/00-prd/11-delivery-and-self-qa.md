# tene plugin — 배포와 자체 QA

> 대응 갭: G-h(자체 QA 전략), 온보딩·호환성 미정
> 목적: "이 플러그인을 어떻게 검증하고 어떻게 남에게 전달하는가"를 확정

---

## 1. 첫 실행 경험 (온보딩)

### 1.1 설치 직후 — 아무 일도 일어나지 않는다

```
/plugin install tene@agent-kay-it
→ 다음 세션 시작
→ SessionStart 훅: 활성 sprint 없음 + master plan 없음 → 아무것도 주입하지 않음
```

**이것이 설계 의도다.** 설치했다고 말을 걸지 않는다. 조용한 플러그인이 신뢰를 얻는다.

### 1.2 첫 진입점 3가지

사용자가 어디로 들어오든 막히지 않게 한다.

| 진입 | 트리거 | 동작 |
|---|---|---|
| **A. 단독 조사** | `/tene:understand <symbol>` 또는 "이거 어디서 쓰여?" | sprint 없이 즉시 동작. **플러그인 가치의 첫 체험** |
| **B. 환경 확인** | `/tene:doctor` | 무엇이 되고 무엇이 안 되는지 표로 제시 |
| **C. 사이클 시작** | `/tene:sprint init` 또는 "새 기능 만들어줘" | 첫 sprint 생성 |

**A를 첫 진입점으로 설계한 것이 중요하다.** 사이클 전체를 도입하지 않아도 `/tene:understand` 하나로 가치를 느낄 수 있어야 도입 장벽이 낮다.

### 1.3 첫 sprint 생성 시 세팅 흐름

```
/tene:sprint init my-feature
  │
  ├─ 1. 계층 규칙 없음 감지
  │     "프로젝트 구조를 스캔해 계층 규칙을 만들까요? (권장)
  │      Understanding Layer 분류와 6가지 질문의 정확도가 올라갑니다."
  │      → 예: /tene:layers scan 실행 → 확인 → layers.yml 저장
  │      → 아니오: 기본 프리셋으로 진행 (미분류가 많아질 수 있음을 안내)
  │
  ├─ 2. 인덱스 없음 감지
  │     백그라운드로 tene-scan build 실행 (사용자 대기 없음)
  │
  ├─ 3. 문서 언어 확정 (D10)
  │     세션의 사용자 언어를 감지해 상태에 기록. 이후 고정
  │
  ├─ 4. .gitignore 제안
  │     ".tene-claude/index/, .tene-claude/history/, .tene-claude/archive/ 를
  │      .gitignore 에 추가할까요?"
  │
  └─ 5. 다음 행동: /tene:prd my-feature
```

**전부 건너뛸 수 있어야 한다.** 설정 강요는 이탈을 만든다.

### 1.4 제거 경험

```
/plugin uninstall tene@agent-kay-it
→ docs/sprints/**  : 그대로 남는다 (사람이 읽는 산출물, git 자산)
→ .tene-claude/      : 그대로 남는다 (사용자가 직접 삭제)
```

**플러그인을 지워도 프로젝트가 깨지지 않는다** (NFR-7). 남은 문서는 그 자체로 읽을 수 있는 마크다운이다.

---

## 2. 버전 호환성

### 2.1 Claude Code 버전 요구

| 기능 | 최소 버전 | 미달 시 |
|---|---|---|
| 플러그인 기본 (skills/agents/hooks) | v2.1.143 | 설치 불가 |
| `TaskCreate`/`TaskUpdate`/`TaskGet`/`TaskList` | v2.1.142 | 태스크 연동 비활성, 상태 파일만 사용 |
| Dynamic Workflow | v2.1.154 | 순차 서브에이전트로 degrade |
| `defaultEnabled` 매니페스트 필드 | v2.1.154 | 필드 무시됨 (기본 활성) |
| 워크플로 크기 가이드라인 | v2.1.219 | `unrestricted` 로 동작 |
| skills 경로 `"."` 표기 | v2.1.221 | `"./"` 사용 (하위 호환 표기 채택) |

**선언 최소 버전**: `v2.1.154` — 워크플로가 핵심 기능이므로.
**degrade 최소 버전**: `v2.1.143` — 이 이하는 설치 자체가 안 된다.

### 2.2 버전 감지와 대응

```
버전 감지는 CLAUDE_CODE_EXECPATH → 캐시 → claude --version 3단 폴백 (D12 §8.0)
※ `claude --version` 은 실측 2.5초. 훅에서는 호출하지 않는다.

  < 2.1.143 → 경고 1회 표시 (동작은 시도)
  < 2.1.154 → 워크플로 기능 비활성, 순차 모드로 고정. /tene:doctor 에 표시
  ≥ 2.1.154 → 전 기능
  감지 불가 → 보수적으로 워크플로 비활성
```

`/tene:doctor` 에 항상 표시:
```
Claude Code   : v2.1.234  ✅
Dynamic Workflow : ✅ 사용 가능
Task Management  : ✅ 사용 가능
Node.js       : v22.3.0   ✅ (bin 스크립트 요구: 20+)
```

### 2.3 플러그인 자체 버전 정책

01 §7.4 결정을 따른다.

| 규칙 | 내용 |
|---|---|
| `version` 선언 위치 | **`plugin.json` 에만.** marketplace 엔트리에는 두지 않는다 |
| bump 시점 | 릴리즈마다 필수. 태그 + bump 를 한 커밋으로 |
| 스키마 버전 | 상태 파일·인덱스에 `schemaVersion` 별도 관리 |
| 스키마 마이그레이션 | `tene-state` 가 구버전 감지 시 자동 변환, 실패 시 백업 후 재생성 |

---

## 3. 자체 QA 전략

> **이 플러그인은 자기 자신의 방법론으로 검증되어야 한다.** 그러지 못하면 남에게 권할 수 없다.

### 3.1 3층 검증

```
┌────────────────────────────────────────────────────────┐
│ L3 · Dogfooding    tene 로 tene 를 개발한다              │
│      이 저장소가 docs/sprints/ 를 갖고 사이클을 돈다      │
├────────────────────────────────────────────────────────┤
│ L2 · Eval          스킬·에이전트의 판단 품질 평가         │
│      고정 픽스처에 대해 기대 판정이 나오는가              │
├────────────────────────────────────────────────────────┤
│ L1 · Unit          bin/ 스크립트의 결정론적 동작          │
│      같은 입력 → 같은 출력                              │
└────────────────────────────────────────────────────────┘
```

### 3.2 L1 — 단위 테스트 (Node 표준 `node:test`)

외부 의존 0 원칙을 테스트에도 적용한다.

| 대상 | 테스트 항목 |
|---|---|
| `tene-scan` | 언어 팩별 정의/import/참조 추출 정확도 (픽스처 기반), 주석·문자열 오탐 제외 |
| `tene-state` | 원자적 쓰기, 낙관적 잠금 충돌, 손상 파일 복구, 크기 상한 |
| `tene-doc` | 섹션 앵커 파싱, 플레이스홀더 탐지, 자동 블록 patch 가 사람 영역을 건드리지 않는가 |
| `tene-gate` | 게이트별 판정 진리표 |
| `tene-guard` | **세그먼트 분해 정확도** (05 §6 V1~V12) |
| 계층 판정 | precedence, 미매칭 시 unclassified 반환 |
| 일치율 | unverifiable 제외, 수렴 감지 |

**가장 중요한 것은 `tene-guard` 다.** fail-closed 컴포넌트이므로 오탐(정상 명령 차단)과 미탐(위험 명령 통과) 양쪽을 다 측정한다.

```
guard 테스트 매트릭스: 명령 40종 × 권한모드 6종
  positive control : 차단되어야 하는 명령이 전부 차단되는가
  negative control : 통과해야 하는 명령이 전부 통과하는가
회귀 기준: negative control 오탐 0건, positive control 미탐 0건
```

### 3.3 L2 — Eval (판단 품질)

스킬과 에이전트는 LLM이 실행하므로 단위 테스트로 잡히지 않는다. **픽스처 프로젝트 + 기대 판정**으로 평가한다.

**픽스처 구성** (`evals/fixtures/`)
```
fixtures/
├── ts-express-app/        # TS + Express + Prisma. 계층이 명확한 프로젝트
├── py-fastapi-app/        # Python. 언어 팩 검증
├── flat-app/              # 계층 규칙이 안 잡히는 평평한 구조 (미분류 다수)
└── no-lsp-no-test/        # 도구가 전부 없는 최악 환경 (degrade 검증)
```

**Eval 케이스**

| ID | 대상 | 입력 | 기대 |
|---|---|---|---|
| E-1 | `/tene:prd` | "결제 실패 시 입력값 보존" 요구 | AC ≥ 3, If-then ≥ 1, 범위 밖 비어있지 않음 |
| E-2 | `/tene:prd` | 사용자가 실패 경로를 말하지 않음 | **실패 경로를 질문한다** |
| E-3 | `tene-cartographer` | ts-express-app | 4계층 분류 정확도 ≥ 90%, 미분류를 지어내지 않음 |
| E-4 | `tene-cartographer` | flat-app | **미분류를 미분류로 보고** (억지 배정 0건) |
| E-5 | `tene-gap-auditor` | 의도적으로 AC 1개 미구현 | 그 AC 를 missing 으로 잡아냄 |
| E-6 | `tene-gap-auditor` | 전부 구현됨 | 일치율 100%, 허위 갭 0건 |
| E-7 | `tene-judge` | 증거 없음 | **`insufficient` 반환** (pass 아님) |
| E-8 | `tene-judge` | 증거가 기준 위반을 보임 | `fail` 반환 |
| E-9 | `tene-refuter` | 빈약한 증거의 pass | `refuted: true` |
| E-10 | `/tene:qa` | no-lsp-no-test 환경 | 전 항목 `insufficient`, 0%나 pass 로 위장하지 않음 |
| E-11 | `/tene:report` | 완료된 sprint | R1~R6 전부 채워짐, R6 사유 존재 |
| E-12 | 앵커링 | 스펙에 없는 파일 변경 | **미귀속 변경으로 보고** |

**합격 기준**: E-2, E-4, E-7, E-10, E-12 는 **정직성 테스트**로 분류하고 **100% 통과를 요구**한다. 나머지는 90% 이상.

> 정직성 테스트가 깨지면 제품의 존재 이유가 무너진다. 정확도는 타협 가능하지만 **미측정을 통과로 위장하는 것은 타협 불가**다.

### 3.4 L3 — Dogfooding

이 저장소 자체가 tene 의 첫 사용자가 된다.

```
tene-claude/
├── docs/00-rnd/           # 조사 (사이클 밖)
├── docs/00-prd/           # 본 기획 문서 (사이클 밖)
└── docs/sprints/          # ← tene 개발이 여기서 sprint 로 돌아간다
    ├── master-plan.md
    ├── _meta/layers.yml
    ├── m1-skeleton/
    ├── m2-cycle/
    └── m3-understanding/
```

**Dogfooding 이 잡아내는 것**: 실제로 써 보지 않으면 안 보이는 마찰. 예를 들어 "게이트가 너무 자주 막는다", "인터뷰가 너무 길다", "report 자동 생성이 읽기 어렵다" 같은 것.

**규칙**: M2(사이클) 완료 시점부터 **M3 이후의 개발은 반드시 tene 사이클로 진행**한다. 자기 도구로 자기를 만들지 못하면 출시하지 않는다.

### 3.5 CI 파이프라인

```yaml
name: validate
on: [push, pull_request]
jobs:
  static:
    steps:
      - run: npm i -g @anthropic-ai/claude-code
      - run: claude plugin validate ./plugins/tene --strict
      - run: claude plugin validate . --strict            # 마켓플레이스
      - run: node --test plugins/tene/test/               # L1 단위 테스트
      - run: node plugins/tene/test/guard-matrix.js       # 가드 매트릭스
  eval:
    # PR 라벨 'run-eval' 또는 main 푸시에서만 (토큰 비용)
    if: contains(github.event.pull_request.labels.*.name, 'run-eval')
    steps:
      - run: node evals/runner.js --strict-honesty
```

**Eval 을 매 PR 에 돌리지 않는 이유**: LLM 호출 비용. 정직성 테스트만 추려 경량 세트를 매 PR 에 돌리는 방안을 M8 에서 재검토한다.

---

## 4. 배포

### 4.1 저장소 구조 (02 §8.1 재확인)

```
tene-claude/
├── .claude-plugin/marketplace.json     ← 마켓플레이스
├── plugins/tene/                       ← 플러그인 (source: "./plugins/tene")
├── evals/                              ← 픽스처 + 러너
├── docs/{00-rnd,00-prd,sprints}/
└── .github/workflows/validate.yml
```

### 4.2 릴리즈 절차

```
1. plugins/tene/.claude-plugin/plugin.json 의 version bump
2. CHANGELOG.md 갱신
3. claude plugin validate ./plugins/tene --strict  (로컬)
4. 커밋 + 태그 (같은 커밋에)
5. 푸시 → CI 통과 확인
6. 사용자: /plugin marketplace update && /plugin update tene@agent-kay-it
```

### 4.3 배포 단계

| Phase | 대상 | 방법 |
|---|---|---|
| 0 | 본인 | `claude --plugin-dir ./plugins/tene` |
| 1 | 내부/팀 | 프로젝트 `.claude/settings.json` 의 `extraKnownMarketplaces` |
| 2 | 공개 | GitHub 마켓플레이스 저장소 공개 |
| 3 | 커뮤니티 | Console 폼(`platform.claude.com/plugins/submit`) 제출 |

### 4.4 배포 전 체크리스트

01 §7 과 00-rnd/01 §6 의 함정을 반영한 필수 확인:

- [ ] `.claude-plugin/plugin.json` 존재 (없으면 네임스페이스 중복·병합 발생, 이슈 #76234)
- [ ] `version` 이 `plugin.json` 에만 있고 marketplace 엔트리에는 없다
- [ ] `commands/`, `agents/`, `skills/`, `hooks/` 가 `.claude-plugin/` **밖**에 있다
- [ ] `claude plugin validate --strict` 통과
- [ ] 훅 명령이 **exec 폼**이다 (`${user_config.*}` 사용 시 필수)
- [ ] 모든 경로가 `${CLAUDE_PLUGIN_ROOT}` 기준이다
- [ ] `bin/` 스크립트에 실행 권한이 있고 shebang 이 있다
- [ ] npm 의존성이 0개다
- [ ] README 에 `name@marketplace` 형태 업데이트 방법이 있다 (bare 이름 실패 이슈 #86564)
- [ ] 빈 프로젝트에서 설치 → `/tene:doctor` → `/tene:understand` 가 오류 없이 동작한다

### 4.5 문서화 (사용자용 README)

플러그인 README 에 반드시 들어갈 것:

| 섹션 | 내용 |
|---|---|
| 30초 소개 | 무엇을 해결하는가 |
| 설치 | marketplace add → install |
| **첫 사용** | `/tene:understand` 로 5분 안에 가치 체험 |
| 사이클 | 8단계 다이어그램 + 각 단계 1줄 |
| 문서 구조 | 어떤 파일이 어디에 생기는가 |
| 설정 | userConfig 표 |
| **degrade 안내** | LSP·브라우저·테스트러너 없을 때 무엇이 달라지는가 |
| 제거 | 지워도 문서는 남는다 |
| 업데이트 | `/plugin update tene@agent-kay-it` (bare 이름 안 됨) |

---

## 5. 출시 판정 기준 (Definition of Done)

| # | 기준 | 검증 |
|---|---|---|
| 1 | 빈 프로젝트에서 설치만으로 `/tene:understand` 동작 | 수동 + CI |
| 2 | 전 사이클(prd~archive)이 한 sprint 완주 | Dogfooding |
| 3 | 정직성 Eval(E-2,4,7,10,12) 100% 통과 | CI |
| 4 | 가드 매트릭스 오탐 0 / 미탐 0 | CI |
| 5 | 상시 컨텍스트 부담 ≤ 2,000 토큰 | `/context` 측정 |
| 6 | 동기 훅 200ms 이내 | 벤치마크 |
| 7 | M3 이후 개발이 tene 사이클로 진행됨 | `docs/sprints/` 존재 |
| 8 | 4개 픽스처 환경 전부에서 degrade 동작 | Eval |
| 9 | 플러그인 제거 후 프로젝트 정상 | 수동 |
| 10 | 배포 전 체크리스트 전항 통과 | 릴리즈 절차 |

---

## 6. 출시 후 운영

| 항목 | 방침 |
|---|---|
| 이슈 수집 | GitHub Issues. 재현 정보로 `/tene:doctor --json` 출력 요청 |
| 회귀 방지 | 보고된 결함마다 L1 테스트 또는 Eval 케이스 추가 후 수정 |
| 스키마 변경 | `schemaVersion` bump + 자동 마이그레이션 + 실패 시 백업 |
| Claude Code 버전 추적 | 새 CC 릴리즈 시 §2.1 표 재검증 |
| 사용자 데이터 | 수집하지 않는다. 전부 로컬 파일 |
