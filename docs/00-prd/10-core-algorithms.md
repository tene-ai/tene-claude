# tene plugin — 핵심 알고리즘

> 대응 갭: G-b(일치율), G-c(AC 앵커링), G-g(문서 검증기)
> 목적: 문서에서 "산출한다"고 쓴 지표들의 **계산 방법을 확정**한다

---

## 1. Understanding Layer 판정

### 1.1 규칙 스캔 (`/tene:layers scan`)

프로젝트 구조에서 계층 규칙 초안을 만든다.

```
입력: 프로젝트 루트
1. 소스 디렉토리 수집
   · .gitignore 존중, 기본 제외(node_modules, dist, .git, vendor, …)
   · 소스 확장자를 가진 파일이 1개 이상인 디렉토리만
2. 디렉토리별 집계
   { path, fileCount, extensions[], importSignals[] }
3. 각 디렉토리를 기본 프리셋(02 §2.3-a)에 매칭
   · 경로 패턴 매칭 → 계층 후보
   · import 시그널 매칭 → 계층 후보 (가중치 낮음)
4. 매칭 결과를 계층별로 묶어 제안 생성
5. 미매칭 디렉토리를 "확인 필요" 목록으로 별도 제시
6. AskUserQuestion 으로 확인 → docs/sprints/_meta/layers.yml 저장
```

**제안 출력 예**
```
interface      ← src/app/**, src/components/**          (87 files)
business-logic ← src/services/**, src/lib/**            (34 files)
persistence    ← src/db/**, prisma/**                   (12 files)
infrastructure ← src/config/**, .github/workflows/**    (8 files)

확인 필요 (규칙 미매칭):
  src/utils/**   (28 files)  — 유틸리티. business-logic? 아니면 미분류 유지?
  src/types/**   (13 files)  — 타입 정의. 미분류 유지 권장
```

> **미매칭을 임의로 배정하지 않고 사용자에게 묻는다.** `src/utils/` 를 business-logic 으로 자동 배정하면, 이후 모든 계층 통계가 왜곡된다.

### 1.2 파일 → 계층 판정

```
judgeLayer(filePath):
  1. 프로젝트 규칙(layers.yml) 경로 패턴 매칭
     → 매칭 시 { layer, source: "rules-project", confidence: "high" }
  2. 기본 프리셋 경로 패턴 매칭
     → 매칭 시 { layer, source: "rules-default", confidence: "medium" }
  3. import 시그널 판정
     → 파일의 import 목록 ∩ 계층별 import 패턴
     → 단독 매칭 시 { layer, source: "imports", confidence: "low" }
     → 복수 계층 매칭 시 precedence 순서로 결정, confidence: "low"
  4. 전부 실패
     → { layer: null, source: "unclassified", suggestion: "<dir>/** 추가 검토" }

precedence (충돌 시): interface > persistence > infrastructure > business-logic
```

**precedence 근거**: 한 파일이 여러 계층에 걸치면 **가장 바깥 계층으로 본다.** 컨트롤러가 DB를 직접 만지면 그건 interface 파일에서 일어난 계층 위반이지, persistence 파일이 아니다.

### 1.3 계층 위반 탐지

```
detectViolations(symbols, refs):
  for each ref (from → to):
    fromLayer = judgeLayer(ref.fromFile)
    toLayer   = judgeLayer(ref.toFile)

    layer-skip:  interface → persistence          (business-logic 을 건너뜀)
    reverse:     persistence → interface|business-logic  (역방향 의존)
    infra-leak:  business-logic → infrastructure  (경고 수준, 프로젝트에 따라 정상)

  각 위반에 confidence 를 붙인다:
    양쪽 계층이 rules-project → high
    한쪽이라도 imports/rules-default → medium
    한쪽이라도 unclassified → 위반 판정 자체를 하지 않음 (오탐 방지)
```

> **미분류가 끼면 위반 판정을 하지 않는다.** 계층을 모르는 채 위반을 주장하면 신뢰를 잃는다.

---

## 2. 일치율 (Match Rate) — G5의 핵심

### 2.1 요구 항목의 정의

