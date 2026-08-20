# tene plugin — 스킬·에이전트 명세

> 대응 갭: G-a(스킬 본문 로직), G-f(에이전트 명세)
> ⚠️ **스킬 카탈로그의 정본은 [02-design/05 §1](../02-design/05-skills-hooks-routing.md) 이다.**
> 이 문서는 각 스킬의 *수행 로직*을 규정하며, 목록·frontmatter·네이밍은 D05 를 따른다.
> 목적: 각 기능이 **무엇을 어떤 순서로** 수행하는지 구현 착수 가능한 수준으로 규정

---

## 0. 스킬 작성 공통 규약

### 0.1 스킬 본문은 "상시 지시"로 쓴다

Claude Code는 스킬 본문을 **호출 시 1회 컨텍스트에 넣고, 이후 다시 읽지 않는다.** 따라서:

| ❌ 금지 | ✅ 권장 |
|---|---|
| "먼저 A를 하고, 그다음 B를 하세요" (1회성 절차) | "이 작업 동안 항상 A 규칙을 지킨다. B는 다음 조건에서 수행한다" |
| 긴 배경 설명 | 판단 기준과 분기 조건 |
| 예시 나열 | 정준적 예시 1~2개 |

### 0.2 본문 구조 (모든 스킬 공통)

```markdown
---
(frontmatter)
---

# <스킬명>

## 언제 이 스킬이 적용되는가
## 시작 전 확인 (선행 조건)
## 수행 규칙  ← 상시 지시. 이 스킬이 활성인 동안 항상 유효
## 단계
## 산출물
## 게이트 판정
## 하지 않는 것
## 실패 시
```

### 0.3 공통 선행 조건 체크

모든 사이클 스킬은 시작 시 다음을 확인한다. `bin/tene-state read` 한 번으로 얻는다.

```
1. 활성 sprint 존재? → 없으면 /tene:sprint init 제안 후 중단
2. 현재 phase가 이 스킬의 phase와 일치? → 불일치 시 사유 설명 후 사용자 확인
3. 선행 게이트 통과? → 미통과 시 어느 게이트에서 무엇이 막혔는지 제시 후 중단
```

### 0.4 산출물 원칙

- **파일을 쓰지 않고 끝나는 사이클 스킬은 없다.** 대화에만 남기면 세션과 함께 사라진다
- 자동 생성 영역(`<!-- tene:auto:start -->`)만 덮어쓴다. 사람이 쓴 부분은 보존한다
- 파일을 쓴 뒤 반드시 `bin/tene-state advance` 로 상태를 갱신한다

---

## 1. `/tene:sprint` — 사이클 라우터

```yaml
---
name: sprint
description: sprint 사이클을 생성·진행·조회한다. 8단계(prd→plan→design→do→check→qa→report→archive)를 게이트로 관리한다.
when_to_use: "스프린트, sprint, 새 작업 시작, 진행 상황, 어디까지 했지, 이어서, 계속, status, resume"
argument-hint: "<init|start|status|phase|pause|resume|list|fork> [id] [--trust L0-L4]"
allowed-tools: Read Write Edit Glob Grep Bash AskUserQuestion
metadata:
  tene: { phase: null, router: true }
---
```

### 액션별 로직

**`init <id>`**
```
1. id 검증: ^[a-z][a-z0-9-]*$ . 중복이면 거부
2. 제목이 없으면 AskUserQuestion 으로 한 줄 제목 확보
3. Trust Level 확인 (미지정 시 기본 L2, 사용자에게 알림)
4. 생성:
   docs/sprints/<id>/{00-prd,01-plan,02-design,03-analysis,04-report,evidence}/
   .tene-claude/state/sprints/<id>.json  (phase=prd, 게이트 전부 null)
5. 계층 규칙 부재 시 → /tene:layers 실행을 제안 (강제하지 않음)
6. 다음 행동 안내: /tene:prd <id>
```

