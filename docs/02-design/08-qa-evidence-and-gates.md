# D08 · QA · 증거 · 게이트

> 대응: FR-1.4, FR-4.5~4.7, W-51~W-5F
> 사용자 요구: *"unit, e2e, chrome mcp나 playwright등 다양한 도구를 활용하여 기획 의도대로 동작 하는지 데이터 처리 흐름과 UX 흐름에 대한 종합 테스트까지 수행"*

---

## 1. QA 파이프라인

```
확정된 Intent + AC + UX Journey + Data Journey
        │
        ▼ ① 컴파일
    Test Charter  (happy/alternate/empty/error/permission/retry/recovery)
        │
        ▼ ② 레이어 계획 (7-Layer × required|not-applicable|waived)
    Execution Plan + Capability 매칭
        │
        ▼ ③ 실행 — tene-qa-runner (수집만, 판정 금지)
    Evidence Manifest (artifact + sha256 + redaction)
        │
        ▼ ④ 판정 — tene-judge (builder 요약 제외)
    AC Verdict (passed | failed | insufficient | not-applicable)
        │
        ▼ ⑤ 반박 — tene-refuter (passed 만, 3 렌즈)
    확정 Verdict
        │
        ▼ ⑥ 게이트 G6
    pass / fail
```

**③과 ④를 물리적으로 분리하는 것이 이 설계의 핵심**이다. 실행한 에이전트가 채점하면 편향된다.

---

## 2. Test Charter 컴파일

### 2.1 스키마

```javascript
/**
 * @typedef {Object} TestCharter
 * @property {string} id                 charter_1, …
 * @property {string[]} acIds
 * @property {string} title
 * @property {string} actor              "구매자", "관리자", "cron"
 * @property {string[]} preconditions
 * @property {Step[]} steps
 * @property {Variant[]} variants
 * @property {string[]} forbiddenOutcomes  "절대 일어나면 안 되는 것"
 * @property {string[]} requiredLayers     ["L2","L3","L5"]
 * @property {'low'|'medium'|'high'} risk
 */

/**
 * @typedef {Object} Step
 * @property {string} action             "결제 버튼 클릭"
 * @property {string} [expectedUi]       "Processing 화면으로 전이"
 * @property {string} [expectedData]     "payments 에 status='pending' 행 생성"
 * @property {string[]} observerIds      이 스텝에서 관찰할 대상
 */
```

### 2.2 변형 7종

| 변형 | 의미 | 생성 조건 |
|---|---|---|
| `happy` | 정상 경로 | 항상 |
| `alternate` | 대안 경로 | UX Flow 에 분기가 있으면 |
| `empty` | 빈 입력·빈 목록 | 입력이 있으면 |
| `error` | 오류 응답 | AC 에 If-then 이 있으면 |
| `permission` | 권한 없음 | 인증·권한 언급이 있으면 |
| `retry` | 재시도 | PRD 되돌아오는 경로에 있으면 |
| `recovery` | 실패 후 복구 | 실패 경로가 설계되어 있으면 |

### 2.3 컴파일 알고리즘

```javascript
// lib/qa/charter.js
export function compile(prd, design, ac) {
  const journeys = extractJourneys(prd)          // UX Flow + Data Flow
  const edges = extractTransitions(design)
  const charters = []

  for (const a of ac) {
    const related = journeys.filter(j => j.touchesAc(a.id))
    const relatedEdges = edges.filter(e => e.targetAc === a.id)

    charters.push({
      id: nextId('charter'),
      acIds: [a.id],
      title: a.statement.slice(0, 60),
      actor: inferActor(related, prd),
      preconditions: extractPreconditions(a, related),
      steps: buildSteps(a, related, relatedEdges),
      variants: selectVariants(a, prd, design),
      forbiddenOutcomes: extractForbidden(a),     // AC 의 forbidden 필드
      requiredLayers: selectLayers(a),            // §3.2
      risk: assessRisk(a, design),
    })
  }
  return mergeSimilar(charters)                   // 같은 화면·같은 행위자는 병합
}
```

