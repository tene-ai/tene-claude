# tene plugin — 런타임 계약 (bin/ 스크립트 · 훅 I/O)

> 대응 갭: G-e(bin·훅 I/O 계약)
> 목적: 스크립트와 훅의 입출력을 확정해 스킬·에이전트가 그것을 호출하는 코드를 쓸 수 있게 한다

---

## 0. 공통 규약

### 0.1 실행 환경

| 항목 | 규정 |
|---|---|
| 런타임 | Node.js 20+ (Claude Code가 요구하는 최소 버전과 정렬) |
| 외부 의존 | **없음.** npm 의존성 0. Node 표준 라이브러리만 |
| 배치 | 플러그인 `bin/` — 활성화 시 Bash 도구의 `PATH` 에 자동 추가됨 |
| 호출 형태 | `tene-<name> <subcommand> [--flags]` |
| 작업 기준 | `--project <path>` 미지정 시 `CLAUDE_PROJECT_DIR` → cwd 순 |

### 0.2 출력 규약

| 스트림 | 용도 |
|---|---|
| **stdout** | 기계 판독용 JSON **한 줄** (`--json` 기본) 또는 사람용 텍스트(`--human`) |
| **stderr** | 진단 메시지. 훅 컨텍스트에서는 차단 사유로 쓰인다 |

### 0.3 종료 코드

| 코드 | 의미 |
|---|---|
| `0` | 성공 |
| `1` | 일반 오류 (fail-open 컨텍스트에서는 무시됨) |
| `2` | **차단** (훅 컨텍스트에서만 의미 있음) |
| `3` | 선행 조건 미충족 (상태 없음, 문서 없음 등) |

### 0.4 공통 응답 봉투

```jsonc
{
  "ok": true,
  "tool": "tene-scan",
  "version": 1,
  "elapsedMs": 42,
  "data": { /* 하위 명령별 */ },
  "warnings": [{ "code": "LANG_UNSUPPORTED", "detail": "kotlin: no language pack" }]
}
```

오류 시:
```jsonc
{ "ok": false, "tool": "tene-gate", "error": { "code": "NO_ACTIVE_SPRINT", "message": "...", "hint": "/tene:sprint init" } }
```

### 0.5 성능 예산

| 호출 컨텍스트 | 예산 | 초과 시 |
|---|---|---|
| 동기 훅 (PreToolUse/PostToolUse) | **200ms** | 스스로 중단하고 `exit 0` (fail-open) |
| SessionStart / Stop | 1s | 부분 결과 반환 |
| SessionEnd | **1.5s 공유 예산** | 크기 점검만, 실제 정리는 다음 세션으로 예약 |
| 스킬 호출 (동기 아님) | 30s | 진행 표시 후 계속 |

**200ms 를 지키는 방법**: 훅은 인덱스 파일을 **읽기만** 한다. 인덱싱·스캔은 훅에서 절대 하지 않는다.

---

## 1. `tene-scan` — Code Intelligence Adapter Tier 2

### 1.1 하위 명령

```bash
tene-scan build   [--incremental] [--since <git-ref>] [--langs ts,js,py,go]
tene-scan defs    <symbol> [--limit 20]
tene-scan refs    <symbol> [--kind import|call|any]
tene-scan callers <symbol>
tene-scan imports <file>
tene-scan layer   <file|symbol>
tene-scan touched <file>...            # 파일 → 앵커된 AC
tene-scan questions <symbol>           # 6질문 일괄
tene-scan status                       # 인덱스 상태
```

### 1.2 `build`

```jsonc
// 출력
{ "ok": true, "data": {
    "engine": "node-regex",        // node-regex | ripgrep
    "files": 412, "indexed": 389, "skipped": 23,
    "symbols": 1840, "refs": 5211,
    "langs": { "ts": 301, "py": 62, "go": 26 },
    "unsupported": [{ "ext": ".kt", "files": 23 }],
    "durationMs": 1840,
    "output": ".tene-claude/index/symbols.json"
}}
```

