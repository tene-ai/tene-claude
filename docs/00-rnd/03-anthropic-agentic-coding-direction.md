# 03. Anthropic이 추구하는 바이브 코딩 · 에이전틱 코딩의 방향과 아키텍처

> 조사일: 2026-08-20
> 목적: tene 플러그인이 Anthropic의 방향성과 **같은 방향으로** 확장되도록 철학적·아키텍처적 좌표를 확정

---

## 0. 한 문장 요약

Anthropic의 방향은 **"모델을 더 똑똑하게 만들고, 그 주변에 최소한의 얇은 하네스를 두되, 검증(verification)과 감독(supervision)만은 구조적으로 강제한다"** 이다. 복잡한 오케스트레이션을 프레임워크가 대신하는 방향이 아니라, **모델이 스스로 검증할 수 있는 환경을 사람이 설계하는 방향**이다.

---

## 1. 근본 설계 원칙: "Do the simple thing first"

### 1.1 얇은 래퍼(thin wrapper) 철학

Claude Code는 모델 주변에 복잡한 스캐폴딩을 쌓는 대신, **Claude의 네이티브 능력이 드러나도록 하는 가장 얇은 래퍼**로 설계되었다.

핵심 테제: *"단순한 단일 스레드 마스터 루프 + 규율 있는 도구와 계획 = 통제 가능한 자율성(controllable autonomy)."*

이는 멀티 에이전트 스웜과 복잡한 오케스트레이션을 좇는 업계 흐름에 대한 의도적 반대 선택이다. **디버그 가능성(debuggability), 투명성(transparency), 신뢰성(reliability)** 을 오케스트레이션 정교함보다 우선한다.

### 1.2 "Building effective agents"의 세 원칙

Anthropic이 명시한 자율 에이전트 구축 원칙:

1. **단순성(Simplicity)** — 불필요한 복잡성 배제
2. **투명성(Transparency)** — 에이전트의 계획 단계를 **명시적으로 표시**
3. **도구 문서화(ACI)** — Agent-Computer Interface를 철저히 설계·테스트

그리고 결정적인 실무 기준: **"측정 가능한 개선이 없으면 복잡성을 추가하지 마라."**

### 1.3 Workflow vs Agent 구분

| | 정의 |
|---|---|
| **Workflow** | LLM과 도구가 **미리 정해진 코드 경로**를 통해 조율되는 시스템 |
| **Agent** | LLM이 **자신의 프로세스와 도구 사용을 동적으로 지시**하며 작업 수행 방식을 제어하는 시스템 |

5가지 워크플로 패턴: **Prompt Chaining · Routing · Parallelization · Orchestrator-Workers · Evaluator-Optimizer**

> **tene 설계 함의**: tene의 PDCA/QA 루프는 "Evaluator-Optimizer" 와 "Orchestrator-Workers" 의 결합이다. 그리고 Claude Code의 Dynamic Workflow는 이 패턴들을 **자바스크립트 코드로 명시화**하는 공식 수단이다 — 즉 Anthropic 스스로 "정해진 경로가 나은 곳에서는 코드를 쓰라"고 답한 셈이다.

---

## 2. 에이전틱 루프 아키텍처

### 2.1 3단계 루프

```
      ┌──────────────────────────────────────────────────┐
      │                                                  │
      ▼                                                  │
 [Gather context] ──▶ [Take action] ──▶ [Verify results] ┘
      ▲                                                  
      └────────── 사용자가 언제든 개입/조향 가능 ─────────────
```

이 세 단계는 섞여서 진행된다. 질문은 컨텍스트 수집만으로 끝날 수도 있고, 버그 수정은 세 단계를 반복 순환하며, 리팩터링은 검증에 큰 비중을 둔다. Claude가 **이전 단계에서 배운 것을 기반으로** 각 단계에 무엇이 필요한지 결정하고, 수십 개의 행동을 연쇄하며 스스로 궤도를 수정한다.

**Claude Code는 스스로를 "agentic harness"로 정의한다**: 언어 모델을 유능한 코딩 에이전트로 바꾸는 도구·컨텍스트 관리·실행 환경을 제공하는 층.

### 2.2 도구 = 에이전시의 다섯 범주