### 2.4 `forbiddenOutcomes`

AC 에 "이러면 안 된다"가 있으면 charter 에 실린다.

```
AC-2: If 결제 API 가 4xx 를 반환하면, then 시스템은 payments 에 status='failed' 로 기록해야 한다
forbidden: 결제가 중복 실행되어서는 안 된다

→ charter.forbiddenOutcomes = ["payments 에 status='completed' 행이 2개 이상 생성됨"]
```

**판정 시 forbidden 이 하나라도 관찰되면 즉시 `failed`.** expected 가 전부 충족되어도 마찬가지다.

---

## 3. 7-Layer

### 3.1 정의

| Layer | 질문 | 대표 증거 | 어댑터 |
|---|---|---|---|
| **L1 Static** | 구조·타입·보안 규칙이 맞는가 | lint/tsc/scan 출력 | 프로젝트 명령 |
| **L2 Unit/Contract** | 규칙과 경계 계약이 맞는가 | 테스트 리포트 | 테스트 러너 |
| **L3 Integration/Data** | **실제 데이터 흐름과 부작용이 맞는가** | API 응답, DB 상태, 큐 | HTTP/DB 관찰자 |
| **L4 System E2E** | 시스템을 통해 완료되는가 | 트레이스, 네트워크 | 브라우저/CLI |
| **L5 Intent/UX** | **사용자가 목적을 달성하는가** | 화면 전이, 스크린샷 | Chrome MCP/Playwright |
| **L6 Adversarial/Recovery** | 실패·권한·재시도·롤백이 안전한가 | 결함 주입 결과, 상태 diff | 브라우저/HTTP |
| **L7 Regression/Drift** | 기존 의도를 깨지 않았는가 | 기준선 비교 | 테스트 러너 |

### 3.2 레이어 선택

```javascript
// lib/qa/layers.js
export function selectLayers(ac, design, prd) {
  const layers = new Set(['L1'])                            // 항상

  if (ac.method === 'UNIT') layers.add('L2')
  if (ac.method === 'DATA') { layers.add('L2'); layers.add('L3') }
  if (ac.method === 'UX')   { layers.add('L5'); layers.add('L4') }

  if (isUnwantedPattern(ac))          layers.add('L6')      // If-then 은 실패 경로
  if (prd.hasReturnPaths)             layers.add('L6')      // 되돌아오는 경로
  if (design.touchesExistingSymbols)  layers.add('L7')      // 기존 코드 수정

  return [...layers]
}
```

### 3.3 처리 상태 (필수)

각 레이어는 **반드시 셋 중 하나**로 기록된다.

| 상태 | 의미 | 필수 |
|---|---|---|
| `required` | 실행해야 함 | 결과(pass/fail/insufficient) |
| `not-applicable` | 해당 없음 | **사유 필수** |
| `waived` | 예외 승인 | **waiver id 필수** |

```jsonc
{ "L1": { "state": "required", "result": "pass" },
  "L2": { "state": "required", "result": "pass", "detail": "12/12" },
  "L3": { "state": "required", "result": "fail", "detail": "AC-2" },
  "L4": { "state": "not-applicable", "reason": "단일 서비스, 시스템 경로 없음" },
  "L5": { "state": "required", "result": "partial", "detail": "3/5 엣지" },
  "L6": { "state": "required", "result": "insufficient", "reason": "결함 주입 도구 없음" },
  "L7": { "state": "not-applicable", "reason": "신규 기능, 회귀 기준선 없음" } }
```

**미해결(`required` + 결과 없음)이 있으면 G6 fail.**

---

## 4. Capability 감지