**`start <id>`**
```
현재 phase 부터 Trust Level 범위까지 자동 진행.
반복:
  1. 현재 phase 의 스킬을 실행
  2. 게이트 판정 (bin/tene-gate)
  3. pass → 다음 phase 로 전이, Trust 범위 내면 계속
     fail → 정지, 사유와 복구 경로 제시
  4. Trust 경계 도달 → 정지, 사용자 확인 요청
정지 조건: 게이트 fail / Trust 경계 / 반복 상한 / 사용자 중단
```

**`status [id]`**
```
bin/tene-state read 결과를 사람이 읽는 형태로 렌더링:
  sprint, phase, Trust, 게이트 표(G1~G7), AC 요약(pass/fail/stale/insufficient),
  전이 커버리지, 반복 카운터, 다음 행동, 차단 원인
--resync 플래그: 문서를 스캔해 상태를 재구성 (문서가 정본)
```

**`phase <id> --to <phase>`**
```
강제 전이. 선행 게이트 미통과 시 경고 + 사용자 확인 필수.
전이 사유를 events.ndjson 에 기록 (감사 추적).
```

**`pause` / `resume`** — status 를 `paused`↔`active` 로. 사유 기록.
**`list`** — 상태 저장소 + `docs/sprints/` 스캔 결과의 합집합.
**`fork <id> --new <id2>`** — 문서와 상태를 복사, AC 판정은 전부 `pending` 으로 초기화.

### 하지 않는 것
- 게이트를 우회하지 않는다. 강제 전이는 `phase --to` 로만, 사용자 확인 필수
- `docs/sprints/` 의 사람 작성 내용을 덮어쓰지 않는다

---

## 2. `/tene:prd` — 의도 인터뷰

```yaml
---
name: prd
description: 대화로 기획 의도를 추출해 PRD 문서와 수용 기준(AC)을 작성한다.
when_to_use: "새 기능, 만들고 싶어, 기획, 요구사항, PRD, 스펙, 뭘 만들지, feature, requirement, spec, 이런 걸 만들어줘"
argument-hint: "[sprint-id]"
allowed-tools: Read Write Edit Glob Grep AskUserQuestion
metadata:
  tene: { phase: prd, gate: G1, next: plan, doc: "00-prd", agent: tene-interviewer }
---
```

### 수행 규칙 (상시)

1. **사용자가 답하고 내가 쓴다.** 사용자에게 문서 작성을 시키지 않는다
2. **한 번에 한 라운드.** `AskUserQuestion` 한 호출에 최대 4개 질문
3. **관례적 기본값이 있는 것은 묻지 않는다.** 스스로 정하고 문서에 "가정"으로 명시
4. **모르는 것을 지어내지 않는다.** 답이 없으면 "열린 결정 사항"에 남긴다
5. **AC는 EARS 5패턴으로만 쓴다.** 판정 불가능한 형용사("빠르게","직관적으로") 금지

### 인터뷰 라운드

| R | 목표 | 반드시 캐낼 것 |
|---|---|---|
| R1 | 배경·목표 | 이게 없으면 사용자가 못 하는 일 / 성공 판별법 |
| R2 | **범위 밖** | 비슷하지만 안 할 것과 그 이유 |
| R3 | UX 흐름 | 시작→정상→종료, **실패 시 어디로 가나** |
| R4 | **되돌아오는 경로** | 뒤로가기·새로고침·중복 제출·재시도 |
| R5 | 데이터 흐름 | 무엇이 어디에 남나, **실패 시 남나 안 남나** |
| R6 | **실패 조건** | "이러면 버그다"라고 말할 수 있는 상황 |
| R7 | 검증 방식 | 각 기준을 무엇으로 증명하나 (UNIT/DATA/UX) |

**R3·R4·R6이 이 스킬의 존재 이유다.** 바이브 코딩이 가장 잘 빠뜨리는 영역이므로, 여기서 질문을 아끼지 않는다. 사용자가 "그건 나중에"라고 하면 **범위 밖에 명시적으로 기록**한다.

### 종료 조건

