---
tene:
  sprint: {{sprint}}
  doc: qa
  phase: qa
  status: draft
  created: {{today}}
  modified: {{today}}
  lang: ko
---

# {{title}} — QA

## 1. 게이트 판정     <!-- tene:sec=gate -->

<!-- tene:auto:start block=gate -->
| 항목 | 값 |
|---|---|
| blocking AC | — |
| non-blocking AC | — |
| stale | — |
| **게이트 G6** | — |
| 전이 커버리지 | — |
<!-- tene:auto:end -->

> G6: blocking AC 전부 `passed` + 증거 유효 + stale 0.
> `insufficient` 는 게이트를 막지 않으나 report R6 에 반드시 기록됩니다.

## 2. 검증 환경     <!-- tene:sec=environment -->

<!-- tene:auto:start block=environment -->
| 도구 | 가용 | 비고 |
|---|---|---|
<!-- tene:auto:end -->

## 3. Test Charter     <!-- tene:sec=charters -->

| ID | AC | 행위자 | 변형 | 필요 레이어 | 위험 |
|---|---|---|---|---|---|

## 4. AC 별 판정     <!-- tene:sec=acverdicts -->

<!-- tene:auto:start block=acverdicts -->
| AC | 우선도 | 방식 | 판정 | 증거 | 반박 검증 |
|---|---|---|---|---|---|
<!-- tene:auto:end -->

## 5. UX 흐름 검증     <!-- tene:sec=uxflow -->

<!-- tene:auto:start block=uxflow -->
### 전이 커버리지
| 엣지 | 측정 | 결과 | 증거 |
|---|---|---|---|

### 되돌아오는 경로
| 시나리오 | 결과 |
|---|---|
| 뒤로가기 후 상태 보존 | — |
| 새로고침 후 복구 | — |
| 중복 제출 방지 | — |
| 실패 후 재시도 | — |
<!-- tene:auto:end -->

## 6. 데이터 처리 흐름 검증     <!-- tene:sec=dataflow -->

| 검증 | 정적 확인 | 동적 확인 | 교차 판정 |
|---|---|---|---|

## 7. 7-Layer 처리     <!-- tene:sec=layers -->

<!-- tene:auto:start block=layers -->
| Layer | 처리 | 사유 |
|---|---|---|
| L1 Static | — | |
| L2 Unit/Contract | — | |
| L3 Integration/Data | — | |
| L4 System E2E | — | |
| L5 Intent/UX | — | |
| L6 Adversarial/Recovery | — | |
| L7 Regression/Drift | — | |
<!-- tene:auto:end -->

## 8. 미측정 항목     <!-- tene:sec=insufficient -->

| 항목 | 사유 | 측정하려면 |
|---|---|---|

> ⚠️ 미측정을 0% 또는 passed 로 표기하지 않습니다.

## 9. 후속 조치     <!-- tene:sec=followup -->

| # | 조치 | 대상 | 우선순위 |
|---|---|---|---|

## +@ (자유 관점)
