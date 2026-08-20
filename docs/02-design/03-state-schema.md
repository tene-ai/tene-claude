# D03 · 상태 스키마와 저장소

> 대응: FR-5.1~5.5, NFR-3, NFR-7, W-21~W-27
> 관련: [D02 상태 기계](./02-workflow-state-machine.md), [D12 오류·동시성](./12-errors-concurrency-migration.md)

---

## 1. 디렉토리 레이아웃

```
<project>/
├── docs/sprints/                          ← 정본 (git 커밋)
│   ├── _meta/
│   │   ├── project.json                   프로젝트 고정값
│   │   └── layers.yml                     계층 규칙
│   ├── master-plan.md
│   ├── <sprint-id>-<slug>/
│   │   ├── 00-prd/prd.md
│   │   ├── 01-plan/plan.md
│   │   ├── 02-design/design.md
│   │   ├── 03-analysis/loop-check-1.md
│   │   ├── 03-analysis/loop-check-2.md
│   │   ├── 03-analysis/qa.md
│   │   ├── 04-report/report.md
│   │   └── evidence/<run-id>/
│   │       ├── manifest.json
│   │       └── <artifact files>
│   └── _archive/2026-08/<sprint-id>-<slug>/
│
└── .tene-claude/                          ← 파생·운영
    ├── state/                             ← git 커밋 권장
    │   ├── current.json
    │   ├── master-plan.json
    │   └── sprints/<sprint-id>.json
    ├── index/                             ← .gitignore
    │   ├── symbols.json
    │   ├── anchors.json
    │   └── understanding.json
    ├── history/                           ← .gitignore
    │   ├── events.ndjson
    │   └── suggested.json
    ├── archive/                           ← .gitignore
    │   └── 2026-08/events.ndjson
    ├── .lock
    └── .gitignore
```

### 1.1 sprint 디렉토리 명명

```
<sprint-id>-<slug>
  sprint-id : ^[a-z][a-z0-9-]{0,31}$        사용자 지정 또는 자동 생성
  slug      : 제목에서 파생, 소문자·하이픈, 최대 40자

예: checkout-retry-payment-failure-input-preservation
```

**id 만으로 조회 가능해야 한다.** 디렉토리 탐색 시 `<id>-*` 로 매칭한다. slug 가 바뀌어도 id 로 찾는다.

---

## 2. 공통 규약

### 2.1 봉투

모든 상태 파일의 최상위:

```jsonc
{
  "schemaVersion": 1,
  "updatedAt": "2026-08-20T04:20:00Z",     // RFC 3339 UTC
  "updatedBy": { "kind": "claude", "sessionId": "abc12345" },
  // ... 파일별 내용
}
```

### 2.2 직렬화 규칙

| 규칙 | 내용 |
|---|---|
| 인코딩 | UTF-8, BOM 없음 |
| 키 순서 | **안정 정렬** — `lib/util/json.js` 가 재귀적으로 키를 정렬 |
| 들여쓰기 | 2 스페이스 |
| 끝 | trailing newline |
| 시간 | ISO 8601 UTC (`2026-08-20T04:20:00Z`) |
| 경로 | **프로젝트 루트 상대** (`docs/sprints/...`), 절대 경로 금지 |
| null vs 생략 | 명시적 부재는 `null`, 아직 없는 것은 키 생략 |

**키 정렬 이유**: git diff 를 안정시킨다. 순서가 흔들리면 매번 전체 파일이 변경으로 보인다.

### 2.3 ID 체계

| 접두사 | 대상 | 형식 | 예 |
|---|---|---|---|
| (없음) | sprint | 사용자 지정 slug | `checkout-retry` |
| `intent_` | Intent | 순번 | `intent_1` |
| `ac_` | 수용 기준 | 순번 | `ac_2` |
| `task_` | 작업 항목 | 순번 | `task_3` |
| `gap_` | 갭 | 순번 | `gap_5` |
| `run_` | QA 실행 | 순번 + 날짜 | `run_20260820_01` |
| `waiver_` | Waiver | 순번 | `waiver_1` |
| `charter_` | Test Charter | 순번 | `charter_2` |