일치율의 **분모**는 문서에서 추출한 "요구 항목"이다.

| 출처 | 항목 유형 | 추출 방법 |
|---|---|---|
| PRD | 수용 기준 | AC 표의 각 행 |
| Plan | 작업 항목 | 작업 표의 각 행 (T1..Tn) |
| Design | 처리 로직 | §4 처리 로직 상세의 각 소절 |
| Design | 계층 배치 | §2 4계층 표의 각 행 |
| Design | 화면 전이 | §7 엣지 표의 각 행 |
| Design | 데이터 계약 | §6 계약 표의 각 행 |

```
requirements = extract(prd.ac) ∪ extract(plan.tasks) ∪ extract(design.{logic,layers,edges,contracts})
```

### 2.2 항목별 판정

```
judgeItem(item):
  1.0  implemented   구현 확인됨. 근거 file:line 필수
  0.5  partial       일부만 구현. 무엇이 빠졌는지 명시 필수
  0.0  missing       구현 안 됨. "확인했으나 없음"의 근거 필수
  --   unverifiable  확인 불가. 분모에서 제외 + 사유 필수
```

**`unverifiable` 을 분모에서 빼는 이유**: 확인할 수 없는 것을 0으로 세면 일치율이 영원히 100%가 되지 않는다. 대신 **일치율과 함께 `unverifiable` 개수를 항상 병기**한다.

### 2.3 산출식

```
verifiable = requirements − unverifiable
matchRate  = ( Σ score(item) / |verifiable| ) × 100        (verifiable > 0)
           = null                                          (verifiable == 0)

보고 형식:
  "일치율 87% (13.0 / 15) · 확인 불가 2건"
```

### 2.4 반복 루프

```
loop(n):
  1. n > max_loop_checks → 정지, 사용자 결정 요청 (D11)
  2. matchRate 계산
  3. matchRate ≥ match_target → G5 pass
  4. 미달:
     a. score < 1.0 인 항목을 갭으로 수집
     b. 각 갭에 조치 제안 생성
     c. TaskCreate 로 개선 태스크 생성
     d. check-<n>.md 작성
     e. 사용자/모델이 구현 → /tene:loop-check 재호출 → loop(n+1)

수렴 감지:
  연속 2회 matchRate 가 개선되지 않으면 (Δ < 1%p)
  → "진전이 없습니다" 경고 + 원인 분석 제시 후 정지
```

**수렴 감지가 필요한 이유**: 상한 3회를 다 쓰는 것보다, 2회 연속 제자리면 접근법 자체가 잘못된 것이다. 조기에 사람을 부르는 편이 싸다.

### 2.5 무결성 규칙

| 규칙 | 이유 |
|---|---|
| 일치율을 올리려고 **요구 항목을 제외하지 않는다** | 범위 축소는 사용자 승인 사항 |
| 근거 없는 `implemented` 판정 금지 | "아마 되어 있을 것"은 `unverifiable` |
| 요구 항목을 재해석해 통과시키지 않는다 | 문서 문장 그대로 판정 |
| check 를 실행한 주체가 **코드를 고치지 않는다** | 자기 작업을 자기가 통과시키는 것 방지 |

---

## 3. AC 앵커링

### 3.1 앵커의 정의

```jsonc
{
  "ac": "AC-2",
  "anchors": [
    { "kind": "symbol",   "value": "processPayment",     "file": "src/payments/processPayment.ts", "confidence": "high" },
    { "kind": "symbol",   "value": "paymentsRepo.markFailed", "file": "src/db/payments.ts",        "confidence": "medium" },
    { "kind": "endpoint", "value": "POST /api/v1/payments", "file": "src/api/routes/payments.ts",  "confidence": "medium" },
    { "kind": "screen",   "value": "CheckoutPage",        "file": "src/pages/CheckoutPage.tsx",    "confidence": "high" }
  ],
  "resolvedAt": "design",     // design | do | manual
  "source": "indexed"
}
```

### 3.2 3단계 앵커링 (D9: 혼합 방식)