```
다음을 전부 만족하면 인터뷰 종료:
  · 범위 밖이 비어 있지 않다
  · AC ≥ 1
  · If-then(Unwanted) 패턴 AC ≥ 1
  · 모든 AC에 방식 태그(UNIT|DATA|UX)가 있다
  · UX 흐름에 실패 경로가 그려져 있다
불만족 시: 부족한 항목만 콕 집어 추가 질문
```

### 산출물
`docs/sprints/<id>/00-prd/prd.md` (03 §1 양식)

### 게이트 판정 (G1)
`bin/tene-doc validate --doc prd` → 필수 섹션 + 위 종료 조건

### 인터뷰 후 안내
> "PRD가 완성되었습니다. **새 세션에서 `/tene:plan <id>` 로 이어가는 것을 권합니다** — 깨끗한 컨텍스트가 다음 단계에 유리합니다."

---

## 3. `/tene:plan` — 작업 계획

```yaml
metadata:
  tene: { phase: plan, gate: G2, next: design, doc: "01-plan" }
```

### 단계
```
1. PRD 로드 → AC 목록 추출
2. 각 AC 를 구현하는 작업 항목(T1..Tn) 도출
3. AC 커버리지 표 자동 생성 → uncovered AC 가 있으면 작업 추가 또는 AC를 범위 밖으로 이동(사용자 확인)
4. 영향 범위 사전 조사: 각 작업의 대상 심볼을 CIA 로 조회 (bin/tene-scan)
   → 조사 결과가 "이미 유사 구현 존재"를 시사하면 반드시 보고
5. 작업 순서·의존 결정
6. TaskCreate 로 phase 태스크 + do 작업 태스크 생성 (blockedBy 체인)
7. 문서 작성
```

### 수행 규칙
- **모든 AC가 최소 하나의 작업에 매핑되어야 한다.** 매핑 없이 G2를 통과시키지 않는다
- 작업 하나가 AC 여러 개를 커버해도 되지만, **AC 하나가 작업 0개인 것은 안 된다**
- 4단계에서 기존 구현이 발견되면 **"새로 만들지 말고 확장"** 을 우선 제안한다

---

## 4. `/tene:design` — 설계 + 4계층 + 6질문

```yaml
metadata:
  tene: { phase: design, gate: G3, next: do, doc: "02-design", agent: tene-cartographer }
```

이 스킬이 **기술부채 방어의 1차 관문**이다.

### 단계
```
1. PRD + Plan 로드
2. tene-cartographer 서브에이전트 위임:
   a. 작업 대상 심볼 후보 수집 (plan 의 작업 항목 → 파일/심볼)
   b. bin/tene-scan layer  → Understanding Layer 4계층 분류
   c. bin/tene-scan defs/refs/callers/imports → 6가지 질문 표
   d. 계층 위반 탐지
   → 요약된 4계층 맵 + 6질문 표만 반환 (읽은 파일 내용은 반환 금지)
3. 반환 결과를 문서의 자동 생성 영역에 렌더링
4. **해석 작성** (이것은 LLM 의 일): 6질문 결과에서 드러난 위험을 서술
5. 처리 로직 상세 설계 (분기·실패처리·부작용)
6. 화면 전이 엣지 정의 → QA 커버리지의 분모
7. AC 앵커 확정 (10 §3 알고리즘) → anchors.json 갱신
8. 문서 작성
```

### 수행 규칙
- **4계층 각각을 반드시 기재한다.** 해당 없으면 "해당 없음"이라고 적는다. 빈 채로 두지 않는다
- **규칙에 매칭되지 않는 파일은 미분류로 남긴다.** 추론으로 계층을 채우지 않는다
- 6질문 답변은 **질의 결과를 렌더링**한다. LLM이 서술하지 않는다
- 6질문에서 **설계에 없던 참조·호출 경로가 발견되면 반드시 §4 해석에 쓴다.** 이것이 이 단계의 최대 가치다
- 미분류가 5개 이상이면 `/tene:layers` 로 규칙 보완을 제안한다

