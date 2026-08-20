---
tene:
  sprint: {{sprint}}
  doc: design
  phase: design
  status: draft
  created: {{today}}
  modified: {{today}}
  lang: ko
  profile: {{profile}}
  cia: pending
---

# {{title}} — Design

## 1. 설계 개요     <!-- tene:sec=overview -->

<무엇을 어떻게 만드는지 한 문단>

## 2. Understanding Layer 분류     <!-- tene:sec=layers -->

<!-- tene:auto:start block=layers -->
### Interface (Entry Point)
| 대상 | 파일 | 신규/수정 | 출처 |
|---|---|---|---|

### Business Logic (Processing rules)
| 대상 | 파일 | 신규/수정 | 출처 |
|---|---|---|---|

### Persistence (Data)
| 대상 | 파일 | 신규/수정 | 출처 |
|---|---|---|---|

### Infrastructure (Runtime)
| 대상 | 파일 | 신규/수정 | 출처 |
|---|---|---|---|

### 미분류 (규칙에 매칭되지 않음)
| 대상 | 파일 | 사유 |
|---|---|---|
<!-- tene:auto:end -->

> 4계층 각각에 "해당 없음" 을 포함해 반드시 기재합니다. 비우면 G3 게이트가 막습니다.

## 3. 계층 위반 점검     <!-- tene:sec=violations -->

<!-- tene:auto:start block=violations -->
| 종류 | 내용 | 근거 |
|---|---|---|
<!-- tene:auto:end -->

## 4. 처리 로직 상세     <!-- tene:sec=logic -->

### <로직명>
<입력 → 처리 → 출력. 분기 조건과 각 분기의 결과. 실패 처리와 부작용>

## 5. 6가지 질문     <!-- tene:sec=questions -->

<!-- tene:auto:start block=questions -->
### `<symbol>`
| 질문 | 답변 | 출처 |
|---|---|---|
| Q1 선언·정의된 이름 | | |
| Q2 정의 파일 | | |
| Q3 import·참조 위치 | | |
| Q4 호출·사용 위치 | | |
| Q5 입력 데이터 형태 | | |
| Q6 반환·변경 데이터 | | |
<!-- tene:auto:end -->

### 이 답변에서 드러난 것
<설계에 없던 참조·호출 경로, orphan 심볼, 계층 위반 등>

## 6. 데이터 계약     <!-- tene:sec=contracts -->

| 대상 | 입력 스키마 | 출력 스키마 | 출처 |
|---|---|---|---|

## 7. 화면 전이 설계     <!-- tene:sec=transitions -->

| 엣지 | 트리거 | 대상 AC |
|---|---|---|
| <A> → <B> | <행위> | ac_1 |

> 이 표의 엣지 수가 QA 전이 커버리지의 분모가 됩니다.

## 8. AC 앵커 확정     <!-- tene:sec=anchors -->

| AC | 앵커 |
|---|---|
| ac_1 | `<symbol>` |

## +@ (자유 관점)