```
Stage 1 · design 시점 — 예상 앵커
  입력: AC 문장 + plan 의 작업 항목
  1. AC 문장에서 명사구 후보 추출
     · 백틱으로 감싼 식별자 → 직접 심볼 후보
     · 화면/페이지 명칭 → screen 후보
     · HTTP 메서드+경로 패턴 → endpoint 후보
     · 테이블/엔티티 명칭 → persistence 대상
  2. plan 의 작업 항목이 이 AC 를 커버한다고 선언했으면, 그 작업의 대상 심볼을 후보에 추가
  3. tene-scan defs 로 각 후보를 실제 심볼로 해석
  4. 해석 실패 후보 → "미해결 앵커"로 남기고 사용자 확인 요청
  → confidence: medium (아직 구현 전이므로)

Stage 2 · do 이후 — 실측 교정
  1. git diff 로 이번 sprint 변경 파일 수집
  2. 각 변경 파일의 심볼을 Stage 1 앵커와 대조
  3. 예상에 없던 변경 파일 발견 → 어느 AC 에 속하는지 판단 후 앵커 추가
     판단 불가 → "미귀속 변경"으로 loop-check 단계에 보고
  4. 예상했으나 변경되지 않은 앵커 → 해당 AC 가 미구현일 가능성 → check 에 보고
  → confidence: high

Stage 3 · 수동 교정
  사용자가 문서의 AC 표 "앵커" 열을 직접 편집하면 그것이 최우선
  → source: "human", confidence: "high", 자동 갱신 대상에서 제외
```

### 3.3 미귀속 변경의 처리

```
이번 sprint 에서 변경되었으나 어떤 AC 에도 앵커되지 않은 파일
  → check 문서에 "미귀속 변경" 섹션으로 보고
  → 세 가지 중 하나로 해소해야 한다:
     a. 어떤 AC 의 앵커로 추가 (누락된 앵커였음)
     b. 새 AC 로 승격 (PRD 에 없던 요구가 구현됨 → 범위 확장, 사용자 확인)
     c. 무관 변경으로 표시 (리팩터링·오타 수정 등, 사유 기록)
```

**이 검사가 "스펙에 없는 것이 슬쩍 들어오는 것"을 막는다.** spec driven 을 강제하는 실질적 장치 중 하나다.

### 3.4 stale 마킹

```
PostToolUse:Edit|Write 훅
  1. tool_input.file_path 를 anchors.json 의 byPath 로 O(1) 조회
  2. 매칭된 AC 들 중 status ∈ {pass} 인 것만 stale 로 전환
     (fail/insufficient 는 이미 미통과이므로 변경 없음)
  3. events.ndjson 에 기록
  4. additionalContext 로 알림:
     "[tene] src/payments/processPayment.ts 변경 → AC-2 재검증 필요 (pass → stale)"
```

**`pass` 만 `stale` 로 바꾸는 이유**: 이미 `fail` 인 것을 `stale` 로 바꾸면 실패 사실이 가려진다.

---

## 4. 전이 커버리지

### 4.1 분모 — 설계된 엣지

```
design 문서 §7 화면 전이 표의 각 행 = 엣지 1개
  { from, to, trigger, targetAC }

mermaid 다이어그램은 시각화용이며 분모의 근거가 아니다.
표가 정본이다. (파싱 안정성 + 사람 편집 용이성)
```

### 4.2 분자 — 측정된 엣지

```
qa 단계에서 브라우저 시나리오 실행 시:
  각 엣지에 대해
    1. from 상태로 진입
    2. trigger 수행
    3. to 상태 도달 확인
    4. 증거 저장 (스크린샷/GIF + 콘솔 + 네트워크)
  → 도달 확인 성공 = 측정됨 (결과가 pass 든 fail 이든)
  → 실행 자체가 불가 = 미측정
```

### 4.3 산출

```
transitionCoverage = 측정된 엣지 수 / 설계된 엣지 수 × 100

보고:
  "전이 커버리지 3/5 (60%) · 미측정 2건
     Processing → ErrorPage  — 5xx 재현 불가
     Processing → Timeout    — 지연 주입 도구 없음"
```

### 4.4 되돌아오는 경로의 별도 집계