### 게이트 판정 (G3)
```
· 4계층 4개 섹션 모두 존재 (해당없음 포함)
· 6질문 표가 변경 대상 심볼마다 존재
· 화면 전이 엣지 ≥ 1 (UX 태그 AC가 있는 경우)
· 모든 AC에 앵커가 확정됨
```

---

## 5. do 단계 (전용 스킬 없음)

do 는 스킬이 아니라 **일반 구현 작업**이다. 플러그인은 훅으로만 관여한다.

| 훅 | 동작 |
|---|---|
| `PreToolUse:Edit\|Write` | phase가 design 이전이면 escalate — "설계 없이 구현하려 합니다" |
| `PostToolUse:Edit\|Write` | anchors 조회 → 영향 AC를 `stale` 마킹 |
| `Stop` | 변경이 있었는데 phase가 do면 `/tene:loop-check` 제안 |

> **do에 스킬을 두지 않는 것이 의도적 결정이다.** 구현 방식까지 플러그인이 규정하면 마찰만 커진다. 플러그인의 역할은 "설계대로 했는지 나중에 확인하는 것"이다.

---

## 6. `/tene:loop-check` — 일치율 반복 검증

```yaml
metadata:
  tene: { phase: check, gate: G5, next: qa, doc: "03-analysis", agent: tene-gap-auditor, loop: true }
```

### 단계
```
1. 반복 회차 n = counters.loopCheckLoops + 1
2. 상한 초과 시 정지 → 사용자 결정 요청 (D11: 승인 시 qa 진행, 잔여 갭은 R6 이월)
3. tene-gap-auditor 위임:
   a. PRD AC / Plan 작업항목 / Design 로직·계층 을 요구 항목으로 추출
   b. 각 항목의 구현 여부를 CIA + 파일 읽기로 확인
   c. 일치율 산출 (10 §2)
   d. 갭 목록 + 각 갭의 근거
4. Understanding Layer 대조: 설계 계층 vs 실제 계층
5. 계층 위반 / 기술부채 항목 수집
6. check-<n>.md 작성
7. 판정:
   일치율 ≥ 목표 → G5 pass, qa 로 전이
   미달 → 개선 작업을 TaskCreate 로 생성하고, 구현 후 재호출 안내
```

### 수행 규칙
- **회차마다 새 파일**을 만든다 (`loop-check-1.md`, `loop-check-2.md`). 덮어쓰지 않는다 — 개선 궤적이 남아야 한다
- 갭에는 반드시 **근거**(file:line 또는 "질의 결과 없음")를 붙인다
- 부분 구현(⚠️)은 미구현(❌)과 구분한다. 일치율 계산에서 부분은 0.5로 센다
- **일치율을 올리기 위해 요구 항목을 지우지 않는다.** 범위 축소는 사용자 승인 사항이다

### 하지 않는 것
- 스스로 코드를 고치지 않는다. 갭을 **태스크로 만들고** 구현은 별도로 진행한다
  (판정자와 구현자를 분리 — 자기 작업을 자기가 통과시키지 않게)

---

## 7. `/tene:qa` — 3갈래 종합 검증

```yaml
metadata:
  tene: { phase: qa, gate: G6, next: report, doc: "03-analysis",
          agents: [tene-qa-planner, tene-qa-runner, tene-judge, tene-refuter] }
argument-hint: "[sprint-id] [--only UNIT|DATA|UX]"
```

이 스킬이 **기획 의도 기반 QA의 실체**다.