```javascript
// lib/qa/capability.js
export function probe(root, config) {
  return {
    testRunner: detectTestRunner(root),      // package.json scripts, pytest.ini, go.mod …
    typecheck:  detectTypecheck(root),
    linter:     detectLinter(root),
    browser:    detectBrowser(config),       // chrome-mcp | playwright | none
    httpClient: true,                        // Bash curl 항상 가능
    db:         detectDb(root),              // .env 없이 접속 정보 알 수 없으면 none
    faultInject: false,                      // MVP 미지원
    cia:        indexStatus(),
  }
}

function detectTestRunner(root) {
  const pkg = readJsonSafe(join(root, 'package.json'))
  if (pkg?.scripts?.test) return { kind: 'npm', command: 'npm test' }
  if (exists(join(root, 'pytest.ini')) || exists(join(root, 'pyproject.toml')))
    return { kind: 'pytest', command: 'pytest' }
  if (exists(join(root, 'go.mod'))) return { kind: 'go', command: 'go test ./...' }
  if (exists(join(root, 'pom.xml'))) return { kind: 'maven', command: 'mvn test' }
  return null
}

function detectBrowser(config) {
  if (config.browserAdapter && config.browserAdapter !== 'auto') return config.browserAdapter
  // Chrome MCP 는 bin 에서 감지 불가 → 스킬이 판단
  if (hasPlaywright()) return 'playwright'
  return 'unknown'                            // 스킬이 Chrome MCP 를 확인해 확정
}
```

**Chrome MCP 감지는 스킬이 한다.** `bin/` 스크립트는 MCP 도구 가용 여부를 알 수 없다. 스킬이 `mcp__claude-in-chrome__*` 도구 존재를 보고 판단해 `--capability` 로 주입한다.

### 4.1 어댑터 우선순위 (D6)

```
UX 검증:
  1. Chrome MCP  (스킬이 도구 가용 확인)
  2. Playwright  (node_modules 또는 CLI 존재)
  3. 없음 → insufficient

DATA 검증:
  1. 프로젝트 테스트 러너 (통합 테스트)
  2. HTTP + Bash curl + 응답 검사
  3. CIA 정적 확인만 → 부분 판정
```

---

## 5. 증거 수집

### 5.1 Evidence Manifest

```jsonc
// docs/sprints/<dir>/evidence/run_20260820_01/manifest.json
{
  "schemaVersion": 1,
  "runId": "run_20260820_01",
  "sprintId": "checkout-retry",
  "startedAt": "2026-08-20T04:10:00Z",
  "finishedAt": "2026-08-20T04:18:00Z",
  "environment": {
    "name": "local",
    "node": "v22.3.0",
    "os": "darwin-arm64",
    "gitCommit": "e4f5g6h",
    "secretEnv": null
  },
  "capability": {
    "testRunner": "vitest@3.1.0", "browser": "playwright@1.48",
    "db": null, "cia": "indexed"
  },
  "cases": [
    {
      "caseId": "case_1", "charterId": "charter_1", "acIds": ["ac_1"],
      "variant": "error", "layer": "L5",
      "status": "observed",
      "observations": [
        { "at": "2026-08-20T04:11:03Z", "kind": "ui-state",
          "detail": "CheckoutPage 로 복귀. 카드번호 입력값 '4242...' 유지됨" },
        { "at": "2026-08-20T04:11:03Z", "kind": "console",
          "detail": "no errors" },
        { "at": "2026-08-20T04:11:03Z", "kind": "network",
          "detail": "POST /api/v1/payments → 402" }
      ],
      "artifacts": ["art_1", "art_2"]
    }
  ],
  "artifacts": [
    { "id": "art_1", "kind": "gif", "path": "ac_1-flow.gif",
      "sha256": "9f2c...", "size": 482113, "createdAt": "2026-08-20T04:11:05Z",
      "tool": "playwright" },
    { "id": "art_2", "kind": "json", "path": "ac_1-network.json",
      "sha256": "3a81...", "size": 2104, "createdAt": "2026-08-20T04:11:05Z",
      "tool": "playwright" }
  ],
  "redaction": { "policyVersion": 1, "scanStatus": "passed", "hits": 0 }
}
```

