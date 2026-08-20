---
name: layers
description: 코드베이스를 Understanding Layer 4계층으로 분류하고 계층 위반을 찾는다. 규칙에 없는 파일은 추측하지 않고 미분류로 남긴다.
when_to_use: "계층 분류, 아키텍처 확인, 레이어, 계층 위반, 구조 파악, layers, 어느 계층, 계층 규칙, 레이어 규칙 만들어"
argument-hint: "scan|show|violations|edit [--sprint <id>]"
allowed-tools: Read Write Edit Glob Grep Bash(${CLAUDE_PLUGIN_ROOT}/bin/*) AskUserQuestion
metadata:
  tene:
    phase: null
    standalone: true
---

# tene:layers — 4계층 분류

<!-- 스킬이 로드될 때 자동 실행된다. 모델이 "먼저 확인하라" 를 따를 확률에 기대지 않는다. -->

## 코드 인덱스 상태

!`"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" status 2>/dev/null || echo '{"ok":false,"note":"인덱스 없음"}'`


## 언제 적용되는가

계층 구조를 확인하거나, 계층 규칙을 프로젝트에 맞게 다듬을 때. sprint 없이도 동작한다.

## 4계층

| 계층 | 무엇인가 | 판단 기준 |
|---|---|---|
| **Interface** | 진입점 | 외부에서 시스템으로 들어오는 자리 — 라우트, 컨트롤러, 화면 |
| **Business Logic** | 처리 규칙 | 이 시스템이 무엇을 하는지가 담긴 곳 |
| **Persistence** | 데이터 | 상태가 사는 곳 — 리포지토리, 모델, 마이그레이션 |
| **Infrastructure** | 런타임 | 시스템이 돌아가기 위한 조건 — 설정, 미들웨어, 배포 |

## 수행 규칙

1. **모르는 것을 채우지 않는다.** 규칙에 걸리지 않는 파일은 `unclassified` 로 남는다. `src/utils/` 를 business-logic 으로 밀어 넣으면 이후 모든 계층 통계가 조용히 왜곡되고, "규칙을 다듬을 지점" 이라는 정보도 사라진다.
2. **미분류를 결함으로 보고하지 않는다.** 미분류는 규칙이 아직 그 디렉토리를 모른다는 뜻이지, 코드가 잘못됐다는 뜻이 아니다.
3. **위반은 위반한 파일에 귀속한다.** 컨트롤러가 DB 를 직접 import 하면 그건 컨트롤러의 문제다. DB 파일은 아무것도 잘못하지 않았다.
4. **규칙을 사용자 확인 없이 저장하지 않는다.** `layers.yml` 은 프로젝트의 아키텍처 선언이다. 내가 정할 것이 아니다.

## 단계

### `show` (기본)

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" layers
```

결과를 §출력 형식으로 렌더링한다. `suggestions` 가 있으면 규칙 추가를 제안한다.

### `violations`

```
"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" violations
```

| 종류 | 뜻 | 심각도 |
|---|---|---|
| `reverse` | 아래 계층이 위를 참조 (persistence → interface) | blocker |
| `layer-skip` | 계층을 건너뜀 (interface → persistence) | warning |
| `infra-leak` | 처리 규칙이 런타임에 직접 의존 | warning |

`reverse` 는 순환 의존의 씨앗이므로 blocker 다. 나머지는 의도적일 수 있으니 사유를 묻는다.

### `scan` — 규칙 제안

인덱스의 미분류 목록에서 디렉토리 패턴을 뽑아 규칙 후보를 만든다.

1. `"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" layers` 의 `suggestions` 를 본다
2. 각 후보에 대해 **어느 계층인지 사용자에게 묻는다** — 파일 이름만으로는 정할 수 없다
3. 답을 모아 `docs/sprints/_meta/layers.yml` 초안을 만든다
4. 저장 전에 전문을 보여주고 확인받는다

### `edit`

기존 `layers.yml` 을 고친다. 고친 뒤 재분류해서 무엇이 달라졌는지 보여준다.

## 출력 형식

```
[tene:layers] 규칙: docs/sprints/_meta/layers.yml

  Interface        12 파일   src/routes/**, src/controllers/**
  Business Logic   34 파일   src/services/**, src/domain/**
  Persistence      12 파일   src/db/**, prisma/**
  Infrastructure    8 파일   src/config/**, src/middleware/**
  테스트           21 파일   (구현 통계와 분리)
  미분류            9 파일

미분류 (규칙이 아직 모르는 곳)
  src/utils/format.ts
  src/utils/misc.ts
  ...
  → src/utils/** 를 규칙에 추가할까요? (9개 파일)

계층 위반 2건
  ⛔ reverse      src/db/repo.ts:1 → src/controllers/payment.ts
     persistence 가 interface 를 참조합니다. 순환 의존의 시작입니다.
  ⚠️ layer-skip   src/controllers/payment.ts:1 → src/db/client.ts
     컨트롤러가 DB 를 직접 만집니다. 의도한 것입니까?
```

## 하지 않는 것

- 미분류를 임의의 계층으로 배정하지 않는다
- 위반을 자동으로 고치지 않는다 (코드 구조 변경은 사용자 결정이다)
- 사용자 확인 없이 `layers.yml` 을 쓰지 않는다
- 계층 비율로 "건강 점수" 를 만들지 않는다 — 프로젝트마다 적정 비율이 다르다

## 실패 시

- `INDEX_MISSING` → `"${CLAUDE_PLUGIN_ROOT}/bin/tene-scan" build` 를 먼저 실행하도록 안내한다
- 인덱스가 오래됐으면(`status.stale`) 다시 빌드할지 묻는다. 오래된 인덱스로 낸 판정을 최신인 것처럼 보고하지 않는다