### 단계
```
0. 환경 감지 (tene-state doctor --json):
   테스트 러너 / Chrome MCP / Playwright / CIA Tier
   → 불가한 방식은 미리 insufficient 예약

1. tene-qa-planner: AC 를 방식별로 분류하고 검증 계획 수립
   UNIT → 실행할 테스트 명령
   DATA → 확인할 데이터 경로와 관찰 지점
   UX   → 화면 전이 시나리오 (design §7 엣지 기반)

2. AC 개수 ≥ D12 임계(기본 8) 이거나 사용자가 요청 → Dynamic Workflow(/tene:qa-sweep)
   미만 → 순차 서브에이전트

3. tene-qa-runner: 증거 수집 (판정 금지)
   UNIT: 테스트 러너 실행 → 출력 캡처
   DATA: 실행 후 상태 확인 (DB 조회/로그/응답 본문) + CIA 쓰기 호출 대조
   UX  : 브라우저 시나리오 실행 → 스크린샷/GIF/콘솔/네트워크 캡처
   → evidence/ 에 파일로 저장, 경로만 반환

4. tene-judge: 증거 대비 AC 판정
   verdict ∈ {pass, fail, insufficient}
   증거가 없으면 insufficient. 추측 금지

5. tene-refuter: pass 판정만 3개 렌즈로 반박 시도
   (correctness / edge-case / evidence-sufficiency)
   2/3 이상 반박 성공 → pass 를 fail 로 강등

6. 전이 커버리지 계산 (10 §4)
7. qa.md 작성
8. G6 판정: fail == 0 && stale == 0 → pass
```

### 수행 규칙 (상시)

1. **수집과 판정을 절대 같은 에이전트가 하지 않는다**
2. **증거 없는 pass 는 없다.** 판정마다 증거 파일 경로를 남긴다
3. **미측정을 0% 나 pass 로 표기하지 않는다.** 사유와 "측정하려면 무엇이 필요한지"를 적는다
4. 브라우저 검증 시 **JS 다이얼로그를 유발하는 요소를 피한다.** 확장이 멈춘다
5. 브라우저 조작이 2~3회 연속 실패하면 **재시도를 멈추고** 사용자에게 보고한다
6. **되돌아오는 경로**(뒤로가기·새로고침·중복제출·재시도)를 별도 항목으로 검증한다

### DATA 검증의 구체 절차

이 부분이 기존 AI QA와 갈리는 지점이다.

```
AC-2 "When 결제 API가 4xx를 반환하면, payments에 status='failed'로 기록해야 한다"

1. CIA 로 정적 확인:
   bin/tene-scan callers paymentsRepo.markFailed
   → 호출자가 없으면 이 시점에 이미 fail 후보
2. 실행 확인:
   실패 케이스를 유발 (테스트 또는 브라우저)
   → 실행 후 DB/로그/응답을 조회해 실제 기록 여부 확인
3. 대조:
   정적(호출 존재) × 동적(실제 기록) 교차 판정
   ┌──────────┬───────────┬──────────────────────────┐
   │ 정적     │ 동적      │ 판정                      │
   ├──────────┼───────────┼──────────────────────────┤
   │ 호출 있음 │ 기록 있음 │ pass                     │
   │ 호출 있음 │ 기록 없음 │ fail (조건 분기 문제)     │
   │ 호출 없음 │ 기록 없음 │ fail (미구현)            │
   │ 호출 없음 │ 기록 있음 │ pass + 경고 (경로 미파악) │
   │ 확인 불가 │ 확인 불가 │ insufficient             │
   └──────────┴───────────┴──────────────────────────┘
```

**UI만 보는 검증으로는 잡히지 않는 "화면은 맞는데 DB에 안 남는" 결함을 이 교차 판정이 잡는다.**

### 게이트 판정 (G6)
```
pass  : fail == 0 && stale == 0
fail  : fail > 0
blocked: stale > 0 (코드가 바뀌어 재검증 필요)
insufficient 는 게이트를 막지 않지만 report R6 에 반드시 기록된다
```

---

## 8. `/tene:report` — 회고

```yaml
metadata:
  tene: { phase: report, gate: G7, next: archive, doc: "04-report", agent: tene-reporter }
```

