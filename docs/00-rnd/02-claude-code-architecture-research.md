# 02. Claude Code 아키텍처 기술 연구
### Dynamic Workflow · Task Management · 하네스 엔지니어링 · 그래프 엔지니어링 · Context Engineering

> 조사일: 2026-08-20 · 대상: Claude Code CLI v2.1.x
> 목적: tene 플러그인이 **어떤 런타임 위에** 올라타는지 정확히 파악하고, 각 기능을 어떤 조합으로 쓸지 결정

---

## 0. 전체 조망 — 5개 축이 서로 어떻게 맞물리는가

```
                    ┌──────────────────────────────────────┐
                    │      Context Engineering (기반)       │
                    │  "고신호 토큰의 최소 집합을 유지"        │
                    │  CLAUDE.md / rules / skills / memory  │
                    │  compaction / JIT retrieval           │
                    └───────────────┬──────────────────────┘
                                    │ 무엇을 컨텍스트에 넣을까
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
┌───────▼────────┐        ┌─────────▼─────────┐      ┌─────────▼─────────┐
│ Graph Eng.     │        │ Harness Eng.      │      │ Task Management   │
│ 구조를 미리 계산 │        │ 환경을 구조화하여   │      │ 작업 상태를 외부화  │
│ → JIT 질의     │        │ 컨텍스트 경계 극복  │      │ → 세션 간 인계      │
│ MCP/LSP/그래프  │        │ hooks/goal/verify │      │ TaskCreate/Update  │
└───────┬────────┘        └─────────┬─────────┘      └─────────┬─────────┘
        │                           │                           │
        └───────────────────────────┼───────────────────────────┘
                                    │ 실행 방식
                    ┌───────────────▼──────────────────────┐
                    │      Dynamic Workflow (오케스트레이션) │
                    │  계획을 코드로: agent/parallel/        │
                    │  pipeline/phase, 중간결과는 스크립트 변수│
                    └──────────────────────────────────────┘
```

**핵심 통찰**: 이 다섯은 별개 기능이 아니라 **하나의 문제(컨텍스트 윈도우는 유한하다)에 대한 서로 다른 층위의 답**이다.
- Context Engineering = 무엇을 넣을지 고르는 원칙
- Graph Engineering = 넣을 것을 미리 계산해 두고 필요할 때만 꺼내는 저장소
- Harness Engineering = 컨텍스트가 끊겨도 일이 이어지게 만드는 환경 설계
- Task Management = 그 환경의 "작업 상태" 표준 구현
- Dynamic Workflow = 컨텍스트를 아예 스크립트 변수로 빼내는 실행 모델

---

## 1. Context Engineering

### 1.1 정의와 프롬프트 엔지니어링과의 차이

Anthropic 정의: **"최적의 토큰 집합을 큐레이션하고 유지하기 위한 전략들"**. 추론 시 포함되는 모든 정보(시스템 지시, 도구, 외부 데이터, 메시지 히스토리)를 관리한다.

| | Prompt Engineering | Context Engineering |
|---|---|---|
| 초점 | 효과적인 프롬프트 작성 | 전체 컨텍스트 상태 관리 |
| 성질 | 단발성 | 반복적/순환적 |
| 범위 | 주로 시스템 프롬프트 | 모든 컨텍스트 요소 |
| 용도 | 일회성 분류/생성 | 다중 턴 에이전트 시스템 |

**지도 원칙**: *"원하는 결과의 확률을 최대화하는 가장 작은 고신호 토큰 집합을 찾아라."*

### 1.2 Context Rot & Attention Budget

- **Context Rot**: 토큰 수가 늘수록 정확한 회상 능력이 감소. 원인은 (a) Transformer의 n² 상호작용, (b) 짧은 시퀀스 위주의 학습 분포, (c) 긴 시퀀스 특화 파라미터 부족. 성능 절벽이 아닌 **완만한 구배**로 나타난다.
- **Attention Budget**: 인간의 작업기억처럼 유한한 자원. 모든 새 토큰이 예산을 소비한다.

→ **컨텍스트는 유한 자원으로 취급해야 한다.** tene 의 모든 설계 결정은 이 전제를 따라야 한다.

### 1.3 시스템 프롬프트의 "고도(Altitude)"

| 극단 | 실패 모드 |
|---|---|
| 과도하게 구체적 (Brittle) | if-else 로직 하드코딩 → 유지보수 폭발, 새 상황에 취약 |
| 과도하게 추상적 (Vague) | 행동 신호 부족 → 암묵적 가정 의존, 결과 비일관 |

권장: `<background_information>`, `<instructions>`, `## Tool guidance` 같은 **명확한 섹션 분류**. XML 태그나 Markdown 헤더 사용. **최소한의 충분한 정보** 원칙(짧다는 뜻이 아님). 최고 성능 모델로 최소 프롬프트를 먼저 테스트한 뒤 필요한 만큼만 추가.

### 1.4 도구(Tool) 설계 원칙