**스캔 규칙**
- 제외: `.git`, `node_modules`, `dist`, `build`, `vendor`, `.next`, `target`, `__pycache__`, `.tene`, `.tene-claude`
- `.gitignore` 를 존중한다 (파싱 실패 시 위 기본 제외만 적용)
- 파일당 상한 2MB, 초과 시 skip + warning
- `ripgrep` 이 PATH 에 있으면 사용, 없으면 Node `fs` 순회

**증분 빌드**: 파일 mtime + size 해시로 변경 파일만 재파싱. `--since` 지정 시 `git diff --name-only` 결과만.

### 1.3 `questions` — 6가지 질문 일괄

```jsonc
{ "ok": true, "data": {
  "symbol": "processPayment",
  "tier": "indexed",
  "q1_name":    { "value": "processPayment", "kind": "function", "source": "indexed", "confidence": "high" },
  "q2_defined": { "value": "src/payments/processPayment.ts:42", "source": "indexed", "confidence": "high" },
  "q3_referenced": { "value": [
      { "file": "src/api/routes/payments.ts", "line": 3, "kind": "import" },
      { "file": "src/jobs/retry.ts", "line": 2, "kind": "import" }
    ], "source": "indexed", "confidence": "high" },
  "q4_called": { "value": [
      { "file": "src/api/routes/payments.ts", "line": 18, "kind": "call" },
      { "file": "src/jobs/retry.ts", "line": 7, "kind": "call" }
    ], "source": "indexed", "confidence": "medium",
    "note": "동적 디스패치는 탐지되지 않음" },
  "q5_input":  { "value": "{ amount: number; cardToken: string; idempotencyKey?: string }",
                 "source": "indexed", "confidence": "medium", "raw": "export async function processPayment(input: PaymentInput)" },
  "q6_output": { "returns": "Promise<PaymentResult>",
                 "mutations": [{ "target": "payments", "kind": "db-write", "via": "paymentsRepo.insert",
                                 "file": "src/payments/processPayment.ts:71", "confidence": "medium" }],
                 "source": "indexed+heuristic", "confidence": "medium" },
  "unresolved": []
}}
```

**Q6 mutations 휴리스틱** (전부 `confidence: medium` 이하)
1. persistence 계층으로 판정된 심볼의 호출
2. 알려진 ORM/드라이버 메서드명 (`insert|update|delete|save|create|upsert|exec|query`)
3. 모듈 스코프 변수 대입
4. 파라미터 객체 프로퍼티 대입

### 1.4 언어 팩 인터페이스

```js
// lib/cia/langs/<name>.js
export default {
  name: 'typescript',
  extensions: ['.ts', '.tsx', '.mts', '.cts'],
  // 정의 추출: [{ name, kind, line, exported, signatureText }]
  extractDefinitions(sourceText),
  // import 추출: [{ from, names[], line }]
  extractImports(sourceText),
  // 참조 후보: [{ name, line, kind: 'call'|'ref' }]
  extractReferences(sourceText),
  // 주석/문자열 제거 (오탐 방지)
  stripNonCode(sourceText),
}
```

**1차 지원 4종** (D13): `typescript`(ts/tsx/js/jsx), `python`, `go`, `java`
**미지원 확장자**: 파일 목록과 계층 판정만 제공. 심볼은 `not_indexed`, 6질문은 Tier 3로 폴백

### 1.5 `layer`

```jsonc
{ "ok": true, "data": {
  "target": "src/payments/processPayment.ts",
  "layer": "business-logic",
  "source": "rules-project",          // rules-project | rules-default | imports | unclassified
  "confidence": "high",
  "matchedRule": "**/payments/**",
  "signals": { "imports": ["./db/payments"], "importLayerHint": "persistence" }
}}
```

미매칭 시:
```jsonc
{ "layer": null, "source": "unclassified",
  "reason": "no rule matched",
  "suggestion": "src/jobs/** 를 layers.yml 에 추가 검토" }
```

---

## 2. `tene-state` — 상태 CRUD