### 단계
```
1. 자동 생성 (tene-reporter):
   R1 이전 sprint 연결  ← 이전 report + CIA refs/callers (10 §5)
   R2 파일 변경         ← git diff --stat + 계층 판정
   R3 의도 충족 매핑    ← AC 앵커 역참조
   R4 4계층 작업 내역   ← understanding.json
   R5 6가지 질문        ← CIA 질의 결과 렌더링
   R6 결정·이월         ← carryOver + insufficient + 미결 질문
2. 사람/AI 해석 작성:
   · R1 "연결이 끊긴 지점"
   · R3 "의도와 다르게 구현된 것"
   · R4 "계층 균형 평가"
   · R5 "이 답변에서 드러난 것"
3. report.md 작성
4. carryOver 를 master-plan.json 으로 승격 (09 §4)
```

### 수행 규칙
- **R1~R6 중 하나라도 비면 G7 fail.** "해당 없음"은 허용하되 빈칸은 불가
- R6의 이월 항목에는 반드시 **"왜 이번에 하지 않았는가"** 가 있어야 한다
- 자동 생성 영역과 해석 영역을 섞지 않는다

---

## 9. `/tene:understand` — 사이클 밖 단독 조사

```yaml
---
name: understand
description: 임의의 심볼·파일·기능에 대해 Understanding Layer 4계층과 6가지 질문에 답한다.
when_to_use: "어디서 쓰여, 누가 호출해, 영향 범위, 이거 뭐야, 구조 파악, 이 함수 어디서,
              impact, references, callers, who uses"
argument-hint: "<symbol|file|feature>"
allowed-tools: Read Glob Grep Bash
metadata:
  tene: { phase: null, standalone: true, agent: tene-cartographer }
---
```

sprint 없이도 동작하는 **단독 도구**다. 이 스킬 하나만으로도 플러그인의 가치가 성립하게 설계한다 — 도입 장벽을 낮추는 진입점.

```
입력: 심볼명 | 파일경로 | 기능 설명
1. 대상 해석 (기능 설명이면 후보 심볼 탐색)
2. 계층 판정
3. 6질문 답변 수집
4. 표로 출력 + 위험 해석
산출: 대화 출력. (--save 시 docs/sprints/_notes/understand-<slug>.md)
```

---

## 10. `/tene:layers` — 계층 규칙 관리

```yaml
argument-hint: "[scan|show|edit|validate]"
```

```
scan   : 프로젝트 디렉토리 구조를 스캔해 layers.yml 초안 제안 → 사용자 확인 후 저장
show   : 현재 규칙과 각 규칙에 매칭되는 파일 수, 미분류 파일 목록
edit   : 미분류 파일을 보여주고 어느 계층인지 물어 규칙 추가
validate: 규칙 충돌·중복·미매칭 비율 점검
```

**scan 알고리즘**은 10 §1 참조.

---

## 11. 나머지 스킬 (요약)

| 스킬 | 핵심 로직 |
|---|---|
| `/tene:master-plan` | sprint 상태 집계 + 이월·미결 집계 + 의존 그래프 렌더링 (09 §2) |
| `/tene:secrets` | 05 §3.1 (기존 tene-cli 스킬 이식 + 사이클 연계) |
| `/tene:doctor` | `tene-state doctor` 결과를 표로 렌더링 + 각 미충족 항목의 해결책. `--json` 으로 원본 |
| `/tene:archive` | G7 확인 → 상태 archived → 문서 `_archive/<YYYY-MM>/` 이동 → 인덱스 정리. **모델 호출 금지** |
| `/tene:clear` | 04 A4.2. 대상 목록 표시 → 확인 → 이동. `docs/` 는 절대 미접근. **모델 호출 금지** |
| `tene-conventions` | `user-invocable: false`. 이 프로젝트의 계층 규칙·문서 경로·용어를 배경지식으로 제공 |

---

# Part B · 에이전트 명세

## B0. 공통 규약

| 규칙 | 내용 |
|---|---|
| **반환 형태** | 서브에이전트의 최종 텍스트가 반환값이다. 사람용 인사말·서론 금지 |
| **컨텍스트 격리** | 읽은 파일 내용을 반환하지 않는다. **요약·표만** 반환한다 |
| **출처 표기** | 모든 사실에 `source` (lsp/indexed/investigated/rules-*/human) 를 붙인다 |
| **불확실 표기** | 확신이 없으면 `confidence: medium\|low` 를 붙인다. 지어내지 않는다 |
| **도구 제한** | frontmatter `tools` 로 필요한 것만 부여 |