### 5.2 아티팩트 파일명 규칙

워크플로에서 여러 에이전트가 동시에 쓰므로 충돌 방지 규칙이 필요하다.

```
evidence/<run-id>/
├── manifest.json
├── <ac-id>-<variant>-<seq>.<ext>        예: ac_1-error-01.gif
└── <ac-id>-<observer>-<seq>.json        예: ac_1-network-01.json
```

| 요소 | 규칙 |
|---|---|
| `run-id` | `run_YYYYMMDD_NN` — 스킬이 실행 전에 생성해 `args` 로 주입 |
| `ac-id` | 접두사. **한 에이전트가 한 AC 를 담당하므로 자연히 분리된다** |
| `variant` \| `observer` | `happy`/`error`/… 또는 `network`/`console`/`db` |
| `seq` | 같은 조합 내 순번. 2자리 zero-pad |
| `ext` | `gif`/`png`/`json`/`log`/`har`/`txt` |

**에이전트는 `manifest.json` 을 직접 쓰지 않는다.** 아티팩트 파일만 저장하고 경로·sha256 을 반환하면, 스킬이 전체를 모아 manifest 를 한 번에 작성한다. 동시 쓰기 충돌이 원천 차단된다.

### 5.3 아티팩트 규칙

| 규칙 | 내용 |
|---|---|
| 모든 아티팩트에 `sha256` | 판정 시 무결성 검증 |
| 상대 경로 | manifest 기준 |
| 생성 도구 기록 | 재현 가능성 |
| **스크린샷 단독으로 데이터 흐름을 증명하지 않는다** | L3 은 반드시 데이터 관찰자를 동반 |

### 5.4 Redaction 스캔

**증거를 저장하기 전에 반드시 시크릿 스캔**을 수행한다 (R-23).

```javascript
// lib/qa/evidence.js
const SECRET_PATTERNS = [
  /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{16,}/g,      // Stripe 계열
  /\bghp_[A-Za-z0-9]{36}\b/g,                        // GitHub PAT
  /\bAKIA[0-9A-Z]{16}\b/g,                           // AWS
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./g,  // JWT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /\b[A-Za-z0-9._%+-]+:[^@\s]{8,}@[A-Za-z0-9.-]+/g,  // URL 내 자격증명
]

export function redactScan(content) {
  const hits = []
  for (const re of SECRET_PATTERNS) {
    for (const m of content.matchAll(re)) hits.push({ pattern: re.source, index: m.index })
  }
  return { clean: hits.length === 0, hits }
}
```

**스캔 실패 시 동작**

```
텍스트 아티팩트 (json/log/txt)
  → 패턴 발견 시 마스킹 후 저장 + manifest 에 hits 기록

바이너리 아티팩트 (png/gif/mp4)
  → 스캔 불가. 저장하되 경고:
    "[tene] 스크린샷에 시크릿이 포함될 수 있습니다.
     외부 공유 전 검토하세요: evidence/run_.../ac_1-flow.gif"

scanStatus: "failed" 이면
  → 해당 아티팩트를 저장하지 않고 판정을 insufficient 로
```

---

## 6. 판정

### 6.1 Verdict 4종

| Verdict | 의미 | 게이트 영향 |
|---|---|---|
| `passed` | 증거가 충족을 증명 | — |
| `failed` | 증거가 위반을 증명 | **blocking 이면 G6 fail** |
| `insufficient` | 증거 없음·불충분·오염·stale | 막지 않음. **R6 필수 기록** |
| `not-applicable` | 승인된 근거로 해당 없음 | 막지 않음 |

### 6.2 판정 입력

```javascript
// tene-judge 에이전트 입력
{
  ac: { id, statement, priority, method, forbidden },
  charter: { steps, variants, forbiddenOutcomes, requiredLayers },
  evidence: { cases, artifacts, capability },
  // builder(runner) 의 요약은 포함하지 않는다
}
```