도구는 에이전트와 환경 사이의 **계약**이다.
- **정보 효율성**: 반환값이 토큰 효율적일 것
- **행동 효율성**: 효율적인 후속 행동을 유도할 것
- 자체 포함적(self-contained), 오류에 강건, 의도 명확
- **모호성 제거**: *"어느 도구를 써야 할지 사람이 확신할 수 없으면 AI도 못 한다."*
- 안티패턴: 블로트된 과잉 기능 도구 집합이 결정 지점을 흐린다

### 1.5 Few-shot

*"예제는 천 단어 분량의 그림"*. 모든 엣지 케이스를 나열하지 말고 **다양하고 정준적인 소수의 예제**를 큐레이션하라. 엣지 케이스 세탁 목록은 안티패턴.

### 1.6 Just-in-Time Retrieval

| 방식 | 특징 |
|---|---|
| Pre-inference (사전 로드) | 빠르지만 무관한 정보 포함 가능 |
| **Just-in-Time** | 경량 식별자(파일 경로/쿼리/링크)만 유지, 런타임에 도구로 동적 로드 |

**Claude Code 자체가 이 패턴의 레퍼런스 구현**이다. CLAUDE.md는 사전 로드하되 `glob`/`grep`/`head`/`tail` 로 필요한 것만 꺼낸다. 이점: 저장 효율, 메타데이터 신호(경로 계층·명명 규칙·타임스탬프), 점진적 공개, 자체 관리 컨텍스트. 트레이드오프는 런타임 탐색이 느리다는 점.

> **tene 설계 함의**: 스펙 문서 전체를 컨텍스트에 밀어넣는 것은 안티패턴. **스펙 인덱스(경량 식별자) + 필요 시 섹션 로드**의 JIT 구조가 맞다.

### 1.7 Long-Horizon 3대 기법

| 기법 | 최적 시나리오 | Claude Code 구현 |
|---|---|---|
| **Compaction** | 광범위한 왕복이 필요한 작업 | 자동/`/compact <지시>`, `/rewind` 의 부분 요약 |
| **Structured Note-Taking** | 명확한 마일스톤이 있는 반복 개발 | Auto memory (`MEMORY.md` + 토픽 파일), 진행 상황 파일 |
| **Multi-Agent** | 병렬 탐색이 효과적인 복잡 연구 | 서브에이전트, Agent Teams, Dynamic Workflow |

Compaction 원칙: 회상(recall) 최대화 → 정밀도(precision) 개선 → 가장 안전한 형태는 "도구 결과 제거". 보존 대상은 **아키텍처 결정, 미해결 버그, 구현 세부사항**.

### 1.8 Claude Code의 컨텍스트 엔지니어링 구현체 (실무 매핑)

| 메커니즘 | 로드 시점 | 크기 제약 | 성격 |
|---|---|---|---|
| 시스템 프롬프트 | 항상 (~4.2K 토큰) | — | 불가시 |
| `CLAUDE.md` (managed→user→project→local) | 세션 시작 전체 | **200줄 권장** | 사용자 작성, 권고 |
| `.claude/rules/*.md` | 무조건 로드 or `paths:` 매칭 시 | — | 경로 스코프 가능 |
| Auto memory `MEMORY.md` | 세션 시작 **첫 200줄 / 25KB** | 하드 리밋 | Claude 작성, 학습 축적 |
| Auto memory 토픽 파일 | 온디맨드 | — | 표준 파일 도구로 읽음 |
| Skills `description` | 항상 (설명만) | **1,536자** 캡 | 인덱스 |
| Skills 본문 | 호출 시 1회, 세션 유지 | 컴팩션 후 5K 토큰/스킬, 총 25K | 절차/지식 |
| MCP 도구 스키마 | **기본 deferred** (이름만) | ToolSearch로 온디맨드 | 점진적 공개 |

**중요 디테일들**:
- CLAUDE.md 는 **시스템 프롬프트가 아니라 시스템 프롬프트 뒤의 사용자 메시지**로 주입된다. 강제력이 없다.
- 프로젝트 루트 CLAUDE.md 는 컴팩션 후 디스크에서 재주입되지만, **중첩 CLAUDE.md 와 `paths:` 규칙은 재주입되지 않는다.**
- 스킬 본문은 세션 내 재-읽기 되지 않는다. "한 번 하는 절차"가 아니라 **상시 지시(standing instruction)** 로 써야 한다.
- 블록 레벨 HTML 주석(`<!-- -->`)은 컨텍스트 주입 전에 제거된다 → 유지보수 메모를 토큰 비용 없이 남길 수 있다.
- `claudeMdExcludes` 로 모노레포의 타 팀 CLAUDE.md 를 배제할 수 있다.
- `/doctor` 가 CLAUDE.md 트림을 제안한다 (코드에서 유도 가능한 내용 제거, 함정·근거·비표준 컨벤션 유지). v2.1.206+

### 1.9 선택 가이드 — 무엇을 어디에 쓸 것인가

| 넣고 싶은 것 | 올바른 위치 |
|---|---|
| 매 세션 필요한 사실(빌드 명령, 컨벤션) | `CLAUDE.md` |
| 특정 경로에서만 필요한 규칙 | `.claude/rules/*.md` + `paths:` |
| 다단계 절차 / 도메인 지식 | **Skill** |
| 반드시 매번 실행되어야 하는 것 | **Hook** (CLAUDE.md 아님!) |
| 많은 파일을 읽어야 하는 조사 | **Subagent** |
| 대규모 팬아웃 + 검증 | **Dynamic Workflow** |

