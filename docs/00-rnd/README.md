# 00-rnd — tene 플러그인 시장·기술 조사

> 조사일: 2026-08-20 · 대상: Claude Code CLI v2.1.x
> 목표 제품: **Context Engineering + 하네스 엔지니어링 + Dynamic Workflow 를 활용해 spec(문서) driven 바이브 코딩을 가능하게 하고, 바이브 코딩의 최대 약점인 QA를 강화하는 Claude Code 플러그인**

---

## 문서 목록

| # | 문서 | 다루는 것 |
|---|---|---|
| 01 | [플러그인 개발 및 마켓플레이스](./01-plugin-development-and-marketplace.md) | plugin.json / marketplace.json 전체 스키마, 개발·테스트·검증 루프, 배포 경로, GitHub 이슈 기반 실전 함정 11건, tene 배포 전략 |
| 02 | [Claude Code 아키텍처 기술 연구](./02-claude-code-architecture-research.md) | Context Engineering · 하네스 엔지니어링 · Task Management · Dynamic Workflow · 그래프 엔지니어링의 구조와 상호관계 |
| 03 | [Anthropic 에이전틱 코딩 방향](./03-anthropic-agentic-coding-direction.md) | 설계 철학(단순함·감독된 자율성), 에이전틱 루프, 검증 우선 원칙, 확장 아키텍처 층위, 규모 확대 방향 |
| 04 | [의도 기반 종합 QA 연구](./04-intent-driven-qa-research.md) | 왜 현재 AI QA가 종합 테스트를 못 하는가, 경쟁 제품·방법론·학술 연구, **Intent Ledger 아키텍처 제안**, 구현 로드맵 |

---

## 종합 결론 — tene 이 서야 할 자리

### 1. 문제의 본질은 "테스트 생성"이 아니라 "판정 기준(oracle)"이다

바이브 코딩이 QA에서 무너지는 이유는 AI가 테스트를 못 짜서가 아니다. **무엇이 옳은지를 코드 밖에서 아는 사람이 없기 때문**이다. 유닛/E2E 테스트의 판정 기준은 전부 코드에서 유도된 것이라, "코드가 기획과 다르게 구현된 경우"를 원리적으로 잡을 수 없다.

→ tene 의 제1 명제: **의도를 판정 가능한 형태로 외부화하고, 코드 변경에 맞춰 살아있게 유지한다.**

### 2. Anthropic이 이미 답의 절반을 문서로 써 두었다

공식 베스트 프랙티스는 다음을 명시한다:
- *"Claude가 인터뷰하게 하고 SPEC.md 를 쓰게 하라"*
- *"가장 유용한 스펙은 종단간 검증 단계로 끝난다"*
- *"검증 수단을 줘라. 없으면 당신이 검증 루프가 된다"*
- *"성공을 주장하지 말고 증거를 보여라"*
- *"CLAUDE.md는 권고, Hook은 강제"*

**tene 은 새로운 방법론을 발명할 필요가 없다. Anthropic이 "이렇게 하라"고 쓴 절차를 제품화하면 된다.**

### 3. 다섯 가지 기술 축이 정확히 이 목적에 맞물린다

| 축 | tene 에서의 역할 |
|---|---|
| **Context Engineering** | 의도 원장을 JIT 로드. 전량 주입 금지, 인덱스 + 경로 스코프 |
| **하네스 엔지니어링** | Hook으로 규칙 강제, `/goal`로 종료 조건 외부화, 증거 없이는 완료 불가 |
| **Task Management** | 수용 기준 = 태스크, `TaskCompleted` 훅이 QA 게이트 |
| **Dynamic Workflow** | 기준별 팬아웃 + 수집/판정 분리 + 적대적 검증. 중간 결과가 컨텍스트를 오염시키지 않음 |
| **그래프 엔지니어링** | tene studio MCP로 화면·데이터·상태 흐름을 결정론적으로 획득 |

### 4. 시장 공백이 명확하다

```
                의도 캡처   의도 보관   의도 갱신   코드 구조 연결   QA 실행
AI QA 도구         ✗          ✗          ✗            ✗            ●
SDD 프레임워크      ●          ●          △            ✗            ✗
요구사항 관리       ●          ●          ●            ✗            ✗
코드 그래프 도구    ✗          ✗          ✗            ●            ✗
─────────────────────────────────────────────────────────────────────
tene (목표)        ●          ●          ●            ●            ●
```

**다섯 칸을 다 채운 제품은 없다.** 그리고 tene 은 코드 그래프를 이미 보유한 상태에서 출발한다.

---

## 핵심 아키텍처 요약: Intent Ledger

