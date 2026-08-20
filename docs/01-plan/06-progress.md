# 구현 진행 현황

> 이 문서는 구현이 진행되며 갱신된다. 계획(00~04)은 무엇을 할지를, 이 문서는 무엇이 됐는지를 적는다.

최종 갱신: 2026-08-20

---

## 1. 마일스톤

| M | 범위 | 상태 |
|---|---|---|
| M0 | 기반 (유틸, 오류, 패키징) | ✅ 완료 |
| M1 | 문서 계약 (파서·검증·추출·템플릿) | ✅ 완료 |
| M2 | 상태 관리 (스키마·저장소·요약·복구·훅) | ✅ 완료 |
| M3 | 코드 인텔리전스 (인덱스·계층·앵커) | ✅ 완료 |
| M4 | loop-check | ✅ 완료 |
| M5 | QA 게이트 | ✅ 완료 |
| M6 | 보고서·집계 | ✅ 완료 |
| M7 | 시크릿 경계 | ✅ 완료 |
| M8 | 릴리스 | ✅ 완료 (dogfooding + 외부 구조 검증 포함) |

---

## 2. 완료 항목

### M1 — 문서 계약

| W | 항목 | 결과 |
|---|---|---|
| W-11 | 섹션 앵커 규약 | `lib/doc/sections.js` — 문서 7종 51 앵커 |
| W-12 | 템플릿 (ko) | 7종 |
| W-13 | 템플릿 (en) | 7종 — 앵커·자동블록 ko 와 동일 확인 |
| W-14 | 계층 규칙 프리셋 | `templates/layers.default.yml` |
| W-15 | 앵커 파서 | `lib/doc/parser.js` |
| W-16 | 문서 검증기 | `lib/doc/validate.js` — 18 규칙 |
| W-17 | 자동 블록 patch | `lib/doc/patch.js` |
| W-18 | 문서 추출기 | `lib/doc/extract.js` — 10 대상 |
| W-19 | `bin/tene-doc` | scaffold/validate/extract/patch |
| W-1A | `/tene:sprint init` | `skills/tene-sprint/` |
| W-1B | `/tene:prd` 스킬 | `skills/tene-prd/` |
| W-1C | `tene-interviewer` | `agents/tene-interviewer.md` |

### M2 — 상태 관리

| W | 항목 | 결과 |
|---|---|---|
| W-21 | 상태 스키마 | `lib/state/schema.js` — 13 전이 |
| W-22 | 원자적 저장소 | `lib/state/store.js` — lock + rev 낙관적 잠금 |
| W-23 | 이벤트 저널 | `lib/state/events.js` — NDJSON, 손상 줄 건너뜀 |
| W-24 | 상태 요약기 | `lib/state/summary.js` — ≤600 토큰, 우선순위 절삭 |
| W-25 | 크기 관리 | `lib/state/retention.js` — 측정과 정리 분리 |
| W-26 | resync | `lib/state/resync.js` — 문서→상태 복구 |
| W-27 | `bin/tene-state` | 20 하위 명령 |
| W-28 | SessionStart 훅 | `lib/hooks/session-start.js` |
| W-29 | PreCompact/PostCompact | `lib/hooks/compact.js` |
| W-2A | `/tene:status` | `skills/tene-status/` |
| W-2B | `/tene:sprint` 라우터 | init/start/pause/resume/waiver/phase/list |
| W-2C | Task 연동 | `lib/hooks/task-created.js` |
| W-2D | `/tene:clear` | `skills/tene-clear/` |
| W-2E | `/tene:plan` | `skills/tene-plan/` |

### M3 — 코드 인텔리전스

| W | 항목 | 결과 |
|---|---|---|
| W-31 | 파일 워커 | `lib/scan/walk.js` — .gitignore 단순 glob, 미지원 패턴은 버림 |
| W-32 | 언어 팩 인터페이스 | `lib/scan/langs/index.js` — 계약 검증 포함 |
| W-33~36 | ts/js·python·go·java 팩 | 4종. stripNonCode 가 길이·줄 수 보존 |
| W-37 | 인덱스 빌더 | `lib/scan/index-builder.js` — 증분, 50% 초과 시 전체 |
| W-38 | 질의 API | `lib/scan/query.js` — 9종 질의, needs-investigation 구분 |
| W-39 | 계층 판정 | `lib/scan/layer.js` — 미분류를 추측으로 채우지 않음 |
| W-3A | 6질문 조립 | `lib/scan/questions.js` |
| W-3B | 앵커 역인덱스 | `lib/scan/anchors.js` — byPath O(1) |
| W-3C | `bin/tene-scan` | 9 하위 명령 |
| W-3D | PostToolUse 훅 | `lib/hooks/post-edit.js` — 편집 → AC stale |
| W-3E | `/tene:layers` | 규칙 제안 포함 |
| W-3F | `/tene:understand` | 6질문 단독 조사 |
| W-3G | `tene-cartographer` | Write 없음 (조사 전용) |
| W-3H | `/tene:design` | 4계층 + 6질문 + 앵커 |

