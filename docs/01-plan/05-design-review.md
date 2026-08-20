# tene plugin — 설계 정합성 검토 및 잔여 갭

> 검토일: 2026-08-20 · 대상: `docs/00-prd` (13문서) + `docs/01-plan` (6문서) + `docs/02-design` (15문서)
> 방법: 문서 간 용어·식별자·스키마 키를 기계 대조(grep) 후 수동 확인

---

## 1. 검토 결과 요약

| 구분 | 건수 | 상태 |
|---|---|---|
| **정합성 결함** | 7 | 6건 수정 완료, 1건 문서화로 해소 |
| ↳ 1차 검증에서 놓친 결함 | 2 | 재검증에서 발견 → 수정 완료 (§2.8) |
| **잔여 갭 (구현 전 필요)** | 6 | 착수 전 확정 필요 |
| **잔여 갭 (구현 중 확정 가능)** | 7 | M1~M5 에서 확정 |
| **미검증 가정** | 3 | 1건은 근거 확인 완료 |

**판정**: M0~M2 는 **즉시 착수 가능**. M3 이후는 §3 의 갭 6건 중 해당 항목을 먼저 확정해야 한다.

---

## 2. 정합성 결함 (발견 → 조치)

### C1 · loop-check 반복 상한 불일치 ✅ 수정

| 문서 | 값 (수정 전) | 값 (수정 후) |
|---|---|---|
| 00-prd/01 FR-1.3, 02, 04, 08(2곳), 10 | **5회** | 3회 |
| 01-plan, 02-design 전체 | 3회 | 3회 |

`tene-codex` 정합(D3 결정)으로 3회로 확정했으나 00-prd 미반영 상태였다. **게이트 동작을 좌우하는 값이라 심각도 높음.**

### C2 · userConfig 키 이름 불일치 ✅ 수정

```diff
- "max_check_loops":  { "default": 5, "min": 1, "max": 20 }   // 00-prd/08
+ "max_loop_checks":  { "default": 3, "min": 1, "max": 10 }   // D01 과 통일
```

구현 시 두 키를 각각 읽는 코드가 나올 수 있었다.

### C3 · `trust_level` 잔존 ✅ 수정

Trust Level L0~L4 는 Profile + `--auto-until` 로 대체되었으나 00-prd/08 userConfig 에 남아 있었다.

```diff
- "trust_level": { "default": "L2" }
+ "profile":     { "default": "standard" }
+ "auto_until":  { "default": "design" }
```

### C4 · 워크플로 `meta.name` 자기모순 ✅ 수정

D09 §3~5 는 `name: 'tene-qa-sweep'`, §8 은 *"`meta.name` 을 `qa-sweep` 으로 두라"*. **같은 문서 안에서 모순**이었다.

플러그인 네임스페이스가 접두사를 붙이므로 `tene-qa-sweep` 이면 `/tene:tene-qa-sweep` 이 된다. 전부 `qa-sweep` / `conformance-audit` / `understand-sweep` 으로 통일하고 §8 에 규칙 표를 추가했다.

### C5 · `bin/tene-hook` 누락 ✅ 수정

D05 §8 에서 훅 단일 진입점으로 도입했으나 D00 §3 모듈 구조와 WBS 에 없었다.

- D00 §3 `bin/` 목록에 추가 (각 스크립트 역할 주석 포함)
- WBS 에 **W-08** 신설 (M0, 의존 W-05), W-28 의 의존에 W-08 추가

### C6 · 스킬 카탈로그 14 vs 15 ✅ 문서화로 해소

00-prd/07 은 14개(`tene-status` 없음), D05 는 15개. 00-prd/07 이 구버전이다.

00-prd/07 상단에 정본 표기를 추가했다:
> **스킬 카탈로그의 정본은 02-design/05 §1 이다.** 이 문서는 각 스킬의 *수행 로직*을 규정하며, 목록·frontmatter·네이밍은 D05 를 따른다.

### C7 · `tene-doctor` CLI/스킬 혼용 ✅ 수정

D12 §8.3 이 `tene-doctor --json` 으로 CLI 처럼 표기했으나 `tene-doctor` 는 **스킬**이다. `/tene:doctor --json` 으로 수정.

### 2.8 · 1차 검증이 놓친 것 (재검증에서 발견) ⚠️

C4(워크플로 이름) 수정 시 **검색 범위를 `02-design/09*.md` 로 좁혀** 두 곳을 놓쳤다.

| 위치 | 잔존 값 |
|---|---|
| `00-prd/02-plugin-architecture.md:420` | `name: 'tene-qa-sweep'` |
| `02-design/07-loop-check.md:488` | `name: 'tene-conformance-audit'` |