**runner 의 "통과했습니다" 를 판정자가 보지 못하게 한다.** 관찰 기록만 본다.

### 6.3 판정 규칙

```
1. forbiddenOutcomes 중 하나라도 관찰됨    → failed (즉시)
2. 증거가 없거나 해시 불일치               → insufficient
3. 증거가 기준 문장의 expected 를 충족     → passed
4. 증거가 expected 위반을 보임             → failed
5. 증거가 있으나 기준을 판단하기에 불충분   → insufficient
```

**금지**
- 증거 없이 `passed` 추측
- 기준 문장 재해석으로 통과시키기
- `insufficient` 를 `passed` 로 뭉개기

### 6.4 적대적 반박

`passed` 판정만 3개 렌즈로 반박을 시도한다.

| 렌즈 | 질문 |
|---|---|
| `correctness` | 기준 문장과 증거가 정말 일치하는가? 다른 것을 봤을 가능성은? |
| `edge-case` | 경계·실패·동시성 상황에서도 성립하는가? |
| `evidence-sufficiency` | 이 증거로 이 결론을 낼 수 있는가? 스크린샷만으로 데이터를 주장하지 않았나? |

```
2/3 이상 반박 성공 → passed 를 failed 로 강등
```

**기본값이 `refuted: true`** 다. 증거가 불충분하면 반박한다. 반박자가 관대하면 이 단계가 무의미해진다.

### 6.5 결정론 우선 규칙

> **deterministic assertion 을 LLM 판단으로 뒤집을 수 없다.**

```
테스트 러너가 fail 을 반환 → LLM 이 "실제로는 동작한다" 고 판정 불가
HTTP 상태 코드가 500     → LLM 이 "의도된 것" 이라고 판정 불가
DB 조회 결과가 0행       → LLM 이 "기록되었을 것" 이라고 판정 불가
```

LLM 판정은 **결정론적으로 판정할 수 없는 항목**(UX 적절성, 메시지 명확성)에만 쓴다. 그 경우에도 rubric + 인용 증거 + confidence 를 요구한다.

---

## 7. UX 흐름 검증

### 7.1 전이 커버리지

```
분모 = design.md §7 화면 전이 표의 행 수
분자 = 실제로 도달을 확인한 엣지 수 (결과가 pass 든 fail 든)
```

**mermaid 다이어그램은 분모가 아니다.** 표가 정본이다 — 파싱 안정성과 사람 편집 용이성 때문.

```javascript
// lib/qa/coverage.js
export function computeTransitionCoverage(design, evidence) {
  const edges = extractTransitionTable(design)
  const measured = new Set()
  for (const c of evidence.cases) {
    for (const o of c.observations) {
      if (o.kind === 'ui-state' && o.edgeId) measured.add(o.edgeId)
    }
  }
  return {
    total: edges.length,
    measured: measured.size,
    percent: edges.length ? Math.round(measured.size / edges.length * 100) : null,
    unmeasured: edges.filter(e => !measured.has(e.id)).map(e => ({
      id: e.id, label: `${e.from} → ${e.to}`, reason: findReason(evidence, e.id),
    })),
  }
}
```

### 7.2 되돌아오는 경로 (별도 체크리스트)

PRD R4 에서 캐낸 항목들은 **엣지 표와 별개로** 검증한다.

| 시나리오 | 필수 조건 |
|---|---|
| 뒤로가기 후 상태 보존 | UX AC 존재 |
| 새로고침 후 복구 | 항상 |
| 중복 제출 방지 | 폼 제출 존재 |
| 실패 후 재시도 | 실패 경로 설계됨 |

**설계 엣지에 없어도 검증한다.** 설계에서 빠뜨리기 쉬운 영역이기 때문이다. 미측정 시 `insufficient`.

### 7.3 브라우저 실행 규칙