| 범주 | 능력 |
|---|---|
| File operations | 읽기, 편집, 생성, 이름 변경/재구성 |
| Search | 패턴 파일 검색, regex 내용 검색, 코드베이스 탐색 |
| Execution | 셸 명령, 서버 기동, 테스트 실행, git |
| Web | 웹 검색, 문서 가져오기, 에러 메시지 조회 |
| **Code intelligence** | 편집 후 타입 오류/경고 확인, 정의 이동, 참조 찾기 (**코드 인텔리전스 플러그인 필요**) |

> Code intelligence가 플러그인으로 분리되어 있다는 사실이 tene 에게 기회다. 구조적 이해는 기본 제공이 아니라 **확장 지점**이다.

### 2.3 세션 모델

- 각 세션은 **새 컨텍스트 윈도우로 시작**한다. 이전 대화 히스토리는 없다.
- 대화는 `~/.claude/projects/` 아래 JSONL 로 저장 → 되감기/재개/포크 가능
- **Resume**: 같은 세션 ID로 이어붙임. **Fork**: 히스토리 복사 후 새 세션 ID
- 세션 간 지식 전달 수단은 **CLAUDE.md(사람이 씀)** 와 **auto memory(Claude가 씀)** 두 가지뿐

### 2.4 컨텍스트가 찰 때

1. 오래된 **도구 출력부터** 제거
2. 필요하면 대화 요약
3. 요청과 핵심 코드 스니펫은 보존, **초반의 상세 지시는 소실될 수 있음**
4. 단일 파일/도구 출력이 너무 커서 요약 직후 다시 차면 → 몇 번 시도 후 auto-compact 중단 + 에러(스래싱 방지)

→ **"지속되어야 하는 규칙은 대화가 아니라 CLAUDE.md에"** 가 공식 답이다. (그리고 우리는 2번 문서에서 "강제되어야 하는 규칙은 Hook에" 라는 한 단계를 더 얹었다.)

---

## 3. 감독된 자율성(Supervised Autonomy)

### 3.1 권한 모드 스펙트럼

| 모드 | 동작 |
|---|---|
| **Plan** | 소스 편집 없이 탐색하고 계획만 제안 |
| **Manual** | 파일 편집·셸 명령 전에 매번 승인 요청 |
| **Accept edits** | 파일 편집과 `mkdir`/`mv` 등은 자동, 그 외는 질문 |
| **Auto** | **분류기 모델**이 백그라운드에서 대부분의 액션을 검토하고 위험한 것만 차단 (Pro/Max/Team 인터랙티브 세션의 기본) |

Auto 모드는 Anthropic의 "감독된 자율성" 베팅의 구체화다: **사람의 승인을 모델의 판단으로 대체하되, 스코프 확대·미지의 인프라·적대적 콘텐츠 유발 행위는 차단**한다.

### 3.2 안전 장치 두 축

- **Checkpoints**: 편집 전 스냅샷 → `Esc Esc` / `/rewind` 로 되돌리기. **git과 별개이며 Bash 변경은 미추적.** 원격 시스템(DB/API/배포)에 영향을 주는 행위는 체크포인트 불가 → 권한 모드로 통제
- **Permissions**: 조직 정책 → 프로젝트 → 로컬 순으로 스코프

### 3.3 Plan Mode의 위치

*"프로덕션 코드베이스에서 잘못된 변경이 중대한 결과를 낳을 수 있는 상황에서, Plan Mode는 제약이 아니라 자율 운영을 위험이 아닌 신뢰의 대상으로 만드는 기능이다."*

---

## 4. "바이브 코딩"에 대한 Anthropic의 실질적 입장

Anthropic은 "vibe coding"이라는 용어를 공식 문서에서 밀지 않는다. 대신 **에이전틱 코딩**의 성공 조건을 반복해서 못박는다. 문서 전반에서 추출한 입장은 다음 6개다.

### 4.1 "검증할 수단을 줘라" — 가장 강하게 반복되는 메시지

> *"Claude는 일이 다 된 것처럼 보이면 멈춘다. 실행 가능한 검사가 없으면 '다 된 것처럼 보임'이 유일한 신호이고, 그러면 **당신이 검증 루프가 된다** — 모든 실수가 당신이 알아챌 때까지 기다린다."*

검사는 대화에서 읽을 수 있는 신호를 내는 것이면 무엇이든 된다: 테스트 스위트, 빌드 exit code, 린터, 픽스처 대비 출력 diff 스크립트, **디자인 대비 브라우저 스크린샷**.

게이트 강도 4단계: 프롬프트 내 지시 → `/goal` 조건 → **Stop hook(결정론적)** → **검증 서브에이전트/워크플로(제2의 의견)**