```
① CAPTURE   AskUserQuestion 인터뷰 → 자연어 의도
      ↓ EARS 정규화
② LEDGER    L1 Intent(왜/무엇) · L2 Flow(화면·데이터 전이) · L3 Contract(EARS 기준) · L4 Evidence(증거)
      ↓
③ ANCHOR    기준 ↔ 코드 심볼/엔드포인트/화면 (tene MCP 그래프)
      ↓
④ VERIFY    (a) 결정론 테스트  (b) Chrome MCP UX 흐름  (c) 그래프 데이터 흐름
            Agentic Oracle: 증거 수집 → 판정 → 적대적 반박
      ↓
⑤ SYNC      코드 변경 → 영향 기준 stale → 재검증 / 의도 갱신 인터뷰
```

**L2(Flow)를 명시적 계층으로 둔 것이 차별점이다.** 대부분의 SDD 도구는 L1+L3만 갖는다. 화면 전이와 데이터 흐름을 계층으로 세우고 코드 그래프에서 도출하는 것이 "종합 테스트"를 가능하게 하는 열쇠다.

### 신뢰성의 근간: 정직 규약

- **`not_measured` 를 1급 판정으로 둔다.** 미측정을 0%나 통과로 뭉개지 않는다
- **`provenance` / `resolution` 등급을 그대로 읽어 보고한다.** AI가 추론한 앵커는 augmented로 표시
- **수집과 판정을 분리한다.** 작업한 모델이 자기 작업을 채점하지 않는다

---

## 즉시 실행 가능한 다음 단계

| 순서 | 작업 | 근거 문서 |
|---|---|---|
| 1 | 저장소 레이아웃 확정 (마켓플레이스 겸 플러그인 모노레포) | 01 §7.2 |
| 2 | `plugin.json` + `marketplace.json` 작성, `claude plugin validate --strict` CI 구성 | 01 §2, §7.3 |
| 3 | `/tene:intent` 인터뷰 스킬 + 의도 문서 템플릿 (M1) | 04 §7.1, §6.1 |
| 4 | tene MCP 앵커링 + `PostToolUse` stale 마킹 훅 (M2) | 04 §7.2, §7.4 |
| 5 | DATA 기준의 그래프 검증 스킬 (M3) | 04 §7.3(c) |
| 6 | Chrome MCP UX 흐름 시나리오 + 전이 커버리지 (M4) | 04 §7.3(b) |
| 7 | `/tene:qa-sweep` 워크플로 (M5) | 04 §7.3 |
| 8 | `TaskCompleted` 게이트 + `/goal` 템플릿 (M6) | 04 §7.4 |

**M1~M2 가 나머지 전부의 전제조건**이다. 원장과 앵커 없이 QA 기능부터 만들면 "그냥 또 하나의 AI 테스터"가 된다.

---

## 배포 시 반드시 지킬 3가지 (사고 예방)

1. **`.claude-plugin/plugin.json` 을 반드시 포함**한다 — 없으면 캐시 시 버전 문자열 이름으로 인라인 로드되어 네임스페이스가 중복·병합된다 (이슈 #76234)
2. **`version` 은 `plugin.json` 에만 두고 릴리즈마다 bump** 한다 — 두 곳에 두면 마켓플레이스 값이 조용히 무시되고, bump를 빼먹으면 기존 사용자가 영원히 구버전을 쓴다
3. **`commands/`, `agents/`, `skills/`, `hooks/` 를 `.claude-plugin/` 안에 넣지 않는다** — 매니페스트만 그 안에 들어간다

---

## 조사 방법 및 한계

- Claude Code 공식 문서(code.claude.com/docs) 11개 페이지 원문 수집
- Anthropic 엔지니어링 블로그 4편 원문 수집 (context engineering / harnesses / building effective agents / code execution with MCP)
- `anthropics/claude-code` GitHub 이슈 25건 조회 (플러그인·마켓플레이스 OPEN 이슈)
- 웹 검색 12건 (경쟁 제품, SDD 프레임워크, 방법론, 학술 연구)
- tene MCP 서버 도구 인벤토리 및 `list_projects` 실측

**한계**:
- 경쟁 제품(Momentic, QA.tech 등)의 내부 아키텍처는 공개 문서/비교 글 기준이며, 벤더 자체 기술 백서는 확인하지 못했다
- 학술 연구는 초록·요약 수준으로 확인했고 전문 정독은 하지 않았다
- Claude Code 문서는 v2.1.234 기준 시점 스냅샷이다. 버전별 동작 차이가 문서에 다수 명시되어 있으므로, 구현 착수 시점에 재확인이 필요하다
