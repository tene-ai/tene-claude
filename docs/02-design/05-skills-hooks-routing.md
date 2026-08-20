# D05 · 스킬 · 훅 · 라우팅

> 대응: FR-6.1~6.5, FR-1.2, W-06, W-1A~W-1C, W-2A~W-2E, W-28~W-29, W-3D~W-3H, W-57, W-58
> 관련: [00-prd/07 스킬 명세](../00-prd/07-skill-and-agent-specs.md) — 각 스킬의 단계별 로직

---

## 1. 스킬 카탈로그

| 스킬 디렉토리 | 호출 | phase | 게이트 | 모델 자동호출 |
|---|---|---|---|---|
| `sprint` | `/tene:sprint` | (라우터) | — | ✅ |
| `prd` | `/tene:prd` | prd | G1 | ✅ |
| `plan` | `/tene:plan` | plan | G2 | ✅ |
| `design` | `/tene:design` | design | G3 | ✅ |
| `loop-check` | `/tene:loop-check` | loop-check | G5 | ✅ |
| `qa` | `/tene:qa` | qa | G6 | ✅ |
| `report` | `/tene:report` | report | G7 | ✅ |
| `status` | `/tene:status` | — | — | ✅ |
| `understand` | `/tene:understand` | — | — | ✅ |
| `layers` | `/tene:layers` | — | — | ✅ |
| `secrets` | `/tene:secrets` | — | — | ✅ |
| `doctor` | `/tene:doctor` | — | — | ✅ |
| `archive` | `/tene:archive` | archive | G7 | ❌ |
| `clear` | `/tene:clear` | — | — | ❌ |
| `master-plan` | `/tene:master-plan` | — | — | ✅ |
| `conventions` | (모델 전용) | — | — | ✅ (user-invocable: false) |

**16개.** 컨텍스트 예산 §5 참조.

> ⚠️ **구현 중 정정 1** — 초기 카탈로그는 15개였으나 `master-plan`(W-6A)이 빠져 있었다.
> WBS 에는 있었으므로 카탈로그 쪽 누락이다.

> ⚠️ **구현 중 정정 2 — 디렉토리 이름에 `tene-` 를 붙이지 않는다.**
>
> 초기 카탈로그는 디렉토리를 `tene-prd` 로 적었다. 그러면 Claude Code 가
> **`/tene:tene-prd`** 로 등록한다 — frontmatter 의 `name:` 은 무시되고 디렉토리 이름이 쓰인다.
>
> 워크플로에는 같은 규칙을 §D09 §8 에 이미 적어두었는데(`meta.name` 에 접두사 금지)
> 스킬에는 적용하지 않았다. **실제로 로드해보고 나서야 드러났다** —
> `claude plugin validate` 는 이것을 잡지 못한다.
>
> ```
> skills/prd/SKILL.md       → /tene:prd        ✅
> skills/tene-prd/SKILL.md  → /tene:tene-prd   ❌
> ```

---

## 1.5 Claude Code 스킬 모델 — 조사로 확정한 사실

> ⚠️ **구현 중 전면 정정.** 초기 설계는 스킬 frontmatter 를 `name`/`description`/
> `when_to_use`/`argument-hint`/`allowed-tools` 다섯 개로 가정했다.
> 실제로는 **20개 필드**가 있고, 그중 몇은 우리가 정반대로 이해하고 있었다.

### 1.5.1 스킬이 곧 슬래시 커맨드다

> "Custom commands have been merged into skills."

`commands/*.md` 와 `skills/*/SKILL.md` 는 **같은 것을 만든다.** 별도 커맨드 파일이 필요 없다.

| 위치 | 커맨드 이름의 출처 |
|---|---|
| 플러그인 `skills/<dir>/SKILL.md` | **frontmatter `name`**, 없으면 디렉토리 이름. 플러그인 접두사가 붙는다 |
| 프로젝트 `.claude/skills/<dir>/` | 디렉토리 이름 (frontmatter `name` 은 표시용) |

플러그인에서는 `name` 이 마지막 세그먼트를 정한다 (v2.1.216+).
혼동을 막기 위해 **디렉토리와 `name` 을 일치시킨다.**

### 1.5.2 `allowed-tools` 는 제한이 아니라 **사전 승인**이다

> "It does not restrict which tools are available: every tool remains callable."

