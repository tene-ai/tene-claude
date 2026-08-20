# D00 · 시스템 아키텍처

> 대응: [00-prd/02](../00-prd/02-plugin-architecture.md), [01-plan/00](../01-plan/00-master-implementation-plan.md)

---

## 1. 계층 구조

```
┌───────────────────────────────────────────────────────────────────────┐
│ L4 · SURFACE                                                          │
│   Skills (/tene:*)  ·  Agents  ·  자연어 라우터                         │
│   사용자·모델이 만나는 유일한 표면. 자연어 판단이 여기서 일어난다          │
├───────────────────────────────────────────────────────────────────────┤
│ L3 · ENFORCEMENT                                                      │
│   Hooks  ·  Task blockedBy  ·  Gate rules                              │
│   결정론적 차단. 모델이 우회할 수 없는 유일한 층                          │
├───────────────────────────────────────────────────────────────────────┤
│ L2 · CORE (bin/ + lib/)                                               │
│   tene-state · tene-doc · tene-scan · tene-gate · tene-guard          │
│   순수 함수 + 원자적 I/O. 같은 입력 → 같은 출력                          │
├───────────────────────────────────────────────────────────────────────┤
│ L1 · STORAGE                                                          │
│   docs/sprints/ (정본)  ·  .tene-claude/ (파생)                        │
│   전부 텍스트. 플러그인 없이도 읽힌다                                    │
├───────────────────────────────────────────────────────────────────────┤
│ L0 · EVIDENCE SOURCE (외부, 전부 선택적)                                │
│   LSP · Test Runner · Chrome MCP/Playwright · git · tene CLI          │
└───────────────────────────────────────────────────────────────────────┘
```

### 1.1 계층 간 규칙

| 규칙 | 내용 |
|---|---|
| **하향 호출만** | L4 → L3 → L2 → L1. 역방향 호출 없음 |
| **L4 는 L1 을 직접 쓰지 않는다** | 스킬이 상태 JSON 을 직접 편집 금지. 반드시 L2 경유 |
| **L3 은 L2 만 호출한다** | 훅이 파일을 직접 파싱하지 않는다 |
| **L2 는 순수 함수 + I/O 경계 분리** | `lib/` 로직은 부수효과 없음. I/O 는 `lib/util/atomic.js` 만 |
| **L0 부재는 실패가 아니다** | 없으면 `insufficient` 로 정직 보고 |

### 1.2 왜 이 구조인가

```
문제: LLM 은 비결정적이다. 그런데 게이트 판정은 결정적이어야 한다.
해법: 판단(L4)과 판정(L2/L3)을 물리적으로 분리한다.

  L4 가 "이 AC 는 충족된 것 같다" 라고 말해도
  L3 훅이 L2 게이트를 호출해 상태 파일을 읽고 독립적으로 판정한다.
  L4 의 주장은 판정에 입력되지 않는다.
```

---

## 2. 데이터 흐름 — 하나의 sprint

```
[사용자] "결제 실패 시 입력값 보존 기능 만들어줘"
   │
   │ ① UserPromptSubmit 훅 (L3)
   │    → lib/router 가 키워드 매칭 → additionalContext 로 /tene:sprint init 제안
   ▼
/tene:sprint init checkout-retry                                    (L4)
   │  bin/tene-state init                                            (L2)
   │    → .tene-claude/state/sprints/checkout-retry.json 생성        (L1)
   │  bin/tene-doc scaffold --doc prd                                (L2)
   │    → docs/sprints/checkout-retry-<slug>/00-prd/prd.md           (L1)
   ▼
/tene:prd checkout-retry                                            (L4)
   │  tene-interviewer 에이전트 → AskUserQuestion 인터뷰
   │  bin/tene-doc patch --block intents/ac                          (L2)
   │  bin/tene-state ac --set                                        (L2)
   │  bin/tene-gate check --gate G1                                  (L2)
   ▼ G1 pass
/tene:plan → /tene:design                                           (L4)
   │  tene-cartographer 에이전트
   │    → bin/tene-scan questions/layer                              (L2)
   │    → .tene-claude/index/{symbols,anchors,understanding}.json    (L1)
   │  bin/tene-doc patch --block layers/questions                    (L2)
   ▼ G3 pass
[do] 구현
   │  ② PostToolUse 훅 (L3)
   │     → bin/tene-scan touched <file> → bin/tene-state stale       (L2)
   │     → additionalContext 로 "AC-2 재검증 필요" 알림
   ▼
/tene:loop-check                                                    (L4)
   │  tene-gap-auditor 에이전트 (또는 conformance-audit 워크플로)
   │  bin/tene-doc extract --what requirements                       (L2)
   │  갭 판정 → loop-check-1.md → 개선 태스크
   ▼ G5 pass
/tene:qa                                                            (L4)
   │  qa-planner → charter 생성
   │  qa-sweep 워크플로 (AC≥8) 또는 순차 에이전트
   │    runner(수집) → judge(판정) → refuter(반박)
   │  evidence/<run-id>/manifest.json + artifacts                    (L1)
   │  bin/tene-gate check --gate G6                                  (L2)
   ▼
   │  ③ TaskCompleted 훅 (L3)
   │     → bin/tene-gate task-complete → blocking AC 미충족 시 exit 2
   ▼ G6 pass
/tene:report → /tene:archive                                        (L4)
```

