---
tene:
  sprint: {{sprint}}
  doc: prd
  phase: prd
  status: draft
  created: {{today}}
  modified: {{today}}
  lang: ko
  profile: {{profile}}
---

# {{title}} — PRD

## 1. 배경과 문제     <!-- tene:sec=background -->

<지금 무엇이 불편한가. 방치하면 무슨 일이 생기는가>

## 2. 목표     <!-- tene:sec=goals -->

<이 sprint 가 달성하려는 것. 성공을 무엇으로 확인하는가>

## 3. 범위 밖 (Non-goals)     <!-- tene:sec=nongoals -->

> ⚠️ 필수. 비어 있으면 G1 게이트가 막습니다. "없음" 이라도 명시적으로 적으세요.

<이번에 하지 않을 것과 그 이유>

## 4. 기획 의도 (Intent)     <!-- tene:sec=intents -->

| ID | 의도 | 근거 | 행위자 | 출처 |
|---|---|---|---|---|
| intent_1 | <무엇을 달성하려는가> | <왜> | <누가> | conversation |

## 5. 사용자 흐름 (UX Flow)     <!-- tene:sec=uxflow -->

### 정상 경로
<시작 → 진행 → 종료>

### 실패 경로
<어디서 실패하고 어디로 가는가>

### 되돌아오는 경로
<뒤로가기 / 새로고침 / 중복 제출 / 재시도>

## 6. 데이터 처리 흐름     <!-- tene:sec=dataflow -->

<입력이 어디서 발생해 어디에 남는가. 실패 시 데이터는 남는가 안 남는가>

## 7. 수용 기준 (AC)     <!-- tene:sec=ac -->

| ID | 기준 (EARS) | 우선도 | 방식 | 앵커 | 상태 |
|---|---|---|---|---|---|
| ac_1 | **When** <트리거>, 시스템은 <응답> 해야 한다 | blocking | UX | (design 에서) | pending |
| ac_2 | **If** <조건>, **then** 시스템은 <응답> 해야 한다 | blocking | DATA | | pending |

> 규칙: EARS 5패턴만 · 하나의 AC 는 하나의 판정 · **If-then 최소 1개** · 모호 형용사 금지
> 우선도: blocking(게이트를 막음) / non-blocking(점수로만 반영)
> 방식: UNIT(테스트) / DATA(데이터 흐름) / UX(화면 전이)

## 8. 열린 결정 사항     <!-- tene:sec=decisions -->

| # | 결정할 것 | 선택지 | 기본 제안 | 결정자 |
|---|---|---|---|---|

## +@ (자유 관점)