우리는 이것을 "이 스킬은 이 도구만 쓴다" 는 **보안 경계**로 이해하고 설계했다. 틀렸다.

| 필드 | 실제 의미 |
|---|---|
| `allowed-tools` | 그 턴 동안 **권한 승인 없이** 쓸 수 있는 도구. 나머지도 여전히 호출 가능 |
| `disallowed-tools` | 도구를 **실제로 제거**한다. 이것이 제한이다 |

**`/tene:secrets` 의 "allowed-tools 가 1차 방어" 라는 주장은 성립하지 않는다.**
실제 방어는 `disallowed-tools` + `tene-guard` 훅(fail-closed)이다.

### 1.5.3 호출 주체 제어

| frontmatter | 사용자 | Claude | 쓸 곳 |
|---|---|---|---|
| (기본) | ✅ | ✅ | 대부분 |
| `disable-model-invocation: true` | ✅ | ❌ | **부작용이 큰 것** — archive, clear |
| `user-invocable: false` | ❌ | ✅ | 배경 지식 — conventions |

`disable-model-invocation` 은 description 을 컨텍스트에 싣지도 않는다 (예산 절약).

### 1.5.4 동적 컨텍스트 — 선행 조건을 서술하지 않고 **주입**한다

`` !`<command>` `` 는 스킬 내용이 모델에 전달되기 **전에** 실행되고, 출력이 그 자리에 들어간다.

```markdown
## 현재 상태
!`"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" read`
```

초기 설계는 "먼저 `tene-state read` 를 실행하라" 고 **서술**했다. 모델이 그 지시를 따를지는
확률이다. 주입하면 확률이 아니라 사실이 된다.

### 1.5.5 명령 경로 — `${CLAUDE_PLUGIN_ROOT}` 없이는 실행되지 않는다

> ⚠️ **실사용에서 드러난 치명적 결함.**

초기 스킬 본문은 `tene-state read` 처럼 **PATH 에 있다고 가정**했다. tene 의 `bin/` 은
PATH 에 등록되지 않는다. `/tene:doctor` 를 실제로 실행했더니 명령을 찾지 못했다.

모든 명령은 `"${CLAUDE_PLUGIN_ROOT}/bin/tene-<x>"` 로 쓴다.
`allowed-tools` 의 패턴도 같아야 승인이 걸린다.

### 1.5.6 서브에이전트 격리

`context: fork` 를 주면 스킬 내용이 **서브에이전트의 프롬프트**가 된다.

| 필드 | 뜻 |
|---|---|
| `context: fork` | 격리 실행. 대화 이력을 받지 않는다 |
| `agent` | 실행 환경 (`Explore`, `Plan`, `general-purpose`, 또는 커스텀). 기본 general-purpose |
| `background` | `false` 면 그 턴에서 결과를 기다린다. 기본 `true` |

`agent: Explore` 는 CLAUDE.md 와 git status 를 건너뛴다 — 조사 전용 스킬에 맞다.

**주의**: 지침만 있고 과업이 없는 스킬에 `fork` 를 주면 아무것도 하지 않고 끝난다.

### 1.5.7 그 밖의 필드

| 필드 | 용도 | tene 에서 |
|---|---|---|
| `model` | 그 턴의 모델 | 판정에 상위 모델 |
| `effort` | 노력 수준 | `qa` 는 `high` |
| `hooks` | 스킬 활성 중 훅 등록 (`once` 지원) | 전역 hooks.json 으로 충분 |
| `paths` | 이 경로를 다룰 때만 자동 활성 | `conventions` |
| `arguments` | 명명 위치 인자 (`$name`) | |
| `disallowed-tools` | 실제 도구 제거 | `secrets` |
| `metadata` | 자유 맵 (CC 는 관여 안 함) | tene 자체 메타 |

문자열 치환: `$ARGUMENTS`, `$ARGUMENTS[N]`, `$N`, `$name`, `${CLAUDE_SESSION_ID}`

---

## 2. 스킬 frontmatter 표준

```yaml
---
name: design
description: 처리 로직을 상세 설계하고 Understanding Layer 4계층으로 분류한다. 변경 대상 심볼의 6가지 질문에 답한다.
when_to_use: "설계, 구조, 아키텍처, 어떻게 만들지, 처리 로직, design, architecture, how to build"
argument-hint: "[sprint-id]"
allowed-tools: Read Write Edit Glob Grep Bash(tene-*) AskUserQuestion
metadata:
  tene:
    phase: design
    gate: G3
    next: do
    doc: design
    agent: tene-cartographer
---
```