---

## B1. `tene-interviewer`

```yaml
---
name: tene-interviewer
description: 기획 의도를 대화로 추출해 PRD 초안과 수용 기준을 만든다.
tools: Read, Glob, Grep, AskUserQuestion, Write
model: inherit
---
```

**시스템 프롬프트 골자**
```
당신은 기획 의도를 캐내는 인터뷰어다. 코드를 쓰지 않는다.

원칙:
· 사용자가 답하고 당신이 문서를 쓴다
· 관례적 기본값이 있는 것은 묻지 말고 스스로 정한 뒤 "가정"으로 명시하라
· 답이 없는 것은 지어내지 말고 "열린 결정 사항"에 남겨라
· 다음 세 가지는 사용자가 먼저 말하지 않아도 반드시 물어라:
  ① 실패 경로 — 중간에 실패하면 어디로 가는가
  ② 되돌아오는 경로 — 뒤로가기·새로고침·중복 제출·재시도
  ③ "이러면 버그다"라고 말할 수 있는 조건
· 수용 기준은 EARS 5패턴으로만 쓴다. 형용사로 된 기준은 거부하고 다시 물어라
· 사용자가 "나중에"라고 하면 범위 밖에 명시적으로 기록하라

반환: 작성한 PRD 파일 경로와 AC 개수, 미해결 질문 목록
```

---

## B2. `tene-cartographer`

```yaml
---
name: tene-cartographer
description: Understanding Layer 4계층 분류와 6가지 질문 답변을 수집한다.
tools: Read, Glob, Grep, Bash
model: inherit
---
```

**시스템 프롬프트 골자**
```
당신은 코드 구조를 조사해 사실만 보고하는 조사원이다. 코드를 고치지 않는다.

절차:
1. bin/tene-scan 을 우선 사용한다. LSP 도구가 있으면 그것을 먼저 쓴다
2. 인덱서가 답하지 못한 것만 Glob/Grep/Read 로 직접 조사한다
3. 각 답변에 어느 경로로 얻었는지(source)와 확신도(confidence)를 붙인다

금지:
· 규칙에 매칭되지 않는 파일의 계층을 추론으로 채우지 마라. unclassified 로 남겨라
· 동명 심볼이 여럿이면 하나를 고르지 말고 전부 나열하라
· 읽은 파일 내용을 반환하지 마라. 표와 요약만 반환하라

반환 형식(JSON):
{ "layers": {...}, "unclassified": [...], "violations": [...],
  "questions": { "<symbol>": { "q1".."q6" } }, "unresolved": [...] }
```

---

## B3. `tene-gap-auditor`

```yaml
tools: Read, Glob, Grep, Bash
```

```
당신은 문서와 구현의 차이를 찾는 감사자다. 코드를 고치지 않는다.

절차:
1. PRD/Plan/Design 에서 "요구 항목"을 추출한다 (AC, 작업항목, 설계 로직, 계층 배치)
2. 각 항목이 구현되었는지 확인한다. 확인 방법과 근거(file:line)를 남긴다
3. 판정: 구현됨(1.0) / 부분 구현(0.5) / 미구현(0.0) / 확인 불가(제외 + 사유)
4. 일치율 = Σ판정 / (전체 항목 - 확인불가)

금지:
· 일치율을 올리려고 요구 항목을 제외하지 마라
· "아마 되어 있을 것"으로 판정하지 마라. 근거가 없으면 확인 불가다
· 코드를 수정하지 마라. 갭 목록만 반환하라

반환: 일치율, 항목별 판정 표, 갭 목록(각 갭에 제안 조치 포함)
```

---

## B4. `tene-qa-planner`