```
1. JS 다이얼로그(alert/confirm/prompt)를 유발하는 요소를 피한다
   → 확장이 멈추고 후속 명령을 받지 못한다
2. 2~3회 연속 실패하면 재시도를 멈추고 사용자에게 보고한다
3. 로그인·CAPTCHA 를 만나면 사용자에게 넘긴다
4. production 환경에서 실행하지 않는다 (기본 금지)
5. 각 스텝에서 콘솔·네트워크를 함께 캡처한다
```

### 7.4 Chrome MCP vs Playwright

| 항목 | Chrome MCP | Playwright |
|---|---|---|
| 장점 | 로그인 상태 공유, GIF 기록, 실제 사용자 환경 | 결정론적, CI 가능, 재현성 |
| 단점 | 직접 플랜 필요, 컨텍스트 비용 | 로그인 별도 처리 |
| 용도 | **탐색적 UX 확인** | **회귀 검증** |

**기존 Playwright 스위트가 있으면 회귀에 우선 사용**하고, Chrome MCP 는 탐색·UX 확인에 쓴다.

---

## 8. 데이터 흐름 검증

### 8.1 정적 × 동적 교차 판정

```
AC-2 "When 결제 API 가 4xx 를 반환하면, payments 에 status='failed' 로 기록해야 한다"

정적 확인:  tene-scan callers paymentsRepo.markFailed  → 호출자 목록
동적 확인:  실패 케이스 유발 → DB/로그/응답 조회

┌──────────┬───────────┬────────────────────────────────┐
│ 정적     │ 동적      │ 판정                            │
├──────────┼───────────┼────────────────────────────────┤
│ 호출 있음 │ 기록 있음  │ passed                         │
│ 호출 있음 │ 기록 없음  │ failed (조건 분기 문제)          │
│ 호출 없음 │ 기록 없음  │ failed (미구현)                 │
│ 호출 없음 │ 기록 있음  │ passed + 경고 (경로 미파악)      │
│ 확인 불가 │ 기록 있음  │ passed (동적이 우선)             │
│ 호출 있음 │ 확인 불가  │ insufficient                   │
│ 확인 불가 │ 확인 불가  │ insufficient                   │
└──────────┴───────────┴────────────────────────────────┘
```

**"화면은 맞는데 DB 에 안 남는" 결함을 이 교차 판정이 잡는다.** UI 만 보는 검증으로는 절대 못 잡는다.

### 8.2 동적 확인 수단 (우선순위)

```
1. 프로젝트 통합 테스트  (가장 신뢰. 프로젝트가 이미 검증 수단을 갖고 있음)
2. HTTP 응답 본문 검사   (curl + jq)
3. 애플리케이션 로그      (구조화 로그가 있으면)
4. DB 직접 조회          (접속 정보가 있고 읽기 전용일 때만)
5. 없음 → insufficient
```

**DB 직접 조회는 읽기 전용만.** production 데이터 변경은 기본 금지.

---

## 9. 게이트 G6

### 9.1 알고리즘

```javascript
// lib/gate/rules.js — G6
export function evaluateG6(sprint, qaDoc, evidence) {
  const findings = []

  for (const ac of sprint.ac) {
    if (ac.priority !== 'blocking') continue
    if (isWaived(sprint, ac.id)) continue

    const charter = findCharter(qaDoc, ac.id)
    if (!charter) findings.push(blocker('no_charter', ac.id))

    const unresolvedLayers = charter?.requiredLayers.filter(l => !isResolved(qaDoc, l))
    if (unresolvedLayers?.length) findings.push(blocker('layer_unresolved', ac.id, unresolvedLayers))

    if (ac.verdict !== 'passed') findings.push(blocker('verdict_not_passed', ac.id, ac.verdict))

    if (ac.verdict === 'passed' && !verifyEvidence(evidence, ac.evidenceRef))
      findings.push(blocker('evidence_invalid', ac.id))
  }

  const stale = sprint.ac.filter(a => a.verdict === 'stale')
  if (stale.length) findings.push(blocker('stale_present', stale.map(a => a.id)))

  const expiredWaivers = sprint.waivers.filter(w => isExpired(w))
  if (expiredWaivers.length) findings.push(blocker('waiver_expired', expiredWaivers.map(w => w.id)))

  return {
    result: findings.length ? 'fail' : 'pass',
    findings,
    insufficient: sprint.ac.filter(a => a.verdict === 'insufficient'),
  }
}
```