PRD R4 에서 캐낸 항목들은 **엣지 표와 별개로** 체크리스트로 관리한다.

| 시나리오 | 필수 여부 |
|---|---|
| 뒤로가기 후 상태 보존 | UX AC 가 있으면 필수 |
| 새로고침 후 복구 | 필수 |
| 중복 제출 방지 | 폼 제출이 있으면 필수 |
| 실패 후 재시도 | 실패 경로가 설계되어 있으면 필수 |

이 4종은 **설계 엣지에 없어도 검증한다.** 설계에서 빠뜨리기 쉬운 영역이기 때문이다. 미측정 시 `insufficient` 로 보고한다.

---

## 5. Report 자동 생성 알고리즘

### 5.1 R1 — 이전 sprint 연결

```
1. master-plan.json 에서 이 sprint 의 dependsOn 목록 + 시간순 직전 archived sprint 수집
2. 각 이전 sprint 의 report R2 에서 산출 심볼 목록 추출
3. 이번 sprint 의 변경 심볼과 대조:
   a. 이번 변경이 이전 심볼을 참조/호출 → "확장 관계"
   b. 이번 변경이 이전 심볼을 수정      → "직접 수정 관계"
   c. 이전 심볼이 더 이상 참조되지 않음 → "연결 끊김" ← 반드시 보고
4. 각 관계에 근거(refs/callers 질의 결과) 첨부
```

**c(연결 끊김)가 R1의 진짜 가치다.** 이전 sprint 산출물이 이번 변경으로 고아가 되는 것을 잡는다.

### 5.2 R2 — 파일 변경

```
1. git diff --stat <sprint 시작 커밋>..HEAD
   (시작 커밋은 sprint init 시 상태에 기록)
2. 각 파일에 계층 판정 부착
3. 각 파일의 변경 심볼 추출 (tene-scan defs 를 변경 전후로 비교)
4. 구현 내용 서술은 LLM 이 diff 를 읽고 작성
```

### 5.3 R3 — 의도 충족 매핑

```
1. anchors.json 을 AC → 심볼 방향으로 순회
2. 각 AC 에 대해:
   · PRD 의 AC 문장
   · PRD §1~§2 에서 그 AC 와 관련된 의도 문장 (LLM 이 선택)
   · 앵커된 심볼과 그 구현 요지
3. "의도와 다르게 구현된 것" — check 문서의 partial 판정 항목 중
   구현은 되었으나 설계와 다른 것을 수집
```

### 5.4 R5 — 6가지 질문

```
대상 = 이번 sprint 에서 신규/수정된 심볼 중,
       AC 에 앵커된 것 ∪ 계층이 business-logic 또는 persistence 인 것

각 대상에 tene-scan questions 실행 → 표 렌더링

상한: 20개. 초과 시 앵커된 것 우선, 나머지는 "그 외 N개" 로 요약하고
      전체 목록은 별도 파일로 저장 (04-report/questions-full.md)
```

**상한을 두는 이유**: 100개 심볼의 6질문 표는 아무도 읽지 않는다. 읽히지 않는 문서는 방어 장치가 아니다.

---

## 6. 문서 검증기 (다국어 대응)

### 6.1 문제

문서 섹션 제목을 사용자 언어로 생성하면(`## 3. 범위 밖` vs `## 3. Non-goals`), 제목 문자열로 검증할 수 없다.

### 6.2 해법 — 앵커 주석

각 필수 섹션에 **언어 무관 앵커**를 심는다.

```markdown
## 3. 범위 밖 (Non-goals)     <!-- tene:sec=nongoals -->

- 이번에 하지 않을 것과 그 이유
```

검증기는 `<!-- tene:sec=<id> -->` 만 본다. 제목 문자열은 보지 않는다.

**HTML 주석은 컨텍스트 주입 전에 제거되므로 토큰 비용이 0이다.** (Claude Code가 블록 레벨 HTML 주석을 스트립한다)

### 6.3 섹션 ID 표