```bash
tene-state read     [--sprint <id>] [--summary]     # summary: SessionStart 용 압축본
tene-state init     --sprint <id> --title <t> [--trust L2]
tene-state advance  --sprint <id> --to <phase> [--force]
tene-state gate     --sprint <id> --gate G3 --result pass|fail --detail '<json>'
tene-state ac       --sprint <id> --set '<json>'    # AC 판정 일괄 갱신
tene-state stale    --sprint <id> --ac AC-2 --cause <file>
tene-state carry    --sprint <id> --add '<json>'
tene-state event    --sprint <id> --type <t> --detail '<json>'
tene-state size                                      # 정리 필요 여부
tene-state clean    --archived|--history|--index [--dry-run]
tene-state resync   --sprint <id>                    # 문서를 정본으로 상태 재구성
```

### `read --summary` (SessionStart 훅 전용)

```jsonc
{ "ok": true, "data": {
  "text": "[tene] 진행 중: checkout-retry (phase: qa, Trust L3)\n  · 게이트 G6 FAIL — AC 5건 중 pass 3 / fail 1 / 미측정 1\n  · 차단 원인: AC-2(DATA) 실패\n  · 전이 커버리지 3/5 (60%)\n  · 다음 행동: /tene:qa 재실행 또는 /tene:loop-check 복귀\n  · 문서: docs/sprints/checkout-retry/",
  "tokensEstimate": 180,
  "activeSprint": "checkout-retry", "phase": "qa"
}}
```

**`text` 는 400 토큰을 넘지 않도록 스스로 절삭한다.** 항목 우선순위: 차단 원인 > 다음 행동 > 게이트 요약 > 커버리지 > 경로.

### 쓰기 안전성

| 항목 | 방식 |
|---|---|
| 원자성 | 임시 파일에 쓰고 `rename` (같은 파일시스템) |
| 동시성 | `updatedAt` 비교 낙관적 잠금. 불일치 시 `error.code = STALE_WRITE` 반환 |
| 손상 복구 | JSON 파싱 실패 시 `.corrupt-<ts>` 로 보존하고 `resync` 안내 |

---

## 3. `tene-doc` — 문서 생성·검증

```bash
tene-doc scaffold --sprint <id> --doc prd|plan|design|analysis|qa|report [--lang ko|en]
tene-doc validate --sprint <id> --doc <type> [--strict]
tene-doc patch    --sprint <id> --doc <type> --block <name> --content-file <path>
tene-doc extract  --sprint <id> --what ac|tasks|edges|anchors|requirements
```

### `validate` 출력

```jsonc
{ "ok": true, "data": {
  "doc": "docs/sprints/checkout-retry/00-prd/prd.md",
  "valid": false,
  "checks": [
    { "id": "sections",     "pass": true },
    { "id": "nongoals",     "pass": false, "detail": "§3 범위 밖이 비어 있음" },
    { "id": "ac_count",     "pass": true,  "value": 5 },
    { "id": "ac_method",    "pass": true },
    { "id": "ac_unwanted",  "pass": false, "detail": "If-then 패턴 AC 없음" },
    { "id": "frontmatter",  "pass": true }
  ],
  "freeSections": ["+@ 참고 자료"],
  "gate": "G1", "gateResult": "fail"
}}
```

### `patch` — 자동 생성 영역만 교체

```
--block understanding  → <!-- tene:auto:start ... --> 블록을 찾아 교체
사람이 쓴 영역은 절대 건드리지 않는다.
블록이 없으면 해당 섹션 끝에 새로 삽입한다.
```

### `extract` — 문서 → 구조화 데이터

스킬과 에이전트가 문서를 직접 파싱하지 않게 한다. 파싱 로직을 한 곳에 모은다.

```jsonc
// --what ac
{ "ok": true, "data": { "ac": [
  { "id": "AC-1", "statement": "If 카드가 만료되었다면...", "pattern": "unwanted",
    "method": "UX", "anchors": ["CheckoutPage"], "status": "pass" }
]}}
```

---

## 4. `tene-gate` — 게이트 판정

```bash
tene-gate check  --sprint <id> --gate G1..G7 [--json]
tene-gate task-complete                        # TaskCompleted 훅 전용 (stdin 페이로드)
tene-gate next   --sprint <id>                 # 다음 가능한 전이
```

