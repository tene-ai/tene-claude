# Changelog

## [0.1.0] — 미배포

첫 동작 버전. 사이클 전 구간(prd → archive)이 게이트와 함께 돈다.

### 사이클

- phase 상태 기계 8단계 + 게이트 G0~G7 (결정론, 자연어로 뒤집을 수 없음)
- 스킬 16종, 에이전트 8종, 워크플로 3종
- 문서 템플릿 7종 × 한국어·영어 — 언어 무관 섹션 앵커
- 자연어 키워드 라우팅 (제안만, 차단하지 않음, 세션당 1회)

### 검증

- **loop-check** — 6출처 요구 추출, 4단계 판정(전부 근거 요구), 미귀속 변경 검사, 수렴 감지
- **QA 7-Layer** — charter 컴파일, capability 감지, 증거 매니페스트(sha256 + freshness), 전이 커버리지
- 수집·판정·반박 분리 — `tene-judge` / `tene-refuter` 에 Bash 없음
- `insufficient` 를 `passed` 로 뭉개지 않음. 게이트를 막지 않되 보고서 R6 에 남음

### 코드 인텔리전스

- 3단 폴백 (LSP → 자체 인덱서 → 에이전트 조사), 어느 단이 답했는지 항상 표기
- 언어 팩 4종: TypeScript/JavaScript · Python · Go · Java
- 증분 인덱스 (50% 초과 변경 시 전체 재빌드)
- Understanding Layer 4계층 — 규칙에 없는 파일은 `unclassified` 로 남기고 규칙 제안
- 6가지 질문 조립 + "드러난 것" 추출 (orphan, 정의 모호, 계층 위반)

### 보고서

- R1~R6 — 이전 sprint 연결(orphan 검출) / 변경 / 의도 매핑 / 4계층 / 6질문 / 이월
- 표는 기계가, 서술은 에이전트가
- 사유 없는 이월은 G7 이 막음
- archive 시 미결이 master plan 으로 승격 (중복 승격 방지)

### 시크릿 경계

- `tene-guard` — 유일한 fail-closed. 검사하지 못하면 차단
- SR1~SR4: `tene get` 금지 / 비암호화 export 금지 / `.tene/` 읽기 금지 / 값 인자 전달 금지
- 체인·환경변수 프리픽스·래퍼·절대 경로·`bash -c`·명령 치환·heredoc 을 전부 펼쳐 검사
- `--dangerously-skip-permissions` 에서도 deny 유지
- 가드 매트릭스 156케이스(26위반 × 6모드) — false-negative 0, false-positive 0

### 상태

- 원자적 쓰기 + advisory lock + `rev` 낙관적 잠금
- 손상 파일은 격리하고 삭제하지 않음
- **문서가 정본** — 상태를 통째로 지워도 `--resync` 로 복구
- SessionStart ≤600 토큰 주입, 예산 초과 시 차단 사유가 남고 경로가 먼저 잘림

### 제약

- 외부 패키지 의존 **0** (CI 강제). Node.js 20+ 내장 모듈만
- tene studio / MCP / bkit 에 의존하지 않음. tene CLI 는 선택

### 알려진 한계

- 증거 자동 수집기 없음 — 에이전트가 관찰을 기록한다
- 결함 주입(L6) 미지원 — capability 가 `null` 로 보고하고 `insufficient` 가 된다
- Chrome MCP 감지는 스킬 의존 — bin 은 MCP 도구 목록을 볼 수 없다
- Go/Java 의 저장소 내부 import 미해석 — go.mod·소스 루트가 필요하다

### 구현 중 드러난 설계 정정

계획 단계에서 알 수 없었던 것들. 각 항목은 해당 설계서에 표시되어 있다.

| # | 발견 |
|---|---|
| F3 | `claude --version` 실측 2.5초 — 훅에서 호출 불가 |
| F4 | `updatedAt` 초 단위라 같은 초의 충돌을 놓침 → `rev` 카운터 |
| F5 | Node 빈 기동만 227ms — "훅 200ms" 는 로직 시간의 예산 |
| F10 | `git status --porcelain` 이 untracked 디렉토리를 축약 → `-uall` |
| F12 | **게이트가 TDZ 오류로 무력화됐는데 fail-open 이 삼킴** |
| F15 | `tene-doc` 이 상태의 `sprintDir` 을 안 읽어 문서가 두 경로에 생성 |
| F16 | 절대 경로(`/usr/local/bin/tene get`)로 가드 우회 — 매트릭스가 잡음 |
| F17 | 가드가 깨진 stdin 을 빈 객체로 읽어 통과 — fail-closed 위반 |
| F18 | macOS `/var`→`/private/var` 링크로 훅이 프로젝트 밖으로 판정 |
| F28 | 스킬이 `/tene:tene-prd` 로 등록 — 디렉토리 이름이 곧 호출 이름 |
| F29 | 에이전트가 `tene:tene-judge` — 워크플로 `agentType` 과 어긋나 동작 불가였음 |
| F30 | SubagentStop matcher 가 `tene-.*` 라 아무것도 안 잡힘 |

전체 목록은 [docs/01-plan/06-progress.md](docs/01-plan/06-progress.md) 참조.