### 2.1 필드 사용 규칙

| 필드 | 사용 | 근거 |
|---|---|---|
| `description` | 첫 문장에 핵심 용도 | 1,536자 캡에서 잘려도 살아남게 |
| `when_to_use` | ko/en 트리거 어휘 병기 | FR-6.4 |
| `allowed-tools` | `Bash(tene-*)` 로 우리 스크립트만 사전 승인 | 최소 권한 |
| `disable-model-invocation` | `archive`, `clear` 만 `true` | FR-6.3 |
| `user-invocable` | `conventions` 만 `false` | 배경지식 |
| `metadata.tene` | 훅과 라우터가 읽는 자유 필드 | 표준 필드 재사용 금지 |
| `context: fork` | **사용하지 않음** | 인터뷰가 필요한 스킬에서 `AskUserQuestion` 이 fork 경계에서 제거됨 |

### 2.2 `allowed-tools` 설계

```yaml
# 조사 계열 (읽기만)
understand:  Read Glob Grep Bash(tene-scan*)
status:      Read Bash(tene-state read*)
doctor:      Read Bash(tene-*) Bash(node --version) Bash(claude --version) Bash(git *)

# 문서 작성 계열
prd:         Read Write Edit Glob Grep Bash(tene-doc*) Bash(tene-state*) AskUserQuestion
design:      Read Write Edit Glob Grep Bash(tene-*) AskUserQuestion

# 실행 계열
qa:          Read Write Edit Glob Grep Bash AskUserQuestion   # 테스트 실행 필요

# 시크릿 (읽기 안전 명령만 사전 승인)
secrets:     Read Glob Grep Bash(tene list*) Bash(tene whoami*) Bash(tene version*) Bash(tene env*)
```

**`tene-secrets` 가 핵심**: `tene get`/`tene export` 는 애초에 목록에 없고, 추가로 `tene-guard` 훅이 차단한다(이중 방어).

### 2.3 스킬 본문 작성 규칙

Claude Code 는 스킬 본문을 **호출 시 1회 컨텍스트에 넣고 다시 읽지 않는다.**

| ❌ 금지 | ✅ 권장 |
|---|---|
| "먼저 A를 하고 그다음 B" (1회성 절차) | "이 작업 동안 항상 A 규칙을 지킨다" |
| 긴 배경 설명 | 판단 기준과 분기 조건 |
| 예시 나열 | 정준적 예시 1~2개 |

**본문 구조 (전 스킬 공통)**

```markdown
# <스킬명>

## 언제 적용되는가
## 시작 전 확인
## 수행 규칙        ← 상시 지시. 스킬이 활성인 동안 항상 유효
## 단계
## 산출물
## 게이트 판정
## 하지 않는 것
## 실패 시
```

### 2.4 공통 선행 조건

모든 사이클 스킬이 시작 시 실행:

```bash
tene-state read --json
```

```
1. activeSprint 없음        → /tene:sprint init 제안 후 중단
2. phase 불일치             → 사유 설명 후 사용자 확인
3. 선행 게이트 미통과        → 어느 게이트에서 무엇이 막혔는지 제시 후 중단
```

---

## 3. 훅 배치

### 3.1 `hooks/hooks.json`