| 문서 | 섹션 ID |
|---|---|
| prd | `background`, `goals`, `nongoals`, `uxflow`, `dataflow`, `ac`, `decisions` |
| plan | `tasks`, `coverage`, `impact`, `order`, `risks`, `notdoing` |
| design | `overview`, `layers`, `violations`, `logic`, `questions`, `contracts`, `transitions`, `anchors` |
| analysis | `verdict`, `comparison`, `layercheck`, `debt`, `fixes`, `notdone` |
| qa | `gate`, `environment`, `acverdicts`, `uxflow`, `dataflow`, `unit`, `notmeasured`, `followup` |
| report | `summary`, `r1`, `r2`, `r3`, `r4`, `r5`, `r6` |
| master-plan | `status`, `goal`, `sprints`, `dependencies`, `constraints`, `carry` |

### 6.4 검증 절차

```
validate(doc, type):
  1. frontmatter 파싱 → tene.* 필드 확인
  2. 본문에서 <!-- tene:sec=... --> 앵커 수집
  3. 필수 섹션 ID 전부 존재? → 없으면 fail + 누락 목록
  4. 섹션별 내용 검사 (아래 표)
  5. `## +@` 로 시작하는 섹션은 무시 (자유 관점)
  6. 자동 생성 블록 무결성: start/end 쌍이 맞는가
```

### 6.5 섹션별 내용 검사

| 검사 ID | 대상 | 조건 |
|---|---|---|
| `nongoals_nonempty` | prd.nongoals | 본문이 비어 있지 않음 (공백·플레이스홀더 제외) |
| `ac_count` | prd.ac | 표 행 ≥ 1 |
| `ac_method` | prd.ac | 모든 행의 방식 ∈ {UNIT, DATA, UX} |
| `ac_unwanted` | prd.ac | If-then 패턴 행 ≥ 1 |
| `ac_no_adjective` | prd.ac | 금지 형용사 목록 미포함 (빠르게/직관적/적절히/잘/충분히) |
| `coverage_full` | plan.coverage | uncovered 행 = 0 |
| `layers_all_four` | design.layers | 4개 하위 섹션 전부 존재 (내용이 "해당 없음"이어도 OK) |
| `questions_present` | design.questions | 표 ≥ 1 |
| `edges_present` | design.transitions | UX AC 가 있으면 표 행 ≥ 1 |
| `anchors_resolved` | design.anchors | 모든 AC 에 앵커 ≥ 1 |
| `verdict_numeric` | analysis.verdict | 일치율 수치 존재 |
| `all_ac_judged` | qa.acverdicts | 모든 AC 에 verdict 존재 |
| `notmeasured_reason` | qa.notmeasured | 각 항목에 사유 존재 |
| `r1_to_r6` | report.r1~r6 | 6개 섹션 전부 존재, 각 비어있지 않음 |
| `r4_all_four` | report.r4 | 4계층 전부 기재 |
| `r6_reasons` | report.r6 | 각 이월 항목에 사유 존재 |

### 6.6 플레이스홀더 탐지

템플릿을 채우지 않고 그대로 둔 것을 잡는다.

```
placeholder 패턴: <...>, TODO, TBD, (작성 필요), ...
필수 섹션에 이 패턴만 있으면 → 비어 있는 것으로 간주
```

---

## 7. 알고리즘 무결성 원칙 (요약)

| # | 원칙 | 적용 지점 |
|---|---|---|
| 1 | 모르는 것을 채우지 않는다 | 계층 미분류, unverifiable, insufficient |
| 2 | 분모를 줄여 지표를 올리지 않는다 | 일치율, 전이 커버리지 |
| 3 | 미확인과 실패를 구분한다 | unverifiable ≠ missing, insufficient ≠ fail |
| 4 | 판정자와 구현자를 분리한다 | check(코드 수정 금지), qa(수집≠판정) |
| 5 | 근거 없는 판정을 금지한다 | 모든 implemented/pass 에 file:line 또는 증거 경로 |
| 6 | 사람의 편집을 최우선한다 | 앵커 Stage 3, 자동 생성 블록 밖은 불가침 |
| 7 | 읽히지 않을 분량을 만들지 않는다 | R5 상한 20개, MEMORY.md 200줄 |