**세 개의 훅(①②③)이 이 흐름의 강제 지점**이다. 나머지는 전부 협조적이다.

---

## 3. 모듈 구조

```
plugins/tene/
├── bin/                          진입점 (인자 파싱 + lib 호출만, ≤80 LOC each)
│   ├── tene-state                상태 CRUD
│   ├── tene-doc                  문서 생성·검증·patch·extract
│   ├── tene-scan                 코드 인덱서·계층·6질문
│   ├── tene-loop                 loop-check 판정 (문서 ↔ 구현 대조)
│   ├── tene-qa                   QA 계획·증거·커버리지 (판정 제외)
│   ├── tene-report               R1~R6 표 조립 (서술 제외)
│   ├── tene-gate                 게이트 판정 (+ task-complete 훅)
│   ├── tene-guard                시크릿 가드 (fail-closed)
│   └── tene-hook                 훅 단일 진입점 (D05 §8)
├── lib/
│   ├── util/
│   │   ├── atomic.js             원자적 쓰기 (temp→fsync→rename)
│   │   ├── lock.js               advisory lock
│   │   ├── json.js               안정 직렬화 (키 정렬, trailing newline)
│   │   ├── errors.js             오류 코드 + remediation
│   │   ├── envelope.js           응답 봉투 생성
│   │   ├── paths.js              프로젝트 루트 탐색, 경로 정규화·이탈 방지
│   │   ├── budget.js             토큰 추정·절삭
│   │   └── time.js               UTC ISO 8601
│   ├── state/
│   │   ├── schema.js             타입 정의 + 검증
│   │   ├── store.js              읽기/쓰기/낙관적 잠금
│   │   ├── events.js             NDJSON append
│   │   ├── summary.js            SessionStart 요약
│   │   ├── retention.js          크기 관리·아카이브
│   │   ├── resync.js             문서 → 상태 재구성
│   │   └── migrate.js            스키마 마이그레이션
│   ├── doc/
│   │   ├── sections.js           문서별 필수 섹션 ID 표
│   │   ├── parser.js             frontmatter + 앵커 + 표 파싱
│   │   ├── template.js           스캐폴드 생성
│   │   ├── validate.js           검증 규칙 16종
│   │   ├── patch.js              자동 블록 교체
│   │   └── extract.js            ac/tasks/edges/anchors/requirements 추출
│   ├── scan/
│   │   ├── walk.js               파일 순회 (.gitignore 존중)
│   │   ├── langs/
│   │   │   ├── index.js          언어 팩 레지스트리
│   │   │   ├── typescript.js
│   │   │   ├── python.js
│   │   │   ├── go.js
│   │   │   └── java.js
│   │   ├── index-builder.js      인덱스 생성 (증분)
│   │   ├── query.js              defs/refs/callers/imports
│   │   ├── layer.js              계층 판정
│   │   ├── questions.js          6질문 조립
│   │   └── anchors.js            AC ↔ 파일 역인덱스
│   ├── gate/
│   │   ├── rules.js              G1~G7 규칙
│   │   └── finding.js            Finding 구조 + remediation
│   ├── guard/
│   │   ├── segment.js            명령 세그먼트 분해
│   │   ├── rules.js              시크릿 규칙
│   │   └── mode.js               권한 모드별 강도
│   ├── loop/
│   │   ├── requirements.js       요구 항목 추출
│   │   ├── judge.js              갭 판정
│   │   ├── progress.js           진행률·수렴
│   │   └── unattributed.js       미귀속 변경
│   ├── qa/
│   │   ├── charter.js            Test Charter 생성
│   │   ├── layers.js             7-Layer 계획
│   │   ├── capability.js         어댑터 감지
│   │   ├── evidence.js           매니페스트 + sha256
│   │   └── coverage.js           전이 커버리지
│   ├── report/
│   │   ├── lineage.js            R1
│   │   ├── changes.js            R2
│   │   ├── intent-map.js         R3
│   │   ├── layers-questions.js   R4/R5
│   │   └── carry.js              R6
│   ├── plan/
│   │   ├── aggregate.js          master plan 집계
│   │   └── promote.js            carryOver 승격
│   ├── router/
│   │   ├── rules.json            트리거 규칙
│   │   └── match.js              매칭 + 중복 제어
│   └── hooks/
│       ├── session-start.js
│       ├── user-prompt.js
│       ├── post-tool-use.js
│       ├── task-completed.js
│       ├── stop.js
│       └── compact.js
├── skills/       (11종)
├── agents/       (8종)
├── workflows/    (3종)
├── hooks/hooks.json
├── templates/    (문서 7종 × 2언어 + layers.default.yml)
└── test/
```