### M4 — loop-check

| W | 항목 | 결과 |
|---|---|---|
| W-41 | 요구 항목 추출 | `lib/loop/requirements.js` — 6출처, 우선도 계승 |
| W-42 | 갭 판정 | `lib/loop/judge.js` — 4단계, 전부 근거 요구 |
| W-43 | 진행률·수렴 | `lib/loop/progress.js` — blocking 기준 정체 감지 |
| W-44 | 미귀속 변경 | `lib/loop/unattributed.js` — 3가지 해소 |
| W-45 | `tene-gap-auditor` | Write 없음 (감사 전용) |
| W-46 | `/tene:loop-check` | 회차 반복 |
| — | `bin/tene-loop` | 판정 전용 (문서 작성은 스킬) |

### M5 — QA 게이트

| W | 항목 | 결과 |
|---|---|---|
| W-51 | Charter 컴파일 | `lib/qa/charter.js` — 변형 7종, 금지 조건 |
| W-52 | 7-Layer 계획 | `lib/qa/layers.js` — required/n-a/waived 강제 |
| W-53 | Capability 감지 | `lib/qa/capability.js` — 브라우저는 unknown (스킬이 판단) |
| W-54 | 증거 매니페스트 | `lib/qa/evidence.js` — sha256 + freshness + redaction |
| W-55 | 게이트 규칙 G0~G7 | `lib/gate/rules.js` |
| W-56 | `bin/tene-gate` | check + task-complete (exit 2 차단) |
| W-57 | TaskCompleted 훅 | 게이트 fail 시 완료 차단 |
| W-58 | Stop 훅 | 미충족 시 안내 (차단 안 함) |
| W-59~5C | QA 에이전트 4종 | planner/runner/judge/refuter — judge·refuter 는 Read 만 |
| W-5D | `qa-sweep` 워크플로 | 수집 → 판정 → 반박 파이프라인 |
| W-5E | 전이 커버리지 | `lib/qa/coverage.js` — 분모는 design 전이 표 |
| W-5F | `/tene:qa` | 오케스트레이션 |
| W-5G | `bin/tene-qa` | 계획·증거 (판정 제외) |

### M6 — 보고서·집계

| W | 항목 | 결과 |
|---|---|---|
| W-61 | R1 연결 분석 | `lib/report/lineage.js` — orphan 검출 |
| W-62 | R2 변경 요약 | `lib/report/changes.js` — 삭제 심볼 포함 |
| W-63 | R3 의도 매핑 | `lib/report/intent-map.js` — 미승인 편차 R6 이월 |
| W-64 | R4/R5 렌더링 | `lib/report/layers-questions.js` — 쏠림 감지, 상한 20 |
| W-65 | R6 미결 수집 | `lib/report/carry.js` — 3출처 병합, 사유 강제 |
| W-66 | `tene-reporter` | 표는 기계, 서술은 에이전트 |
| W-67 | `/tene:report` | G7 게이트 |
| W-68~69 | master plan 집계·승격 | `lib/plan/aggregate.js` — 중복 승격 방지 |
| W-6A | `/tene:master-plan` | 순서·의존·이월 |
| W-6B | `/tene:archive` | 문서 이동 + 이월 승격 |
| — | `bin/tene-report` | R1~R6 표 조립 |

### M7 — 시크릿 경계

| W | 항목 | 결과 |
|---|---|---|
| W-71 | 세그먼트 분해 | `lib/guard/segment.js` — 체인·간접·치환·heredoc |
| W-72 | 가드 규칙 | `lib/guard/rules.js` — SR1~SR4 |
| W-73 | `bin/tene-guard` | **fail-closed** (유일) |
| W-74 | `.env` 감지 | 차단하지 않고 대안 안내 |
| W-75 | `/tene:secrets` | allowed-tools 가 1차 방어 |

### 라우팅·훅 (M2~M5 분산)

