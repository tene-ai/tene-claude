# tene plugin — 작업 분해 구조 (WBS)

> 대응: [00-master-implementation-plan.md](./00-master-implementation-plan.md)
> 목적: 마일스톤을 **착수 가능한 작업 단위**로 쪼개고 의존을 명시한다

---

## 표기

| 열 | 의미 |
|---|---|
| ID | `W-<M><번호>` |
| 산출물 | 이 작업이 만드는 파일 |
| 의존 | 선행 작업 ID |
| 규모 | S(≤반나절) / M(1일) / L(2~3일) / XL(1주+) |
| 검증 | 완료를 확인하는 방법 |

---

## M0 · 스캐폴딩

| ID | 작업 | 산출물 | 의존 | 규모 | 검증 |
|---|---|---|---|---|---|
| W-01 | 저장소 골격 | `plugins/tene/`, `evals/`, `.github/` | — | S | 디렉토리 존재 |
| W-02 | 플러그인 매니페스트 | `.claude-plugin/plugin.json` | W-01 | S | `plugin validate --strict` |
| W-03 | 마켓플레이스 매니페스트 | `.claude-plugin/marketplace.json` | W-01 | S | `plugin validate . --strict` |
| W-04 | 라이선스·NOTICE | `LICENSE`, `NOTICE` | W-01 | S | Apache-2.0 전문 |
| W-05 | `lib/util` 기반 | `atomic.js`, `errors.js`, `json.js`, `log.js` | W-01 | M | 단위 테스트 |
| W-06 | `/tene:doctor` 스킬 | `skills/tene-doctor/SKILL.md` | W-05 | M | 환경 표 출력 |
| W-08 | `bin/tene-hook` 디스패처 | 훅 단일 진입점 + stdin 리더 | W-05 | M | 11개 이벤트 분기, 타임아웃 |
| W-07 | CI 워크플로 | `.github/workflows/validate.yml` | W-02,W-03 | S | CI 그린 |

---

## M1 · 문서 시스템

| ID | 작업 | 산출물 | 의존 | 규모 | 검증 |
|---|---|---|---|---|---|
| W-11 | 섹션 앵커 규약 확정 | `lib/doc/sections.js` (ID 표) | W-05 | S | 문서 7종 ID 정의 |
| W-12 | 템플릿 7종 (ko) | `templates/*.template.ko.md` | W-11 | L | 앵커 전부 포함 |
| W-13 | 템플릿 7종 (en) | `templates/*.template.en.md` | W-12 | M | 앵커 동일 |
| W-14 | 계층 규칙 프리셋 | `templates/layers.default.yml` | — | S | 4계층 패턴 |
| W-15 | 앵커 파서 | `lib/doc/parser.js` | W-11 | M | 단위 테스트 |
| W-16 | 문서 검증기 | `lib/doc/validate.js` | W-15 | L | 규칙표 전항 테스트 |
| W-17 | 자동 블록 patch | `lib/doc/patch.js` | W-15 | M | 사람 영역 불변 확인 |
| W-18 | 문서 추출기 | `lib/doc/extract.js` (ac/tasks/edges/anchors) | W-15 | M | 표 파싱 테스트 |
| W-19 | `bin/tene-doc` | 진입점 | W-16,W-17,W-18 | S | CLI 계약 준수 |
| W-1A | `/tene:sprint init` | `skills/tene-sprint/SKILL.md` (init 액션) | W-19 | M | 폴더+스캐폴드 생성 |
| W-1B | `/tene:prd` 스킬 | `skills/tene-prd/SKILL.md` | W-1A | L | 인터뷰→PRD |
| W-1C | `tene-interviewer` 에이전트 | `agents/tene-interviewer.md` | W-1B | M | 실패경로 질문 확인 |

---

## M2 · 사이클 엔진

