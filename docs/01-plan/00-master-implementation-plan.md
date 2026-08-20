# tene plugin — 마스터 구현 계획

> 대응 요구사항: [docs/00-prd](../00-prd/README.md) 전체
> 관계 정립: [00-prd/12](../00-prd/12-relation-to-tene-codex.md) — Claude Code 네이티브 기반, 코어 비공유

---

## 1. 구현 전략

### 1.1 세 가지 기둥

| # | 기둥 | 구현 수단 | 왜 이 수단인가 |
|---|---|---|---|
| **A** | **절차 강제** (spec driven 을 반드시) | Hooks + Task `blockedBy` + 게이트 | CLAUDE.md 는 권고. 훅만이 결정론적 차단을 한다 |
| **B** | **의도 보존과 검증** (QA 를 꼼꼼히) | Skills + Dynamic Workflow + 문서 | 의도는 대화에서 나오고 문서에 남고 워크플로가 검증한다 |
| **C** | **결정론적 사실** (기술부채 방어) | 경량 Node 스크립트 5종 | LLM 이 JSON 을 손편집하면 깨진다. 판정은 결정론이어야 한다 |

### 1.2 구현 순서 원칙

```
쓰기(문서·상태) → 읽기(검증) → 강제(게이트) → 규모(워크플로) → 배포
```

**근거**: 게이트는 검증할 대상이 있어야 만들 수 있고, 검증은 산출물이 있어야 만들 수 있다. 역순으로 만들면 매번 목(mock)을 세워야 한다.

### 1.3 각 마일스톤의 완료 정의

모든 마일스톤은 **"빈 프로젝트에서 실제로 동작함"** 을 완료 조건으로 한다. 코드가 존재하는 것은 완료가 아니다.

---

## 2. 마일스톤 로드맵

```
M0 ─── M1 ─── M2 ─── M3 ─┬─ M4 ─── M5 ─┬─ M6 ─── M7 ─── M8
스캐폴딩  문서   사이클  이해계층 │ 루프   QA게이트 │ 회고   시크릿  배포
                              └── M3 완료 후 M4·M5 병렬 불가(M4→M5 순차)
                                  M7 은 M2 이후 언제든 병렬 가능
```

| M | 이름 | 핵심 산출물 | 완료 조건 (실측 가능) |
|---|---|---|---|
| **M0** | 스캐폴딩 | 저장소 구조, 매니페스트, CI | `claude plugin validate --strict` 통과, `/plugin install` 성공 |
| **M1** | 문서 시스템 | 템플릿 7종, `tene-doc`, `/tene:sprint init` | 빈 프로젝트에서 sprint 폴더 + PRD 스캐폴드 생성 |
| **M2** | 사이클 엔진 | `tene-state`, 상태 스키마, SessionStart 복원, `/tene:status` | 세션 종료 후 새 세션에서 "이어서" 가 동작 |
| **M3** | 이해 계층 | `tene-scan`, 계층 규칙, 6질문, `/tene:understand` | 4계층·6질문 표가 실제 코드베이스에서 자동 생성 |
| **M4** | 루프 검증 | `/tene:loop-check`, 갭 산출, 반복 | 의도적 미구현 AC 를 잡아내고 개선 태스크 생성 |
| **M5** | QA 게이트 | `tene-gate`, `/tene:qa`, 워크플로, Evidence | blocking AC 미충족 시 report 진입 차단 |
| **M6** | 회고·집계 | `/tene:report` R1~R6, `/tene:master-plan` | 회고 문서가 사람 개입 최소로 완성 |
| **M7** | 시크릿 | `tene-guard`, `/tene:secrets` | 검증 시나리오 V1~V12 통과 |
| **M8** | 배포 | 마켓플레이스, Eval, 문서 | 외부 프로젝트에서 설치→전 사이클 완주 |

### 2.1 임계 경로

```
M0 → M1 → M2 → M3 → M4 → M5 → M6 → M8
                  └─ M7 (병렬 가능, M8 전 완료)
```

