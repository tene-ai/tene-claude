---
name: master-plan
description: 여러 sprint 의 순서와 의존, 이월 항목을 관리한다. 다음에 무엇을 할지 정한다.
when_to_use: "전체 계획, 로드맵, sprint 순서, 다음에 뭐 할까, master plan, 의존 관계, 이월 정리, 남은 일"
argument-hint: "[status|next|order|carry]"
allowed-tools: Read Write Edit Glob Bash(${CLAUDE_PLUGIN_ROOT}/bin/*) AskUserQuestion
metadata:
  tene:
    phase: null
    standalone: true
---

# tene:master-plan — 다중 sprint 관리

<!-- 스킬이 로드될 때 자동 실행된다. 모델이 "먼저 확인하라" 를 따를 확률에 기대지 않는다. -->

## 현재 sprint 상태

!`"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" read 2>/dev/null || echo '{"ok":false,"note":"상태 없음"}'`


## 언제 적용되는가

sprint 여러 개를 계획하거나, 다음에 무엇을 할지 정할 때. 활성 sprint 가 없을 때 자연스럽게 여기로 온다.

## 수행 규칙

1. **의존은 사람이 선언한다.** 자동 추론하지 않는다 — 코드 의존과 작업 순서는 다르다.
2. **선행이 끝나지 않으면 추천하지 않는다.** 순서를 무시하면 의존이 깨진 채로 시작된다.
3. **이월 항목이 막는 것을 알린다.** 열린 결정 사항이 다음 sprint 를 막으면 그것부터 정하게 한다.
4. **이월을 임의로 닫지 않는다.** 해결됐다는 판단은 사용자가 한다.

## 하위 명령

### `status` (기본)

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-state" list
"${CLAUDE_PLUGIN_ROOT}/bin/tene-report" carry
```

전체 sprint 현황과 열린 이월을 보여준다.

### `next`

다음에 할 sprint 를 추천한다. 판단 기준:

```
1. 진행 중인 sprint 가 있으면 그것
2. 선행이 전부 archived 인 planned sprint 중 order 가 가장 앞선 것
3. 그 sprint 를 막는 열린 이월이 있으면 함께 알린다
```

**막혀 있어도 후보로는 낸다.** 무엇을 먼저 해결해야 하는지 알려주는 것이 목적이다.

### `order`

sprint 순서와 의존을 조정한다. `master-plan.md` 의 표를 고치고 상태에 반영한다.

### `carry`

이월 항목을 정리한다. 각 항목마다:
- 해결됐으면 `resolved` 로 표시 (사용자 확인 필수)
- 다음 sprint 의 AC 로 승격
- 여전히 미결이면 그대로 둔다

## 출력 형식

```
[tene:master-plan] 결제 개선

  진행    payment-core ✅ archived   checkout-retry ✅ archived
          refund-flow ⬜ planned     settlement ⬜ planned

  다음    refund-flow (선행 payment-core 완료)
          ⚠️ 이월 [decision] 재시도 잡의 멱등키 정책 이 이 sprint 를 막습니다

열린 이월 3건
  | 출처 | 종류 | 항목 | 차단 |
  | checkout-retry | decision | 멱등키 정책 | refund-flow |
  | checkout-retry | unmeasured | ac_3 테스트 러너 없음 | — |
```

## 하지 않는 것

- 의존을 코드에서 추론하지 않는다
- 선행 미완료 sprint 를 추천하지 않는다
- 이월 항목을 임의로 닫지 않는다
- sprint 를 자동으로 만들지 않는다 (`/tene:sprint init` 은 사용자가 부른다)