| ID | 작업 | 산출물 | 의존 | 규모 | 검증 |
|---|---|---|---|---|---|
| W-21 | 상태 스키마 확정 | `lib/state/schema.js` + JSON Schema | W-05 | M | 스키마 검증 |
| W-22 | 원자적 저장소 | `lib/state/store.js` (lock, revision) | W-21 | L | 동시성 테스트 |
| W-23 | 이벤트 저널 | `lib/state/events.js` (append) | W-22 | S | append 테스트 |
| W-24 | 상태 요약기 | `lib/state/summary.js` (토큰 예산 절삭) | W-22 | M | ≤600 토큰 |
| W-25 | 크기 관리 | `lib/state/retention.js` (size, clean) | W-22 | M | 상한 초과 시 아카이브 |
| W-26 | resync | `lib/recover/resync.js` (문서→상태) | W-22,W-18 | L | 상태 삭제 후 복구 |
| W-27 | `bin/tene-state` | 진입점 | W-22~W-26 | S | CLI 계약 |
| W-28 | SessionStart 훅 | `hooks/hooks.json` + `lib/hooks/session-start.js` | W-24,W-08 | M | 200ms, 주입 확인 |
| W-29 | PreCompact/PostCompact 훅 | `lib/hooks/compact.js` | W-28 | S | 스냅샷 flush |
| W-2A | `/tene:status` 스킬 | `skills/tene-status/SKILL.md` | W-27 | M | 상태 렌더링 |
| W-2B | `/tene:sprint` 라우터 | start/phase/pause/resume/list/fork | W-27 | L | 액션별 동작 |
| W-2C | Task 연동 | phase 태스크 + blockedBy | W-2B | M | 의존 자동 해제 |
| W-2D | `/tene:clear` 스킬 | `skills/tene-clear/SKILL.md` | W-25 | M | dry-run 기본 |
| W-2E | `/tene:plan` 스킬 | `skills/tene-plan/SKILL.md` | W-18,W-2B | M | AC 커버리지 표 |

---

## M3 · 이해 계층

| ID | 작업 | 산출물 | 의존 | 규모 | 검증 |
|---|---|---|---|---|---|
| W-31 | 파일 워커 | `lib/scan/walk.js` (.gitignore 존중) | W-05 | M | 제외 규칙 테스트 |
| W-32 | 언어 팩 인터페이스 | `lib/scan/langs/index.js` | W-31 | S | 계약 정의 |
| W-33 | ts/js 언어 팩 | `lib/scan/langs/typescript.js` | W-32 | L | 픽스처 정확도 |
| W-34 | python 언어 팩 | `lib/scan/langs/python.js` | W-32 | M | 픽스처 정확도 |
| W-35 | go 언어 팩 | `lib/scan/langs/go.js` | W-32 | M | 픽스처 정확도 |
| W-36 | java 언어 팩 | `lib/scan/langs/java.js` | W-32 | M | 픽스처 정확도 |
| W-37 | 인덱스 빌더 | `lib/scan/index-builder.js` (증분) | W-33 | L | 증분 정확성 |
| W-38 | 질의 API | `lib/scan/query.js` (defs/refs/callers/imports) | W-37 | M | 질의 테스트 |
| W-39 | 계층 판정 | `lib/scan/layer.js` (규칙→import→미분류) | W-14,W-37 | L | 정확도 ≥90% |
| W-3A | 6질문 조립 | `lib/scan/questions.js` | W-38,W-39 | M | 6항목 응답 |
| W-3B | 앵커 역인덱스 | `lib/scan/anchors.js` (touched) | W-37,W-18 | M | O(1), 200ms |
| W-3C | `bin/tene-scan` | 진입점 | W-37~W-3B | S | CLI 계약 |
| W-3D | PostToolUse 훅 | stale 마킹 | W-3B,W-27 | M | 편집→AC stale |
| W-3E | `/tene:layers` 스킬 | scan/show/edit/validate | W-39 | L | 규칙 제안 |
| W-3F | `/tene:understand` 스킬 | 단독 조사 | W-3A | M | 6질문 표 출력 |
| W-3G | `tene-cartographer` 에이전트 | 요약 반환 | W-3A | M | 파일 내용 미반환 |
| W-3H | `/tene:design` 스킬 | 4계층+6질문 자동 생성 | W-3G,W-17 | L | G3 게이트 |

---

## M4 · 루프 검증