**M3 이 최대 위험 구간**이다. 자체 인덱서의 정확도가 M4·M5·M6 산출물의 신뢰도를 좌우한다.

### 2.2 Dogfooding 전환 시점

**M2 완료 직후부터 M3 이후 개발은 tene 사이클로 진행한다.**

```
docs/sprints/
├── m3-understanding/     ← M3 개발을 sprint 로
├── m4-loop-check/
├── m5-qa-gate/
├── m6-report/
├── m7-secrets/
└── m8-release/
```

자기 도구로 자기를 만들지 못하면 출시하지 않는다.

---

## 3. 마일스톤 상세

### M0 · 스캐폴딩

**목표**: 설치 가능한 빈 플러그인.

| 작업 | 산출물 |
|---|---|
| 저장소 구조 생성 | `plugins/tene/`, `evals/`, `.github/workflows/` |
| `plugin.json` 작성 | `name`, `version`, `userConfig`, 컴포넌트 경로 |
| `marketplace.json` 작성 | 단일 플러그인 엔트리, 상대 경로 소스 |
| CI 검증 워크플로 | `claude plugin validate --strict` × 2 (플러그인 + 마켓플레이스) |
| 최소 스킬 1개 | `/tene:doctor` (환경 감지만) |
| LICENSE / NOTICE | Apache-2.0 |

**완료 조건**
- [ ] `claude --plugin-dir ./plugins/tene` 로 로드되고 `/tene:doctor` 가 응답
- [ ] `claude plugin validate ./plugins/tene --strict` 경고 0
- [ ] CI 그린