```json
{
  "hooks": {
    "SessionStart": [
      { "matcher": "startup|resume|clear",
        "hooks": [{ "type": "command",
          "command": ["${CLAUDE_PLUGIN_ROOT}/bin/tene-hook", "session-start"],
          "timeout": 5 }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command",
          "command": ["${CLAUDE_PLUGIN_ROOT}/bin/tene-hook", "user-prompt"],
          "timeout": 5 }] }
    ],
    "PreToolUse": [
      { "matcher": "Bash",
        "hooks": [{ "type": "command",
          "command": ["${CLAUDE_PLUGIN_ROOT}/bin/tene-guard", "--event", "pretooluse-bash"],
          "timeout": 10 }] },
      { "matcher": "Read",
        "hooks": [{ "type": "command",
          "command": ["${CLAUDE_PLUGIN_ROOT}/bin/tene-guard", "--event", "pretooluse-read"],
          "timeout": 10 }] },
      { "matcher": "Edit|Write",
        "hooks": [{ "type": "command",
          "command": ["${CLAUDE_PLUGIN_ROOT}/bin/tene-hook", "pre-edit"],
          "timeout": 5 }] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write",
        "hooks": [{ "type": "command",
          "command": ["${CLAUDE_PLUGIN_ROOT}/bin/tene-hook", "post-edit"],
          "timeout": 5 }] },
      { "matcher": "Bash",
        "hooks": [{ "type": "command",
          "command": ["${CLAUDE_PLUGIN_ROOT}/bin/tene-hook", "post-bash"],
          "timeout": 5 }] }
    ],
    "TaskCreated": [
      { "hooks": [{ "type": "command",
          "command": ["${CLAUDE_PLUGIN_ROOT}/bin/tene-hook", "task-created"],
          "timeout": 5 }] }
    ],
    "TaskCompleted": [
      { "hooks": [{ "type": "command",
          "command": ["${CLAUDE_PLUGIN_ROOT}/bin/tene-gate", "task-complete"],
          "timeout": 15 }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command",
          "command": ["${CLAUDE_PLUGIN_ROOT}/bin/tene-hook", "stop"],
          "timeout": 10 }] }
    ],
    "PreCompact": [
      { "hooks": [{ "type": "command",
          "command": ["${CLAUDE_PLUGIN_ROOT}/bin/tene-hook", "pre-compact"],
          "timeout": 5 }] }
    ],
    "PostCompact": [
      { "hooks": [{ "type": "command",
          "command": ["${CLAUDE_PLUGIN_ROOT}/bin/tene-hook", "post-compact"],
          "timeout": 5 }] }
    ],
    "SubagentStop": [
      { "matcher": "tene-.*",
        "hooks": [{ "type": "command",
          "command": ["${CLAUDE_PLUGIN_ROOT}/bin/tene-hook", "subagent-stop"],
          "timeout": 5 }] }
    ],
    "SessionEnd": [
      { "hooks": [{ "type": "command",
          "command": ["${CLAUDE_PLUGIN_ROOT}/bin/tene-hook", "session-end"],
          "timeout": 2 }] }
    ]
  }
}
```

**단일 진입점 `bin/tene-hook`**: 훅마다 별도 스크립트를 두면 Node 기동이 반복된다. 하나의 스크립트가 첫 인자로 분기한다.

> ⚠️ **`command` 는 문자열이다** (구현 중 정정). 위 예시의 배열(exec) 폼은 CC v2.1.235 validator 가 거부한다.
> 실제 파일은 `"\"${CLAUDE_PLUGIN_ROOT}/bin/tene-hook\" session-start"` 형태의 문자열을 쓴다.
> 자세한 근거는 [D01 §4.2](./01-packaging-and-manifest.md).

### 3.2 훅별 동작 요약

| 훅 | 입력 | 처리 | 출력 | 차단 |
|---|---|---|---|---|
| `SessionStart` | `source` | `current.json` 읽어 요약 | stdout 평문 | ✗ |
| `UserPromptSubmit` | `prompt` | 키워드 라우팅 | `additionalContext` | ✗ |
| `PreToolUse:Bash` | `tool_input.command` | 시크릿 가드 | deny/escalate | ✅ **fail-closed** |
| `PreToolUse:Read` | `tool_input.file_path` | `.tene/` 검사 | deny | ✅ **fail-closed** |
| `PreToolUse:Edit\|Write` | `tool_input.file_path` | phase 가드 | escalate | 조건부 |
| `PostToolUse:Edit\|Write` | `tool_input.file_path` | anchors 조회 → stale | `additionalContext` | ✗ |
| `PostToolUse:Bash` | `tool_input.command` | `.env` 감지 | `additionalContext` | ✗ |
| `TaskCreated` | `task` | phase 메타 부착 | — | ✗ |
| `TaskCompleted` | `task` | 게이트 판정 | exit 2 + stderr | ✅ |
| `Stop` | — | 다음 행동 안내 / loop 미달 차단 | `additionalContext` | 조건부 |
| `PreCompact` | — | 상태 flush | — | ✗ |
| `PostCompact` | — | 요약 재주입 | `additionalContext` | ✗ |
| `SubagentStop` | `agent_type` | 산출물 반영 | — | ✗ |
| `SessionEnd` | `reason` | 크기 점검만 | — | ✗ |

