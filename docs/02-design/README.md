# 02-design — tene plugin 상세 설계

> 선행: [docs/00-prd](../00-prd/README.md) (요구사항) · [docs/01-plan](../01-plan/README.md) (구현 계획)
> 목적: **구현 착수 가능한 수준**의 처리 로직·스키마·계약 확정

---

## 문서

| # | 문서 | 다루는 것 |
|---|---|---|
| **D00** | [시스템 아키텍처](./00-system-architecture.md) | 4계층 구조, 계층 간 규칙, 데이터 흐름, 모듈 구조, 순수성 경계, 성능 예산 |
| **D01** | [패키징과 매니페스트](./01-packaging-and-manifest.md) | 저장소 레이아웃, `plugin.json`/`marketplace.json`, userConfig, CI, 배포 함정 방어 |
| **D02** | [워크플로 상태 기계](./02-workflow-state-machine.md) | Phase 전이표, **게이트 G0~G7 규칙**, Profile, Waiver, Task 매핑, Master Plan |
| **D03** | [상태 스키마](./03-state-schema.md) | 디렉토리 레이아웃, `current.json`/`sprints/*.json`, 원자성·잠금, 크기 관리, **resync** |
| **D04** | [문서 계약](./04-document-contracts.md) | **섹션 앵커 규약**, 파서, 검증 16규칙, 템플릿, patch, extract |
| **D05** | [스킬·훅·라우팅](./05-skills-hooks-routing.md) | 스킬 15종, frontmatter 표준, **훅 배치도**, 자연어 라우터, 컨텍스트 예산 |
| **D06** | [코드 인텔리전스](./06-code-intelligence.md) | **3-Tier 어댑터**, 언어 팩 4종, 계층 판정, 6질문 조립, AC 앵커링 |
| **D07** | [Loop Check](./07-loop-check.md) | 요구 항목 추출, 갭 판정, **미귀속 변경**, 수렴 감지, 반복 루프 |
| **D08** | [QA·증거·게이트](./08-qa-evidence-and-gates.md) | Test Charter, **7-Layer**, Evidence Manifest, 판정 분리, 교차 판정, G6 |
| **D09** | [워크플로·에이전트](./09-workflows-and-agents.md) | Dynamic Workflow 3종, 스키마, degrade, 에이전트 8종 명세 |
| **D10** | [Report·집계](./10-report-and-aggregation.md) | **R1~R6 생성 알고리즘**, Master Plan 집계, 이월 승격, 아카이브 |
| **D11** | [시크릿 경계](./11-secret-boundary.md) | tene CLI 분석, **4대 안전 규칙**, fail-closed 가드, 세그먼트 분해, 240 케이스 |
| **D12** | [오류·동시성·마이그레이션](./12-errors-concurrency-migration.md) | 오류 모델, fail-open/closed 경계, 잠금, 손상 복구, 성능 강제 |
| **D13** | [테스트·수용](./13-testing-and-acceptance.md) | 테스트 레이아웃, 진리표, 가드 매트릭스, Eval, Dogfooding, 수용 시나리오 |

---

## 아키텍처 한 장

```
┌───────────────────────────────────────────────────────────────────┐
│ L4 SURFACE      Skills(/tene:*) · Agents · 자연어 라우터            │  D05, D09
│                 자연어 판단이 여기서만 일어난다                       │
├───────────────────────────────────────────────────────────────────┤
│ L3 ENFORCEMENT  Hooks · Task blockedBy · Gate                     │  D02, D05
│                 모델이 우회할 수 없는 유일한 층                       │
├───────────────────────────────────────────────────────────────────┤
│ L2 CORE         tene-state · tene-doc · tene-scan                 │  D03, D04,
│                 tene-gate · tene-guard                            │  D06, D11
│                 순수 함수 + 원자적 I/O                              │
├───────────────────────────────────────────────────────────────────┤
│ L1 STORAGE      docs/sprints/ (정본) · .tene-claude/ (파생)         │  D03
├───────────────────────────────────────────────────────────────────┤
│ L0 EVIDENCE     LSP · Test Runner · Chrome/Playwright · git · tene │  D06, D08, D11
│                 전부 선택적. 부재는 실패가 아니라 insufficient        │
└───────────────────────────────────────────────────────────────────┘
```

**핵심 설계**: LLM 은 비결정적인데 게이트 판정은 결정적이어야 한다. 그래서 **판단(L4)과 판정(L2/L3)을 물리적으로 분리**했다. L4 가 "충족된 것 같다"고 말해도 L3 훅이 L2 게이트를 호출해 상태 파일을 읽고 독립적으로 판정한다.

---

## 강제 지점 3곳