**ULID 대신 순번**을 쓴다 — 사람이 문서 표에서 읽고 쓰는 값이기 때문이다. sprint 내에서만 유일하면 된다.

---

## 3. `_meta/project.json`

프로젝트 전체에 고정되는 값. **한 번 정하면 잘 바뀌지 않는다.**

```jsonc
{
  "schemaVersion": 1,
  "createdAt": "2026-08-18T02:00:00Z",
  "updatedAt": "2026-08-18T02:00:00Z",
  "docLanguage": "ko",                    // 최초 sprint 에서 확정, 이후 고정
  "docsRoot": "docs/sprints",
  "defaultProfile": "standard",
  "buildCommand": "npm run typecheck",    // G4 검사용 (선택)
  "testCommand": "npm test",              // QA L2 용 (선택)
  "browserAdapter": "auto"
}
```

**`docs/sprints/_meta/` 에 두는 이유**: 팀이 공유해야 하는 값이므로 git 커밋 대상인 문서 영역에 둔다. `.tene-claude/` 는 로컬 성격이 강하다.

---

## 4. `state/current.json`

**세션 복원의 유일한 진입점.** SessionStart 훅이 이 파일 하나만 읽는다.

```jsonc
{
  "schemaVersion": 1,
  "updatedAt": "2026-08-20T04:20:00Z",
  "updatedBy": { "kind": "claude", "sessionId": "abc12345" },

  "activeSprint": "checkout-retry",
  "phase": "qa",
  "status": "active",                     // active | paused
  "profile": "standard",
  "autoUntil": "design",

  "summary": {
    "gate": { "id": "G6", "result": "fail" },
    "ac": { "total": 5, "passed": 3, "failed": 1, "insufficient": 1, "stale": 0,
            "blockingFailed": 1 },
    "coverage": { "transitions": { "measured": 3, "total": 5 } },
    "loopChecks": { "count": 2, "max": 3 },
    "blocking": [
      { "kind": "ac", "id": "ac_2", "reason": "payments 테이블에 실패 기록 없음" }
    ]
  },

  "nextAction": {
    "skill": "loop-check",
    "reason": "AC-2 (blocking) 미구현으로 G6 차단",
    "alternatives": ["qa --only DATA", "waiver --ac ac_2"]
  },

  "docsRoot": "docs/sprints",
  "sprintDir": "docs/sprints/checkout-retry-payment-failure-input-preservation"
}
```

### 4.1 초기값 (`sprint init` 직후)

```jsonc
{
  "activeSprint": "checkout-retry",
  "phase": "draft",
  "status": "active",
  "profile": "standard",
  "autoUntil": "design",
  "summary": {
    "gate": null,                          // 아직 판정 없음
    "ac": { "total": 0, "passed": 0, "failed": 0,
            "insufficient": 0, "stale": 0, "blockingFailed": 0 },
    "coverage": null,                      // 전이 표가 아직 없음
    "loopChecks": { "count": 0, "max": 3 },
    "blocking": []
  },
  "nextAction": { "skill": "prd", "reason": "기획 의도를 인터뷰로 추출하세요", "alternatives": [] }
}
```

**`null` 과 `0` 을 구분한다.** 아직 존재하지 않는 것(`null`)과 0건인 것(`0`)은 다르다. `coverage: null` 은 "전이 표가 없음", `{measured:0,total:5}` 는 "5개 중 0개 측정"이다.

### 4.2 `summary` 를 여기 두는 이유

SessionStart 훅이 200ms 안에 끝나야 한다. sprint 파일을 열어 AC 배열을 순회하면 예산을 넘긴다. **전이 시점에 미리 계산해 둔다.**

`summary` 는 파생 데이터이므로 불일치 가능성이 있다. `tene-state read --verify` 로 재계산해 검증할 수 있다.

---

## 5. `state/sprints/<sprint-id>.json`