### 3.3 `SessionStart` 상세

```javascript
// lib/hooks/session-start.js
export function run(payload) {
  const state = readCurrent()                    // 파일 1개
  if (!state?.activeSprint) {
    const plan = readMasterPlan()
    if (!plan?.sprints?.length) return { exit: 0 }        // 조용함
    const next = recommendNext(plan)
    if (!next.next) return { exit: 0 }
    return { exit: 0, stdout: formatNextSuggestion(next) }
  }
  return { exit: 0, stdout: formatSummary(state) }        // ≤600 토큰
}
```

**출력 예 (진행 중 sprint 있음)**

```
[tene] 진행 중: checkout-retry (phase: qa, profile: standard)
  · G6 FAIL — blocking AC 3건 중 1건 failed
  · 차단: ac_2 (DATA) — payments 테이블에 실패 기록 없음
  · 미측정 1건 (ac_3), 전이 커버리지 3/5
  · 다음: /tene:loop-check 로 복귀하거나 /tene:qa --only DATA 재실행
  · 문서: docs/sprints/checkout-retry-payment-failure-input-preservation/
```

**출력 예 (활성 sprint 없음 + master plan 있음)**

```
[tene] 진행 중인 sprint 가 없습니다.
  · 다음 추천: refund-flow (선행 payment-core 완료됨)
  · ⚠️ 결정 대기: "재시도 잡의 멱등키 정책" (checkout-retry 에서 이월)
  · /tene:master-plan --carry 로 확인하세요
```

**출력 없음**: 활성 sprint 도 master plan 도 없으면 **아무것도 주입하지 않는다.** 설치했다고 말을 걸지 않는다.

### 3.4 토큰 절삭

```javascript
// lib/util/budget.js
const CHARS_PER_TOKEN = 2.5     // 한국어 기준 보수적 추정

export function truncateToBudget(lines, maxTokens) {
  // 우선순위: 차단 원인 > 다음 행동 > 게이트 요약 > 커버리지 > 경로
  const PRIORITY = ['blocking', 'next', 'gate', 'coverage', 'path']
  let out = [], used = 0
  for (const key of PRIORITY) {
    const line = lines[key]
    if (!line) continue
    const cost = Math.ceil(line.length / CHARS_PER_TOKEN)
    if (used + cost > maxTokens) break
    out.push(line); used += cost
  }
  return out.join('\n')
}
```

### 3.5 `PostToolUse:Edit|Write` 상세 (로직 200ms 예산 — D12 §6.2)

```javascript
// lib/hooks/post-edit.js
const DEADLINE_MS = 150

export function run(payload) {
  const t0 = performance.now()
  try {
    const path = normalizeToProjectRelative(payload.tool_input?.file_path)
    if (!path || isDocOrState(path)) return { exit: 0 }    // 문서·상태 편집은 무시

    const anchors = readAnchorIndex()                       // 단일 readFileSync
    if (performance.now() - t0 > DEADLINE_MS) return { exit: 0 }

    const acIds = anchors.byPath?.[path] ?? []
    if (!acIds.length) {
      // 앵커 없는 변경 → 미귀속 후보로 기록 (loop-check 에서 검사)
      recordUnattributed(path)
      return { exit: 0 }
    }

    const staled = markStale(acIds, path)                    // pass 인 것만 stale 로
    if (!staled.length) return { exit: 0 }

    return { exit: 0, additionalContext:
      `[tene] ${path} 변경 → ${staled.join(', ')} 재검증 필요 (passed → stale)` }
  } catch {
    return { exit: 0 }                                       // fail-open
  }
}
```

### 3.6 `PreToolUse:Edit|Write` — phase 가드

```javascript
export function run(payload) {
  const state = readCurrent()
  if (!state?.activeSprint) return { exit: 0 }
  if (!['prd', 'plan', 'design'].includes(state.phase)) return { exit: 0 }

  const path = normalizeToProjectRelative(payload.tool_input?.file_path)
  if (isDocOrState(path) || isConfigFile(path)) return { exit: 0 }

  // bypassPermissions/dontAsk 에서는 escalate 불가 → 경고로 강등
  if (['bypassPermissions', 'dontAsk'].includes(payload.permission_mode)) {
    return { exit: 0, additionalContext:
      `[tene] 현재 phase 는 ${state.phase} 입니다. 설계 없이 구현 중입니다.` }
  }

  return {
    exit: 0,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'escalate',
      permissionDecisionReason:
        `현재 phase 가 ${state.phase} 입니다. /tene:design 을 먼저 실행하거나, ` +
        `탐색적 작업이라면 그대로 승인하세요.`,
    },
  }
}
```