**함정 방어** (00-rnd/01 §6)
- `.claude-plugin/plugin.json` 반드시 존재 (없으면 네임스페이스 병합, 이슈 #76234)
- `version` 은 `plugin.json` 에만
- `commands/`·`agents/`·`skills/`·`hooks/` 는 `.claude-plugin/` **밖**

---

### M1 · 문서 시스템

**목표**: 문서를 만들고 검증할 수 있다.

| 작업 | 산출물 |
|---|---|
| 템플릿 7종 | `templates/{prd,plan,design,loop-check,qa,report,master-plan}.template.md` |
| 섹션 앵커 규약 | `<!-- tene:sec=<id> -->` 전 템플릿 적용 |
| `tene-doc` 스크립트 | `scaffold` / `validate` / `patch` / `extract` |
| 계층 규칙 프리셋 | `templates/layers.default.yml` |
| `/tene:sprint init` | 폴더 생성 + PRD 스캐폴드 |
| `/tene:prd` 스킬 | 인터뷰 → PRD 작성 |

**완료 조건**
- [ ] `/tene:sprint init x` → `docs/sprints/x-<slug>/{00-prd,…,04-report,evidence}/` 생성
- [ ] `/tene:prd x` 인터뷰 후 PRD 가 필수 섹션을 갖고 생성됨
- [ ] `tene-doc validate --doc prd` 가 누락 섹션을 정확히 지적
- [ ] 자유 섹션 `## +@ ...` 이 검증을 통과
- [ ] 한국어/영어 문서 모두 앵커 기반으로 검증됨

---

### M2 · 사이클 엔진

**목표**: 상태가 세션을 넘어 유지되고, phase 가 전이된다.

| 작업 | 산출물 |
|---|---|
| 상태 스키마 확정 | `.tene-claude/state/{current,master-plan,sprints/*}.json` |
| `tene-state` 스크립트 | `read` / `init` / `advance` / `gate` / `ac` / `event` / `size` / `clean` / `resync` |
| 원자적 쓰기 | temp → fsync → rename, `updatedAt` 낙관적 잠금 |
| SessionStart 훅 | 상태 요약 주입 (≤600 토큰) |
| PreCompact/PostCompact 훅 | 스냅샷 flush / 재주입 |
| `/tene:status` 스킬 | 상태 렌더링, `--resync` |
| `/tene:sprint` 라우터 | `start/phase/pause/resume/list/fork` |
| Task 연동 | phase 태스크 생성, `blockedBy` 체인 |
| `/tene:clear` | 정리 (dry-run 기본) |

**완료 조건**
- [ ] sprint 를 만들고 세션 종료 → 새 세션에서 SessionStart 가 현재 phase 를 알림
- [ ] "이어서 해줘" 로 재개
- [ ] 상태 파일 손상 시 `--resync` 로 문서에서 복구
- [ ] `/tene:clear --dry-run` 이 대상만 표시하고 실행하지 않음
- [ ] SessionStart 훅이 200ms 이내

**여기서 Dogfooding 시작.**

---

### M3 · 이해 계층 (최대 위험)

**목표**: 4계층과 6질문이 실제 코드에서 자동으로 채워진다.

| 작업 | 산출물 |
|---|---|
| `tene-scan build` | 파일 스캔 → 심볼/import/참조 인덱스 |
| 언어 팩 4종 | `ts`(ts/tsx/js/jsx), `py`, `go`, `java` |
| 주석·문자열 제거 | 오탐 방지 (언어별) |
| 계층 판정 엔진 | 규칙 매칭 → import 시그널 → unclassified |
| `tene-scan questions` | 6질문 일괄 응답 |
| `tene-scan touched` | 파일 → AC 역인덱스 (O(1)) |
| `/tene:layers` | scan/show/edit/validate |
| `/tene:understand` | 단독 조사 진입점 |
| `/tene:design` | 4계층 + 6질문 자동 생성 |
| `tene-cartographer` 에이전트 | CIA 호출 + 요약 반환 |

**완료 조건**
- [ ] 4개 픽스처에서 `tene-scan build` 성공
- [ ] `/tene:understand <symbol>` 이 6질문 표를 출처 Tier 와 함께 반환
- [ ] flat-app 픽스처에서 **미분류를 미분류로 보고** (억지 배정 0)
- [ ] 계층 판정 정확도 ≥ 90% (ts-express-app 기준, 수동 라벨 대비)
- [ ] `tene-scan touched` 가 200ms 이내

**위험 완화**: 정확도가 목표에 못 미치면 **Tier 3(에이전트 조사) 비중을 높이고 신뢰 등급을 낮춰 표기**한다. 절차는 유지된다.

---

### M4 · 루프 검증

**목표**: 문서 대비 구현 갭을 찾고 반복 개선한다.

| 작업 | 산출물 |
|---|---|
| 요구 항목 추출 | PRD AC + Plan 작업 + Design 로직/계층/엣지/계약 |
| 갭 판정 | implemented / partial / missing / unverifiable |
| 진행률 산출 | 표시용 백분율 (게이트 아님) |
| blocking gap 판정 | G5 게이트 조건 |
| 수렴 감지 | 2회 연속 개선 없으면 정지 |
| 미귀속 변경 검사 | 앵커 없는 변경 파일 보고 |
| `/tene:loop-check` | 회차별 문서 생성 + 개선 태스크 |
| `tene-gap-auditor` 에이전트 | 감사 (코드 수정 금지) |
| `conformance-audit` 워크플로 | 항목 ≥ 15 시 팬아웃 |

**완료 조건**
- [ ] 의도적으로 AC 1개를 미구현한 픽스처에서 그것을 `missing` 으로 검출
- [ ] 전부 구현된 픽스처에서 허위 갭 0건
- [ ] 회차마다 `loop-check-<n>.md` 가 새로 생성 (덮어쓰지 않음)
- [ ] 스펙에 없는 파일 변경이 **미귀속 변경**으로 보고됨
- [ ] 상한(3회) 도달 시 waiver 절차 안내

---

### M5 · QA 게이트

**목표**: 기획 의도 기반 종합 QA 와 결정론적 게이트.

| 작업 | 산출물 |
|---|---|
| Test Charter 생성 | AC → charter (변형 7종) |
| 7-Layer 계획 | 각 레이어에 required/not-applicable/waived |
| 어댑터 감지 | 테스트 러너 / Chrome MCP / Playwright / DB |
| 증거 수집 | `evidence/<run-id>/` + manifest + sha256 |
| 판정 분리 | runner(수집) → judge(판정) → refuter(반박) |
| 전이 커버리지 | 설계 엣지 대비 측정 비율 |
| `tene-gate` | G1~G7 판정 |
| `TaskCompleted` 훅 | 게이트 실패 시 exit 2 |
| `qa-sweep` 워크플로 | AC ≥ 8 시 팬아웃 |
| `/tene:qa` | 전 과정 오케스트레이션 |

**완료 조건**
- [ ] blocking AC 하나가 미충족일 때 `/tene:report` 가 차단됨
- [ ] `TaskCompleted` 훅이 [QA] 태스크 완료를 exit 2 로 반려하고 복구 경로 제시
- [ ] no-lsp-no-test 픽스처에서 전 항목 `insufficient`, 0%/pass 위장 없음
- [ ] 증거 없는 `passed` 판정 0건
- [ ] 전이 커버리지가 qa.md 에 기록

---

### M6 · 회고·집계

**목표**: R1~R6 이 자동 생성되고 미결이 승격된다.

| 작업 | 산출물 |
|---|---|
| R1 이전 sprint 연결 | 이전 report 산출 심볼 ↔ 이번 변경 참조 대조 |
| R2 파일 변경 | git diff + 계층 판정 |
| R3 의도 매핑 | AC 앵커 역참조 |
| R4 4계층 | understanding.json 렌더링 |
| R5 6질문 | 대상 선정 + 상한 20 |
| R6 미결·이월 | carryOver + insufficient + 열린 결정 |
| `/tene:report` | 자동 생성 + 해석 작성 |
| `/tene:master-plan` | 집계 + 이월 승격 + `--next` |
| `/tene:archive` | 아카이브 이동 |

**완료 조건**
- [ ] 완료된 sprint 에서 R1~R6 전부 채워짐
- [ ] R6 의 각 이월 항목에 사유 존재
- [ ] "연결이 끊긴 지점" 이 실제로 검출됨 (고아 심볼 픽스처)
- [ ] master plan 에 carryOver 가 승격되고 다음 sprint PRD 인터뷰에서 제시됨

---

### M7 · 시크릿 (M2 이후 병렬 가능)

| 작업 | 산출물 |
|---|---|
| `tene-guard` | 세그먼트 분해 + 규칙 판정 (fail-closed) |
| PreToolUse:Bash 훅 | `tene get` / 비암호화 `export` 차단 |
| PreToolUse:Read 훅 | `.tene/**` 차단 |
| PostToolUse 훅 | `.env` 감지 경고 |
| `/tene:secrets` | tene CLI 안내 스킬 |
| 가드 매트릭스 테스트 | 명령 40종 × 권한모드 6종 |

**완료 조건**
- [ ] V1~V12 전부 통과 (05 §6)
- [ ] negative control 오탐 0건, positive control 미탐 0건
- [ ] tene CLI 미설치 시 조용히 비활성화

---

### M8 · 배포

| 작업 | 산출물 |
|---|---|
| Eval 러너 + 픽스처 4종 | `evals/` |
| 정직성 테스트 5종 | E-2/4/7/10/12 |
| README (사용자용) | 30초 소개 ~ degrade 안내 |
| CHANGELOG | 릴리즈 노트 |
| 마켓플레이스 공개 | GitHub 저장소 |
| 커뮤니티 제출 | Console 폼 |

**완료 조건**
- [ ] 외부 프로젝트에서 설치 → 전 사이클 완주
- [ ] 정직성 Eval 100% 통과
- [ ] 배포 전 체크리스트 전항 (11 §4.4)

---

## 4. 개발 환경과 규약

### 4.1 기술 스택

| 항목 | 선택 | 근거 |
|---|---|---|
| 스크립트 런타임 | **Node.js 20+** | Claude Code 요구 버전과 정렬. 추가 설치 불필요 |
| 외부 의존 | **0개** | 설치 부담 제거. `package.json` 의 `dependencies` 는 빈 객체 |
| 테스트 | `node:test` | 표준 라이브러리 |
| 스크립트 언어 | ESM JavaScript | 빌드 단계 없음 |
| 문서 | Markdown + YAML frontmatter | git diff 가능 |
| 상태 | JSON / NDJSON | 사람이 읽고 편집 가능 |

**TypeScript 를 쓰지 않는 이유**: 빌드 산출물이 생기면 플러그인 배포 시 소스와 산출물의 동기화 문제가 생긴다. 순수 JS + JSDoc 타입 주석으로 충분하다.

### 4.2 코드 배치

```
plugins/tene/
├── bin/                  실행 진입점 (shebang + 인자 파싱만)
│   ├── tene-state
│   ├── tene-doc
│   ├── tene-scan
│   ├── tene-gate
│   └── tene-guard
├── lib/                  실제 로직 (테스트 대상)
│   ├── state/            상태 CRUD, 이벤트, 잠금
│   ├── doc/              템플릿, 앵커 파서, 검증
│   ├── scan/             인덱서, 언어 팩, 계층 판정
│   ├── gate/             게이트 규칙
│   ├── guard/            시크릿 규칙
│   ├── router/           트리거 규칙
│   └── util/             fs 원자성, 로깅, 오류
├── skills/
├── agents/
├── workflows/
├── hooks/
├── templates/
└── test/
```

**`bin/` 은 얇게 유지한다.** 로직은 전부 `lib/` 에 두어 단위 테스트가 가능하게 한다.

### 4.3 코딩 규약

| 규칙 | 내용 |
|---|---|
| 모든 `bin/` 출력 | JSON 한 줄 (stdout), 진단은 stderr |
| 오류 처리 | 예외를 삼키지 않는다. 오류 코드 + remediation 을 반환 |
| fail 방향 | `tene-guard` 만 fail-closed. 나머지는 fail-open (exit 0) |
| 시간 | 항상 UTC ISO 8601 |
| 경로 | 항상 프로젝트 루트 상대 경로로 저장 |
| 파일 쓰기 | `lib/util/atomic.js` 경유. 직접 `writeFileSync` 금지 |
| 로그 | 상태 변경은 `events.ndjson` 에 append |

---

## 5. 일정 추정

작업량 기준(사람+AI 협업). 절대 시간이 아니라 **상대 규모**로 읽는다.

| M | 규모 | 주 위험 |
|---|---|---|
| M0 | S | 매니페스트 스키마 오류 |
| M1 | M | 템플릿 설계 재작업 |
| M2 | L | 상태 스키마 변경 파급 |
| M3 | **XL** | 인덱서 정확도 |
| M4 | M | 갭 판정 오탐 |
| M5 | **L** | 어댑터 환경 편차 |
| M6 | M | R1 연결 추론 정확도 |
| M7 | S | (규칙이 명확) |
| M8 | M | Eval 비용 |

**M3 이 전체의 30% 이상을 차지한다.** 여기서 막히면 Tier 3 비중을 높여 우회한다.

---

## 6. 중단·축소 판단 기준

각 마일스톤에서 다음 신호가 나오면 범위를 줄인다.

| 신호 | 축소 방안 |
|---|---|
| M3 계층 정확도 < 70% | 계층 자동 판정 포기, `/tene:layers edit` 수동 확정만 제공 |
| M3 인덱서가 특정 언어에서 실패 | 그 언어는 Tier 3 전용으로 선언 |
| M5 어댑터 감지가 불안정 | 사용자가 `userConfig` 로 명시 지정 |
| M6 R1 연결 추론 오탐 다수 | R1 을 "후보 제시 + 사람 확인" 으로 격하 |
| Eval 비용 과다 | 정직성 5종만 CI, 나머지는 릴리즈 전 수동 |

**축소해도 지켜야 하는 것**: 4계층·6질문 절차, blocking AC 게이트, `insufficient` 정직 표기, 시크릿 경계. 이 넷이 제품 정체성이다.