### 9.2 "100%" 의 의미

> **blocking AC 전부가 charter 를 갖고, required 레이어가 전부 처리되고, verdict 가 passed 이며, 증거 해시가 유효한 상태.**

non-blocking 결과는 점수와 debt 로 표시할 수 있지만 **blocker 를 상쇄하지 않는다.**

### 9.3 증거 무결성 검증

```javascript
function verifyEvidence(manifest, ref) {
  const art = manifest.artifacts.find(a => a.path === ref || a.id === ref)
  if (!art) return false
  const actual = sha256File(join(manifestDir, art.path))
  if (actual !== art.sha256) return false
  // freshness: 증거가 마지막 코드 변경보다 이후인가
  if (art.createdAt < lastCodeChangeAt()) return false
  return true
}
```

**freshness 검사**: 증거가 코드 변경보다 오래되었으면 무효다. 이것이 `stale` 판정과 이중 방어를 이룬다.

---

## 9.4 `bin/tene-qa` — 계획과 증거만

> ⚠️ **구현 중 추가** — 초기 설계에는 QA 전용 CLI 가 없었다.

`tene-qa` 는 **판정하지 않는다.** 판정은 `tene-judge`(L4), 게이트는 `tene-gate`(L2)의 일이다.

```
tene-qa capability     무엇을 검증할 수 있는가
tene-qa plan           charter + 레이어 계획
tene-qa evidence       증거 등록 (해시 기록)
tene-qa verify         증거 무결성 + freshness
tene-qa coverage       전이 커버리지 + 되돌아오는 경로
tene-qa judge-input    판정자 입력 조립 (runner 결론 제거)
tene-qa scan-secrets   증거의 시크릿 검사
```

`judge-input` 이 이 CLI 의 핵심이다. **수집자의 결론을 물리적으로 제거한** 입력을 만든다 —
판정자가 "통과했습니다" 를 읽으면 그것을 따라가기 때문이다.

---

## 10. Loop 정책 (QA 실패 시)

### 10.1 원인 분류

```javascript
const ROOT_CAUSES = {
  requirements: 'prd',        // 요구사항이 모호하거나 잘못됨
  design:       'design',     // 설계가 요구를 만족 못 함
  implementation: 'do',       // 구현이 설계와 다름
  test:         'loop-check', // 테스트·추적이 잘못됨
  environment:  null,         // 환경 문제 → insufficient
  policy:       'prd',        // 정책 결정 필요
}
```

### 10.2 복귀 경로

```
QA fail → 원인 분류 → 해당 phase 로 복귀

requirements  → prd    (PRD 수정 + downstream 무효화)
design        → design (설계 수정 + 하위 문서 갱신)
implementation→ do     (구현 수정)
test          → loop-check (추적·증거 보강)
environment   → insufficient 로 기록, sprint 는 진행
policy        → 사용자 결정 대기 (carryOver: decision)
```

**requirements/design 으로 복귀하면 downstream 산출물을 무효화한다.**

```javascript
function invalidateDownstream(sprint, fromPhase) {
  const order = ['prd','plan','design','do','loop-check','qa']
  const idx = order.indexOf(fromPhase)
  for (const phase of order.slice(idx + 1)) {
    sprint.gates[GATE_BY_PHASE[phase]] = null       // 게이트 재판정 필요
  }
  // AC 판정도 무효화 (요구가 바뀌었으므로)
  if (fromPhase === 'prd') sprint.ac.forEach(a => { a.verdict = 'pending' })
}
```

### 10.3 자동 반복 상한

```
QA 재시도 기본 3회.
초과 시 정지하고 사용자에게 blocker 와 시도 증거를 제공한다.
```