```jsonc
{
  "schemaVersion": 1,
  "updatedAt": "2026-08-20T04:20:00Z",
  "updatedBy": { "kind": "claude", "sessionId": "abc12345" },

  "id": "checkout-retry",
  "slug": "payment-failure-input-preservation",
  "title": "결제 실패 시 입력값 보존",
  "status": "active",                     // planned | active | paused | archived
  "phase": "qa",
  "profile": "standard",
  "createdAt": "2026-08-18T02:00:00Z",
  "startCommit": "a1b2c3d",               // R2 diff 기준점
  "archivedAt": null,

  "docs": {
    "prd":       "docs/sprints/checkout-retry-.../00-prd/prd.md",
    "plan":      "docs/sprints/checkout-retry-.../01-plan/plan.md",
    "design":    "docs/sprints/checkout-retry-.../02-design/design.md",
    "loopCheck": ["docs/sprints/checkout-retry-.../03-analysis/loop-check-1.md",
                  "docs/sprints/checkout-retry-.../03-analysis/loop-check-2.md"],
    "qa":        "docs/sprints/checkout-retry-.../03-analysis/qa.md",
    "report":    null
  },

  "gates": {
    "G0": { "result": "pass", "at": "2026-08-18T02:05:00Z" },
    "G1": { "result": "pass", "at": "2026-08-18T03:10:00Z" },
    "G2": { "result": "pass", "at": "2026-08-18T05:00:00Z" },
    "G3": { "result": "pass", "at": "2026-08-19T01:00:00Z" },
    "G4": { "result": "pass", "at": "2026-08-19T22:00:00Z" },
    "G5": { "result": "pass", "at": "2026-08-20T03:00:00Z" },
    "G6": { "result": "fail", "at": "2026-08-20T04:20:00Z",
            "detail": { "blockingFailed": 1, "insufficient": 1 } },
    "G7": null
  },

  "intents": [
    { "id": "intent_1", "status": "confirmed",
      "statement": "결제 실패 시 사용자가 처음부터 다시 입력하지 않게 한다",
      "source": { "kind": "conversation", "locator": "session:abc12345#turn12" },
      "confirmedAt": "2026-08-18T03:05:00Z" }
  ],

  "ac": [
    { "id": "ac_1", "intentId": "intent_1", "priority": "blocking", "method": "UX",
      "verdict": "passed", "anchors": ["CheckoutPage"],
      "evidenceRef": "evidence/run_20260820_01/ac_1.gif",
      "judgedAt": "2026-08-20T04:15:00Z" },
    { "id": "ac_2", "intentId": "intent_1", "priority": "blocking", "method": "DATA",
      "verdict": "failed", "anchors": ["processPayment", "paymentsRepo.markFailed"],
      "evidenceRef": "evidence/run_20260820_01/ac_2.json",
      "reason": "payments 테이블에 실패 기록 없음", "judgedAt": "2026-08-20T04:16:00Z" },
    { "id": "ac_3", "intentId": "intent_1", "priority": "non-blocking", "method": "UX",
      "verdict": "insufficient", "anchors": ["CheckoutPage"],
      "reason": "타임아웃 재현 환경 부재",
      "toMeasure": "목 서버에 지연 주입 필요" }
  ],

  "layers": {
    "required": ["L1", "L2", "L3", "L5"],
    "resolution": { "L1": "required", "L2": "required", "L3": "required",
                    "L4": "not-applicable", "L5": "required",
                    "L6": "required", "L7": "not-applicable" },
    "notApplicableReason": { "L4": "단일 서비스, 시스템 E2E 경로 없음",
                             "L7": "신규 기능, 회귀 기준선 없음" }
  },

  "coverage": { "transitions": { "measured": 3, "total": 5,
                                 "unmeasured": ["Processing→ErrorPage", "Processing→Timeout"] } },

  "counters": { "loopChecks": 2, "maxLoopChecks": 3, "qaRuns": 1 },

  "gaps": [
    { "id": "gap_1", "severity": "blocker", "kind": "missing",
      "subject": "ac_2", "detail": "markFailed 호출 없음",
      "status": "open", "recordedAt": "2026-08-20T03:00:00Z" }
  ],

  "waivers": [],

  "carryOver": [
    { "id": "C1", "kind": "deferred", "title": "5xx → ErrorPage 전이 검증",
      "reason": "5xx 재현 환경 부재", "raisedAt": "2026-08-20T04:20:00Z" },
    { "id": "D1", "kind": "decision", "title": "재시도 잡의 멱등키 정책",
      "reason": "design 6질문에서 미설계 호출 경로 발견", "raisedAt": "2026-08-19T01:30:00Z" }
  ],

  "runs": [
    { "id": "run_20260820_01", "startedAt": "2026-08-20T04:10:00Z",
      "finishedAt": "2026-08-20T04:18:00Z",
      "manifest": "docs/sprints/checkout-retry-.../evidence/run_20260820_01/manifest.json",
      "capability": { "testRunner": "vitest", "browser": "playwright", "cia": "indexed" } }
  ]
}
```