그리고: **"성공을 주장하지 말고 증거를 보여라"** (테스트 출력, 실행 명령과 반환값, 결과 스크린샷).

### 4.2 "탐색 → 계획 → 구현 → 커밋"

Plan mode 로 탐색과 실행을 분리한다. 단, **오버헤드가 있다**. 한 문장으로 diff를 설명할 수 있으면 계획을 건너뛰어라. 계획이 가장 유용한 때: 접근법이 불확실할 때, 다중 파일 변경일 때, 익숙하지 않은 코드일 때.

### 4.3 "Claude가 당신을 인터뷰하게 하라" — 스펙 우선의 공식 형태

대형 기능에 대한 공식 권장 프롬프트:

```
I want to build [brief description]. Interview me in detail using the AskUserQuestion tool.
Ask about technical implementation, UI/UX, edge cases, concerns, and tradeoffs.
Don't ask obvious questions, dig into the hard parts I might not have considered.
Keep interviewing until we've covered everything, then write a complete spec to SPEC.md.
```

그리고 스펙 품질 기준:

> *"가장 유용한 스펙은 자기충족적이다: 관련된 파일과 인터페이스를 명명하고, 무엇이 범위 밖인지 밝히며, **기능이 동작함을 증명하는 종단간 검증 단계로 끝난다.** 스펙을 정밀하게 만드는 데 쓴 시간이 구현을 지켜보는 데 쓴 시간보다 더 많이 보상한다."*

스펙 완성 후에는 **새 세션에서 실행**하라 — 깨끗한 컨텍스트가 온전히 구현에 집중된다.

> **이 세 문장이 tene 플러그인의 존재 이유를 그대로 서술한다.** Anthropic이 "이렇게 해야 한다"고 말한 절차를 tene 이 **제품화**하는 것이다.

### 4.4 "적대적 리뷰 단계를 넣어라"

> *"무인 실행이 길어질수록 완료로 간주하기 전의 독립적 검사가 중요해진다. 새로운 서브에이전트 컨텍스트에서 도는 리뷰어는 **변경을 만들어낸 추론이 아니라 diff와 기준만 본다.** 그래서 결과를 자체 기준으로 평가한다."*

동시에 과잉 경고도 명시한다:

> *"갭을 찾으라고 지시받은 리뷰어는 작업이 건전해도 보통 뭔가를 보고한다. 그게 시킨 일이기 때문이다. 모든 발견을 쫓으면 과설계로 이어진다 — 불필요한 추상화 층, 방어적 코드, 발생할 수 없는 케이스의 테스트. **정확성이나 명시된 요구사항에 영향을 주는 갭만 표시**하도록 리뷰어에게 지시하고, 나머지는 선택으로 취급하라."*

### 4.5 "CLAUDE.md 는 코드처럼 다뤄라"

각 줄에 대해 물어라: *"이걸 지우면 Claude가 실수하게 되는가?"* 아니면 삭제. 비대해진 CLAUDE.md 는 **실제 지시를 무시하게 만든다.**

포함 O: 추측 불가한 bash 명령, 기본값과 다른 코드 스타일 규칙, 테스트 지시, 저장소 예절, 프로젝트 고유 아키텍처 결정, 개발환경 특이사항, 비자명한 함정
포함 X: 코드를 읽으면 알 수 있는 것, 표준 언어 관례, 상세 API 문서, 자주 바뀌는 정보, 긴 설명/튜토리얼, 파일별 설명, "깨끗한 코드를 써라" 같은 자명한 것

### 4.6 실패 패턴 5선 (공식)

| 패턴 | 증상 | 처방 |
|---|---|---|
| **주방 싱크 세션** | 무관한 작업이 섞여 컨텍스트 오염 | 작업 사이 `/clear` |
| **반복 교정** | 두 번 이상 교정해도 계속 틀림 | 2회 실패 후 `/clear` + 배운 것을 반영한 더 나은 초기 프롬프트 |
| **과잉 명세 CLAUDE.md** | 규칙이 소음에 묻힘 | 가차 없이 잘라내기, 훅으로 전환 |
| **신뢰-후-검증 갭** | 그럴듯하지만 엣지 케이스 미처리 | 항상 검증 수단 제공. **검증할 수 없으면 배포하지 마라** |
| **무한 탐색** | 스코프 없는 "조사"로 수백 파일 읽음 | 좁게 스코프하거나 서브에이전트로 격리 |