### `check` 출력

```jsonc
{ "ok": true, "data": {
  "gate": "G6", "result": "fail",
  "checks": [
    { "id": "qa_doc_exists",  "pass": true },
    { "id": "all_ac_judged",  "pass": true },
    { "id": "fail_zero",      "pass": false, "detail": "AC-2 fail" },
    { "id": "stale_zero",     "pass": true }
  ],
  "blocking": [{ "ac": "AC-2", "reason": "payments 테이블에 실패 기록 없음",
                 "evidence": "docs/sprints/checkout-retry/evidence/AC-2.json" }],
  "recovery": ["/tene:loop-check 로 복귀해 구현 갭을 메우세요",
               "또는 AC-2 를 범위 밖으로 재정의하고 PRD를 갱신하세요"],
  "insufficient": [{ "ac": "AC-3", "reason": "타임아웃 재현 환경 부재" }]
}}
```

**`recovery` 는 반드시 채운다.** 차단만 하고 길을 알려주지 않으면 사용자가 막힌다.

### 게이트 판정 규칙 (전체)

| 게이트 | 체크 항목 |
|---|---|
| G1 | `sections`, `nongoals`, `ac_count≥1`, `ac_method`, `ac_unwanted≥1`, `frontmatter` |
| G2 | `sections`, `ac_coverage`(uncovered=0) |
| G3 | `sections`, `layers_all_four`, `questions_present`, `edges≥1(UX AC 존재 시)`, `anchors_resolved` |
| G4 | `changed_files>0`, `build_ok`(명령 존재 시) |
| G5 | `match_rate≥target` OR (`loops≥max` AND `user_approved`) |
| G6 | `qa_doc_exists`, `all_ac_judged`, `fail_zero`, `stale_zero` |
| G7 | `r1..r6_present`, `r4_all_four_layers`, `r6_reasons_present` |

---

## 5. `tene-guard` — 가드 (fail-closed)

```bash
tene-guard --event pretooluse    # stdin: 훅 페이로드
tene-guard --event posttooluse
```

### 판정 순서 (PreToolUse:Bash)

```
1. tool_input.command 를 세그먼트 분해: ; && || | & \n
2. 각 세그먼트의 첫 토큰(명령어 위치)만 명령으로 간주
   → `grep "tene get" README.md` 는 grep 이므로 통과
3. 규칙 적용:
   deny     : tene get
   deny     : tene export  (--encrypted 없음)
   deny     : cat|less|more|head|tail|strings|xxd|od  대상이 .tene/
   escalate : tene set KEY <값>  (--stdin 없이 인자로 값 전달)
4. 어느 규칙에도 안 걸리면 exit 0
5. 내부 예외 발생 시 → deny (fail-closed)
```

### 출력 (deny)

```jsonc
{ "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "tene get 은 평문 값을 stdout 으로 내보내 AI 컨텍스트에 들어갑니다. 값 확인은 별도 터미널에서 직접 실행하세요. 존재 여부만 필요하면 `tene list` 를 쓰세요."
}}
```

### PreToolUse:Read

```
file_path 가 .tene/ 하위 → deny
그 외 → exit 0
```

### PreToolUse:Edit|Write — phase 가드

```
현재 phase 가 design 이전(prd|plan|design) 이고, 대상이 소스 파일이면
→ escalate (deny 아님)
   "설계 문서 없이 구현하려 합니다. /tene:design 을 먼저 실행하거나, 그대로 진행하려면 승인하세요."
예외: docs/**, *.md, .tene-claude/**, 설정 파일 → 통과
```

> `deny` 가 아니라 `escalate` 인 이유: 탐색적 프로토타이핑을 막으면 마찰이 크다. **사용자가 알고 넘어가게** 하는 것이 목적이다.

---

## 6. 훅별 I/O 계약

### 6.1 공통 입력 필드