| 항목 | 결과 |
|---|---|
| 자연어 라우터 | `lib/router/` — 10규칙, 세션당 1회 제안, 제안만 (차단 안 함) |
| 훅 핸들러 10종 | session-start/end, user-prompt, pre/post-edit, post-bash, task-created, stop, compact, subagent-stop |
| 워크플로 3종 | qa-sweep, conformance-audit, understand-sweep |

---

## 3. 구현 중 드러난 설계 정정

계획 단계에서 알 수 없었던 것들이다. 각 항목은 해당 설계서에 "⚠️ 구현 중 정정" 으로 표시했다.

| # | 발견 | 원인 | 반영 |
|---|---|---|---|
| F1 | 훅 `command` 배열 형식 거부 | `claude plugin validate` 는 문자열만 받는다 | D01 §4.2, D05 §3.1 |
| F2 | `plugin.json` 의 `skills`/`agents`/`workflows` 선언 거부 | 기본 위치는 자동 탐색된다 | D01 §2.1 |
| F3 | `claude --version` 실측 2.5초 | 훅에서 호출 불가 | D12 §8.0 — 3단 폴백 |
| F4 | **낙관적 잠금이 충돌을 놓침** | `updatedAt` 이 초 단위라 같은 초의 두 변경을 구분 못 함 | D03 §8.3, D12 §3.3 — `rev` 카운터로 교체 |
| F5 | **Node 빈 기동만 227ms** | "훅 200ms 예산" 은 프로세스 총 시간으로는 달성 불가 | D12 §6.2 — 예산의 대상을 "훅 로직 시간" 으로 명시 |
| F6 | 섹션 경계가 하위 제목에서 잘림 | 자동 블록이 `###` 을 쓰는데 파서가 모든 제목에서 끊었다 | `parser.js` — `h.level <= sec.level` |
| F7 | waiver 후 차단 목록과 `blockingFailed` 불일치 | `buildBlocking` 이 `waived` 를 보지 않았다 | `store.js` + 요약에 `waived` 노출 |
| F8 | import 를 하나도 못 읽음 | `stripNonCode` 가 경로 문자열까지 지웠다 | `stripComments` 분리 (ts·go) |
| F9 | `.ts` 의 `Promise<T>` 를 JSX 컴포넌트로 셈 | 제네릭과 JSX 구분 없음 | 확장자 + 선행 문자 검사 |
| F10 | **새로 만든 파일이 전부 "변경 안 됨"** | `git status --porcelain` 이 untracked 디렉토리를 `src/` 로 축약 | `-uall` 추가 |
| F11 | 정체 판정이 주석 의도와 반대 | 진행률이 오르면 정체 아님으로 처리 | blocking 갭 기준으로 교체 |
| F12 | **게이트가 조용히 무력화** | `bin/tene-gate` 의 TDZ 오류를 fail-open 이 삼킴 | 상수를 호출 앞으로 + 오류 시 stderr 경고 |
| F13 | 모든 레이어가 insufficient | `applyCapability` 에 boolean map 을 넘겼는데 도구 이름으로 조회 | 시그니처 정정 |
| F14 | charter 에 AC 문장이 비어 있음 | 상태 AC 에는 statement 가 없다 (문서에만 있음) | 문서 기준 + 상태 병합 |
| F15 | **문서가 두 경로에 생성** | `tene-doc` 이 상태의 `sprintDir` 을 안 읽고 `<id>` 로 만듦 | 상태를 정본으로 |
| F16 | **절대 경로로 가드 우회** | `/usr/local/bin/tene get` — 명령은 `tene` 로 읽었으나 정규식이 전체 경로에 걸림 | `normalizedCommand()` (가드 매트릭스가 잡음) |
| F17 | **가드가 깨진 입력을 통과** | `readStdinJson` 이 파싱 실패를 `{}` 로 바꿔 "검사할 것 없음" 이 됨 | `strict` 모드 — fail-closed 경로로 |
| F18 | macOS `/tmp` 하위에서 훅 미동작 | `/var`→`/private/var` 심볼릭 링크로 `relative()` 가 프로젝트 밖 판정 | `relativeInProject()` |
| F19 | **인덱서가 실제 코드베이스에서 죽음** | 심볼명이 `constructor`·`toString` 이면 `??=` 가 Object.prototype 을 반환 | `Object.create(null)` + `hasOwn` |
| F20 | **확장자 없는 진입점 전체 누락** | `bin/*` 9개가 인덱싱 안 됨 → orphan 오탐, interface 계층 비어 보임 | shebang 판별 |
| F21 | `resync` 가 계층 위반 | persistence 에 있으면서 문서 파서 참조 — 도구가 blocker 로 잡음 | `lib/recover/` 로 이동 |
| F22 | **게이트 G2 가 정상 문서를 막음** | 템플릿 헤더 `커버 작업` 이 ALIAS 에 없어 추출 0건 — 자기 템플릿을 자기가 못 읽음 | ALIAS 보강 + 왕복 테스트 17건 |
| F23 | archive 후에도 활성 sprint 로 남음 | `clearActiveIfMatches()` 를 만들어놓고 아무도 호출 안 함 (죽은 코드) | `advance()` 에서 호출 |
| F24 | `--force` 로 건너뛴 게이트가 기록 안 됨 | 나중에 "게이트를 통과했나" 를 답할 수 없음 | `skipped` + `forced: true` 기록 |
| F25 | 프리셋이 `src/core/**` 를 business-logic 으로 단정 | 프로젝트마다 뜻이 다름 (DDD 코어 vs FastAPI 인프라) | 프리셋에서 제거 — 모호하면 미분류 |
| F26 | 프리셋의 인프라 import 에 **JS 만** 있었음 | Python `jwt`·`boto3`, Go·Java 라이브러리가 통째로 빠짐 | 4개 생태계 추가 |
| F27 | `assertInProject` 가 상대 경로 root 를 못 씀 | `bin` 은 절대 경로로 바꿔주지만 API 직접 호출은 아님 | `resolve(root)` |
| F28 | **스킬이 `/tene:tene-prd` 로 등록됨** | 디렉토리 이름이 그대로 호출 이름이 된다 (frontmatter `name:` 은 무시) | `skills/tene-prd/` → `skills/prd/` |
| F29 | **에이전트가 `tene:tene-judge` 로 등록됨** | 같은 중복. 워크플로의 `agentType: 'tene-judge'` 와 어긋나 **워크플로가 동작하지 않았을 것** | 파일명 정규화 + `agentType: 'tene:judge'` |
| F30 | SubagentStop 훅이 아무것도 못 잡음 | matcher 가 `tene-.*` 인데 실제는 `tene:<name>` | `tene:.*` + 핸들러 접두사 |
| F31 | **스킬이 지시하는 명령이 실행 불가** | 본문이 `tene-state read` 로 PATH 를 가정 — `bin/` 은 PATH 에 없다 | 전부 `${CLAUDE_PLUGIN_ROOT}/bin/` |
| F32 | **`allowed-tools` 를 정반대로 이해** | 제한이 아니라 **사전 승인**이다. "목록에 없는 도구도 여전히 호출 가능" | `secrets` 는 `disallowed-tools` 로 실제 방어 |
| F33 | 선행 조건을 서술에만 의존 | "먼저 `tene-state read` 하라" 는 모델이 따를 확률 | `` !`cmd` `` 로 **주입** — 확률이 사실이 된다 |
| F34 | frontmatter 필드 20개 중 5개만 씀 | `disable-model-invocation`·`context: fork`·`effort`·`paths` 등을 몰랐다 | 목적에 맞게 적용 |
| F35 | 서브에이전트 필드 16개 중 4개만 씀 | `disallowedTools`·`skills`·`maxTurns`·`effort` 미사용 | 8종 전부 보강 |