### 5.1 Intent/AC 미러링 범위 (D14 해소)

**정본은 문서다.** 상태에는 **판정에 필요한 최소 필드만** 미러링한다.

| 필드 | 문서 | 상태 | 이유 |
|---|---|---|---|
| Intent statement | ✅ 전문 | ✅ 전문 | SessionStart 요약에 필요 |
| Intent rationale/actors/outcomes | ✅ | ❌ | 게이트 판정에 불필요 |
| AC statement | ✅ 전문 | ❌ | 문서를 읽으면 된다 |
| AC priority/method | ✅ | ✅ | 게이트 판정에 필수 |
| AC verdict/evidence | ✅ (qa.md) | ✅ | 게이트 판정에 필수 |
| AC anchors | ✅ (design.md) | ✅ | stale 마킹에 필수 |

**중복을 최소화하는 이유**: 두 곳에 같은 텍스트가 있으면 반드시 드리프트한다.

---

## 6. `state/master-plan.json`

```jsonc
{
  "schemaVersion": 1,
  "updatedAt": "2026-08-20T04:30:00Z",
  "title": "결제 흐름 개선",
  "goal": "결제 실패로 인한 이탈률을 절반으로 줄인다",

  "sprints": [
    { "id": "payment-core",   "order": 1, "dependsOn": [],
      "status": "archived", "archivedAt": "2026-08-14T10:00:00Z" },
    { "id": "checkout-retry", "order": 2, "dependsOn": ["payment-core"],
      "status": "active", "phase": "qa" },
    { "id": "refund-flow",    "order": 3, "dependsOn": ["payment-core"],
      "status": "planned" }
  ],

  "carryOver": [
    { "id": "checkout-retry:D1", "from": "checkout-retry", "kind": "decision",
      "title": "재시도 잡의 멱등키 정책",
      "reason": "design 6질문에서 미설계 호출 경로 발견",
      "status": "open", "blocks": ["refund-flow"],
      "promotedAt": "2026-08-20T05:00:00Z" }
  ],

  "constraints": ["PG사 응답 지연 3초 가정", "모바일 우선"]
}
```

---

## 7. `history/events.ndjson`

```jsonl
{"seq":1,"ts":"2026-08-18T02:00:00Z","type":"SprintCreated","sprint":"checkout-retry","by":{"kind":"claude","sessionId":"abc12345"},"payload":{"title":"결제 실패 시 입력값 보존","profile":"standard"}}
{"seq":2,"ts":"2026-08-18T03:05:00Z","type":"IntentCaptured","sprint":"checkout-retry","payload":{"intentId":"intent_1","source":"conversation"}}
{"seq":3,"ts":"2026-08-18T03:10:00Z","type":"PhaseTransitioned","sprint":"checkout-retry","payload":{"from":"prd","to":"plan","gate":"G1"}}
{"seq":4,"ts":"2026-08-19T22:14:00Z","type":"AcStaled","sprint":"checkout-retry","payload":{"acId":"ac_2","cause":"src/payments/processPayment.ts"}}
{"seq":5,"ts":"2026-08-20T04:20:00Z","type":"GateEvaluated","sprint":"checkout-retry","payload":{"gate":"G6","result":"fail","blockerCount":2}}
```

### 7.1 append 규칙