모든 훅이 stdin JSON 으로 받는 것:
```jsonc
{ "session_id": "...", "transcript_path": "...", "cwd": "...",
  "permission_mode": "auto|default|acceptEdits|plan|bypassPermissions|dontAsk",
  "hook_event_name": "PreToolUse", "prompt_id": "...", "agent_id": "...", "agent_type": "..." }
```

> **`permission_mode` 를 읽는다.** `bypassPermissions`/`dontAsk` 모드에서는 `escalate` 를 낼 수 없다(물어볼 사람이 없다) — 이 경우 escalate 대신 `additionalContext` 경고로 강등한다. **단 시크릿 `deny` 는 모든 모드에서 유지한다.**

### 6.2 훅 상세

| 훅 | 추가 입력 | 처리 | 출력 |
|---|---|---|---|
| `SessionStart` | `source` | `tene-state read --summary` | stdout 평문(Claude에게 보임) |
| `UserPromptSubmit` | `prompt` | 키워드 라우터 + phase 힌트 | `additionalContext` |
| `PreToolUse:Bash` | `tool_input.command` | `tene-guard` | deny/escalate/pass |
| `PreToolUse:Read` | `tool_input.file_path` | `.tene/` 검사 | deny/pass |
| `PreToolUse:Edit\|Write` | `tool_input.file_path` | phase 가드 | escalate/pass |
| `PostToolUse:Edit\|Write` | `tool_input.file_path` | `tene-scan touched` → `tene-state stale` | `additionalContext` (영향 AC 알림) |
| `PostToolUse:Bash` | `tool_input.command` | `.env` 생성 탐지 | `additionalContext` |
| `TaskCreated` | `task` | 제목에서 `[Phase]` 파싱 → 상태 연결 | exit 0 |
| `TaskCompleted` | `task` | `tene-gate task-complete` | **exit 2 + stderr(사유)** 또는 0 |
| `Stop` | — | 전이 가능 여부 판정 | `additionalContext` 또는 조건부 exit 2 |
| `PreCompact` | — | `tene-state read` 후 flush | exit 0 |
| `PostCompact` | — | `read --summary` | `additionalContext` |
| `SubagentStop` | `agent_type` | `tene-*` 이면 산출물 반영 | exit 0 |
| `SessionEnd` | `reason` | `tene-state size` 만 (1.5초 예산) | exit 0 |

### 6.3 `TaskCompleted` — 게이트 차단의 실체

```
입력: { "task": { "id": "...", "title": "[QA] AC 검증 및 게이트 판정", "status": "completed" } }

1. 제목에서 phase 파싱: [PRD]|[Plan]|[Design]|[Do]|[LoopCheck]|[QA]|[Report]
2. 해당 phase 의 게이트를 조회 (tene-gate check)
3. result === "fail" → exit 2
   stderr:
     "G6 게이트 실패로 QA 태스크를 완료할 수 없습니다.
      · AC-2 fail — payments 테이블에 실패 기록 없음
        증거: docs/sprints/checkout-retry/evidence/AC-2.json
      복구:
      · /tene:loop-check 로 복귀해 구현 갭을 메우세요
      · 또는 AC-2 를 범위 밖으로 재정의하고 PRD를 갱신하세요"
4. 그 외 → exit 0
```

> **이것이 "spec driven 을 반드시 하게 만드는" 강제 지점이다.** 모델이 "완료했습니다"라고 선언해도 상태 파일이 반증한다.

### 6.4 `Stop` — 조건부 차단

```
차단(exit 2) 하는 경우는 하나뿐:
  Trust Level ≥ L3 이고, 현재 phase 가 check 이고, 일치율 < 목표이고,
  반복 횟수 < 상한  →  "아직 목표 미달입니다. 계속 개선하세요" + 갭 목록

그 외에는 전부 additionalContext 로 다음 행동만 제시한다.
```

**8회 연속 차단 시 Claude Code가 오버라이드**하므로, 반복 상한(3회)이 그보다 낮게 설정되어 있다 — 자연 종료가 강제 종료보다 먼저 온다.

### 6.5 `UserPromptSubmit` — 키워드 라우터