F31~F35 는 **공식 문서를 조사하지 않고 만든 결과**다. `claude plugin validate` 도
실제 로드도 통과하는데, 스킬이 지시한 명령이 실행되지 않았다.

F28~F30 은 **`claude plugin validate` 가 통과하는 상태에서** 실제 로드로만 드러났다.
매니페스트 검증과 실제 등록은 다른 일이다.

F19~F21 은 **테스트 257개가 통과하는 상태에서** dogfooding 이 찾았다.
자세한 경위는 [docs/03-analysis/dogfooding-01.md](../03-analysis/dogfooding-01.md).

F4 와 F5 는 **테스트가 아니라 실측이 잡았다.** F4 는 검증 스크립트에서 예외가 안 나서, F5 는 벤치마크에서 드러났다.

---

## 4. 검증 상태

```
테스트         333개 통과 / 0 실패
           단위 250 · 가드 매트릭스 5 · 통합 13 · 정직성 Eval 14
           에이전트 계약 21 · 플러그인 레이아웃 12 · frontmatter 계약 19
플러그인 검증   claude plugin validate ✔
문서 정합성    33개 문서 / 10 규칙 ✔
외부 의존성    없음 (node: 내장 모듈만)
```

| 검증 항목 | 결과 |
|---|---|
| 언어 독립성 | ko/en 템플릿이 동일 앵커·동일 추출 결과 |
| 낙관적 잠금 | 같은 초 안의 충돌 감지 확인 |
| 손상 파일 격리 | `.corrupt-<ts>` 보존, 원본 삭제 안 함 |
| 상위 스키마 | 읽기 전용, 백업·마이그레이션 하지 않음 |
| fail-open | 손상된 `current.json` 에서도 훅이 조용히 통과 |
| 예산 절삭 | 예산 부족 시 차단 사유가 남고 경로가 먼저 잘림 |
| resync | 문서만으로 phase·AC 복구, 게이트는 비움 |
| 시크릿 가드 | 체인·프리픽스·래퍼·간접 실행 우회 차단, `grep "tene get"` 오탐 없음 |
| bypass 모드 | `--dangerously-skip-permissions` 에서도 SR1~SR3 deny 유지 |
| 게이트 차단 | G6 fail 시 TaskCompleted exit 2 + 해결 경로 제시 |
| 전체 사이클 | 빈 프로젝트 → PRD → G1 pass → 전이 → 구현 → 인덱스 → loop-check pass |
| "100%" 의미 | 진행률 67% 인데 판정 pass (blocking 갭 0) — 백분율이 게이트가 아님을 실증 |
| 가드 매트릭스 | 156케이스(26위반 × 6모드) false-negative 0, false-positive 0 |
| 훅 로직 예산 | SessionStart 70ms / PostToolUse 24ms / 라우터 4ms / 가드 14ms (예산 대비 여유) |
| 인덱스 성능 | 200파일 전체 빌드 269ms, 증분 188ms (로직 기준) |
| 정직성 Eval | 픽스처 4종에 결함을 심고 전부 검출 — 미분류·계층 위반·도구 없음·미귀속 |
| **dogfooding #1** | tene 를 tene 에 적용 — 121파일 인덱싱, 미분류 0, blocker 0. 결함 3건 발견·수정 |
| **사이클 완주** | draft → archived, G0~G7 전부 pass, 문서 6종 생성, 이월 2건 승격 |
| **템플릿 왕복** | 자기 템플릿을 자기가 읽는지 ko/en 각각 8개 섹션 |
| **외부 구조** | Express 8/8 정확, FastAPI 는 import 규칙으로 보완. 결함 3건 발견·수정 |
| **에이전트 계약** | judge/refuter 는 Read 만, runner 는 판정 금지 등 21건 고정 |
| **실제 로드** | `claude --plugin-dir plugins/tene` 로 스킬 16 · 에이전트 8 · 워크플로 3 확인 |
| **이름 규약** | 스킬=디렉토리(또는 frontmatter name), 에이전트=파일명, 워크플로=meta.name. 전부 `tene:` 접두사 |
| **슬래시 호출** | `/tene:status`·`/tene:layers` 실제 실행 확인. 스킬이 곧 커맨드 — `commands/` 불필요 |
| **동적 주입** | 스킬 로드 시 상태·인덱스가 자동으로 컨텍스트에 들어간다 (명령 실행 없이) |
| **skill-creator eval** | 7개 스킬 14 케이스 — 정직성 중심 (`evals/evals.json`) |