**`deny` 가 아니라 `escalate` 인 이유**: 탐색적 프로토타이핑을 막으면 마찰이 크다. 사용자가 **알고 넘어가게** 하는 것이 목적이다.

### 3.7 `Stop` — 조건부 차단

```javascript
export function run(payload) {
  const state = readCurrent()
  if (!state?.activeSprint) return { exit: 0 }

  // 차단하는 유일한 경우
  if (state.phase === 'loop-check' &&
      state.summary?.blockingGaps > 0 &&
      state.counters.loopChecks < state.counters.maxLoopChecks &&
      autoUntilIncludes(state.autoUntil, 'loop-check')) {
    return { exit: 2, stderr:
      `[tene] loop-check 미완료: blocking 갭 ${state.summary.blockingGaps}건\n` +
      formatGaps(state) + `\n계속 개선하거나 /tene:sprint waiver 로 예외 처리하세요.` }
  }

  // 그 외에는 안내만
  const next = state.nextAction
  if (!next) return { exit: 0 }
  return { exit: 0, additionalContext: `[tene] 다음 단계: /tene:${next.skill} — ${next.reason}` }
}
```

**8회 연속 차단 시 Claude Code 가 오버라이드**하므로, loop 상한(3회)이 그보다 낮게 설정되어 있다. 자연 종료가 강제 종료보다 먼저 온다.

---

## 4. `TaskCompleted` — 게이트 차단의 실체

D02 §5.3~5.4 참조. 핵심만 재확인:

```
입력: { task: { title: "[QA] 수용 기준 검증 및 게이트 판정" } }

1. 제목에서 phase 파싱: [PRD]|[Plan]|[Design]|[Do]|[LoopCheck]|[QA]|[Report]
   → tene 태스크가 아니면 exit 0
2. 해당 phase 의 게이트 판정
3. fail → exit 2 + stderr (차단 원인 / 복구 경로 / 미측정)
4. pass → exit 0
```

**이것이 "spec driven 을 반드시 하게 만드는" 강제 지점**이다. 모델이 "완료했습니다"라고 선언해도 상태 파일이 반증한다.

---

## 5. 자연어 라우팅

### 5.1 2단 구조

```
① 스킬 description + when_to_use  (모델 판단)
   Claude Code 가 세션 시작에 전 스킬 설명을 컨텍스트에 싣고 관련성으로 자동 호출

② UserPromptSubmit 훅 키워드 라우터  (결정론적 보조)
   모델이 놓치는 경우를 위해 additionalContext 로 제안
```

### 5.2 라우터 규칙

```jsonc
// lib/router/rules.json
{
  "version": 1,
  "rules": [
    { "id": "new-feature", "priority": 10, "when": "no-active-sprint",
      "any": {
        "ko": ["새 기능", "기능 추가", "만들어줘", "구현해줘", "개발해줘", "이런 걸 만들"],
        "en": ["new feature", "add a feature", "implement", "build a", "create a feature"]
      },
      "suggest": "sprint init",
      "message": { "ko": "새 기능 요청으로 보입니다. sprint 로 시작하면 의도가 문서로 남고 QA 기준이 됩니다.",
                   "en": "This looks like a new feature. Starting a sprint preserves intent as QA criteria." } },

    { "id": "prd", "priority": 20, "when": "phase=draft|prd",
      "any": { "ko": ["요구사항", "기획", "스펙", "정리해줘", "뭘 만들지"],
               "en": ["requirement", "spec", "plan out", "what to build"] },
      "suggest": "prd" },

    { "id": "design", "priority": 20, "when": "phase=plan|design",
      "any": { "ko": ["설계", "구조", "아키텍처", "어떻게 만들"],
               "en": ["design", "architecture", "how to build", "structure"] },
      "suggest": "design" },

    { "id": "loop-check", "priority": 20, "when": "phase>=do",
      "any": { "ko": ["문서대로", "제대로 됐", "일치", "빠진 거", "점검"],
               "en": ["as specified", "conformance", "gaps", "check against"] },
      "suggest": "loop-check" },

    { "id": "qa", "priority": 20, "when": "phase>=loop-check",
      "any": { "ko": ["QA", "테스트", "검증", "동작 확인", "제대로 되는지"],
               "en": ["qa", "test", "verify", "does it work"] },
      "suggest": "qa" },

    { "id": "report", "priority": 20, "when": "phase>=qa",
      "any": { "ko": ["회고", "보고서", "정리", "리포트"],
               "en": ["report", "retro", "summary", "wrap up"] },
      "suggest": "report" },

    { "id": "understand", "priority": 30, "when": "always",
      "any": { "ko": ["어디서 쓰", "누가 호출", "영향", "이거 뭐", "참조", "구조 파악"],
               "en": ["where is", "who calls", "impact", "references", "what does"] },
      "suggest": "understand" },

    { "id": "status", "priority": 15, "when": "has-active-sprint",
      "any": { "ko": ["어디까지", "이어서", "계속", "진행 상황", "현재 상태"],
               "en": ["where were we", "continue", "resume", "status", "what's next"] },
      "suggest": "status" },

    { "id": "secrets", "priority": 15, "when": "tene-cli-available",
      "any": { "ko": ["키", "시크릿", "토큰", "비밀", "환경변수", "API 키"],
               "en": ["api key", "secret", "token", "credential", "env var", ".env"] },
      "suggest": "secrets" }
  ]
}
```