전 범위 재검증(`grep -rl` on `00-prd 01-plan 02-design`)에서 발견해 수정했다.

**교훈**: 정합성 검증은 **항상 전 범위로 실행한다.** 결함이 발견된 문서만 보면 같은 결함의 다른 인스턴스를 놓친다. §8 의 재검증 스크립트는 이미 전 범위를 대상으로 한다.

---

## 3. 잔여 갭 — 구현 착수 전 확정 필요 (6건)

### GAP-1 · 스킬 `SKILL.md` 실물 없음 🔴

| 있는 것 | 없는 것 |
|---|---|
| 00-prd/07 수행 로직 (단계·규칙·게이트) | frontmatter + 본문 완성본 |
| D05 §2 frontmatter 표준 | 15개 각각의 실제 파일 |

**판단**: 이건 **문서 갭이 아니라 M1~M6 의 구현 산출물**이다. 다만 스킬 본문은 "코드"가 아니라 "프롬프트"이므로, 품질이 제품 동작을 직접 좌우한다.

**조치**: WBS 의 각 스킬 작업(W-1A, W-1B, W-2A, …)에서 00-prd/07 §해당절 + D05 §2 를 입력으로 작성한다. 별도 설계 문서는 만들지 않는다.

### GAP-2 · 문서 템플릿 실물 2/7 🔴

| 템플릿 | 상태 |
|---|---|
| PRD | D04 §4.1 에 전문 |
| QA | D04 §4.2 에 핵심부만 |
| Plan / Design / Loop-check / Report / Master-plan | **없음** (섹션 ID 만 정의됨) |

**조치**: W-12(템플릿 7종 ko) 착수 시 D04 §1.2 섹션 ID 표 + 00-prd/03 양식을 결합해 작성. **섹션 ID 는 이미 확정되어 있으므로 설계 재작업은 불필요.**

### GAP-3 · `light` profile 문서 병합 파서 미정의 🔴

D02 §3.1 에 이런 표기가 있다:

```javascript
light: { plan: '00-prd/prd.md#plan', loopCheck: '02-design/design.md#loop-check' }
```

**`#plan` 앵커가 어떻게 동작하는지 스펙이 없다.** 같은 파일 안의 섹션인가? 그렇다면:
- `tene-doc validate --doc plan` 이 어느 범위를 검사하는가
- `tene-doc patch --block coverage` 가 어느 파일의 어느 위치를 고치는가
- 섹션 ID 충돌 (`prd.md` 에 `tasks` 섹션이 생김)

**조치 (택1)**
| 안 | 내용 | 비용 |
|---|---|---|
| **A (권장)** | `light` 도 파일은 분리하되 **섹션 수를 줄인다** | 낮음. 파서 변경 없음 |
| B | 같은 파일 내 서브섹션 + ID 네임스페이스(`plan:tasks`) | 파서·검증기 전면 수정 |
| C | MVP 에서 `light` 제외 (`standard`/`off` 만) | 가장 낮음 |

**A 를 권장한다.** `light` 의 목적은 "문서 작성 부담 감소"이지 "파일 개수 감소"가 아니다.

### GAP-4 · `evidence/` 아티팩트 파일명 규칙 없음 🟡

manifest 스키마는 D08 §5.1 에 있으나 실제 파일명 규칙이 없다. 워크플로에서 여러 에이전트가 동시에 쓰므로 **충돌 방지 규칙이 필요하다.**

**제안**
```
evidence/<run-id>/
├── manifest.json
├── <ac-id>-<variant>-<seq>.<ext>       예: ac_1-error-01.gif
└── <ac-id>-<observer>-<seq>.json       예: ac_1-network-01.json
```

`ac-id` 가 접두사이므로 에이전트별로 자연히 분리된다(한 에이전트가 한 AC 담당).

### GAP-5 · `extract --what intents` 예시 없음 🟡

D04 §7 에서 `--what ac|intents|tasks|coverage|edges|anchors|verdicts|requirements|carry` 를 선언했으나 예시는 `ac` / `requirements` / `anchors` 3종뿐이다.

**Intent 표 파싱 스키마가 없으면** `tene-interviewer` 가 쓴 표를 상태로 미러링할 수 없다.

**조치**: W-18 착수 시 나머지 6종 스키마를 D04 §7 에 추가. 표 구조는 이미 템플릿에 있으므로 파싱 규칙만 명시하면 된다.

### GAP-6 · `current.json` 초기 생성 시 `summary` 초기화 🟡

D03 §4 의 `summary` 는 전이 시점에 미리 계산해 두는 파생 데이터인데, **`sprint init` 직후(phase=draft, AC 0건)에 어떤 값을 넣는지** 정의가 없다.