---

## 11. `/tene:qa` 실행 흐름

```
1. 선행 조건 (tene-state read)
2. Capability 감지 + Chrome MCP 확인
3. AC 로드 (tene-doc extract --what ac)
4. tene-qa-planner → Charter + 레이어 계획
5. 실행 방식 결정
     AC ≥ workflow_threshold(8) 또는 사용자 요청 → qa-sweep 워크플로
     미만 → 순차 서브에이전트
6. tene-qa-runner: 증거 수집 (판정 금지)
7. redaction 스캔 → manifest 작성
8. tene-judge: AC 별 판정
9. tene-refuter: passed 만 3렌즈 반박
10. 전이 커버리지 계산
11. qa.md 작성 (tene-doc patch)
12. tene-state ac --set (판정 미러링)
13. tene-gate check --gate G6
14. 결과 보고
```

### 11.1 부분 실행

```bash
/tene:qa --only UX          # UX 방식 AC 만
/tene:qa --only DATA
/tene:qa --layer L6         # 특정 레이어만
/tene:qa --ac ac_2          # 특정 AC 만 (stale 재검증에 유용)
```

**부분 실행 후에도 G6 는 전체를 본다.** 일부만 통과시키지 않는다.

---

## 12. 에이전트 명세

### 12.1 `tene-qa-runner`

```yaml
tools: Bash, Read, Write, Glob, Grep
# Chrome MCP 도구는 스킬이 위임 시 함께 전달
```

```
당신은 증거를 수집한다. **판정하지 않는다.**

규칙:
· 계획된 절차를 실행하고 관찰한 것만 기록한다
· "통과했다" 고 쓰지 마라. 무엇을 실행했고 무엇이 관찰되었는지만 쓴다
· 증거를 evidence/<run-id>/ 에 파일로 저장하고 경로와 sha256 을 반환한다
· 각 스텝에서 UI 상태·콘솔·네트워크를 함께 캡처한다
· 브라우저: JS 다이얼로그 유발 요소를 피한다. 2~3회 실패 시 중단하고 보고한다
· 실행하지 못한 것은 실행하지 못했다고 쓴다. 추정하지 마라

반환: { cases: [{ caseId, acIds, variant, layer, observations[], artifacts[] }] }
      (verdict 필드 없음)
```

### 12.2 `tene-judge`

```yaml
tools: Read
```

```
당신은 증거를 보고 수용 기준 충족 여부를 판정한다. 실행하지 않는다.

verdict 는 넷 중 하나다:
  passed         — 증거가 기준 충족을 증명
  failed         — 증거가 위반을 증명, 또는 forbidden 이 관찰됨
  insufficient   — 증거 없음·불충분·해시 불일치·stale
  not-applicable — 승인된 근거와 범위가 존재

규칙:
· forbiddenOutcomes 중 하나라도 관찰되면 즉시 failed 다
· 증거가 없으면 passed 로 추측하지 마라. insufficient 다
· 기준 문장을 재해석해 통과시키지 마라. 문장 그대로 판정한다
· deterministic assertion(테스트 결과, HTTP 코드, DB 행 수)을 뒤집지 마라
· 스크린샷만으로 데이터 흐름을 판정하지 마라

반환: { acId, verdict, reason, evidencePaths[], layerResults{} }
```

### 12.3 `tene-refuter`

```yaml
tools: Read
```

```
당신은 passed 판정을 반박하려 시도한다. 지정된 렌즈로만 본다.

렌즈:
  correctness          — 기준 문장과 증거가 정말 일치하는가
  edge-case            — 경계·실패·동시성에서도 성립하는가
  evidence-sufficiency — 이 증거로 이 결론을 낼 수 있는가

기본값은 refuted: true 다. 증거가 불충분하면 반박한다.
반박할 수 없을 때만 refuted: false 를 반환한다.

반환: { refuted: boolean, reason: string, lens: string }
```