### 3.1 `bin/` 은 왜 얇은가

```javascript
#!/usr/bin/env node
// bin/tene-scan — 전체 구조
import { parseArgs } from 'node:util'
import { run } from '../lib/scan/cli.js'
import { emit, fail } from '../lib/util/envelope.js'

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  project: { type: 'string' }, json: { type: 'boolean', default: true },
  limit: { type: 'string' }, kind: { type: 'string' },
}})

try {
  emit(await run(positionals[0], positionals.slice(1), values))
} catch (err) {
  fail(err)   // 오류 코드 + remediation 을 봉투에 담아 stdout, exit code 설정
}
```

**이유**: 로직이 `lib/` 에 있어야 `node:test` 로 프로세스 기동 없이 테스트할 수 있다. `bin/` 을 테스트하려면 매번 자식 프로세스를 띄워야 한다.

---

## 4. 순수성 경계

```
┌─────────────────────────────────────────────────────┐
│  순수 함수 영역 (부수효과 없음, 테스트 쉬움)           │
│                                                     │
│  lib/doc/parser.js    lib/doc/validate.js           │
│  lib/scan/langs/*     lib/scan/layer.js             │
│  lib/gate/rules.js    lib/guard/rules.js            │
│  lib/loop/judge.js    lib/qa/charter.js             │
│  lib/util/budget.js   lib/util/json.js              │
└──────────────────────┬──────────────────────────────┘
                       │ 데이터만 주고받음
┌──────────────────────▼──────────────────────────────┐
│  I/O 경계 (부수효과 집중)                             │
│                                                     │
│  lib/util/atomic.js   lib/util/lock.js              │
│  lib/state/store.js   lib/scan/walk.js              │
└─────────────────────────────────────────────────────┘
```

**규칙**: 순수 영역의 함수는 `fs` 를 import 하지 않는다. 파일 내용은 인자로 받는다.

```javascript
// ✅ 순수
export function validateDoc(text, docType) { ... }

// ❌ 금지
export function validateDoc(path, docType) { const text = readFileSync(path) ... }
```

---

## 5. 상태 소유권

| 데이터 | 정본 | 파생 | 재생성 |
|---|---|---|---|
| 기획 의도 (Intent) | `docs/.../prd.md` Intent 표 | `state/sprints/*.json` 요약 | `resync` |
| 수용 기준 (AC) | `docs/.../prd.md` AC 표 | 동일 | `resync` |
| AC 판정 | `docs/.../qa.md` 판정 표 | 동일 | `resync` |
| phase | `state/sprints/*.json` | — | 문서 존재로 추정 가능 |
| 게이트 결과 | `state/sprints/*.json` | — | 재판정 가능 |
| 심볼 인덱스 | — | `index/symbols.json` | `scan build` |
| AC 앵커 | `docs/.../design.md` 앵커 표 | `index/anchors.json` | `scan build` |
| 계층 맵 | `docs/.../design.md` 4계층 | `index/understanding.json` | `scan build` |
| 증거 | `evidence/<run>/manifest.json` | — | 재실행 필요 |
| 이벤트 | `history/events.ndjson` | — | 불가 (append-only) |

