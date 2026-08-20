---
name: conventions
description: 이 프로젝트의 문서·코드 관례를 알려준다. tene 문서를 읽거나 쓸 때 모델이 참조한다.
paths: docs/sprints/**
user-invocable: false
allowed-tools: Read Glob
metadata:
  tene:
    phase: null
    standalone: true
---

# tene 관례

이 스킬은 사용자가 부르지 않는다. tene 문서를 다룰 때 모델이 참조한다.

## 문서 구조

```
docs/sprints/<id>-<slug>/
├── 00-prd/prd.md
├── 01-plan/plan.md
├── 02-design/design.md
├── 03-analysis/loop-check-<n>.md, qa.md, evidence/
└── 04-report/report.md
```

`_archive/<YYYY-MM>/` 아래로 옮겨진 것은 종료된 sprint 다.

## 섹션 앵커

모든 필수 섹션에 HTML 주석 앵커가 있다.

```markdown
## 3. 범위 밖 (Non-goals)     <!-- tene:sec=nongoals -->
```

- **앵커로 섹션을 찾는다.** 제목 문자열로 찾지 않는다 — 문서 언어가 바뀌어도 앵커는 같다
- 앵커를 지우거나 바꾸지 않는다. 지우면 검증기가 섹션을 못 찾아 게이트가 막는다
- 새 섹션에 앵커를 임의로 만들지 않는다. 자유 섹션은 `## +@ <제목>` 으로 쓴다

## 자동 생성 블록

```markdown
<!-- tene:auto:start block=layers -->
(기계가 채우는 영역)
<!-- tene:auto:end -->
```

- **블록 안을 손으로 고치지 않는다.** 다음 갱신에서 덮인다
- 사람이 쓸 말은 블록 **밖**에 쓴다
- start/end 쌍이 맞지 않으면 검증이 실패한다

## 수용 기준 (EARS)

다섯 패턴만 쓴다.

| 패턴 | 형태 |
|---|---|
| Ubiquitous | 시스템은 항상 ~해야 한다 |
| Event-driven | **When** ~할 때, 시스템은 ~해야 한다 |
| State-driven | **While** ~인 동안, 시스템은 ~해야 한다 |
| **Unwanted** | **If** ~라면, **then** 시스템은 ~해야 한다 |
| Optional | **Where** ~인 경우, 시스템은 ~해야 한다 |

- **If-then 이 최소 1개 필요하다.** 실패 조건이 없는 기획은 실패를 생각하지 않은 기획이다
- 판정할 수 없는 형용사를 쓰지 않는다: "빠르게", "직관적으로", "적절히", "자연스럽게"
- 각 AC 에 `priority`(blocking|non-blocking)와 `method`(UNIT|DATA|UX)를 붙인다

## 판정 어휘

혼용하지 않는다. 각각 다른 뜻이다.

| 값 | 뜻 |
|---|---|
| `passed` | 증거가 충족을 증명 |
| `failed` | 증거가 위반을 증명 |
| `insufficient` | **모른다** — 증거가 없거나 불충분 |
| `not-applicable` | 해당 없음 (사유 필수) |
| `stale` | 코드가 바뀌어 판정이 무효 |

`insufficient` 를 `passed` 로 쓰지 않는다. `not-applicable` 과도 다르다 — 전자는 갖추면 측정되고 후자는 영영 대상이 아니다.

## "100%" 의 뜻

**백분율이 아니다.** blocking 항목이 전부 증거와 함께 통과했다는 뜻이다.

백분율은 분모를 줄이거나 평균으로 희석해 조작된다. 그래서 게이트는 백분율을 보지 않는다.

## 계층 (Understanding Layer)

| 계층 | 무엇 |
|---|---|
| Interface | 진입점 — 외부에서 들어오는 자리 |
| Business Logic | 처리 규칙 — 이 시스템이 무엇을 하는지 |
| Persistence | 데이터 — 상태가 사는 곳 |
| Infrastructure | 런타임 — 돌아가기 위한 조건 |

- **네 계층을 모두 기재한다.** 비면 "해당 없음" 이라고 쓴다
- 규칙에 없는 파일은 `unclassified` 로 남긴다. 추측으로 배정하지 않는다

## 시크릿

- `tene get` / `tene export`(비암호화) 를 실행하지 않는다
- `.tene/` 를 읽지 않는다 (`.tene-claude/` 는 상태 디렉토리로 읽어도 된다)
- 시크릿 값을 CLI 인자로 넘기지 않는다