```javascript
// lib/state/events.js
export async function appendEvent(event) {
  const line = JSON.stringify({
    seq: await nextSeq(),
    ts: nowIso(),
    ...event,
  }) + '\n'
  await appendFileAtomic(EVENTS_PATH, line)   // O_APPEND, 단일 write
}
```

**한 줄 = 한 이벤트.** 부분 쓰기가 발생해도 그 줄만 손상되고 파일 전체는 유효하다. 읽을 때 파싱 실패한 줄은 건너뛰고 경고한다.

**해시 체인은 MVP 에서 하지 않는다**(DEC, 01-plan/03 §2.7). 감사 요구가 생기면 `schemaVersion` 을 올려 추가한다.

---

## 8. 원자성과 동시성

### 8.1 원자적 쓰기

```javascript
// lib/util/atomic.js
import { writeFileSync, renameSync, openSync, fsyncSync, closeSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

export function writeAtomic(path, content) {
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true })
  const tmp = join(dir, `.tmp-${process.pid}-${counter++}`)

  writeFileSync(tmp, content, 'utf8')
  const fd = openSync(tmp, 'r')
  fsyncSync(fd)              // 디스크 반영 보장
  closeSync(fd)
  renameSync(tmp, path)      // 같은 파일시스템 내 rename 은 원자적
}
```

**`fsync` 를 하는 이유**: rename 은 원자적이지만, 크래시 시 내용이 디스크에 없을 수 있다.

### 8.2 Advisory Lock

```javascript
// lib/util/lock.js
const LOCK_PATH = '.tene-claude/.lock'
const TIMEOUT_MS = 5000
const STALE_MS = 30000

export async function withLock(fn) {
  const acquired = await acquire()
  try { return await fn() }
  finally { release(acquired) }
}

function acquire() {
  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      // O_EXCL 로 배타 생성. 이미 있으면 실패
      const fd = openSync(LOCK_PATH, 'wx')
      writeSync(fd, JSON.stringify({ pid: process.pid, host: hostname(), at: nowIso() }))
      closeSync(fd)
      return true
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      if (isStale()) { unlinkSync(LOCK_PATH); continue }   // 30초 넘은 lock 은 제거
      sleepSync(50)
    }
  }
  throw new TeneError('LOCK_TIMEOUT', { hint: 'tene-state doctor 로 lock 상태를 확인하세요' })
}
```

**stale lock 자동 제거**: 30초 이상 된 lock 은 프로세스가 죽은 것으로 간주한다. 훅은 최대 500ms 를 쓰므로 30초는 충분히 안전하다.

### 8.3 낙관적 잠금

> ⚠️ **구현 중 정정** — 초기 설계는 `updatedAt` 비교였다. `updatedAt` 은 ISO 8601 **초 단위**라
> 같은 초 안에 일어난 두 변경을 구분하지 못한다 (실제로 검증 중 충돌 미탐지로 드러났다).
> 낙관적 잠금은 단조 증가 카운터 `rev` 로 한다. `updatedAt` 은 사람이 읽는 표시용으로만 남는다.

모든 상태 문서(`current.json`, `sprint/*.json`, `master-plan.json`)는 `rev: number` 를 갖는다.
쓰기 때마다 `rev` 가 1 증가한다.

```javascript
// 읽기 시 rev 를 받아두고, 쓰기 시 비교
const sprint = readSprint(root, id)              // rev: 7
// ... 사용자 상호작용 ...
writeSprint(root, sprint, { expectedRev: 7 })
// 디스크의 rev !== 7 이면 STALE_WRITE 오류
```

**충돌 시 동작**: 자동 병합하지 않는다. 현재 상태를 보여주고 사용자가 결정하게 한다.

```
[tene] 다른 세션이 이 sprint 를 변경했습니다.
  내가 읽은 판   : rev 7 (2026-08-20T04:10:00Z, phase: loop-check)
  현재 상태      : rev 9 (2026-08-20T04:25:00Z, phase: qa)
  → 최신 상태로 다시 시작하려면 /tene:status
  → 덮어쓰려면 --force (권장하지 않음)
```

