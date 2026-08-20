---
tene:
  sprint: {{sprint}}
  doc: report
  phase: report
  status: draft
  created: {{today}}
  modified: {{today}}
  lang: ko
---

# {{title}} — Sprint Report

## 0. 요약     <!-- tene:sec=summary -->

<!-- tene:auto:start block=summary -->
| 항목 | 값 |
|---|---|
<!-- tene:auto:end -->

## R1. 이전 sprint 와의 연결     <!-- tene:sec=r1 -->

| 이전 sprint | 산출물 | 관계 | 근거 |
|---|---|---|---|

### 연결이 끊긴 지점
<이전 sprint 산출물 중 이번 변경으로 사용되지 않게 된 것. 없으면 "해당 없음">

## R2. 생성·수정한 파일과 구현 내용     <!-- tene:sec=r2 -->

<!-- tene:auto:start block=r2 -->
| 파일 | 변경 | 계층 | 심볼 |
|---|---|---|---|
<!-- tene:auto:end -->

### 구현 내용
<어떻게 구현했는지 서술>

## R3. 기획 의도 충족 매핑     <!-- tene:sec=r3 -->

| 구현 | 충족한 AC | 기획 의도 |
|---|---|---|

### 의도와 다르게 구현된 것
<있으면 승인 여부와 함께. 없으면 "해당 없음">

## R4. Understanding Layer 기준 작업 내역     <!-- tene:sec=r4 -->

<!-- tene:auto:start block=r4 -->
### Interface (Entry Point)
### Business Logic (Processing rules)
### Persistence (Data)
### Infrastructure (Runtime)
### 미분류
<!-- tene:auto:end -->

### 계층 균형 평가
<쏠림이 있는가. 타당한가>

## R5. 6가지 질문 답변     <!-- tene:sec=r5 -->

<!-- tene:auto:start block=r5 -->
<!-- tene:auto:end -->

### 이 답변에서 드러난 것
<설계에 없던 경로, orphan, 계층 위반. 발견은 R6 으로 이월>

## R6. 사용자 결정 대기 · 이월 작업     <!-- tene:sec=r6 -->

### 결정이 필요한 정책
| # | 결정할 것 | 선택지 | 영향 | 왜 지금 정해야 하나 |
|---|---|---|---|---|

### 이월 작업
| # | 작업 | 왜 이번에 하지 않았나 | 언제 할 것인가 |
|---|---|---|---|

### 예외 승인 (waiver)
| # | 대상 | 사유 | 만료 |
|---|---|---|---|

> 사유 없는 이월은 G7 게이트가 막습니다.

## +@ (자유 회고)