### 5.3 매칭 알고리즘

```javascript
// lib/router/match.js
export function route(prompt, state, config) {
  if (config.autoTrigger === false) return null

  const lang = detectLang(prompt)                        // ko | en | other
  const candidates = RULES
    .filter(r => matchesCondition(r.when, state))
    .filter(r => matchesKeywords(r.any, prompt, lang))
    .sort((a, b) => a.priority - b.priority)

  if (!candidates.length) return null

  const top = candidates[0]
  if (alreadySuggested(top.id)) return null              // 세션당 1회
  markSuggested(top.id)

  return {
    skill: top.suggest,
    message: top.message?.[lang] ?? top.message?.en,
  }
}
```

### 5.4 조건 표현

| `when` | 의미 |
|---|---|
| `always` | 항상 |
| `no-active-sprint` | 진행 중 sprint 없음 |
| `has-active-sprint` | 있음 |
| `phase=a\|b` | 현재 phase 가 a 또는 b |
| `phase>=do` | phase 순서상 do 이상 |
| `tene-cli-available` | `tene` 가 PATH 에 있음 |

### 5.5 중복 제어

```jsonc
// .tene-claude/history/suggested.json  (세션 단위, SessionStart 에서 초기화)
{ "sessionId": "abc12345", "suggested": ["new-feature", "qa"] }
```

같은 세션에서 같은 규칙을 두 번 제안하지 않는다.

### 5.6 출력 형식

```
[tene] 이 요청은 QA 단계로 보입니다.
       현재 sprint: checkout-retry (phase: qa)
       /tene:qa 를 실행하면 수용 기준 5건을 UNIT/DATA/UX 로 검증합니다.
```

**제안만 한다. 차단하지 않는다** (exit 0). 사용자가 무시하고 다른 일을 해도 막지 않는다.

---

## 6. 컨텍스트 예산 검증

| 항목 | 예상 토큰 | 산출 근거 |
|---|---|---|
| 스킬 description × 15 | ~1,350 | 스킬당 평균 90 토큰 (description + when_to_use) |
| SessionStart 주입 | ~350 | §3.3 예시 기준 |
| 훅 제안 (요청당) | ~80 | §5.6 예시 기준 |
| **상시 합계** | **~1,700** | NFR-1 (2,000) 이내 ✅ |

### 6.1 초과 시 축소 순서

```
1. when_to_use 어휘 축약 (가장 먼저)
2. 저빈도 스킬에 disable-model-invocation: true
   → description 이 컨텍스트에서 제거됨
   후보: tene-clear, tene-archive (이미 적용), tene-layers
3. 스킬 통합
   후보: tene-status 를 tene-sprint 의 액션으로 흡수
```

### 6.2 스킬 description 예산 배분