---

## 2. 하네스 엔지니어링 (Harness Engineering)

### 2.1 문제 정의

에이전트는 **이산적 세션**으로 작업한다. 새 세션은 이전 상태 기억이 없다. Anthropic의 비유: *"교대근무하는 엔지니어 팀 — 각 교대는 이전 작업 내용을 모른 채 시작한다."*

핵심 질문: **"새 컨텍스트 윈도우로 시작한 에이전트가 작업 상태를 빠르게 파악하게 하려면?"**

### 2.2 2-Agent 아키텍처

```
┌──────────────────┐         ┌────────────────────────────┐
│ Initializer      │  1회    │ Coding Agent               │  N회 반복
│ (환경 기초 구축)   │  ────▶ │ (증분 진행)                 │
├──────────────────┤         ├────────────────────────────┤
│ · init.sh 작성    │         │ · pwd                      │
│ · progress 파일   │         │ · git log + progress 읽기  │
│ · feature_list.json│        │ · feature list 읽고 1개 선택│
│ · 초기 git commit │         │ · init.sh 로 서버 기동      │
└──────────────────┘         │ · 기본 기능 E2E 테스트       │
                             │ · 기능 1개 구현 + 검증       │
                             │ · commit + progress 갱신    │
                             └────────────────────────────┘
```

### 2.3 Feature List — 조기 종료 방지 장치

Initializer가 작성하는 **구조화된 JSON**:

```json
{
  "category": "functional",
  "description": "New chat button creates a fresh conversation",
  "steps": ["Navigate to main interface", "Click 'New Chat'", "..."],
  "passes": false
}
```

- claude.ai 클론 예제에서 **200개 이상**의 feature 로 확장됨
- Coding agent 는 **`passes` 필드만 변경 가능**
- JSON 형식 선택 이유: *"모델이 JSON 파일을 부적절하게 변경하거나 덮어쓸 가능성이 더 낮다"*
- 강력한 지시문: *"It is unacceptable to remove or edit tests because this could lead to missing or buggy functionality."*

### 2.4 실패 모드 ↔ 해결책 매핑 (Anthropic 원문 표)

| 실패 모드 | Initializer 해결 | Coding Agent 해결 |
|---|---|---|
| 조기 승리 선언 | Feature list JSON 생성 | 한 번에 하나씩, 신중한 테스트 |
| 미정리 환경 | Git repo & progress 파일 | 세션 시작 시 테스트, 끝에 commit |
| 미검증 완료 | Feature list | Self-verify 후에만 passing 표시 |
| 실행 방법 모름 | `init.sh` 작성 | 세션 시작 시 읽기 |

### 2.5 검증 루프 — 브라우저 자동화 필수

Claude의 주요 실패 모드는 **적절한 테스트 없이 feature를 완료로 표시**하는 것. 해결책은 단위 테스트가 아니라 **사용자처럼 브라우저 자동화 도구로 E2E 테스트**하도록 명시적으로 프롬프팅하는 것이다.

> 이것이 4번 주제(의도 기반 QA)와 직결된다. Anthropic 자신이 "단위 테스트만으로는 불충분"하다고 명시한다.

### 2.6 Claude Code가 제공하는 하네스 프리미티브

| 프리미티브 | 강제력 | 용도 |
|---|---|---|
| **Hooks** | 결정론적(런타임 실행) | 규칙 강제. exit 2 로 차단 |
| **`/goal`** | 모델 평가자 + Stop hook 래퍼 | 조건 충족까지 자동 턴 반복 |
| **Stop hook** | 스크립트 | 검사 통과 전 턴 종료 차단 (8회 연속 차단 시 오버라이드) |
| **Checkpoints / `/rewind`** | — | 되감기 (단, Bash 변경은 미추적) |
| **Subagent 검증** | 별도 컨텍스트 | 작성자가 아닌 모델이 채점 |
| **Monitors** | 백그라운드 | 로그/파일/외부 상태 감시 → 세션에 알림 |
| **Worktrees** | 격리 | 병렬 편집 충돌 방지 |

#### Hook 이벤트 전량 (v2.1.x)