이 셋이 "spec driven 을 반드시" 만드는 실체다.

| 훅 | 시점 | 동작 | 문서 |
|---|---|---|---|
| `PreToolUse:Bash\|Read` | 도구 실행 전 | **시크릿 차단 (fail-closed)** | D11 §3 |
| `PostToolUse:Edit\|Write` | 편집 직후 | 영향 AC 를 `stale` 마킹 | D06 §5.4 |
| **`TaskCompleted`** | 완료 선언 시 | **게이트 미통과면 exit 2** | D02 §5.3 |

`TaskCompleted` 가 가장 중요하다. 모델이 "완료했습니다"라고 선언해도 **상태 파일이 반증한다.**

---

## 핵심 결정 5가지

| # | 결정 | 문서 |
|---|---|---|
| 1 | **"100%" = blocking AC 이진 판정** (백분율 아님) | D07 §1, D08 §9.2 |
| 2 | **수집자와 판정자 분리** (judge 에 Bash 도구 미부여) | D08 §6, D09 §7.2 |
| 3 | **미분류를 채우지 않는다** (계층 판정) | D06 §3.4 |
| 4 | **미귀속 변경 검사** (스펙 밖 변경 유입 차단) | D07 §5 |
| 5 | **`tene-guard` 만 fail-closed** | D12 §2 |

---

## 요구사항 → 설계 매핑

| 사용자 요구 | 설계 |
|---|---|
| prd→plan→design→do→loop check→qa→report 사이클 | D02 §1 전이표, §2 게이트 |
| **100% 달성까지 반복 개선** | D07 전체 (갭 판정·수렴 감지·상한) |
| unit/e2e/chrome/playwright 종합 테스트 | D08 §3 7-Layer, §7 UX, §8 데이터 흐름 |
| sprint 모음 + workflow + task management | D02 §5~6, D09, D10 §8 |
| report 6항목 (R1~R6) | D10 §1~6 (생성 알고리즘) |
| Understanding Layer 4계층 | D06 §3 (규칙 기반 판정) |
| 6가지 질문 | D06 §4 (질의 조립) |
| **기술부채·스파게티 방어** | D06 §3.4·§4.4, D07 §5, D10 §4·§5 |
| 문서 양식 통일 + `+@` 자유 | D04 §1~4 (앵커·템플릿·검증) |
| qa 문서가 게이트 판정 | D08 §9, D02 §2 |
| 상태를 파일/메모리로, clear 처리 | D03 §4~5, §9, §12 |
| 폴더 구조 00-prd~04-report | D03 §1 |
| 직접 호출 + 자연어 트리거 | D05 §1~2, §5 |
| tene CLI 시크릿 관리 | D11 전체 |

---

## 구현 착수 순서

```
1. D00 §3 모듈 구조대로 디렉토리 생성
2. D01 §2~3 매니페스트 작성 → claude plugin validate
3. D12 §1 오류 모델 + D00 §4 순수성 경계 확립 (lib/util)
4. D03 §8 원자적 저장소  ← 병목
5. D04 §1~2 앵커 규약 + 파서
6. D06 §2 인덱서        ← 병목
7. 이후 01-plan/01 WBS 의존 그래프
```

**두 병목**: 상태 저장소(D03 §8), 인덱스 빌더(D06 §2). 하위 작업 대부분의 선행이다.

---

## 미결정 (구현 중 확정)

| # | 항목 | 확정 시점 |
|---|---|---|
| D2 | 문서 루트 기본 경로 | M1 |
| D6 | UX 검증 도구 우선순위 | M5 |
| D10 | 문서 언어 처리 | M1 |
| D12 | 워크플로 전환 임계 | M5 |
| D15 | 언어 팩 우선순위 | M3 착수 전 |
| D16 | Dogfooding 전환 시점 | M2 완료 시 |

---

## 설계 원칙 (전 문서 관통)

```
1. 모르는 것을 채우지 않는다        미분류 / unverifiable / insufficient
2. 분모를 줄여 지표를 올리지 않는다  일치율 / 전이 커버리지
3. 미확인과 실패를 구분한다         unverifiable ≠ missing, insufficient ≠ failed
4. 판정자와 구현자를 분리한다       loop-check(코드 수정 금지), qa(수집≠판정)
5. 근거 없는 판정을 금지한다        모든 implemented/passed 에 file:line 또는 증거
6. 사람의 편집을 최우선한다         앵커 Stage 3, 자동 블록 밖은 불가침
7. 읽히지 않을 분량을 만들지 않는다  R5 상한 20, MEMORY.md 200줄
8. 부재는 실패가 아니다             도구 없음 → insufficient, 조용한 degrade
```