| 스킬 | 목표 토큰 | 근거 |
|---|---|---|
| `tene-sprint`, `tene-qa`, `tene-prd` | 각 120 | 트리거 어휘가 많아야 함 |
| `tene-plan`, `tene-design`, `tene-loop-check`, `tene-report` | 각 90 | |
| `tene-understand`, `tene-status`, `tene-secrets` | 각 90 | |
| `tene-layers`, `tene-doctor`, `tene-conventions` | 각 60 | 저빈도 |
| `tene-archive`, `tene-clear` | 0 | `disable-model-invocation` |

---

## 7. 스킬 ↔ 코어 호출 계약

**스킬은 상태 파일을 직접 편집하지 않는다.** 반드시 `bin/` 경유.

```
Skill (자연어 판단)
  → 후보 산출물 생성 (문서 초안, AC 목록)
  → bin/tene-doc validate 로 검증
  → 사용자 확인 (필요 시)
  → bin/tene-doc patch + bin/tene-state advance 로 커밋
  → 다음 행동 안내
```

### 7.1 예: `/tene:prd` 흐름

```bash
1. tene-state read --json                    # 선행 조건
2. (tene-interviewer 에이전트로 인터뷰)
3. Write docs/sprints/<dir>/00-prd/prd.md    # 문서 작성
4. tene-doc validate --sprint x --doc prd    # 검증
5. (누락 시 3~4 반복)
6. tene-state ac --sprint x --set '<json>'   # AC 미러링
7. tene-gate check --gate G1                 # 게이트
8. tene-state advance --sprint x --to plan   # 전이
```

### 7.2 오류 처리

```
bin/ 이 exit != 0 을 반환하면:
  · 오류 코드와 remediation 을 사용자에게 그대로 보여준다
  · 임의로 재시도하지 않는다
  · 상태를 추측해 진행하지 않는다
```

---

## 8. `bin/tene-hook` 구조

```javascript
#!/usr/bin/env node
// bin/tene-hook <event>
import { readStdinJson } from '../lib/util/stdin.js'

const HANDLERS = {
  'session-start': () => import('../lib/hooks/session-start.js'),
  'user-prompt':   () => import('../lib/hooks/user-prompt.js'),
  'pre-edit':      () => import('../lib/hooks/pre-edit.js'),
  'post-edit':     () => import('../lib/hooks/post-edit.js'),
  'post-bash':     () => import('../lib/hooks/post-bash.js'),
  'task-created':  () => import('../lib/hooks/task-created.js'),
  'stop':          () => import('../lib/hooks/stop.js'),
  'pre-compact':   () => import('../lib/hooks/compact.js'),
  'post-compact':  () => import('../lib/hooks/compact.js'),
  'subagent-stop': () => import('../lib/hooks/subagent-stop.js'),
  'session-end':   () => import('../lib/hooks/session-end.js'),
}

const event = process.argv[2]
try {
  const payload = readStdinJson()                  // 타임아웃 포함
  const mod = await HANDLERS[event]?.()
  const result = mod ? await mod.run(payload, event) : { exit: 0 }

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.additionalContext || result.hookSpecificOutput) {
    process.stdout.write(JSON.stringify({
      additionalContext: result.additionalContext,
      hookSpecificOutput: result.hookSpecificOutput,
    }))
  }
  if (result.stderr) process.stderr.write(result.stderr)
  process.exit(result.exit ?? 0)
} catch {
  process.exit(0)                                  // fail-open
}
```

### 8.1 stdin 읽기 (블로킹 방지)

```javascript
// lib/util/stdin.js
export function readStdinJson(timeoutMs = 1000) {
  const chunks = []
  const deadline = Date.now() + timeoutMs
  const fd = 0
  const buf = Buffer.alloc(65536)

  while (Date.now() < deadline) {
    let n
    try { n = readSync(fd, buf, 0, buf.length, null) }
    catch (e) { if (e.code === 'EAGAIN') { sleepSync(5); continue } throw e }
    if (n === 0) break
    chunks.push(buf.subarray(0, n).toString('utf8'))
    // 완전한 JSON 이 되면 즉시 반환 (EOF 대기 안 함)
    const text = chunks.join('')
    try { return JSON.parse(text) } catch { /* 계속 읽기 */ }
  }
  try { return JSON.parse(chunks.join('')) } catch { return {} }
}
```

**EOF 를 기다리지 않는 이유**: 호스트가 stdin 쓰기 끝을 열어두면 훅이 무한 대기한다. **완전한 JSON 이 되는 즉시 반환**한다.