---

## 5. 확장 아키텍처의 층위 구조

Anthropic이 제시하는 확장 수단은 **역할이 뚜렷이 분리되어 있으며 서로 대체재가 아니다.**

```
┌─────────────────────────────────────────────────────────────┐
│  Plugins  — 위의 모든 것을 하나의 설치 단위로 묶어 배포          │
├─────────────────────────────────────────────────────────────┤
│  Hooks    — 결정론적 강제 (반드시 매번 일어나야 하는 것)          │
│  Skills   — 온디맨드 절차/지식 (모델 또는 사용자 호출)           │
│  Subagents— 격리 컨텍스트 워커 (많은 파일을 읽는 조사/검증)       │
│  Workflows— 코드로 표현된 오케스트레이션 (수십~수백 에이전트)     │
│  MCP/LSP  — 외부 도구·구조 지능                                │
├─────────────────────────────────────────────────────────────┤
│  CLAUDE.md / rules / auto memory — 지속 컨텍스트 (권고적)      │
├─────────────────────────────────────────────────────────────┤
│  Agentic loop (gather → act → verify) + Permission modes     │
└─────────────────────────────────────────────────────────────┘
```

**선택 규칙(공식)**:
- 매 세션 필요한 *사실* → CLAUDE.md
- 특정 경로에서만 필요 → `.claude/rules/` + `paths:`
- 다단계 *절차* → Skill
- **예외 없이 매번 실행** → Hook
- 많은 파일을 읽는 작업 → Subagent
- 규모 + 반복 가능한 품질 패턴 → Workflow

---

## 6. 규모 확대 방향 — Anthropic이 실제로 밀고 있는 것

### 6.1 병렬화의 4가지 형태

| 방식 | 조율 주체 | 적합 |
|---|---|---|
| Worktrees | 사람 | 완전 수동 병렬 세션 |
| Desktop / Web 세션 | 사람 | 시각적 다중 세션 관리 |
| **Agent Teams** | lead 에이전트 | 토론·상호 검증이 필요한 작업 |
| **Dynamic Workflows** | 스크립트 | 대규모 팬아웃 + 반복 가능한 품질 패턴 |

### 6.2 Writer/Reviewer 패턴

새 컨텍스트는 코드 리뷰를 개선한다 — **Claude가 방금 자기가 쓴 코드에 편향되지 않기 때문**이다. 세션 A가 구현하고 세션 B가 리뷰하고, B의 출력을 A에 되먹인다. 테스트에도 동일 적용: 한 Claude가 테스트를 쓰고 다른 Claude가 통과시키는 코드를 쓴다.

### 6.3 파일 팬아웃 (대규모 마이그레이션)

```bash
for file in $(cat files.txt); do
  claude -p "Migrate $file from React to Vue. Return OK or FAIL." \
    --allowedTools "Edit,Bash(git commit *)"
done
```
2~3개 파일로 프롬프트를 다듬은 뒤 전체 실행. `--allowedTools` 로 무인 실행 시 권한 제한.

### 6.4 비인터랙티브 통합

`claude -p` + `--output-format json|stream-json` 으로 CI, pre-commit hook, 데이터 파이프라인에 통합.

---

## 7. 컨텍스트/도구 효율의 최신 방향: Code Execution with MCP

Anthropic 2026 엔지니어링 3부작(**Context → Tools → Code Execution**)의 마지막 축.

**패턴**: MCP 서버를 도구 정의 덩어리로 컨텍스트에 밀어넣는 대신 **코드 API 로 노출**하고, 에이전트가 TypeScript/JavaScript 코드를 작성해 호출한다.

```
servers/
├── google-drive/getDocument.ts
├── salesforce/updateRecord.ts
```

**효과**:
- **Progressive disclosure**: 필요한 정의만 온디맨드 로드. 한 사례에서 **150,000 → 2,000 토큰 (98.7% 절감)**
- **실행 환경 내 필터링**: 10,000행 스프레드시트를 로컬에서 걸러 결과만 반환
- **강력한 제어 흐름**: 루프/조건/에러 처리를 익숙한 코드 패턴으로
- **프라이버시**: 중간 결과가 기본적으로 실행 환경에 머문다. 민감 데이터가 모델 컨텍스트에 들어가지 않고 시스템 간 흐를 수 있다
- **상태 지속 + Skills**: 워크스페이스 파일 유지, 재사용 가능한 코드 구현 저장 → **"상위 능력의 도구상자" 구축**