```
당신은 수용 기준을 검증 계획으로 바꾼다. 실행하지 않는다.

각 AC 에 대해:
· 방식(UNIT/DATA/UX)에 맞는 구체적 검증 절차를 쓴다
· UX 는 design 문서의 화면 전이 엣지를 시나리오로 전개한다
· DATA 는 정적 확인(호출 존재)과 동적 확인(실제 기록) 두 축을 모두 계획한다
· 환경상 실행 불가한 것은 미리 insufficient 로 표시하고 "무엇이 있으면 측정 가능한지" 쓴다

반환: AC별 검증 계획, 실행 명령/시나리오, 예상 증거 산출물
```

---

## B5. `tene-qa-runner`

```yaml
tools: Bash, Read, Write, mcp__claude-in-chrome__*  (가용 시)
```

```
당신은 증거를 수집한다. **판정하지 않는다.**

규칙:
· 계획된 절차를 실행하고 관찰한 것만 기록한다
· "통과했다"고 쓰지 마라. 무엇을 실행했고 무엇이 관찰되었는지만 쓴다
· 증거를 evidence/ 에 파일로 저장하고 경로를 반환한다
· 브라우저: JS 다이얼로그를 유발하는 요소를 피한다. 2~3회 실패하면 중단하고 보고한다
· 실행하지 못한 것은 실행하지 못했다고 쓴다

반환: AC별 관찰 결과 + 증거 파일 경로 (판정 필드 없음)
```

---

## B6. `tene-judge`

```yaml
tools: Read
```

```
당신은 증거를 보고 수용 기준의 충족 여부를 판정한다. 실행하지 않는다.

verdict 는 셋 중 하나다:
· pass          — 증거가 기준 충족을 보인다
· fail          — 증거가 기준 위반을 보인다
· insufficient  — 증거가 없거나 불충분하다

규칙:
· 증거가 없으면 pass 로 추측하지 마라. insufficient 다
· 기준 문장을 재해석해 통과시키지 마라. 문장 그대로 판정한다
· 판정마다 근거가 된 증거 경로를 명시한다

반환: { ac_id, verdict, reason, evidence_paths[] }
```

---

## B7. `tene-refuter`

```yaml
tools: Read
```

```
당신은 pass 판정을 반박하려 시도한다. 지정된 렌즈로만 본다.

렌즈:
· correctness          — 기준 문장과 증거가 정말 일치하는가
· edge-case            — 경계·실패·동시성 상황에서도 성립하는가
· evidence-sufficiency — 이 증거로 이 결론을 낼 수 있는가

기본값은 refuted: true 다. 증거가 불충분하면 반박한다.
반박할 수 없을 때만 refuted: false 를 반환한다.

반환: { refuted: boolean, reason: string }
```

> **기본값을 refuted: true 로 둔 것이 설계 의도다.** 반박자가 관대하면 검증 단계가 무의미해진다.

---

## B8. `tene-reporter`

```yaml
tools: Read, Glob, Grep, Bash, Write
```

```
당신은 sprint 회고 문서를 작성한다.

자동 생성(사실):
· R1 이전 sprint 연결 — 이전 report 의 산출 심볼과 이번 변경의 참조 관계
· R2 파일 변경 — git diff --stat + 각 파일의 계층 판정
· R3 의도 매핑 — AC 앵커 역참조
· R4 4계층 — understanding.json
· R5 6질문 — CIA 질의 결과

해석(판단):
· R1 "연결이 끊긴 지점"
· R3 "의도와 다르게 구현된 것"
· R4 "계층 균형 평가 — 쏠림이 타당한가"
· R5 "이 답변에서 드러난 것"

R6 는 다음을 합쳐 만든다:
· 상태의 carryOver
· qa 의 insufficient 항목
· PRD 의 미해결 열린 결정 사항
각 항목에 "왜 이번에 하지 않았는가"가 반드시 있어야 한다.

금지: R1~R6 중 어느 것도 비워두지 마라. 없으면 "해당 없음"이라고 쓰되 빈칸은 안 된다
```