| ID | 작업 | 산출물 | 의존 | 규모 | 검증 |
|---|---|---|---|---|---|
| W-41 | 요구 항목 추출 | `lib/loop/requirements.js` | W-18 | M | 6출처 추출 |
| W-42 | 갭 판정 | `lib/loop/judge.js` | W-41,W-38 | L | 4단계 판정 |
| W-43 | 진행률·수렴 | `lib/loop/progress.js` | W-42 | M | 수렴 감지 |
| W-44 | 미귀속 변경 검사 | `lib/loop/unattributed.js` | W-3B | M | 앵커 없는 변경 검출 |
| W-45 | `tene-gap-auditor` 에이전트 | 감사 | W-42 | M | 코드 미수정 확인 |
| W-48 | `bin/tene-loop` | 진입점 (D07 §4.3) | W-42~W-44 | S | CLI 계약 |
| W-46 | `/tene:loop-check` 스킬 | 회차 문서 + 개선 태스크 | W-43,W-45 | L | 반복 동작 |
| W-47 | `conformance-audit` 워크플로 | 팬아웃 감사 | W-46 | M | 항목≥15 전환 |

---

## M5 · QA 게이트

| ID | 작업 | 산출물 | 의존 | 규모 | 검증 |
|---|---|---|---|---|---|
| W-51 | Charter 생성 | `lib/qa/charter.js` | W-18 | L | AC→charter |
| W-52 | 레이어 계획 | `lib/qa/layers.js` (7-Layer) | W-51 | M | required/n-a/waived |
| W-53 | 어댑터 감지 | `lib/qa/capability.js` | W-05 | M | 러너/브라우저 감지 |
| W-54 | 증거 매니페스트 | `lib/qa/evidence.js` (sha256) | W-05 | M | 해시 검증 |
| W-55 | 게이트 규칙 | `lib/gate/rules.js` (G1~G7) | W-16,W-27 | L | 진리표 테스트 |
| W-56 | `bin/tene-gate` | 진입점 | W-55 | S | CLI 계약 |
| W-5G | `bin/tene-qa` | 진입점 (D08 §9.4) | W-51~W-54 | S | CLI 계약 |
| W-57 | TaskCompleted 훅 | exit 2 차단 | W-56 | M | 차단+복구경로 |
| W-58 | Stop 훅 | 조건부 차단 | W-56 | M | loop 미달 시 |
| W-59 | `tene-qa-planner` 에이전트 | 검증 계획 | W-52 | M | 계획 산출 |
| W-5A | `tene-qa-runner` 에이전트 | 증거 수집 | W-53,W-54 | L | 판정 미포함 |
| W-5B | `tene-judge` 에이전트 | 판정 | W-5A | M | insufficient 반환 |
| W-5C | `tene-refuter` 에이전트 | 적대적 반박 | W-5B | S | 기본 refuted |
| W-5D | `qa-sweep` 워크플로 | 팬아웃 | W-5A~W-5C | L | AC≥8 전환 |
| W-5E | 전이 커버리지 | `lib/qa/coverage.js` | W-18 | M | 엣지 비율 |
| W-5F | `/tene:qa` 스킬 | 오케스트레이션 | W-59~W-5E | L | 전 과정 |

---

## M6 · 회고·집계

| ID | 작업 | 산출물 | 의존 | 규모 | 검증 |
|---|---|---|---|---|---|
| W-61 | R1 연결 분석 | `lib/report/lineage.js` | W-38 | L | 고아 검출 |
| W-62 | R2 변경 요약 | `lib/report/changes.js` (git+layer) | W-39 | M | diff 파싱 |
| W-63 | R3 의도 매핑 | `lib/report/intent-map.js` | W-3B | M | 역참조 |
| W-64 | R4/R5 렌더링 | `lib/report/layers-questions.js` | W-3A | M | 상한 20 |
| W-65 | R6 미결 수집 | `lib/report/carry.js` | W-27 | M | 3출처 병합 |
| W-66 | `tene-reporter` 에이전트 | 문서 작성 | W-61~W-65 | L | R1~R6 완비 |
| W-67 | `/tene:report` 스킬 | 생성+해석 | W-66 | M | G7 게이트 |
| W-68 | master plan 집계 | `lib/plan/aggregate.js` | W-27 | M | 상태 집계 |
| W-69 | carryOver 승격 | `lib/plan/aggregate.js` 의 `promote()` | W-65,W-68 | M | 승격 경로 |
| W-6A | `/tene:master-plan` 스킬 | 집계/order/next/carry | W-68,W-69 | L | 추천 규칙 |
| W-6B | `/tene:archive` 스킬 | 아카이브 이동 | W-27 | M | 문서 이동 |

---

## M7 · 시크릿 (M2 이후 병렬)