| 카테고리 | 이벤트 |
|---|---|
| 세션 | `SessionStart`, `Setup`, `SessionEnd` |
| 턴 | `UserPromptSubmit`, `UserPromptExpansion`, `Stop`, `StopFailure` |
| 도구 | `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch` |
| 에이전트/태스크 | `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `TeammateIdle` |
| 컨텍스트 | `PreCompact`, `PostCompact`, `InstructionsLoaded` |
| 환경 | `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove` |
| MCP | `Elicitation`, `ElicitationResult` |
| 기타 | `Notification`, `MessageDisplay` |

**Hook 핸들러 타입**: `command`(셸/exec), `http`, `mcp_tool`, `prompt`(모델 평가), `agent`(서브에이전트 평가). — `prompt`/`agent` 타입의 존재가 결정적이다: **훅 안에서 LLM 판정을 돌릴 수 있다.** 의도 부합성 검사 같은 비결정론적 게이트를 훅으로 만들 수 있다는 뜻.

**exit code 의미**:
- `0`: 정상. stdout 이 `{` 로 시작하면 JSON 으로 해석. `UserPromptSubmit`/`UserPromptExpansion`/`SessionStart` 에서는 평문 stdout 이 Claude에게 보임
- `2`: **차단**. `PreToolUse`, `UserPromptSubmit`, `Stop`, `SubagentStop`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `PreCompact`, `PostToolBatch`, `WorktreeCreate` 등에서 동작

**JSON 출력 필드**: `continue`, `stopReason`, `systemMessage`, `additionalContext`, `decision`(allow/deny/escalate), `hookSpecificOutput.{permissionDecision, updatedInput, retry}`

**출력 한도**: 10,000자. `SessionEnd` 는 전체 훅이 1.5초 예산 공유(설정 시 최대 60초).

#### `/goal` 의 동작 원리

- 실체는 **세션 스코프 prompt 기반 Stop hook**
- 매 턴 종료 시 small fast model(기본 Haiku)에게 조건 + 대화를 보내 3가지 판정: **Not yet met / Met / Impossible**
- 평가자는 **도구를 호출하지 않는다.** 대화에 드러난 것만 판단한다 → 조건은 **Claude의 출력으로 증명 가능한 형태**여야 한다
- 조건 최대 4,000자. `or stop after 20 turns` 같은 절로 상한 설정 가능
- 도구 사용 없이 여러 턴 답만 하면 루프를 멈추고 사용자에게 반환
- 인증 실패 / 크레딧 소진 / 컴팩션 불가한 컨텍스트 오버플로 / 모델 부재 → goal 해제. 그 외(레이트리밋 등)는 유지

> **tene 설계 함의**: "스펙의 모든 수용 기준이 충족되었음이 전사(transcript)에 증거로 남았는가" 를 `/goal` 조건으로 쓰는 것이 자연스럽다. 그리고 그 증거를 남기는 것은 QA 스킬의 책무다.

### 2.7 Claude Code 공식 베스트 프랙티스 중 하네스 관련 핵심

> *"Claude는 일이 다 된 것처럼 보이면 멈춘다. 실행 가능한 검사가 없으면 '다 된 것처럼 보임'이 유일한 신호이고, 당신이 검증 루프가 된다."*

검사를 얼마나 강하게 게이트할지 4단계:
1. **프롬프트 안에서**: "검사를 실행하고 반복하라"
2. **세션 전체**: `/goal` 조건
3. **결정론적 게이트**: Stop hook
4. **제2의 의견**: 검증 서브에이전트 / Dynamic Workflow의 적대적 검증

그리고 *"성공을 주장하지 말고 증거를 보여라"* — 테스트 출력, 실행한 명령과 반환값, 결과 스크린샷.

**대형 기능은 Claude가 사용자를 인터뷰하게 하라** (공식 문서의 권장 프롬프트):

```
I want to build [brief description]. Interview me in detail using the AskUserQuestion tool.
Ask about technical implementation, UI/UX, edge cases, concerns, and tradeoffs.
Don't ask obvious questions, dig into the hard parts I might not have considered.
Keep interviewing until we've covered everything, then write a complete spec to SPEC.md.
```

> **이것이 tene 의 4번 주제(의도 추출)에 대한 Anthropic 공식 답변의 원형이다.** 좋은 스펙은 자기충족적이어야 하며 — 관련 파일과 인터페이스를 명명하고, 범위 밖을 명시하고, **기능이 동작함을 증명하는 E2E 검증 단계로 끝나야 한다.**

---

## 3. Task Management System

### 3.1 변천

- v2.1.142 에서 레거시 `TodoWrite` 가 폐기되고 **`TaskCreate` / `TaskUpdate` / `TaskGet` / `TaskList`** 4개 도구로 분리
- 2026-01-22 Claude Code 2.1 릴리즈에서 다중 세션 오케스트레이션 계층으로 승격

### 3.2 구조

| 요소 | 내용 |
|---|---|
| 상태 | `pending` / `in progress` / `completed` |
| 의존성 | 태스크 간 의존 선언. 미해결 의존이 있는 pending 태스크는 **claim 불가** |
| 자동 해제 | 선행 태스크 완료 시 의존 태스크가 자동으로 unblock |
| 동시성 제어 | **파일 락**으로 claim 경쟁 방지 |
| 저장 위치 | `~/.claude/tasks/{team-name}/` — 세션 종료 후에도 **로컬 유지**, 업로드되지 않음 |
| 보존 | `cleanupPeriodDays` 스윕 규칙 적용 |

`{team-name}` = `session-` + 세션 ID 앞 8자.

### 3.3 Agent Teams 와의 관계

Agent Teams(실험적, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)는 이 태스크 리스트를 **공유 조율 백본**으로 쓴다.

| 구성요소 | 역할 |
|---|---|
| Team lead | 팀메이트 스폰 + 작업 조율. 세션 수명 동안 고정, 이양 불가 |
| Teammates | 독립 Claude Code 인스턴스. 각자 독립 컨텍스트 |
| Task list | 팀메이트가 claim/complete 하는 공유 목록 |
| Mailbox | `~/.claude/teams/{team}/inboxes/{agent}.json` — 에이전트 간 메시징 |

**Subagent vs Agent Teams**

| | Subagents | Agent Teams |
|---|---|---|
| 통신 | 메인 에이전트에만 보고 | 팀메이트끼리 직접 메시지 |
| 조율 | 메인 에이전트가 전담 | 자율 조율 + 공유 태스크 리스트 |
| 토큰 | 낮음(요약 반환) | 높음(각자 완전한 인스턴스) |
| 적합 | 결과만 필요한 집중 작업 | 토론·상호 검증이 필요한 복잡 작업 |

**보안 규약(중요)**: 에이전트 간 `SendMessage` 메시지는 수신 에이전트에게 **"사람이 아니라 다른 Claude 세션에서 왔다"** 고 알려진다. 팀메이트는 권한 프롬프트를 대신 승인할 수 없고, 거부당한 액션을 다른 팀메이트에게 우회 요청할 수 없다. Auto 모드에서는 분류기가 (a) 릴레이된 승인 주장을 비신뢰 입력으로 취급하고 (b) 전달 전 모든 메시지를 검토한다.

**품질 게이트 훅**: `TeammateIdle`, `TaskCreated`, `TaskCompleted` 에서 exit 2 로 각각 "계속 일해라 / 태스크 생성 차단 / 완료 차단 + 피드백" 을 강제할 수 있다.

> **tene 설계 함의**: `TaskCompleted` 훅에서 "이 태스크에 연결된 스펙의 수용 기준이 QA 증거와 함께 통과했는가"를 검사해 미달 시 exit 2 로 반려하는 것이 **의도 기반 QA 게이트의 가장 저비용 구현**이다.

### 3.4 알려진 한계

- 재개(`/resume`, `/rewind`)로 in-process 팀메이트가 복원되지 않음
- 태스크 상태가 지연될 수 있음(완료 표시 누락 → 의존 태스크 블록)
- 세션당 팀 1개, 중첩 팀 불가, lead 고정
- 팀메이트는 백그라운드 서브에이전트를 못 띄움

---

## 4. Dynamic Workflow

### 4.1 정체

**Claude가 작성하고 런타임이 백그라운드에서 실행하는 JavaScript 오케스트레이션 스크립트.** v2.1.154+ 필요. 2026-05-28 Opus 4.8과 함께 출시.

핵심 차별점: **계획을 코드로 옮긴다.** 서브에이전트/스킬/에이전트팀에서는 Claude가 턴마다 다음 행동을 정하고 모든 결과가 컨텍스트에 쌓이지만, 워크플로 스크립트는 루프·분기·중간 결과를 **스크립트 변수에** 보유한다. Claude의 컨텍스트에는 **최종 답만** 들어온다.

| | Subagents | Skills | Agent teams | **Workflows** |
|---|---|---|---|---|
| 다음 실행 결정 | Claude, 턴마다 | Claude | lead, 턴마다 | **스크립트** |
| 중간 결과 위치 | 컨텍스트 | 컨텍스트 | 공유 태스크 리스트 | **스크립트 변수** |
| 재사용 대상 | 워커 정의 | 지시문 | 팀 정의 | **오케스트레이션 자체** |
| 규모 | 턴당 몇 개 | 동일 | 소수 장기 실행 | **런당 수십~수백** |
| 중단 시 | 턴 재시작 | 턴 재시작 | 계속 실행 | **동일 세션 내 재개 가능** |

### 4.2 스크립트 구조

```javascript
export const meta = {
  name: 'spec-conformance-audit',
  description: 'Audit implementation against spec acceptance criteria',
  phases: [
    { title: 'Discover', detail: 'enumerate spec criteria' },
    { title: 'Verify',   detail: 'one agent per criterion' },
    { title: 'Adversarial', detail: 'refute each finding' },
  ],
}

phase('Discover')
const spec = await agent('Read docs/spec/*.md and list every acceptance criterion.', {
  schema: { type:'object', required:['criteria'],
            properties:{ criteria:{ type:'array', items:{ type:'string' } } } },
})

const results = await pipeline(
  spec.criteria,
  c  => agent(`Verify criterion: ${c}. Show evidence.`, { phase:'Verify', label:c, schema: VERDICT }),
  (v, c) => parallel([1,2,3].map(i => () =>
      agent(`Try to REFUTE this verdict for "${c}": ${JSON.stringify(v)}`,
            { phase:'Adversarial', schema: REFUTE })))
      .then(votes => ({ criterion:c, verdict:v, refuted: votes.filter(Boolean).filter(x=>x.refuted).length >= 2 })),
)

return results.filter(Boolean).filter(r => !r.refuted)
```

`meta` 는 **순수 리터럴**이어야 한다(변수·함수호출·스프레드·템플릿 보간 불가). 필수: `name`, `description`. 선택: `whenToUse`, `phases`, `model`.

### 4.3 프리미티브

| 프리미티브 | 시그니처 | 의미 |
|---|---|---|
| `agent(prompt, opts?)` | `→ Promise<string \| object \| null>` | 서브에이전트 1개. `schema` 주면 검증된 객체 반환. 중단/치명적 오류 시 `null` |
| `parallel(thunks[])` | `→ Promise<any[]>` | **배리어**. 전부 대기. 실패한 thunk 는 `null` |
| `pipeline(items, ...stages)` | `→ Promise<any[]>` | **배리어 없음**. 아이템별 독립 진행. 각 스테이지는 `(prev, originalItem, index)` 수신 |
| `phase(title)` | `void` | 진행 표시 그룹 |
| `log(msg)` | `void` | 사용자에게 진행 메시지 |
| `workflow(nameOrRef, args?)` | `→ Promise<any>` | 다른 워크플로를 인라인 호출(1단계 중첩만) |
| `args` | 글로벌 | 호출 시 전달된 입력 |
| `budget` | `{ total, spent(), remaining() }` | 토큰 예산. `total` 도달 시 `agent()` throw |

**`agent()` 옵션**: `label`, `phase`, `schema`(JSON Schema), `model`, `effort`, `isolation:'worktree'`, `agentType`

**`pipeline` 이 기본값인 이유**: `parallel` 은 배리어이므로 가장 느린 아이템이 전체를 붙잡는다. 배리어가 정당한 경우는 (a) 전체 결과 셋에 대한 dedup/merge, (b) 총합 0이면 조기 종료, (c) 다음 스테이지가 "다른 발견들"을 참조할 때뿐이다.

### 4.4 런타임 제약

| 제약 | 이유 |
|---|---|
| 실행 중 사용자 입력 불가 (권한 프롬프트만 일시정지) | 단계별 승인이 필요하면 단계마다 별도 워크플로 |
| 스크립트 자체는 파일시스템/셸 접근 불가 | 에이전트가 읽고 쓴다. 스크립트는 조율만 |
| 모듈 로딩 불가 (`import()` 포함 시 실행 전 실패) | 라이브러리가 필요한 일은 에이전트 태스크로 |
| `Date.now()` / `Math.random()` / 인자 없는 `new Date()` throw | **재개(resume) 결정성 보장** |
| 동시 에이전트 최대 16 (CPU에 따라 감소) | 로컬 자원 |
| 런당 총 에이전트 1,000 | 폭주 방지 |
| `parallel`/`pipeline` 한 번에 최대 4,096 아이템 | 명시적 에러 |

### 4.5 실행·비용·재개

- 모든 런은 스크립트를 `~/.claude/projects/<session>/` 아래 파일로 기록하고 경로를 Claude에게 넘긴다. **읽고, diff 뜨고, 편집해서 재실행 가능.**
- **재개 규칙**(중요): 실행 중이던 에이전트는 저장되지 않아 재시작. 리플레이는 **에이전트 시작 순서**를 따르며, 캐시된 결과는 **완료하지 않은 첫 에이전트에서 멈춘다.** 그 이후 시작된 에이전트는 완료했더라도 전부 재실행. → **작은 에이전트 다수로 팬아웃한 워크플로가 진행을 더 많이 보존한다.**
- 재개는 **동일 세션 내에서만**. Claude Code 를 종료하면 다음 세션은 처음부터.
- **프롬프트 캐시 팬아웃**: 같은 model/effort/agentType/tools/schema/cwd 인 에이전트는 프리픽스 캐시를 공유. 첫 에이전트 응답 시작까지 나머지를 최대 `CLAUDE_CODE_WORKFLOW_PREFIX_STAGGER_MS`(기본 5000ms) 홀드.
- **크기 가이드라인**: `/config` 의 `workflowSizeGuideline` — `small`(<5) / `medium`(<15, 기본) / `large`(<50) / `unrestricted`
- 25개 초과 에이전트 또는 예상 150만 토큰 초과 시 `Large workflow` 경고(권고적)
- 워크플로 서브에이전트는 세션 모드와 무관하게 **항상 `acceptEdits`** 로 실행되며 툴 allowlist 를 상속. 파일 편집은 자동 승인된다.

### 4.6 플러그인으로 워크플로 배포

플러그인 루트 `workflows/` 에 스크립트를 두면 `/plugin-name:meta-name` 으로 실행된다. 매니페스트 `workflows` 필드로 경로 변경 가능.

> **tene 설계 함의**: tene 의 QA 스윕/스펙 감사/마이그레이션은 전부 **워크플로로 배포**하는 것이 맞다. 사용자가 `ultracode` 를 몰라도 `/tene:qa-sweep` 하나로 수십 에이전트 오케스트레이션을 얻는다.

### 4.7 품질 패턴 카탈로그 (공식 도구 설명 기준)

| 패턴 | 요지 |
|---|---|
| **Adversarial verify** | 발견마다 독립 회의론자 N명이 *반박을 시도*. 과반 반박 시 폐기 |
| **Perspective-diverse verify** | 동일 반박자 N명 대신 서로 다른 렌즈(정확성/보안/성능/재현성) |
| **Judge panel** | 서로 다른 각도의 N개 시도 → 병렬 심판 채점 → 승자 기반 합성 + 차점자 아이디어 이식 |
| **Loop-until-dry** | K 라운드 연속 신규 발견 없을 때까지 반복 (단순 카운터는 꼬리를 놓침) |
| **Multi-modal sweep** | 컨테이너별/내용별/엔티티별/시간별 등 서로 다른 탐색 축 |
| **Completeness critic** | 마지막에 "무엇이 빠졌나 — 미실행 모달리티, 미검증 주장, 미독 소스" |
| **No silent caps** | top-N/샘플링으로 커버리지를 제한했다면 `log()` 로 밝힐 것 |

---

## 5. 그래프 엔지니어링 (Graph Engineering)

> Claude Code 공식 문서에 "graph engineering" 이라는 명명된 기능은 없다. 이는 **컨텍스트 엔지니어링의 JIT retrieval 을 코드 구조 도메인에 특화시킨 업계 패턴**이며, Claude Code 는 MCP/LSP/코드 인텔리전스 플러그인을 통해 이를 수용한다.

### 5.1 문제

에이전트가 코드 구조를 파악하는 기본 수단은 `grep` + `Read` 루프다. 이것은:
- 동적 디스패치, 인터페이스 구현, DI 컨테이너를 따라가지 못한다
- 읽은 파일 전량이 컨텍스트를 소모한다 (Context Rot 가속)
- "이걸 고치면 뭐가 깨지나"에 답할 수 없다

### 5.2 해법: 사전 계산된 코드 지식 그래프

**패턴**: tree-sitter/LSP 로 코드베이스를 파싱 → 심볼과 관계를 그래프로 추출 → **MCP 로 에이전트에 노출**. 에이전트는 무작위로 파일을 읽는 대신 **변경 전에 구조를 질의**한다.

2026년 이 카테고리의 성장은 뚜렷하다. CodeGraph(1월 출시 5개월 만에 47.4k stars), GitNexus(4~6월 사이 1.2k→42k) 등 상위 도구들의 공통 특성은 **온디바이스 사전 계산 + MCP 서빙**(클라우드 없음, 임베딩 API 없음, 코드 유출 없음)이다.

### 5.3 Claude Code 측 수용 지점

| 메커니즘 | 제공 형태 |
|---|---|
| **LSP 플러그인** (`.lsp.json`) | 심볼 네비게이션 + 편집 후 자동 오류 감지. TypeScript/Python/Rust 등 공식 플러그인 존재 |
| **MCP 서버** | 그래프 질의 도구. 기본 deferred → `ToolSearch` 로 온디맨드 로드 (컨텍스트 절약) |
| **Code execution with MCP** | 도구 정의를 코드 API 로 노출해 progressive disclosure. 한 사례에서 **150,000 → 2,000 토큰 (98.7% 절감)** |
| **`large-codebases` 가이드** | 중첩 CLAUDE.md, sparse worktree, 패키지별 스킬 |

### 5.4 이 프로젝트의 기존 자산: tene MCP

본 워크스페이스에는 이미 **tene studio 정적 분석 그래프**가 MCP로 연결되어 있다 (4개 프로젝트 인덱싱, `tene-studio` 기준 6,598 노드 / 10,955 엣지, schemaVersion 28). 도구군을 분류하면:

| 그룹 | 도구 |
|---|---|
| **구조 질의** | `get_symbol`, `get_definition`, `get_signature`, `get_callers`, `get_callees`, `get_module_graph`, `get_interface_tree`, `get_file_tree`, `find_references` |
| **영향/추적** | `get_impact`, `trace`, `trace_data_flow`, `trace_feature`, `get_data_flow`, `get_event_flow`, `get_entry_points`, `get_cycles` |
| **도메인/경계** | `get_domain(s)`, `get_boundaries`, `get_boundary_coverage`, `get_architecture_style`, `get_layer` 계열 |
| **데이터** | `get_schema`, `get_mutations`, `find_endpoints_for_table`, `get_endpoint_contract`, `get_state_profile` |
| **QA/테스트** | `get_test_coverage`, `get_test_gap`, `select_tests_for_change`, `get_task_test_matrix`, `trace_tested_flow`, `verify_chain`, `verify_task`, `record_verdict` |
| **태스크** | `create_task`, `update_task`, `list_tasks`, `get_task`, `set_task_phase`, `add_task_anchor`, `get_task_conflicts`, `next_unimplemented` |
| **의도/설계** | `get_design_decisions`, `get_explanation`/`set_explanation`, `propose_blueprint`, `get_blueprint`, `inject_agent_memory`, `set_node_annotation` |
| **가드레일** | `check_guardrails`, `confirm_mutation`, `ask_user`, `get_guards`, `get_warnings`, `get_uncertain_edges` |
| **오버레이 보정** | `add_edge`, `confirm_edge`, `set_layer`, `set_label`, `set_node_domain`, `revert_overlay`, `clear_overlay` |

**정직 규약(honesty contract)이 설계에 내장되어 있다는 점이 특히 중요하다**: `semanticLayer` 부재 = 엔진이 못 정한 것, `provenance:"augmented"` = AI/사람이 보탠 것(결정론적 확정 아님), `resolution:"over-approx"/"unknown"` = 불확실, `truncated`/`_meta.budget` = 답이 잘림. `get_warnings`/`get_capabilities` 가 자기 사각지대를 스스로 신고한다.

> **tene 플러그인의 결정적 차별점이 여기 있다.** 대부분의 SDD 도구는 스펙(문서)만 다루고 코드 구조는 grep 에 맡긴다. tene 은 **스펙(의도) ↔ 결정론적 코드 그래프(구조) ↔ 테스트 증거(검증)** 세 축을 연결할 수 있는 유일한 위치에 있다. 이것이 4번 주제의 아키텍처 제안 기반이 된다.

### 5.5 그래프를 컨텍스트 엔지니어링 관점에서 쓰는 법

| 하지 말 것 | 할 것 |
|---|---|
| 그래프 전체 덤프를 컨텍스트에 넣기 | 질문 단위로 최소 서브그래프만 질의 |
| 그래프를 진실로 맹신 | `provenance`/`resolution` 등급을 그대로 읽고 전달 |
| grep 먼저 하고 그래프 나중에 | **변경 전에 `get_impact` 먼저** |
| 그래프에 소스 본문 기대 | 구조 골격일 뿐. 구현 세부는 `read_file` 로 확인 |

---

## 6. tene 플러그인 관점의 조합 설계 (초안)

```
[Plan]  /tene:spec  ──── AskUserQuestion 인터뷰 ──▶ docs/spec/<feature>.md (의도 SSOT)
                              │                        + acceptance criteria (EARS 형식)
                              ▼
                     tene MCP: set_explanation / propose_blueprint
                     (의도를 그래프 노드에 앵커)

[Do]    Hook: PreToolUse(Edit|Write) ──▶ 대상 파일에 연결된 스펙 존재? 없으면 escalate
        Skill: /tene:implement ──▶ get_impact 로 영향 범위 선확인 후 구현

[Check] Hook: TaskCompleted ──▶ 해당 태스크의 수용 기준 QA 증거 검사, 미달 시 exit 2
        Workflow: /tene:qa-sweep ──▶ 기준별 에이전트 팬아웃 + 적대적 검증
        /goal "모든 수용 기준이 증거와 함께 통과"

[Act]   Auto memory + tene overlay 에 학습 축적 (record_verdict / inject_agent_memory)
```

각 층의 근거:
- **Skill** 로 절차를 배포 (온디맨드 로드 → 컨텍스트 절약)
- **Hook** 으로 규칙을 강제 (CLAUDE.md 는 지켜지지 않는다)
- **Workflow** 로 규모를 확보 (중간 결과가 컨텍스트를 오염시키지 않음)
- **MCP 그래프** 로 구조를 JIT 조회 (grep 루프 제거)
- **`/goal` + Stop hook** 으로 종료 조건을 외부화 (조기 승리 선언 방지)

---

## 출처

- [Effective context engineering for AI agents — Anthropic Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Effective harnesses for long-running agents — Anthropic Engineering](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Building effective agents — Anthropic Engineering](https://www.anthropic.com/engineering/building-effective-agents)
- [Code execution with MCP — Anthropic Engineering](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [Orchestrate subagents at scale with dynamic workflows — Claude Code Docs](https://code.claude.com/docs/en/workflows)
- [Orchestrate teams of Claude Code sessions — Claude Code Docs](https://code.claude.com/docs/en/agent-teams)
- [How Claude remembers your project — Claude Code Docs](https://code.claude.com/docs/en/memory)
- [Explore the context window — Claude Code Docs](https://code.claude.com/docs/en/context-window)
- [Extend Claude with skills — Claude Code Docs](https://code.claude.com/docs/en/skills)
- [Hooks reference — Claude Code Docs](https://code.claude.com/docs/en/hooks)
- [Keep Claude working toward a goal (/goal) — Claude Code Docs](https://code.claude.com/docs/en/goal)
- [Best practices for Claude Code — Claude Code Docs](https://code.claude.com/docs/en/best-practices)
- [Set up Claude Code in a monorepo or large codebase — Claude Code Docs](https://code.claude.com/docs/en/large-codebases)
- [Inside Claude Code's Shared Task List — MindStudio](https://www.mindstudio.ai/blog/claude-code-agent-teams-shared-task-list)
- [Claude Code Workflows: Deterministic Multi-Agent Orchestration — alexop.dev](https://alexop.dev/posts/claude-code-workflows-deterministic-orchestration/)
- [Code Intelligence Tools for AI Agents Compared — Ry Walker Research](https://rywalker.com/research/code-intelligence-tools)
- [Leveraging Codebase Knowledge Graphs for Agentic Code Generation — Potpie](https://potpie.ai/blog/leveraging-codebase-knowledge-graphs-for-agentic-code-generation)
- [Agent Harness Engineering — AddyOsmani.com](https://addyosmani.com/blog/agent-harness-engineering/)
- tene MCP 서버 (`mcp__tene__*`) 도구 인벤토리 및 `list_projects` 실측 (2026-08-20)