---

## 5. 다음 (M8 · 릴리스)

| 항목 | 상태 |
|---|---|
| 통합 테스트 | ✅ 12케이스 — 사이클 전 구간을 실제 bin 으로 |
| 가드 매트릭스 | ✅ 156케이스 × 6모드, CI 강제 |
| 성능 벤치 | ✅ 훅 로직 예산을 CI 가 검사 |
| Node 버전 매트릭스 | ✅ 20 / 22 / 24 |
| README | ✅ |
| CHANGELOG | ✅ |
| **실제 프로젝트 시범 적용** | ✅ 자기 자신 + Express + FastAPI (결함 6건 발견·수정) |
| Eval 스위트 (D13 §4) | ✅ E-1·E-3·E-4·E-7·E-10·E-12. E-2/E-7 의 LLM 판단은 프롬프트 계약 테스트로 방어 |

### 알려진 한계

- **`tene-qa evidence` 는 스킬이 채워야 한다.** 자동 수집기가 없다 — 에이전트가 관찰을 기록한다
- **결함 주입(L6) 미지원.** capability 가 `null` 로 보고하고 `insufficient` 가 된다
- **Chrome MCP 감지는 스킬 의존.** bin 은 MCP 도구 목록을 볼 수 없다
- **Go/Java 의 저장소 내부 import 해석 없음.** go.mod·소스 루트가 필요해 하지 않는다