**원칙**: 사람이 읽어야 하는 것은 문서, 기계가 빨리 읽어야 하는 것은 인덱스. **인덱스는 전부 지워도 복구된다.**

---

## 6. 성능 예산 배분

| 경로 | 예산 | 설계 대응 |
|---|---|---|
| `PostToolUse` 훅 | 200ms | `anchors.json` 을 메모리 맵 없이 단일 `readFileSync` + 객체 조회 |
| `SessionStart` 훅 | 200ms | `current.json` 1개만 읽음. sprint 파일 미접근 |
| `TaskCompleted` 훅 | 500ms | sprint 파일 1개 + 게이트 규칙 평가 (순수 함수) |
| `SessionEnd` 훅 | **1.5s 공유** | 크기 확인만(`stat`), 정리는 다음 세션 예약 |
| `scan build` (1,000 파일) | 10s | 증분 빌드, 파일당 단일 패스 |
| `scan questions` | 500ms | 인덱스 조회만 |
| 스킬 호출 | 30s | 사용자 대기 가능 구간 |

### 6.1 훅이 200ms 를 지키는 방법

```javascript
// lib/hooks/post-tool-use.js
const DEADLINE_MS = 150   // 여유 50ms

export async function run(payload) {
  const t0 = performance.now()
  const guard = () => { if (performance.now() - t0 > DEADLINE_MS) throw new Deadline() }

  try {
    const anchors = readAnchorIndex()      // 단일 파일, 캐시 가능
    guard()
    const acs = anchors.byPath[payload.tool_input.file_path] ?? []
    if (!acs.length) return { exit: 0 }
    guard()
    markStale(acs, payload.tool_input.file_path)   // 상태 파일 1개 쓰기
    return { exit: 0, additionalContext: buildNotice(acs) }
  } catch (e) {
    return { exit: 0 }    // fail-open. 지연도 실패도 사용자를 막지 않는다
  }
}
```

---

## 7. 확장 지점

| 확장 | 방법 | 안정성 |
|---|---|---|
| 언어 팩 추가 | `lib/scan/langs/<name>.js` + 레지스트리 등록 | 안정 API |
| 계층 규칙 | `docs/sprints/_meta/layers.yml` | 사용자 데이터 |
| QA 어댑터 추가 | `lib/qa/adapters/<name>.js` (M5 이후) | 실험적 |
| 문서 템플릿 | 프로젝트 `.claude/skills/` 오버라이드 | 사용자 데이터 |
| 트리거 규칙 | `lib/router/rules.json` | 내부 (userConfig 로 on/off 만) |
| 게이트 임계 | `userConfig` | 안정 |

---

## 8. 의존성 정책

```json
// plugins/tene/package.json
{
  "name": "tene-plugin",
  "type": "module",
  "engines": { "node": ">=20" },
  "dependencies": {},          ← 항상 비어 있어야 한다
  "devDependencies": {}        ← 테스트도 node:test 만 사용
}
```

CI 의 `scripts/assert-no-deps.js` 가 이를 강제한다.

**예외 없음.** YAML 파싱조차 자체 구현한다 (`layers.yml` 은 단순 구조로 제한).

---

## 9. 실패 모드 요약

| 실패 | 계층 | 동작 |
|---|---|---|
| 상태 파일 손상 | L1 | `.corrupt-<ts>` 보존 → `resync` 안내 → 훅은 exit 0 |
| 인덱스 없음 | L1 | 스킬이 `scan build` 자동 실행. 훅은 조용히 통과 |
| 문서 없음 | L1 | 게이트가 `DOC_MISSING` 반환 + 해당 스킬 안내 |
| 훅 지연 | L3 | 자체 중단 후 exit 0 |
| 게이트 오류 | L2 | fail-open (exit 0) — 단 `tene-guard` 는 fail-closed |
| 워크플로 불가 (버전) | L4 | 순차 서브에이전트로 degrade |
| LSP/브라우저/러너 부재 | L0 | `insufficient` 로 정직 보고 |
| tene CLI 부재 | L0 | 시크릿 스킬 조용히 비활성화 |

**단 하나의 fail-closed**: `tene-guard`. 내부 예외 발생 시에도 `deny` 한다.