| ID | 작업 | 산출물 | 의존 | 규모 | 검증 |
|---|---|---|---|---|---|
| W-71 | 세그먼트 분해 | `lib/guard/segment.js` | W-05 | M | 체인 명령 분해 |
| W-72 | 시크릿 규칙 | `lib/guard/rules.js` | W-71 | M | 4대 규칙 |
| W-73 | 권한모드 인지 | `lib/guard/rules.js` 의 `escalateOrWarn()` | W-72 | S | escalate 강등 |
| W-74 | `bin/tene-guard` | 진입점 (fail-closed) | W-71~W-73 | S | 예외 시 deny |
| W-75 | PreToolUse 훅 (Bash/Read) | 차단 | W-74 | M | V1~V6 |
| W-76 | PostToolUse `.env` 감지 | 경고 | W-74 | S | V10 |
| W-77 | `/tene:secrets` 스킬 | tene CLI 안내 | W-75 | M | V9,V11 |
| W-78 | 가드 매트릭스 테스트 | `test/guard-matrix.test.js` | W-75 | L | 26×6, 오탐0/미탐0 |

---

## M8 · 배포

| ID | 작업 | 산출물 | 의존 | 규모 | 검증 |
|---|---|---|---|---|---|
| W-81 | 픽스처 4종 | `evals/fixtures/*` | — | L | 4환경 |
| W-82 | Eval 러너 | `test/eval-honesty.test.js` (결정론), 에이전트 케이스는 수동 | W-81 | L | E-3/4/7/10/12 |
| W-83 | 정직성 테스트 | E-2/4/7/10/12 100% | W-82 | M | 전부 통과 |
| W-84 | 사용자 README | `plugins/tene/README.md` | 전체 | M | 8섹션 |
| W-85 | CHANGELOG | `CHANGELOG.md` | — | S | 릴리즈 노트 |
| W-86 | 배포 체크리스트 실행 | — | 전체 | M | 10항 |
| W-87 | 마켓플레이스 공개 | GitHub | W-86 | S | 설치 확인 |
| W-88 | 커뮤니티 제출 | Console 폼 | W-87 | S | 제출 완료 |

---

## 의존 그래프 (핵심 경로)

```
W-05 (util)
  ├─▶ W-11→W-15→W-16→W-19 (doc)         ─┐
  ├─▶ W-21→W-22→W-27 (state)             ─┼─▶ W-2B (sprint 라우터)
  └─▶ W-31→W-32→W-33→W-37→W-38 (scan)    ─┘        │
                        │                           │
                        ├─▶ W-39 (layer) ─▶ W-3A (6질문) ─▶ W-3H (design)
                        └─▶ W-3B (anchors) ─▶ W-3D (stale 훅)
                                    │
                                    ├─▶ W-42 (갭 판정) ─▶ W-46 (loop-check)
                                    └─▶ W-51 (charter) ─▶ W-5F (qa) ─▶ W-67 (report)
                                                │
                                                └─▶ W-55 (gate) ─▶ W-57 (TaskCompleted 훅)
```

**병목**: `W-37 (인덱스 빌더)` 와 `W-22 (상태 저장소)`. 이 둘이 하위 작업 대부분의 선행이다. 우선 착수한다.

---

## 병렬화 가능 구간

| 구간 | 병렬 작업 |
|---|---|
| M1 진행 중 | W-14(계층 프리셋), W-21(상태 스키마) 설계 선행 가능 |
| M3 진행 중 | W-34/35/36 (언어 팩) 상호 독립 |
| M2 완료 후 | M7(시크릿) 전체가 독립 |
| M5 진행 중 | W-81(픽스처) 준비 가능 |

---

## 작업 착수 체크리스트 (모든 작업 공통)

- [ ] 이 작업의 **선행 작업이 완료**되었는가
- [ ] 이 작업이 대응하는 **요구사항 ID**가 명확한가 ([04-requirements-traceability.md](./04-requirements-traceability.md))
- [ ] **검증 방법**이 정해졌는가 (수동 확인이면 절차를 적는다)
- [ ] `lib/` 에 로직을 두고 `bin/` 은 얇게 유지하는가
- [ ] 파일 쓰기가 `lib/util/atomic.js` 를 경유하는가
- [ ] 실패 시 fail-open 인가 (guard 제외)