**제안**
```jsonc
"summary": {
  "gate": null,
  "ac": { "total": 0, "passed": 0, "failed": 0, "insufficient": 0, "stale": 0, "blockingFailed": 0 },
  "coverage": null,
  "loopChecks": { "count": 0, "max": 3 },
  "blocking": []
}
```

`null` 과 `0` 을 구분한다 — 아직 없는 것(`null`)과 0건인 것(`0`)은 다르다.

---

## 4. 잔여 갭 — 구현 중 확정 가능 (7건)

| # | 갭 | 확정 시점 | 비고 |
|---|---|---|---|
| GAP-7 | `master-plan.md` 최초 생성 시점 | M6 | sprint 2개 이상일 때 자동 생성 제안이 자연스러움 |
| GAP-8 | `sprint fork` 상세 동작 | M2 | D05 액션 목록에만 있음. 문서 복사 범위·AC 초기화 규칙 필요 |
| GAP-9 | `.gitignore` 자동 생성 vs 제안 | M1 | D01 §5.1(자동) vs §5.2(제안) 애매. **`.tene-claude/.gitignore` 는 자동, 프로젝트 `.gitignore` 는 제안**으로 정리 권장 |
| GAP-10 | Q5 타입 별칭 해석 알고리즘 | M3 | "1단계만" 원칙은 있으나 인터페이스 필드 펼치기 방법 미정 |
| GAP-11 | `questions-full.md` 스펙 | M6 | D10 §5.2 에서 언급만. 단순 나열 문서이므로 간단 |
| GAP-12 | `off` profile 과 `--auto-until` 상호작용 | M2 | `off` 는 게이트가 경고만 하므로 auto-until 이 무의미할 수 있음 |
| GAP-13 | 에이전트의 `Bash` 도구 범위 제한 | M3 | `Bash(tene-*)` 로 좁힐지, 전체 허용할지. **`tene-judge`/`tene-refuter` 는 Bash 미부여로 이미 확정** |

---

## 5. 미검증 가정

### A-1 · 스킬이 Workflow 도구를 호출할 수 있는가 ✅ **근거 확인**

D07·D08·D09 전반이 *"스킬이 조건에 따라 워크플로로 전환한다"* 를 전제한다. Claude Code 는 Workflow 도구 호출에 **명시적 opt-in** 을 요구하므로 검증이 필요했다.

**확인 결과**: Workflow 도구 설명의 opt-in 조건 중 다음 항목이 있다.

> *"The user invoked a skill or slash command whose instructions tell you to call Workflow."*

**즉 스킬 본문이 Workflow 호출을 지시하면 정당한 opt-in 이다.** 설계 전제가 성립한다.

단, 스킬 본문에 **명시적으로 써야 한다.** 암묵적으로 기대하면 모델이 호출하지 않을 수 있다.

```markdown
## 실행 방식 결정 (tene-qa 스킬 본문에 포함)

수용 기준이 8건 이상이거나 사용자가 명시 요청하면
**Workflow 도구로 `qa-sweep` 을 실행한다.**
8건 미만이면 서브에이전트를 순차 호출한다.
```

이 문장을 D09 §6 에 반영 권장.

### A-2 · Chrome MCP 도구 가용 여부를 스킬이 판단할 수 있는가 🟡 **미검증**

D08 §4 는 *"Chrome MCP 감지는 스킬이 한다. bin 스크립트는 MCP 도구 가용 여부를 알 수 없다"* 고 전제한다.

**불확실한 점**: 모델이 자신에게 어떤 MCP 도구가 있는지 **신뢰성 있게 판단**할 수 있는가. 도구가 deferred 상태면 이름만 보이고 스키마는 없다.

**완화**: 판단 실패 시 `userConfig.browser_adapter` 로 사용자가 명시 지정할 수 있게 이미 설계되어 있다(D01 §2). 최악의 경우 `insufficient` 로 정직 보고된다.

**조치**: M5 착수 시 실측. 실패하면 `browser_adapter` 기본값을 `auto` 에서 `ask` 로 바꾼다.

### A-3 · 훅 200ms 예산 달성 가능성 🟡 **미검증**

Node 프로세스 기동 비용만 30~60ms 다. 인덱스 파일이 8MB 면 `readFileSync` + `JSON.parse` 가 예산을 넘길 수 있다.

**완화 설계 (이미 반영됨)**
- 데드라인 가드로 초과 시 자체 중단 (D12 §6.1)
- fail-open 이므로 사용자를 막지 않음

**추가 완화 (미반영 — 필요 시)**
```
anchors.json 을 symbols.json 에서 분리해 작게 유지  ← 이미 분리됨
byPath 만 담은 초경량 인덱스를 별도 파일로
```

**조치**: W-3B 착수 시 `hook-latency.js` 로 실측. p99 > 200ms 면 인덱스 분할.