---

## 9. 크기 관리와 정리

### 9.1 상한

| 파일 | 상한 | 초과 시 |
|---|---|---|
| `events.ndjson` | 5,000줄 **또는** 256KB | 오래된 절반을 `archive/<YYYY-MM>/events.ndjson` 으로 이동 |
| `state/sprints/` 활성 항목 | 50개 | `archived` 항목을 아카이브로 |
| `index/symbols.json` | 20MB | 경고 + `scan build --prune` 제안 |
| `master-plan.json` carryOver | 200개 | `resolved` 항목 정리 제안 |
| `history/suggested.json` | 세션당 리셋 | — |

### 9.2 정리 시점

```
SessionEnd 훅 (1.5초 예산)
  → tene-state size  (stat 만, 파싱 없음)
  → 초과 감지 시 .tene-claude/state/current.json 에 needsCleanup: true 만 기록
  → 실제 정리는 하지 않음

다음 SessionStart
  → needsCleanup 감지 → 백그라운드로 정리 실행 (사용자 대기 없음)

또는 사용자가 명시 실행
  → /tene:clear
```

**SessionEnd 에서 실제 정리를 하지 않는 이유**: 1.5초를 전체 훅이 공유한다. 정리 중 세션이 종료되면 파일이 반쯤 옮겨진다.

### 9.3 `/tene:clear` 동작

```bash
tene-state clean --dry-run              # 기본. 대상만 표시
tene-state clean --archived             # archived sprint 를 아카이브로
tene-state clean --history              # 이벤트 로그 압축
tene-state clean --index                # 인덱스 삭제 (재생성됨)
tene-state clean --all --yes            # 전부 (확인 필수)
```

**안전 규칙**
1. `docs/sprints/` 는 **절대 건드리지 않는다**
2. 아카이브는 삭제가 아니라 **이동**
3. 완전 삭제는 `--purge` 를 별도 명시해야 함
4. `--dry-run` 이 기본. 실행하려면 명시적 플래그

```jsonc
// clean --dry-run 출력
{ "ok": true, "data": {
  "dryRun": true,
  "candidates": {
    "archived": [{ "id": "payment-core", "size": 4821, "archivedAt": "2026-08-14T..." }],
    "history":  { "lines": 6200, "willArchive": 3100, "bytes": 312000 },
    "index":    { "files": 3, "bytes": 8400000 }
  },
  "totalReclaim": 8716821,
  "note": "docs/sprints/ 는 정리 대상이 아닙니다"
}}
```

---

## 10. Resync — 문서에서 상태 복구

상태 파일이 손상되거나 없을 때, **문서를 정본으로 상태를 재구성**한다.

```javascript
// lib/state/resync.js
export async function resync(sprintId, docsRoot) {
  const dir = findSprintDir(docsRoot, sprintId)
  if (!dir) throw new TeneError('SPRINT_DIR_NOT_FOUND')

  const docs = detectDocs(dir)                    // 존재하는 문서 파악
  const prd = docs.prd ? parseDoc(read(docs.prd)) : null
  const design = docs.design ? parseDoc(read(docs.design)) : null
  const qa = docs.qa ? parseDoc(read(docs.qa)) : null

  const state = {
    schemaVersion: 1,
    id: sprintId,
    slug: dir.slug,
    title: prd?.frontmatter?.tene?.title ?? dir.slug,
    phase: inferPhase(docs, qa),                  // §10.1
    status: 'active',
    profile: prd?.frontmatter?.tene?.profile ?? 'standard',
    docs,
    intents: prd ? extractIntents(prd) : [],
    ac: mergeAc(prd, design, qa),                 // 문서 3곳에서 병합
    gates: reevaluateGates(...),                  // 재판정
    carryOver: extractCarryOver(docs.report),
    counters: { loopChecks: docs.loopCheck?.length ?? 0, maxLoopChecks: 3 },
  }

  await saveSprint(state)
  await appendEvent({ type: 'StateResynced', sprint: sprintId,
                      payload: { recoveredFrom: 'docs' } })
  return state
}
```