```jsonc
// lib/router/rules.json
{ "rules": [
  { "id": "new-feature", "when": "no-active-sprint",
    "any": { "ko": ["새 기능","기능 추가","만들어","구현해","개발해"],
             "en": ["new feature","add feature","implement","build a"] },
    "suggest": "/tene:sprint init", "priority": 10 },
  { "id": "qa", "when": "phase>=do",
    "any": { "ko": ["QA","테스트","검증","동작 확인","제대로 되는지"],
             "en": ["qa","test","verify","check if it works"] },
    "suggest": "/tene:qa", "priority": 20 },
  { "id": "understand", "when": "always",
    "any": { "ko": ["어디서 쓰","누가 호출","영향 범위","이거 뭐야","구조"],
             "en": ["where is","who calls","impact","references"] },
    "suggest": "/tene:understand", "priority": 30 },
  { "id": "secrets", "when": "tene-cli-available",
    "any": { "ko": ["키","시크릿","토큰","비밀","환경변수"],
             "en": ["api key","secret","token","credential","env var"] },
    "suggest": "/tene:secrets", "priority": 15 }
]}
```

**중복 제어**: 같은 세션에서 같은 `rule.id` 를 두 번 제안하지 않는다 (`.tene-claude/history/suggested.json`).
**우선순위**: 현재 phase 에 해당하는 규칙이 항상 우선.
**비활성화**: `userConfig.auto_trigger === false` 이면 즉시 exit 0.

---

## 7. userConfig

```jsonc
{
  "docs_root":        { "type": "directory", "title": "문서 루트", "default": "docs/sprints" },
  "state_dir":        { "type": "directory", "title": "상태 디렉토리", "default": ".tene-claude" },
  "profile":          { "type": "string",  "title": "기본 Profile", "default": "standard" },
  "auto_until":       { "type": "string",  "title": "자동 진행 상한", "default": "design" },
  "match_target":     { "type": "number",  "title": "check 목표 일치율", "default": 100, "min": 50, "max": 100 },
  "max_loop_checks":  { "type": "number",  "title": "loop-check 반복 상한", "default": 3, "min": 1, "max": 10 },
  "auto_trigger":     { "type": "boolean", "title": "자연어 자동 트리거", "default": true },
  "workflow_threshold": { "type": "number", "title": "워크플로 전환 AC 수", "default": 8 },
  "doc_language":     { "type": "string",  "title": "문서 언어", "default": "auto" },
  "scan_langs":       { "type": "string",  "title": "인덱서 언어", "default": "ts,js,py,go", "multiple": true }
}
```

훅에서는 `CLAUDE_PLUGIN_OPTION_<KEY>` 환경변수로 읽는다 (셸 폼에서 `${user_config.*}` 는 거부되므로).

---

## 8. 오류 코드 표

| 코드 | 발생 | 처리 |
|---|---|---|
| `NO_ACTIVE_SPRINT` | 활성 sprint 없음 | `/tene:sprint init` 안내 |
| `PHASE_MISMATCH` | 스킬의 phase ≠ 현재 phase | 사유 설명 후 사용자 확인 |
| `GATE_BLOCKED` | 선행 게이트 미통과 | `recovery` 제시 |
| `DOC_MISSING` | 필요한 문서 없음 | 해당 스킬 안내 |
| `DOC_INVALID` | 필수 섹션 누락 | 누락 목록 제시 |
| `STALE_WRITE` | 동시 편집 충돌 | 현재 상태 표시 후 재시도 확인 |
| `STATE_CORRUPT` | JSON 파싱 실패 | 백업 후 `resync` 안내 |
| `INDEX_MISSING` | 인덱스 없음 | `tene-scan build` 자동 실행 |
| `LANG_UNSUPPORTED` | 언어 팩 없음 | Tier 3 폴백 |
| `NO_TEST_RUNNER` | 테스트 러너 감지 실패 | UNIT `insufficient` |
| `NO_BROWSER` | 브라우저 드라이버 없음 | UX `insufficient` |
| `TENE_CLI_MISSING` | tene CLI 없음 | 시크릿 스킬 비활성 |
| `GUARD_ERROR` | 가드 내부 오류 | **deny** (fail-closed) |