---

## 6. 구현 충분성 판정

### 6.1 마일스톤별

| M | 착수 가능 | 선행 필요 |
|---|---|---|
| **M0 스캐폴딩** | ✅ 즉시 | — |
| **M1 문서 시스템** | ✅ 즉시 | GAP-2(템플릿)는 이 마일스톤의 산출물 |
| **M2 사이클 엔진** | ✅ 즉시 | GAP-6(summary 초기값) 확정 — §3 제안 채택 시 즉시 |
| **M3 이해 계층** | 🟡 조건부 | GAP-10(타입 별칭) 확정 필요 |
| **M4 루프 검증** | ✅ | — |
| **M5 QA 게이트** | 🟡 조건부 | GAP-4(파일명), A-2(Chrome 감지) 확인 |
| **M6 회고** | 🟡 조건부 | GAP-7(master-plan 시점), GAP-11 |
| **M7 시크릿** | ✅ 즉시 | 가장 완결된 설계 |
| **M8 배포** | ✅ | — |

### 6.2 설계 밀도 평가

| 문서 | 밀도 | 판단 |
|---|---|---|
| D11 시크릿 | ★★★ | 정규식·판정표·240 케이스까지. **바로 구현 가능** |
| D08 QA | ★★★ | 교차 판정표·스키마·에이전트 프롬프트 완비 |
| D06 코드 인텔리전스 | ★★☆ | 정규식은 있으나 Q5 별칭 해석 미완 |
| D03 상태 | ★★★ | 스키마·원자성·복구까지 |
| D04 문서 계약 | ★★☆ | 파서·검증은 완비, **템플릿 실물 2/7** |
| D02 상태 기계 | ★★★ | 전이표·게이트 규칙·waiver 완비 |
| D05 스킬·훅 | ★★☆ | 훅은 완비, **스킬 본문은 로직만** |
| D07 루프 | ★★★ | 판정·수렴·미귀속까지 |
| D09 워크플로 | ★★★ | 스크립트 전문·스키마·degrade |
| D10 리포트 | ★★★ | R1~R6 알고리즘 전부 |
| D12 오류 | ★★★ | 오류표·잠금·마이그레이션 |
| D13 테스트 | ★★★ | 진리표·매트릭스·Eval 케이스 |

**약한 곳 3개**: D04(템플릿), D05(스킬 본문), D06(Q5). 전부 §3 에 갭으로 등록되어 있다.

### 6.3 종합

> **"이 문서로 구현을 시작할 수 있는가"** → **예.**
> **"이 문서만으로 끝까지 갈 수 있는가"** → **아니오.** M3·M5·M6 착수 시점에 §3~4 의 해당 갭을 확정해야 한다.

이건 설계 실패가 아니라 **의도된 상태다.** 템플릿 실물이나 스킬 본문은 문서로 미리 확정하는 것보다, 구현하면서 Dogfooding 피드백으로 다듬는 편이 낫다. 다만 **무엇이 미확정인지 알고 있어야** 하므로 이 문서로 추적한다.

---

## 7. 즉시 조치 권장 (착수 전)

| # | 조치 | 이유 | 비용 |
|---|---|---|---|
| 1 | **GAP-3 `light` profile 을 A안(파일 분리 유지)으로 확정** | 파서 설계 전체에 영향 | 문서 수정 10분 |
| 2 | **GAP-6 `summary` 초기값 확정** | M2 착수 즉시 필요 | 문서 수정 5분 |
| 3 | **A-1 을 D09 §6 에 명문화** | 스킬 본문에 반드시 들어가야 함 | 문서 수정 5분 |
| 4 | GAP-4 evidence 파일명 규칙 추가 | M5 전까지 | 문서 수정 5분 |

나머지 갭은 해당 마일스톤 착수 시 확정한다.

---

## 8. 재검증 절차

설계 문서를 수정할 때마다 다음을 실행한다.

```bash
cd docs

# 용어 일관성
grep -ho "G[0-7]\b" 00-prd/*.md 01-plan/*.md 02-design/*.md | sort | uniq -c
grep -c "not_measured\|trust_level\|max_check_loops" 00-prd/*.md 01-plan/*.md 02-design/*.md

# 식별자 대조
grep -ho "tene-\(state\|doc\|scan\|gate\|guard\|hook\)" 02-design/*.md | sort -u
grep -o "^| \`tene-[a-z-]*\`" 02-design/05*.md | sort -u

# 워크플로 이름
grep -A1 "export const meta" 02-design/09*.md | grep "name:"
```

**CI 에 넣을 가치가 있다.** 문서 정합성 검사를 `scripts/check-docs-consistency.js` 로 만들어 `validate.yml` 에 추가하는 것을 M8 에서 검토한다.