### 10.1 phase 추론

```
report 존재 + R1~R6 완비   → report (또는 archived if _archive/ 하위)
qa 존재                     → qa
loop-check-N 존재           → loop-check
design 존재                 → do        (설계는 됐고 구현 중으로 가정)
plan 존재                   → design
prd 존재                    → plan
아무것도 없음               → draft
```

**추론이므로 사용자에게 확인을 요청한다.**

```
[tene] 문서에서 상태를 재구성했습니다.
  추정 phase: qa (qa.md 존재)
  복구된 AC: 5건 (passed 3 / failed 1 / insufficient 1)
  게이트: 재판정 결과 G6 fail
이 상태가 맞습니까? 다르면 /tene:sprint phase --to <phase> 로 조정하세요.
```

### 10.2 AC 병합 규칙

AC 정보가 세 문서에 흩어져 있다.

| 출처 | 제공 필드 |
|---|---|
| `prd.md` AC 표 | id, statement, priority, method |
| `design.md` 앵커 표 | anchors |
| `qa.md` 판정 표 | verdict, evidenceRef, reason |

```javascript
function mergeAc(prd, design, qa) {
  const base = prd ? extractAcTable(prd) : []
  const anchors = design ? extractAnchorTable(design) : {}
  const verdicts = qa ? extractVerdictTable(qa) : {}

  return base.map(ac => ({
    ...ac,
    anchors: anchors[ac.id] ?? [],
    verdict: verdicts[ac.id]?.verdict ?? 'pending',
    evidenceRef: verdicts[ac.id]?.evidenceRef ?? null,
    reason: verdicts[ac.id]?.reason ?? null,
  }))
}
```

---

## 11. 마이그레이션

```javascript
// lib/state/migrate.js
const MIGRATIONS = {
  1: null,                                  // 초기 버전
  // 2: (s) => ({ ...s, newField: default }),
}
const CURRENT = 1

export function migrate(state, path) {
  const v = state.schemaVersion ?? 0
  if (v === CURRENT) return state
  if (v > CURRENT) throw new TeneError('SCHEMA_TOO_NEW', {
    found: v, supported: CURRENT,
    hint: '플러그인을 업데이트하세요: /plugin update tene@agent-kay-it',
  })

  backup(path)                              // .bak-v<v>-<ts>
  let s = state
  for (let i = v + 1; i <= CURRENT; i++) {
    const fn = MIGRATIONS[i]
    if (!fn) throw new TeneError('MIGRATION_MISSING', { from: i - 1, to: i })
    s = fn(s)
    s.schemaVersion = i
  }
  return s
}
```

**규칙**
- 마이그레이션 전 반드시 백업
- 상위 버전 스키마는 **읽기 전용 모드**로 처리 (덮어쓰지 않는다)
- 마이그레이션 실패 시 원본 유지 + `resync` 안내

---

## 12. auto memory 와의 경계

| 저장 대상 | 위치 | 이유 |
|---|---|---|
| sprint phase, 게이트, AC 판정 | `.tene-claude/state/` | 변동이 잦다. 메모리에 넣으면 200줄 예산 낭비 |
| 의도·설계·판정 근거 | `docs/sprints/` | 사람이 읽어야 한다 |
| **프로젝트 관례·함정·선호** | auto memory `MEMORY.md` | 다음 sprint 에도, 그 다음에도 유효 |

**메모리 저장 판별 기준**: *"다음 sprint 에도, 그 다음 sprint 에도 유효한가?"*

메모리에 적합한 예:
- "이 프로젝트는 pnpm 을 쓴다"
- "결제 테스트는 목 서버가 필요하다"
- "payments 테이블은 소프트 삭제를 안 한다"
- "사용자는 인터뷰 라운드를 짧게 선호한다"

메모리에 부적합한 예:
- "checkout-retry 는 qa 단계다" (상태 파일)
- "AC-2 가 실패했다" (상태 파일)

**플러그인은 auto memory 에 직접 쓰지 않는다.** Claude 가 스스로 판단해 쓰도록 스킬 본문에서 유도만 한다.