**트레이드오프**: 에이전트 생성 코드 실행에는 샌드박싱·자원 제한·모니터링이 필요하다.

> Claude Code의 **Dynamic Workflow가 정확히 이 철학의 사내 구현체**다. 중간 결과가 스크립트 변수에 머물고, 최종 답만 컨텍스트에 들어온다.

---

## 8. 규모의 증거 — 왜 이 방향인가

- Anthropic 내부 132명 엔지니어/연구자 설문: **Claude Code 보조 작업의 약 27%가 이 도구 없이는 시도조차 하지 않았을 일**이었다. 즉 아키텍처가 기존 작업을 가속한 것이 아니라 **질적으로 새로운 워크플로를 가능하게 했다**.
- 2026년 Anthropic은 새 프로덕션 코드의 80% 이상이 Claude가 작성한 것이라고 밝혔고, 동시에 재귀적 자기 개선의 위험과 "브레이크"의 필요성을 공개적으로 제기했다.

→ **자율성의 확대와 통제 수단의 확대가 같은 속도로 가야 한다는 것이 Anthropic의 공식 입장이다.** Auto 모드의 분류기, `/goal` 의 독립 평가자, 워크플로의 적대적 검증은 모두 이 균형의 산물이다.

---

## 9. tene 플러그인에 대한 방향성 정렬 체크리스트

| Anthropic 원칙 | tene 의 정렬 방식 | 위반 시 위험 |
|---|---|---|
| 단순함을 먼저 | 스킬/훅으로 시작, 워크플로는 규모가 필요할 때만 | 과도한 오케스트레이션으로 디버그 불가 |
| 측정 가능한 개선 없으면 복잡성 금지 | 각 기능에 "이것이 없을 때 대비 무엇이 나아지나" 를 명시 | 기능 비대 |
| 검증 수단을 제공 | 스펙의 수용 기준 → 실행 가능한 검사로 자동 변환 | 바이브 코딩의 근본 실패 재현 |
| 증거를 보여라 | QA 결과를 "측정한 것"으로 기록, 미측정은 미측정이라고 표기 | 허위 통과 |
| 컨텍스트는 유한 자원 | 스펙 인덱스 + JIT 로드, 그래프 질의로 grep 루프 제거 | Context Rot |
| 강제는 훅으로 | 스펙 없는 구현 차단, QA 미달 시 태스크 완료 차단 | 규칙이 무시됨 |
| 새 컨텍스트로 검증 | 검증 서브에이전트 / 적대적 워크플로 | 자기 작업 편향 |
| 과잉 발견 억제 | "정확성/명시 요구사항에 영향을 주는 갭만" 을 리뷰어 프롬프트에 명시 | 과설계 |
| 사람이 루프에 남음 | AskUserQuestion 기반 의도 인터뷰, 불확실성은 사용자에게 확인 | 의도 왜곡 |

---

## 출처

- [How Claude Code works — Claude Code Docs](https://code.claude.com/docs/en/how-claude-code-works)
- [Best practices for Claude Code — Claude Code Docs](https://code.claude.com/docs/en/best-practices)
- [Building effective agents — Anthropic Engineering](https://www.anthropic.com/engineering/building-effective-agents)
- [Effective context engineering for AI agents — Anthropic Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Effective harnesses for long-running agents — Anthropic Engineering](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Code execution with MCP — Anthropic Engineering](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [Permission modes — Claude Code Docs](https://code.claude.com/docs/en/permission-modes)
- [Claude Code Agent Architecture: Single-Threaded Master Loop — ZenML LLMOps Database](https://www.zenml.io/llmops-database/claude-code-agent-architecture-single-threaded-master-loop-for-autonomous-coding)
- [Dive into Claude Code: The Design Space of Today's and Future AI Agent Systems — arXiv:2604.14228](https://arxiv.org/html/2604.14228v1)
- [Claude Code Auto Mode: Anthropic's Bet on Supervised Autonomy — LuminaByte](https://luminabyte.de/en/blog/claude-code-auto-mode)
- [When AI builds itself — Anthropic](https://www.anthropic.com/institute/recursive-self-improvement)
- [Anthropic says 80% of its new production code is now authored by Claude — VentureBeat](https://venturebeat.com/technology/anthropic-says-80-of-its-new-production-code-is-now-authored-by-claude-how-your-enterprise-can-keep-up)
